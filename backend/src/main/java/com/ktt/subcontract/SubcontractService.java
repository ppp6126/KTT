package com.ktt.subcontract;

import com.ktt.ap.ApBill;
import com.ktt.ap.ApService;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.purchase.Supplier;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.subcontract.SubcontractDtos.ClaimDto;
import com.ktt.subcontract.SubcontractDtos.ClaimRequest;
import com.ktt.subcontract.SubcontractDtos.Dto;
import com.ktt.subcontract.SubcontractDtos.Row;
import com.ktt.subcontract.SubcontractDtos.SaveRequest;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * ผู้รับเหมาช่วง: สัญญาจ้างช่วง → งวดเบิก (ตรวจรับงาน) → ตั้งหนี้อัตโนมัติ (กันเงินประกัน + หัก ณ ที่จ่าย)
 * ต้นทุนโครงการนับจากงวดที่อนุมัติแล้ว
 */
@ApplicationScoped
public class SubcontractService {

    private static final Set<Integer> WHT = Set.of(0, 1, 2, 3, 5);

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ProjectService projects;

    @Inject
    ApService ap;

    @Inject
    EntityManager em;

    @Transactional
    public List<Row> list(UUID projectId, String status) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        io.quarkus.panache.common.Parameters p = new io.quarkus.panache.common.Parameters();
        projects.scope(w, p, "projectId");
        if (projectId != null) {
            w.append(" and projectId = :project");
            p.and("project", projectId);
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        List<Row> out = new ArrayList<>();
        for (Subcontract s : Subcontract.<Subcontract>list(w + " order by createdAt desc", p)) {
            Project pr = Project.findById(s.projectId);
            Supplier sup = Supplier.findById(s.supplierId);
            BigDecimal claimed = claimed(s.id);
            out.add(new Row(s.id, s.docNo, s.projectId, pr == null ? null : pr.code, sup == null ? null : sup.name, s.title,
                    s.amount, claimed, pct(claimed, s.amount), s.status, s.endDate));
        }
        return out;
    }

    @Transactional
    public Dto get(UUID id) {
        requireRead();
        return toDto(require(id));
    }

    @Transactional
    public Dto save(UUID id, SaveRequest req) {
        requireWrite();
        Subcontract s = id == null ? new Subcontract() : require(id);
        if (s.id != null && !"draft".equals(s.status) && !"active".equals(s.status)) {
            throw ApiException.conflict("closed", "สัญญาจ้างช่วงปิดแล้ว");
        }
        projects.requireVisible(req.projectId());
        Supplier sup = Supplier.findById(req.supplierId());
        if (sup == null || "supplier".equals(sup.kind)) {
            throw ApiException.badRequest("invalid_supplier", "กรุณาเลือกผู้รับเหมาช่วง (ประเภทผู้รับเหมาช่วงในทะเบียนผู้ขาย)");
        }
        if (!WHT.contains(req.whtPct().intValue()) || req.whtPct().compareTo(BigDecimal.valueOf(req.whtPct().intValue())) != 0) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
        if (s.id != null && req.amount().compareTo(claimed(s.id)) < 0) {
            throw ApiException.badRequest("below_claimed", "มูลค่าสัญญาน้อยกว่ายอดที่เบิกไปแล้ว");
        }
        if (s.id == null) {
            s.docNo = docNumbers.next(projects.prefix("subcontract", "SC"), DocNumberService.today());
            s.createdBy = currentUser.id();
        }
        s.projectId = req.projectId();
        s.supplierId = sup.id;
        s.title = req.title().trim();
        s.scope = UserNames.blankToNull(req.scope());
        s.amount = Money.round2(req.amount());
        s.vatPct = req.vatEnabled() ? new BigDecimal("7.00") : BigDecimal.ZERO;
        s.retentionPct = req.retentionPct();
        s.whtPct = req.whtPct();
        s.startDate = req.startDate();
        s.endDate = req.endDate();
        s.notes = UserNames.blankToNull(req.notes());
        if (s.id == null) {
            s.persist();
        }
        audit.log("subcontract", s.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("docNo", s.docNo, "amount", s.amount));
        return toDto(s);
    }

    @Transactional
    public Dto changeStatus(UUID id, String status) {
        requireWrite();
        Subcontract s = require(id);
        String from = s.status;
        switch (status) {
            case "active" -> {
                if (!"draft".equals(s.status)) {
                    throw ApiException.conflict("invalid_status", "เริ่มสัญญาได้เฉพาะฉบับร่าง");
                }
                if (s.amount.signum() <= 0) {
                    throw ApiException.badRequest("invalid_amount", "มูลค่าสัญญาต้องมากกว่า 0");
                }
            }
            case "completed" -> {
                if (!"active".equals(s.status)) {
                    throw ApiException.conflict("invalid_status", "ปิดได้เฉพาะสัญญาที่กำลังดำเนินการ");
                }
            }
            case "cancelled" -> {
                if (SubcontractClaim.count("subcontractId = ?1 and status <> 'draft'", s.id) > 0) {
                    throw ApiException.conflict("has_claims", "มีงวดเบิกที่อนุมัติแล้ว ยกเลิกไม่ได้ ให้ปิดสัญญาแทน");
                }
            }
            default -> throw ApiException.badRequest("invalid_status", "สถานะไม่ถูกต้อง");
        }
        s.status = status;
        audit.log("subcontract", s.id, AuditService.ACTION_UPDATE, Map.of("status", from), Map.of("status", status));
        return toDto(s);
    }

    @Transactional
    public Dto addClaim(UUID id, ClaimRequest req) {
        requireWrite();
        Subcontract s = require(id);
        if (!"active".equals(s.status)) {
            throw ApiException.conflict("not_active", "ต้องเริ่มสัญญาก่อนจึงบันทึกงวดเบิกได้");
        }
        BigDecimal after = claimed(s.id).add(req.amount());
        if (after.compareTo(s.amount) > 0) {
            throw ApiException.badRequest("over_contract", "ยอดเบิกสะสมเกินมูลค่าสัญญา (เหลือเบิกได้ "
                    + s.amount.subtract(claimed(s.id)).toPlainString() + " บาท)");
        }
        Number max = (Number) em.createNativeQuery("select coalesce(max(claim_no), 0) from subcontract_claims where subcontract_id = ?1")
                .setParameter(1, s.id).getSingleResult();
        SubcontractClaim c = new SubcontractClaim();
        c.subcontractId = s.id;
        c.claimNo = max.intValue() + 1;
        c.claimDate = req.claimDate();
        c.description = req.description().trim();
        c.progressPct = req.progressPct();
        c.amount = Money.round2(req.amount());
        c.createdBy = currentUser.id();
        c.persist();
        audit.log("subcontract", s.id, AuditService.ACTION_UPDATE, null, Map.of("claim", c.claimNo, "amount", c.amount));
        return toDto(s);
    }

    /** ตรวจรับงานงวดนี้ → สร้างบิลเจ้าหนี้ฉบับร่างให้บัญชีตรวจเลขที่ใบกำกับ */
    @Transactional
    public Dto approveClaim(UUID id, UUID claimId) {
        requireWrite();
        Subcontract s = require(id);
        SubcontractClaim c = SubcontractClaim.findById(claimId);
        if (c == null || !c.subcontractId.equals(s.id)) {
            throw ApiException.notFound("ไม่พบงวดเบิก");
        }
        if (!"draft".equals(c.status)) {
            throw ApiException.conflict("invalid_status", "งวดนี้อนุมัติแล้ว");
        }
        if (currentUser.id().equals(c.createdBy) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("self_approval", "ต้องให้ผู้จัดการโครงการตรวจรับงาน");
        }
        c.status = "approved";
        c.approvedBy = currentUser.id();
        c.approvedAt = Instant.now();
        BigDecimal retention = Money.pct(c.amount, s.retentionPct);
        ApBill bill = ap.createFromClaim(c.id, s.supplierId, s.projectId,
                s.title + " งวดที่ " + c.claimNo + " " + c.description, c.amount, s.vatPct, s.whtPct, retention, c.claimDate);
        c.apBillId = bill.id;
        c.status = "billed";
        audit.log("subcontract", s.id, AuditService.ACTION_APPROVE, null, Map.of("claim", c.claimNo, "bill", bill.docNo));
        return toDto(s);
    }

    @Transactional
    public Dto deleteClaim(UUID id, UUID claimId) {
        requireWrite();
        Subcontract s = require(id);
        SubcontractClaim c = SubcontractClaim.findById(claimId);
        if (c == null || !c.subcontractId.equals(s.id) || !"draft".equals(c.status)) {
            throw ApiException.conflict("not_deletable", "ลบได้เฉพาะงวดที่ยังไม่อนุมัติ");
        }
        c.delete();
        return toDto(s);
    }

    /** คืนเงินประกันผลงานให้ผู้รับเหมาช่วง (ตั้งหนี้ใหม่ ไม่มี VAT/หัก ณ ที่จ่าย เพราะคิดไปแล้วตอนตั้งหนี้งวด) */
    @Transactional
    public Dto releaseRetention(UUID id, BigDecimal amount) {
        requireWrite();
        Subcontract s = require(id);
        BigDecimal held = retentionHeld(s);
        if (amount.compareTo(held) > 0) {
            throw ApiException.badRequest("over_release", "คืนได้ไม่เกิน " + held.toPlainString() + " บาท");
        }
        ApBill bill = ap.createFromClaim(null, s.supplierId, s.projectId, "คืนเงินประกันผลงาน " + s.docNo + " " + s.title,
                Money.round2(amount), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, com.ktt.docnum.DocNumberService.today());
        bill.notes = "คืนเงินประกันผลงานตามสัญญาจ้างช่วง " + s.docNo;
        s.retentionReleased = Money.round2(s.retentionReleased.add(amount));
        audit.log("subcontract", s.id, AuditService.ACTION_UPDATE, null, Map.of("retentionRelease", amount, "bill", bill.docNo));
        return toDto(s);
    }

    // ================================================================= internals

    private BigDecimal claimed(UUID id) {
        return SqlValues.decimal0(em.createNativeQuery("select coalesce(sum(amount), 0) from subcontract_claims where subcontract_id = ?1")
                .setParameter(1, id).getSingleResult());
    }

    private BigDecimal retentionHeld(Subcontract s) {
        BigDecimal ret = SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(b.retention_amount), 0) from subcontract_claims c join ap_bills b on b.id = c.ap_bill_id
                        where c.subcontract_id = ?1 and b.status <> 'void' and b.deleted_at is null""").setParameter(1, s.id).getSingleResult());
        return Money.round2(ret.subtract(s.retentionReleased));
    }

    private static BigDecimal pct(BigDecimal part, BigDecimal whole) {
        return whole.signum() == 0 ? BigDecimal.ZERO : part.multiply(Money.HUNDRED).divide(whole, 1, RoundingMode.HALF_UP);
    }

    private Subcontract require(UUID id) {
        Subcontract s = id == null ? null : Subcontract.findById(id);
        if (s == null) {
            throw ApiException.notFound("ไม่พบสัญญาจ้างช่วง");
        }
        projects.requireVisible(s.projectId);
        return s;
    }

    private void requireRead() {
        if (!currentUser.can(Perm.SUBCONTRACT_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูผู้รับเหมาช่วง");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.SUBCONTRACT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์จัดการผู้รับเหมาช่วง");
        }
    }

    Dto toDto(Subcontract s) {
        Project p = Project.findById(s.projectId);
        Supplier sup = Supplier.findById(s.supplierId);
        List<ClaimDto> claims = new ArrayList<>();
        Map<UUID, String> names = UserNames.of(SubcontractClaim.listFor(s.id).stream().map(c -> c.approvedBy).toList());
        BigDecimal paid = BigDecimal.ZERO;
        for (SubcontractClaim c : SubcontractClaim.listFor(s.id)) {
            ApBill b = c.apBillId == null ? null : ApBill.findById(c.apBillId);
            BigDecimal ret = Money.pct(c.amount, s.retentionPct);
            BigDecimal wht = Money.pct(c.amount, s.whtPct);
            BigDecimal vat = Money.pct(c.amount, s.vatPct);
            if (b != null && !"void".equals(b.status)) {
                paid = paid.add(b.paidAmount);
            }
            claims.add(new ClaimDto(c.id, c.claimNo, c.claimDate, c.description, c.progressPct, c.amount, ret, wht, vat,
                    c.amount.add(vat).subtract(ret).subtract(wht), c.status, c.apBillId, b == null ? null : b.docNo,
                    b == null ? null : b.status, names.get(c.approvedBy), c.approvedAt));
        }
        BigDecimal claimed = claimed(s.id);
        return new Dto(s.id, s.docNo, s.projectId, p == null ? null : p.code, p == null ? null : p.name, s.supplierId,
                sup == null ? null : sup.name, sup == null ? null : sup.taxId, s.title, s.scope, s.amount, s.vatPct.signum() > 0,
                s.vatPct, s.retentionPct, s.whtPct, s.startDate, s.endDate, s.status, s.notes, claimed, pct(claimed, s.amount),
                retentionHeld(s), s.retentionReleased, Money.round2(paid), claims,
                currentUser.can(Perm.SUBCONTRACT_WRITE) && Set.of("draft", "active").contains(s.status), s.createdAt);
    }
}
