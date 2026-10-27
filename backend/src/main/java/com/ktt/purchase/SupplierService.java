package com.ktt.purchase;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.ThaiTaxId;
import com.ktt.common.UserNames;
import com.ktt.purchase.PurchaseDtos.EvaluationDto;
import com.ktt.purchase.PurchaseDtos.EvaluationRequest;
import com.ktt.purchase.PurchaseDtos.SupplierDto;
import com.ktt.purchase.PurchaseDtos.SupplierOption;
import com.ktt.purchase.PurchaseDtos.SupplierRequest;
import com.ktt.purchase.PurchaseDtos.SupplierRow;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** ทะเบียนผู้ขาย/ผู้รับเหมาช่วง และการประเมินผู้ขาย (คุณภาพ ตรงเวลา ราคา บริการ คะแนน 1–5) */
@ApplicationScoped
public class SupplierService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    EntityManager em;

    @Transactional
    public PageResult<SupplierRow> list(String q, String kind, Boolean active, int page, int size) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(code) like :q or taxId like :q or phone like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if ("supplier".equals(kind) || "subcontractor".equals(kind)) {
            w.append(" and (kind = :kind or kind = 'both')");
            p.and("kind", kind);
        }
        if (active != null) {
            w.append(" and active = :active");
            p.and("active", active);
        }
        PanacheQuery<Supplier> query = Supplier.find(w.toString(), Sort.ascending("name"), p);
        long total = query.count();
        List<Supplier> list = query.page(Page.of(page, size)).list();
        Map<UUID, BigDecimal> ratings = ratings(list.stream().map(s -> s.id).toList());
        Map<UUID, BigDecimal> payable = payables(list.stream().map(s -> s.id).toList());
        return new PageResult<>(list.stream().map(s -> new SupplierRow(s.id, s.code, s.name, s.kind, s.personType, s.taxId,
                s.phone, s.contactName, s.category, s.creditDays, s.active, ratings.get(s.id),
                payable.getOrDefault(s.id, BigDecimal.ZERO))).toList(), total, page, size);
    }

    @Transactional
    public List<SupplierOption> options(String kind) {
        requireAny();
        String w = "active = true" + ("subcontractor".equals(kind) ? " and kind in ('subcontractor', 'both')"
                : "supplier".equals(kind) ? " and kind in ('supplier', 'both')" : "");
        return Supplier.<Supplier>list(w + " order by name").stream()
                .map(s -> new SupplierOption(s.id, s.code, s.name, s.kind, s.creditDays, s.vatRegistered)).toList();
    }

    @Transactional
    public SupplierDto get(UUID id) {
        requireAny();
        return toDto(require(id));
    }

    @Transactional
    public SupplierDto save(UUID id, SupplierRequest req) {
        requireWrite();
        Supplier s = id == null ? new Supplier() : require(id);
        String tax = UserNames.blankToNull(req.taxId());
        if (tax != null && !ThaiTaxId.Validator.isValidTaxId(tax)) {
            throw ApiException.badRequest("invalid_tax_id", "เลขผู้เสียภาษีไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)");
        }
        String code = UserNames.blankToNull(req.code());
        if (code == null) {
            code = s.code != null ? s.code : nextCode();
        }
        if (Supplier.count("lower(code) = ?1 and id <> ?2", code.toLowerCase(), s.id == null ? new UUID(0, 0) : s.id) > 0) {
            throw ApiException.conflict("duplicate_code", "รหัสผู้ขายซ้ำ");
        }
        s.code = code;
        s.name = req.name().trim();
        s.kind = req.kind();
        s.personType = req.personType();
        s.taxId = tax;
        s.branchNo = UserNames.blankToNull(req.branchNo());
        s.address = UserNames.blankToNull(req.address());
        s.phone = UserNames.blankToNull(req.phone());
        s.email = UserNames.blankToNull(req.email());
        s.contactName = UserNames.blankToNull(req.contactName());
        s.category = UserNames.blankToNull(req.category());
        s.creditDays = req.creditDays();
        s.vatRegistered = req.vatRegistered();
        s.bankName = UserNames.blankToNull(req.bankName());
        s.bankAccount = UserNames.blankToNull(req.bankAccount());
        s.notes = UserNames.blankToNull(req.notes());
        s.active = req.active();
        if (s.id == null) {
            s.createdBy = currentUser.id();
            s.persist();
        }
        audit.log("supplier", s.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("code", s.code, "name", s.name));
        return toDto(s);
    }

    @Transactional
    public void delete(UUID id) {
        requireWrite();
        Supplier s = require(id);
        Number used = (Number) em.createNativeQuery("""
                        select (select count(*) from purchase_orders where supplier_id = ?1 and deleted_at is null)
                             + (select count(*) from ap_bills where supplier_id = ?1 and deleted_at is null)
                             + (select count(*) from subcontracts where supplier_id = ?1 and deleted_at is null)
                        """).setParameter(1, s.id).getSingleResult();
        if (used.longValue() > 0) {
            throw ApiException.conflict("in_use", "ผู้ขายนี้มีเอกสารอ้างอิงแล้ว ให้ปิดการใช้งานแทนการลบ");
        }
        s.softDelete();
        audit.log("supplier", s.id, AuditService.ACTION_DELETE, Map.of("name", s.name), null);
    }

    @Transactional
    public SupplierDto evaluate(UUID id, EvaluationRequest req) {
        if (!currentUser.can(Perm.PURCHASE_WRITE) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ประเมินผู้ขาย");
        }
        Supplier s = require(id);
        em.createNativeQuery("""
                        insert into supplier_evaluations (supplier_id, project_id, eval_date, quality, delivery, price, service, comment, created_by)
                        values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                        """).setParameter(1, s.id).setParameter(2, req.projectId()).setParameter(3, req.evalDate())
                .setParameter(4, req.quality()).setParameter(5, req.delivery()).setParameter(6, req.price())
                .setParameter(7, req.service()).setParameter(8, UserNames.blankToNull(req.comment()))
                .setParameter(9, currentUser.id()).executeUpdate();
        audit.log("supplier", s.id, AuditService.ACTION_UPDATE, null, Map.of("evaluation", req.quality() + req.delivery() + req.price() + req.service()));
        return toDto(s);
    }

    // ================================================================= internals

    Supplier require(UUID id) {
        Supplier s = id == null ? null : Supplier.findById(id);
        if (s == null) {
            throw ApiException.notFound("ไม่พบผู้ขาย");
        }
        return s;
    }

    private String nextCode() {
        Number n = (Number) em.createNativeQuery("select count(*) from suppliers").getSingleResult();
        for (int i = n.intValue() + 1; ; i++) {
            String c = "S%04d".formatted(i);
            if (Supplier.count("code", c) == 0) {
                return c;
            }
        }
    }

    Map<UUID, BigDecimal> ratings(List<UUID> ids) {
        Map<UUID, BigDecimal> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select supplier_id, avg((quality + delivery + price + service) / 4.0) from supplier_evaluations
                        where supplier_id in (:ids) group by supplier_id""").setParameter("ids", ids).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), SqlValues.decimal(r[1]).setScale(1, RoundingMode.HALF_UP)));
        return out;
    }

    private Map<UUID, BigDecimal> payables(List<UUID> ids) {
        Map<UUID, BigDecimal> out = new HashMap<>();
        if (ids.isEmpty() || !currentUser.can(Perm.AP_READ)) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select supplier_id, sum(total_amount - retention_amount - paid_amount) from ap_bills
                        where supplier_id in (:ids) and status in ('approved', 'partial') and deleted_at is null group by supplier_id
                        """).setParameter("ids", ids).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), SqlValues.decimal0(r[1]).setScale(2, RoundingMode.HALF_UP)));
        return out;
    }

    private SupplierDto toDto(Supplier s) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select e.id, e.project_id, p.code, e.eval_date, e.quality, e.delivery, e.price, e.service, e.comment, u.name
                        from supplier_evaluations e left join projects p on p.id = e.project_id left join users u on u.id = e.created_by
                        where e.supplier_id = ?1 order by e.eval_date desc""").setParameter(1, s.id).getResultList();
        List<EvaluationDto> evals = rows.stream().map(r -> {
            int q = ((Number) r[4]).intValue();
            int d = ((Number) r[5]).intValue();
            int pr = ((Number) r[6]).intValue();
            int sv = ((Number) r[7]).intValue();
            return new EvaluationDto(SqlValues.uuid(r[0]), SqlValues.uuid(r[1]), (String) r[2], SqlValues.date(r[3]), q, d, pr, sv,
                    BigDecimal.valueOf(q + d + pr + sv).divide(BigDecimal.valueOf(4), 2, RoundingMode.HALF_UP), (String) r[8], (String) r[9]);
        }).toList();
        return new SupplierDto(s.id, s.code, s.name, s.kind, s.personType, s.taxId, s.branchNo, s.address, s.phone, s.email,
                s.contactName, s.category, s.creditDays, s.vatRegistered, s.bankName, s.bankAccount, s.notes, s.active,
                ratings(List.of(s.id)).get(s.id), evals, s.createdAt);
    }

    private void requireRead() {
        if (!currentUser.can(Perm.PURCHASE_READ) && !currentUser.can(Perm.AP_READ) && !currentUser.can(Perm.SUBCONTRACT_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูผู้ขาย");
        }
    }

    private void requireAny() {
        if (!currentUser.can(Perm.PURCHASE_READ) && !currentUser.can(Perm.PURCHASE_REQUEST) && !currentUser.can(Perm.AP_READ)
                && !currentUser.can(Perm.SUBCONTRACT_READ) && !currentUser.can(Perm.LABOR_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูผู้ขาย");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.PURCHASE_WRITE) && !currentUser.can(Perm.AP_WRITE) && !currentUser.can(Perm.SUBCONTRACT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขผู้ขาย");
        }
    }
}
