package com.ktt.stock;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.pricing.Material;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.stock.StockDtos.DocLine;
import com.ktt.stock.StockDtos.LedgerRow;
import com.ktt.stock.StockDtos.OnHandRow;
import com.ktt.stock.StockDtos.StockDocDto;
import com.ktt.stock.StockDtos.StockDocRequest;
import com.ktt.stock.StockDtos.WarehouseDto;
import com.ktt.stock.StockDtos.WarehouseRequest;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * คลังวัสดุแบบสมุดคุม (stock_movements) ต้นทุนถัวเฉลี่ยเคลื่อนที่ต่อวัสดุต่อคลัง
 * <ul>
 *   <li>รับเข้า: จากใบรับสินค้า (PurchaseService เรียก {@link #receive})</li>
 *   <li>เบิกใช้ (issue): ออกจากคลัง ตัดเป็นต้นทุนโครงการด้วยต้นทุนเฉลี่ย</li>
 *   <li>โอน (transfer): ออกจากคลังหนึ่งเข้าอีกคลังด้วยต้นทุนเดิม</li>
 *   <li>ปรับยอด (adjust): ตรวจนับแล้วปรับเพิ่ม/ลด</li>
 *   <li>รับคืน (return): ของเหลือจากโครงการคืนเข้าคลัง ลดต้นทุนโครงการ</li>
 * </ul>
 * ห้ามสต็อกติดลบ ใช้ advisory lock ต่อ (วัสดุ, คลัง) กันเบิกพร้อมกันเกินยอด
 */
@ApplicationScoped
public class StockService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ProjectService projects;

    @Inject
    NotificationService notifications;

    @Inject
    EntityManager em;

    // ================================================================= warehouses

    @Transactional
    public List<WarehouseDto> warehouses() {
        requireRead();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select w.id, w.code, w.name, w.project_id, p.code, p.name, w.active,
                               coalesce((select sum(m.qty * m.unit_cost) from stock_movements m where m.warehouse_id = w.id), 0)
                        from warehouses w left join projects p on p.id = w.project_id
                        where w.deleted_at is null order by w.project_id nulls first, w.code
                        """).getResultList();
        boolean cost = canSeeCost();
        return rows.stream().map(r -> new WarehouseDto(SqlValues.uuid(r[0]), (String) r[1], (String) r[2],
                SqlValues.uuid(r[3]), (String) r[4], (String) r[5], (Boolean) r[6],
                cost ? SqlValues.decimal0(r[7]).setScale(2, RoundingMode.HALF_UP) : null)).toList();
    }

    @Transactional
    public WarehouseDto saveWarehouse(UUID id, WarehouseRequest req) {
        requireWrite();
        Warehouse w = id == null ? new Warehouse() : Warehouse.findById(id);
        if (w == null) {
            throw ApiException.notFound("ไม่พบคลัง");
        }
        String code = req.code().trim().toUpperCase();
        if (Warehouse.count("lower(code) = ?1 and id <> ?2", code.toLowerCase(), w.id == null ? new UUID(0, 0) : w.id) > 0) {
            throw ApiException.conflict("duplicate_code", "รหัสคลังซ้ำ");
        }
        if (req.projectId() != null) {
            projects.requireVisible(req.projectId());
        }
        w.code = code;
        w.name = req.name().trim();
        w.projectId = req.projectId();
        w.active = req.active();
        if (w.id == null) {
            w.createdBy = currentUser.id();
            w.persist();
        }
        audit.log("warehouse", w.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null, Map.of("code", w.code));
        return warehouses().stream().filter(x -> x.id().equals(w.id)).findFirst().orElseThrow();
    }

    @Transactional
    public void setMinQty(UUID materialId, UUID warehouseId, BigDecimal minQty) {
        requireWrite();
        em.createNativeQuery("""
                        insert into stock_levels (material_id, warehouse_id, min_qty) values (?1, ?2, ?3)
                        on conflict (material_id, warehouse_id) do update set min_qty = excluded.min_qty
                        """).setParameter(1, materialId).setParameter(2, warehouseId).setParameter(3, minQty).executeUpdate();
    }

    // ================================================================= query

    @Transactional
    public List<OnHandRow> onHand(UUID warehouseId, String q, boolean lowOnly) {
        requireRead();
        StringBuilder sql = new StringBuilder("""
                with pos as (
                  select material_id, warehouse_id, sum(qty) qty, sum(qty * unit_cost) val, max(movement_date) last_date
                  from stock_movements group by material_id, warehouse_id
                ), keys as (
                  select material_id, warehouse_id from pos
                  union select material_id, warehouse_id from stock_levels where min_qty > 0
                )
                select k.material_id, m.code, m.name, m.unit, k.warehouse_id, w.code, w.name,
                       coalesce(p.qty, 0), coalesce(p.val, 0), coalesce(l.min_qty, 0), p.last_date
                from keys k
                join materials m on m.id = k.material_id
                join warehouses w on w.id = k.warehouse_id and w.deleted_at is null
                left join pos p on p.material_id = k.material_id and p.warehouse_id = k.warehouse_id
                left join stock_levels l on l.material_id = k.material_id and l.warehouse_id = k.warehouse_id
                where 1 = 1
                """);
        if (warehouseId != null) {
            sql.append(" and k.warehouse_id = :wh");
        }
        if (q != null && !q.isBlank()) {
            sql.append(" and (lower(m.name) like :q or lower(m.code) like :q)");
        }
        if (lowOnly) {
            sql.append(" and coalesce(l.min_qty, 0) > 0 and coalesce(p.qty, 0) < l.min_qty");
        }
        sql.append(" and (coalesce(p.qty, 0) <> 0 or coalesce(l.min_qty, 0) > 0) order by w.code, m.name limit 2000");
        var query = em.createNativeQuery(sql.toString());
        if (warehouseId != null) {
            query.setParameter("wh", warehouseId);
        }
        if (q != null && !q.isBlank()) {
            query.setParameter("q", "%" + q.trim().toLowerCase() + "%");
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        boolean cost = canSeeCost();
        List<OnHandRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            StockMath.Position p = new StockMath.Position(SqlValues.decimal0(r[7]), SqlValues.decimal0(r[8]));
            BigDecimal min = SqlValues.decimal0(r[9]);
            out.add(new OnHandRow(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], (String) r[3], SqlValues.uuid(r[4]),
                    (String) r[5], (String) r[6], p.qty(), cost ? p.avgCost() : null,
                    cost ? p.value().setScale(2, RoundingMode.HALF_UP) : null, min,
                    min.signum() > 0 && p.qty().compareTo(min) < 0, SqlValues.date(r[10])));
        }
        return out;
    }

    @Transactional
    public List<LedgerRow> ledger(UUID materialId, UUID warehouseId) {
        requireRead();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select m.movement_date, m.kind, m.qty, m.unit_cost, m.ref_type, m.ref_id, m.note, p.code,
                               coalesce(g.doc_no, d.doc_no), m.created_at
                        from stock_movements m
                        left join projects p on p.id = m.project_id
                        left join goods_receipts g on m.ref_type = 'goods_receipt' and g.id = m.ref_id
                        left join stock_docs d on m.ref_type = 'stock_doc' and d.id = m.ref_id
                        where m.material_id = ?1 and m.warehouse_id = ?2
                        order by m.movement_date, m.created_at
                        """).setParameter(1, materialId).setParameter(2, warehouseId).getResultList();
        boolean canCost = canSeeCost();
        List<LedgerRow> out = new ArrayList<>();
        BigDecimal bal = BigDecimal.ZERO;
        BigDecimal val = BigDecimal.ZERO;
        for (Object[] r : rows) {
            BigDecimal qty = SqlValues.decimal0(r[2]);
            BigDecimal cost = SqlValues.decimal0(r[3]);
            bal = bal.add(qty);
            val = val.add(qty.multiply(cost));
            out.add(new LedgerRow(SqlValues.date(r[0]), (String) r[1], qty, canCost ? cost : null, (String) r[4], SqlValues.uuid(r[5]),
                    (String) r[8], (String) r[7], (String) r[6], bal, canCost ? val.setScale(2, RoundingMode.HALF_UP) : null));
        }
        return out;
    }

    @Transactional
    public List<StockDocDto> docs(UUID projectId, int limit) {
        requireRead();
        String where = projectId == null ? "" : " where d.project_id = :p";
        var q = em.createNativeQuery("""
                        select d.id, d.doc_no, d.kind, d.doc_date, w.name, w2.name, p.code, d.notes, u.name,
                               coalesce((select sum(abs(m.qty * m.unit_cost)) from stock_movements m
                                         where m.ref_type = 'stock_doc' and m.ref_id = d.id and (m.qty < 0 or d.kind in ('adjust', 'return'))), 0)
                        from stock_docs d join warehouses w on w.id = d.warehouse_id
                        left join warehouses w2 on w2.id = d.to_warehouse_id
                        left join projects p on p.id = d.project_id
                        left join users u on u.id = d.created_by
                        """ + where + " order by d.doc_date desc, d.created_at desc limit " + Math.min(500, Math.max(1, limit)));
        if (projectId != null) {
            q.setParameter("p", projectId);
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        boolean cost = canSeeCost();
        return rows.stream().map(r -> new StockDocDto(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], SqlValues.date(r[3]),
                (String) r[4], (String) r[5], (String) r[6], (String) r[7], (String) r[8],
                cost ? SqlValues.decimal0(r[9]).setScale(2, RoundingMode.HALF_UP) : null, lines(SqlValues.uuid(r[0]), cost))).toList();
    }

    /** ต้นทุน/มูลค่าคลัง: แสดงเฉพาะผู้มีสิทธิ์ดูต้นทุนหรือผู้จัดการคลัง (กฎเดียวกับ onHand) */
    private boolean canSeeCost() {
        return currentUser.canViewCost() || currentUser.can(Perm.STOCK_WRITE);
    }

    private List<DocLine> lines(UUID docId, boolean cost) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select m.material_id, mt.code, mt.name, mt.unit, m.qty, m.unit_cost, m.note, m.kind
                        from stock_movements m join materials mt on mt.id = m.material_id
                        where m.ref_type = 'stock_doc' and m.ref_id = ?1 and m.kind <> 'transfer_in' order by mt.name
                        """).setParameter(1, docId).getResultList();
        return rows.stream().map(r -> new DocLine(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], (String) r[3],
                SqlValues.decimal0(r[4]), cost ? SqlValues.decimal0(r[5]) : null, (String) r[6])).toList();
    }

    // ================================================================= posting

    /** รับเข้าคลัง (จากใบรับสินค้า) */
    @Transactional(Transactional.TxType.MANDATORY)
    public void receive(UUID materialId, UUID warehouseId, BigDecimal qty, BigDecimal unitCost, LocalDate date,
                        String refType, UUID refId, String note) {
        lock(materialId, warehouseId);
        StockMovement m = new StockMovement();
        m.movementDate = date;
        m.materialId = materialId;
        m.warehouseId = warehouseId;
        m.qty = qty;
        m.unitCost = unitCost;
        m.kind = "receive";
        m.refType = refType;
        m.refId = refId;
        m.note = note;
        m.createdBy = currentUser.id();
        m.persist();
    }

    /**
     * ย้อนรายการทั้งหมดของเอกสารอ้างอิง (ยกเลิกใบรับสินค้า) ต้องมีของเหลือพอ
     * <p>
     * ตัดออกด้วยต้นทุนเฉลี่ยปัจจุบันของคลัง (ไม่ใช่ราคาตอนรับ) เพื่อให้มูลค่าคงคลังไม่ติดลบและต้นทุนเฉลี่ยไม่เพี้ยน
     * ถ้าตัดจนหมดคลังจะล้างมูลค่าคงเหลือทั้งหมด ส่วนต่างจากราคาตอนรับ (ซึ่งถูกตัดเป็นต้นทุนโครงการไปแล้วตอนเบิก)
     * ถือว่าจบที่ต้นทุนโครงการที่เบิกไป ไม่ย้อนแก้เอกสารเบิกเดิม
     */
    @Transactional(Transactional.TxType.MANDATORY)
    public void reverse(String refType, UUID refId, LocalDate date) {
        List<StockMovement> list = StockMovement.list("refType = ?1 and refId = ?2", refType, refId);
        for (StockMovement src : list) {
            lock(src.materialId, src.warehouseId);
            BigDecimal cost = src.unitCost;
            if (src.qty.signum() > 0) {
                StockMath.Position p = position(src.materialId, src.warehouseId);
                if (p.qty().compareTo(src.qty) < 0) {
                    Material mt = Material.findById(src.materialId);
                    throw ApiException.conflict("stock_used", "วัสดุ \"" + (mt == null ? "" : mt.name) + "\" ถูกเบิกออกไปแล้ว ยกเลิกไม่ได้ ให้ทำรายการปรับยอดแทน");
                }
                cost = StockMath.outCost(p, src.qty);
            }
            StockMovement m = new StockMovement();
            m.movementDate = date;
            m.materialId = src.materialId;
            m.warehouseId = src.warehouseId;
            m.qty = src.qty.negate();
            m.unitCost = cost;
            m.kind = "adjust";
            m.projectId = src.projectId;
            m.refType = refType;
            m.refId = refId;
            m.note = "ยกเลิกรายการ";
            m.createdBy = currentUser.id();
            m.persist();
        }
    }

    @Transactional
    public StockDocDto post(StockDocRequest req) {
        requireWrite();
        Warehouse from = Warehouse.findById(req.warehouseId());
        if (from == null || !from.active) {
            throw ApiException.badRequest("invalid_warehouse", "ไม่พบคลัง");
        }
        Warehouse to = null;
        Project project = null;
        switch (req.kind()) {
            case "issue", "return" -> {
                if (req.projectId() == null) {
                    throw ApiException.badRequest("project_required", "กรุณาเลือกโครงการ");
                }
                project = projects.requireVisible(req.projectId());
            }
            case "transfer" -> {
                to = req.toWarehouseId() == null ? null : Warehouse.findById(req.toWarehouseId());
                if (to == null || to.id.equals(from.id)) {
                    throw ApiException.badRequest("invalid_warehouse", "กรุณาเลือกคลังปลายทางที่ต่างจากคลังต้นทาง");
                }
            }
            case "adjust" -> {
                if (!currentUser.can(Perm.STOCK_WRITE)) {
                    throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ปรับยอด");
                }
            }
            default -> throw ApiException.badRequest("invalid_kind", "ประเภทเอกสารไม่ถูกต้อง");
        }
        if (req.docDate().isAfter(DocNumberService.today())) {
            throw ApiException.badRequest("future_date", "ลงวันที่ล่วงหน้าไม่ได้");
        }
        StockDoc d = new StockDoc();
        d.docNo = docNumbers.next(projects.prefix("stock_doc", "SD"), req.docDate());
        d.kind = req.kind();
        d.docDate = req.docDate();
        d.warehouseId = from.id;
        d.toWarehouseId = to == null ? null : to.id;
        d.projectId = project == null ? null : project.id;
        d.notes = UserNames.blankToNull(req.notes());
        d.createdBy = currentUser.id();
        d.persist();
        for (StockDtos.LineInput in : req.lines()) {
            Material mt = Material.findById(in.materialId());
            if (mt == null) {
                throw ApiException.badRequest("invalid_material", "ไม่พบวัสดุ");
            }
            BigDecimal qty = in.qty();
            if (qty.signum() == 0 || (!"adjust".equals(d.kind) && qty.signum() < 0)) {
                throw ApiException.badRequest("invalid_qty", "จำนวน \"" + mt.name + "\" ไม่ถูกต้อง");
            }
            lock(mt.id, from.id);
            StockMath.Position p = position(mt.id, from.id);
            switch (d.kind) {
                case "issue" -> out(d, mt, from.id, qty, p, "issue", d.projectId, in.note());
                case "transfer" -> {
                    BigDecimal cost = out(d, mt, from.id, qty, p, "transfer_out", null, in.note());
                    lock(mt.id, to.id);
                    move(d, mt.id, to.id, qty, cost, "transfer_in", null, in.note());
                }
                case "return" -> {
                    // คืนได้ไม่เกินยอดที่โครงการเบิกไปสุทธิ (เบิก − คืนแล้ว) ของวัสดุนี้
                    em.createNativeQuery("select pg_advisory_xact_lock(hashtext(?1))")
                            .setParameter(1, "stock_return:" + d.projectId + ":" + mt.id).getSingleResult();
                    BigDecimal net = netIssued(d.projectId, mt.id);
                    if (qty.compareTo(net) > 0) {
                        throw ApiException.badRequest("over_return", "\"" + mt.name + "\" โครงการเบิกไปสุทธิ "
                                + net.stripTrailingZeros().toPlainString() + " " + mt.unit + " คืนเกินยอดที่เบิกไม่ได้");
                    }
                    // คืนของจากโครงการด้วยต้นทุนเฉลี่ยที่โครงการเบิกไป (ถ้าไม่มี ใช้ต้นทุนเฉลี่ยคลัง)
                    BigDecimal cost = projectIssueCost(d.projectId, mt.id, p.avgCost().signum() > 0 ? p.avgCost() : mt.costPrice);
                    move(d, mt.id, from.id, qty, cost, "return", d.projectId, in.note());
                }
                case "adjust" -> {
                    if (qty.signum() < 0) {
                        out(d, mt, from.id, qty.negate(), p, "adjust", null, in.note());
                    } else {
                        BigDecimal cost = in.unitCost() != null ? in.unitCost()
                                : p.avgCost().signum() > 0 ? p.avgCost() : mt.costPrice;
                        move(d, mt.id, from.id, qty, cost, "adjust", null, in.note());
                    }
                }
                default -> throw new IllegalStateException();
            }
        }
        audit.log("stock_doc", d.id, AuditService.ACTION_CREATE, null, Map.of("docNo", d.docNo, "kind", d.kind, "lines", req.lines().size()));
        return docs(null, 200).stream().filter(x -> x.id().equals(d.id)).findFirst().orElseThrow();
    }

    /** จ่ายออก ตรวจยอดคงเหลือ คืนต้นทุนต่อหน่วยที่ใช้ */
    private BigDecimal out(StockDoc d, Material mt, UUID wh, BigDecimal qty, StockMath.Position p, String kind, UUID projectId, String note) {
        if (p.qty().compareTo(qty) < 0) {
            throw ApiException.conflict("insufficient_stock", "\"" + mt.name + "\" คงเหลือ " + p.qty().stripTrailingZeros().toPlainString()
                    + " " + mt.unit + " ไม่พอจ่าย " + qty.stripTrailingZeros().toPlainString());
        }
        // ต้นทุนเฉลี่ย ; จ่ายหมดคลังใช้มูลค่าคงเหลือทั้งหมด ; ไม่ติดลบ
        BigDecimal cost = StockMath.outCost(p, qty);
        move(d, mt.id, wh, qty.negate(), cost, kind, projectId, note);
        return cost;
    }

    private void move(StockDoc d, UUID materialId, UUID wh, BigDecimal qty, BigDecimal cost, String kind, UUID projectId, String note) {
        StockMovement m = new StockMovement();
        m.movementDate = d.docDate;
        m.materialId = materialId;
        m.warehouseId = wh;
        m.qty = qty;
        m.unitCost = cost;
        m.kind = kind;
        m.projectId = projectId;
        m.refType = "stock_doc";
        m.refId = d.id;
        m.note = UserNames.blankToNull(note);
        m.createdBy = currentUser.id();
        m.persist();
    }

    /** ยอดเบิกสุทธิของโครงการ (เบิก − รับคืน) ต่อวัสดุ ทุกคลัง */
    private BigDecimal netIssued(UUID projectId, UUID materialId) {
        em.flush();
        return SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(-qty), 0) from stock_movements
                        where project_id = ?1 and material_id = ?2 and kind in ('issue', 'return')
                        """).setParameter(1, projectId).setParameter(2, materialId).getSingleResult()).max(BigDecimal.ZERO);
    }

    private BigDecimal projectIssueCost(UUID projectId, UUID materialId, BigDecimal fallback) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select coalesce(sum(-qty), 0), coalesce(sum(-qty * unit_cost), 0) from stock_movements
                        where project_id = ?1 and material_id = ?2 and kind = 'issue'
                        """).setParameter(1, projectId).setParameter(2, materialId).getSingleResult();
        BigDecimal q = SqlValues.decimal0(r[0]);
        return q.signum() > 0 ? SqlValues.decimal0(r[1]).divide(q, 4, RoundingMode.HALF_UP) : fallback;
    }

    public StockMath.Position position(UUID materialId, UUID warehouseId) {
        em.flush();
        Object[] r = (Object[]) em.createNativeQuery("""
                        select coalesce(sum(qty), 0), coalesce(sum(qty * unit_cost), 0) from stock_movements
                        where material_id = ?1 and warehouse_id = ?2
                        """).setParameter(1, materialId).setParameter(2, warehouseId).getSingleResult();
        return new StockMath.Position(SqlValues.decimal0(r[0]), SqlValues.decimal0(r[1]));
    }

    private void lock(UUID materialId, UUID warehouseId) {
        em.createNativeQuery("select pg_advisory_xact_lock(hashtext(?1))")
                .setParameter(1, "stock:" + materialId + ":" + warehouseId).getSingleResult();
    }

    // ================================================================= alerts (SiteJobs เรียกทุกเช้า)

    @Transactional
    public int notifyLowStock() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select m.name, w.name, coalesce((select sum(s.qty) from stock_movements s
                                where s.material_id = l.material_id and s.warehouse_id = l.warehouse_id), 0), l.min_qty, l.material_id
                        from stock_levels l join materials m on m.id = l.material_id join warehouses w on w.id = l.warehouse_id
                        where l.min_qty > 0 and w.deleted_at is null and w.active
                        """).getResultList();
        List<Object[]> low = rows.stream().filter(r -> SqlValues.decimal0(r[2]).compareTo(SqlValues.decimal0(r[3])) < 0).toList();
        if (low.isEmpty()) {
            return 0;
        }
        String body = String.join(", ", low.stream().limit(10).map(r -> r[0] + " (" + r[1] + ")").toList())
                + (low.size() > 10 ? " และอีก " + (low.size() - 10) + " รายการ" : "");
        notifications.notifyAll(notifications.usersWithPermission(Perm.STOCK_WRITE), "low_stock",
                "วัสดุต่ำกว่าจุดสั่งซื้อ " + low.size() + " รายการ", body, "/stock?low=true", "stock", new UUID(0, 1));
        return low.size();
    }

    private void requireRead() {
        if (!currentUser.can(Perm.STOCK_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูคลังวัสดุ");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.STOCK_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์จัดการคลังวัสดุ");
        }
    }
}
