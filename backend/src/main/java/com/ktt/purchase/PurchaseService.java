package com.ktt.purchase;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.pricing.Material;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.purchase.PurchaseDtos.GrLine;
import com.ktt.purchase.PurchaseDtos.GrRow;
import com.ktt.purchase.PurchaseDtos.PoDto;
import com.ktt.purchase.PurchaseDtos.PoItemDto;
import com.ktt.purchase.PurchaseDtos.PoItemInput;
import com.ktt.purchase.PurchaseDtos.PoRequest;
import com.ktt.purchase.PurchaseDtos.PoRow;
import com.ktt.purchase.PurchaseDtos.PrDto;
import com.ktt.purchase.PurchaseDtos.PrItemDto;
import com.ktt.purchase.PurchaseDtos.PrItemInput;
import com.ktt.purchase.PurchaseDtos.PrRequest;
import com.ktt.purchase.PurchaseDtos.PrRow;
import com.ktt.purchase.PurchaseDtos.QuoteDto;
import com.ktt.purchase.PurchaseDtos.QuoteRequest;
import com.ktt.purchase.PurchaseDtos.ReceiveLine;
import com.ktt.purchase.PurchaseDtos.ReceiveRequest;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.settings.AppSettings;
import com.ktt.stock.StockService;
import com.ktt.stock.Warehouse;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * จัดซื้อ
 * <pre>
 * PR: draft ──ส่ง──► submitted ──อนุมัติ──► approved ──เลือกใบเสนอราคา──► ordered (สร้าง PO)
 * PO: draft ──ส่ง──► (เกินเกณฑ์) pending_approval ──อนุมัติ──► approved ──รับของ──► partial ──► received ──► closed
 * </pre>
 * รับของเข้าคลัง (PO มีคลังปลายทาง) = เพิ่มสต็อกด้วยราคาซื้อหลังหักส่วนลดเฉลี่ย ไม่รวม VAT
 * ส่งตรงหน้างาน (PO ไม่มีคลัง) = ตัดเป็นต้นทุนวัสดุของโครงการทันที
 */
@ApplicationScoped
public class PurchaseService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ProjectService projects;

    @Inject
    StockService stock;

    @Inject
    SupplierService suppliers;

    @Inject
    NotificationService notifications;

    @Inject
    AppSettings settings;

    @Inject
    ObjectMapper mapper;

    @Inject
    EntityManager em;

    // ================================================================= PR

    @Transactional
    public PageResult<PrRow> listPr(String status, UUID projectId, String q, int page, int size) {
        requirePrAccess();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (!currentUser.can(Perm.PURCHASE_READ)) {
            w.append(" and createdBy = :me");
            p.and("me", currentUser.id());
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        if (projectId != null) {
            w.append(" and projectId = :project");
            p.and("project", projectId);
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or id in (select i.prId from PurchaseRequestItem i where lower(i.description) like :q))");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        PanacheQuery<PurchaseRequest> query = PurchaseRequest.find(w.toString(), Sort.descending("requestDate").and("docNo", Sort.Direction.Descending), p);
        long total = query.count();
        List<PurchaseRequest> list = query.page(Page.of(page, size)).list();
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.createdBy).toList());
        List<PrRow> rows = new ArrayList<>();
        for (PurchaseRequest x : list) {
            Object[] agg = (Object[]) em.createNativeQuery("""
                            select count(*), coalesce(sum(quantity * coalesce(est_unit_price, 0)), 0) from purchase_request_items where pr_id = ?1
                            """).setParameter(1, x.id).getSingleResult();
            Project pr = x.projectId == null ? null : Project.findById(x.projectId);
            PurchaseOrder po = PurchaseOrder.find("prId", x.id).firstResult();
            rows.add(new PrRow(x.id, x.docNo, pr == null ? null : pr.code, pr == null ? null : pr.name, x.requestDate,
                    x.requiredDate, x.status, ((Number) agg[0]).intValue(), Money.round2(SqlValues.decimal0(agg[1])),
                    names.get(x.createdBy), po == null ? null : po.docNo));
        }
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public PrDto getPr(UUID id) {
        return toDto(requirePr(id));
    }

    @Transactional
    public PrDto createPr(PrRequest req) {
        if (!currentUser.can(Perm.PURCHASE_REQUEST) && !currentUser.can(Perm.PURCHASE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์เขียนใบขอซื้อ");
        }
        PurchaseRequest x = new PurchaseRequest();
        x.docNo = docNumbers.next(projects.prefix("purchase_request", "PR"), req.requestDate());
        x.createdBy = currentUser.id();
        applyPr(x, req);
        x.persist();
        writePrItems(x, req.items());
        audit.log("purchase_request", x.id, AuditService.ACTION_CREATE, null, Map.of("docNo", x.docNo));
        return toDto(x);
    }

    @Transactional
    public PrDto updatePr(UUID id, PrRequest req) {
        PurchaseRequest x = requirePr(id);
        requirePrOwner(x);
        if (!"draft".equals(x.status) && !"rejected".equals(x.status)) {
            throw ApiException.conflict("not_editable", "แก้ไขได้เฉพาะใบขอซื้อที่เป็นร่างหรือถูกตีกลับ");
        }
        applyPr(x, req);
        x.status = "draft";
        writePrItems(x, req.items());
        audit.log("purchase_request", x.id, AuditService.ACTION_UPDATE, null, Map.of("items", req.items().size()));
        return toDto(x);
    }

    @Transactional
    public PrDto submitPr(UUID id) {
        PurchaseRequest x = requirePr(id);
        requirePrOwner(x);
        if (!"draft".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ส่งได้เฉพาะฉบับร่าง");
        }
        x.status = "submitted";
        notifications.notifyAll(notifications.usersWithPermission(Perm.PURCHASE_APPROVE), "approval_request",
                "ขออนุมัติใบขอซื้อ " + x.docNo, projectLabel(x.projectId), "/purchase/requests/" + x.id, "purchase_request", x.id);
        audit.log("purchase_request", x.id, AuditService.ACTION_UPDATE, Map.of("status", "draft"), Map.of("status", x.status));
        return toDto(x);
    }

    @Transactional
    public PrDto decidePr(UUID id, boolean approve, String comment) {
        if (!currentUser.can(Perm.PURCHASE_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติใบขอซื้อ");
        }
        PurchaseRequest x = requirePr(id);
        if (!"submitted".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบขอซื้อนี้ไม่ได้รออนุมัติ");
        }
        if (currentUser.id().equals(x.createdBy) && !isOwner()) {
            throw ApiException.forbidden("self_approval", "อนุมัติใบขอซื้อของตัวเองไม่ได้");
        }
        if (!approve && UserNames.blankToNull(comment) == null) {
            throw ApiException.badRequest("reason_required", "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
        }
        x.status = approve ? "approved" : "rejected";
        x.decidedBy = currentUser.id();
        x.decidedAt = Instant.now();
        x.decisionComment = UserNames.blankToNull(comment);
        if (x.createdBy != null) {
            notifications.notify(x.createdBy, "approval_result", (approve ? "อนุมัติแล้ว: " : "ไม่อนุมัติ: ") + x.docNo,
                    x.decisionComment, "/purchase/requests/" + x.id, "purchase_request", x.id);
        }
        audit.log("purchase_request", x.id, approve ? AuditService.ACTION_APPROVE : AuditService.ACTION_REJECT, null,
                Map.of("comment", x.decisionComment == null ? "" : x.decisionComment));
        return toDto(x);
    }

    @Transactional
    public PrDto cancelPr(UUID id) {
        PurchaseRequest x = requirePr(id);
        requirePrOwner(x);
        if ("ordered".equals(x.status) || "cancelled".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบขอซื้อนี้สั่งซื้อหรือยกเลิกไปแล้ว");
        }
        x.status = "cancelled";
        audit.log("purchase_request", x.id, AuditService.ACTION_UPDATE, null, Map.of("status", "cancelled"));
        return toDto(x);
    }

    // ---------------------------------------------------------------- เปรียบเทียบราคา

    @Transactional
    public PrDto saveQuote(UUID prId, UUID quoteId, QuoteRequest req) {
        requireWrite();
        PurchaseRequest x = requirePr(prId);
        if (!"approved".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "บันทึกใบเสนอราคาได้เมื่อใบขอซื้ออนุมัติแล้วและยังไม่สั่งซื้อ");
        }
        Supplier s = suppliers.require(req.supplierId());
        PrQuote q = quoteId == null ? new PrQuote() : PrQuote.findById(quoteId);
        if (q == null || (q.prId != null && !q.prId.equals(x.id))) {
            throw ApiException.notFound("ไม่พบใบเสนอราคา");
        }
        Map<UUID, PurchaseRequestItem> items = new HashMap<>();
        PurchaseRequestItem.listFor(x.id).forEach(i -> items.put(i.id, i));
        ObjectNode prices = mapper.createObjectNode();
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<UUID, BigDecimal> e : req.prices().entrySet()) {
            PurchaseRequestItem it = items.get(e.getKey());
            if (it == null) {
                throw ApiException.badRequest("invalid_item", "รายการไม่ได้อยู่ในใบขอซื้อนี้");
            }
            if (e.getValue() == null) {
                continue;
            }
            if (e.getValue().signum() < 0) {
                throw ApiException.badRequest("invalid_price", "ราคาต้องไม่ติดลบ");
            }
            BigDecimal price = Money.round2(e.getValue());
            prices.put(e.getKey().toString(), price);
            total = total.add(Money.round2(price.multiply(it.quantity)));
        }
        q.prId = x.id;
        q.supplierId = s.id;
        q.quoteRef = UserNames.blankToNull(req.quoteRef());
        q.quoteDate = req.quoteDate();
        q.deliveryDays = req.deliveryDays();
        q.creditDays = req.creditDays() == null ? s.creditDays : req.creditDays();
        q.vatIncluded = req.vatIncluded();
        q.prices = prices;
        q.total = total;
        q.notes = UserNames.blankToNull(req.notes());
        if (q.id == null) {
            q.createdBy = currentUser.id();
            q.persist();
        }
        audit.log("purchase_request", x.id, AuditService.ACTION_UPDATE, null, Map.of("quote", s.name, "total", total));
        return toDto(x);
    }

    @Transactional
    public PrDto deleteQuote(UUID prId, UUID quoteId) {
        requireWrite();
        PurchaseRequest x = requirePr(prId);
        PrQuote q = PrQuote.findById(quoteId);
        if (q == null || !q.prId.equals(x.id) || q.selected) {
            throw ApiException.conflict("not_deletable", "ลบใบเสนอราคานี้ไม่ได้");
        }
        q.delete();
        return toDto(x);
    }

    /** เลือกผู้ขายจากตารางเปรียบเทียบ แล้วสร้าง PO ฉบับร่าง (เฉพาะรายการที่ผู้ขายรายนี้เสนอราคา) */
    @Transactional
    public PoDto orderFromQuote(UUID prId, UUID quoteId) {
        requireWrite();
        PurchaseRequest x = requirePr(prId);
        if (!"approved".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบขอซื้อต้องอนุมัติแล้วและยังไม่สั่งซื้อ");
        }
        PrQuote q = PrQuote.findById(quoteId);
        if (q == null || !q.prId.equals(x.id)) {
            throw ApiException.notFound("ไม่พบใบเสนอราคา");
        }
        Supplier s = suppliers.require(q.supplierId);
        List<PoItemInput> lines = new ArrayList<>();
        for (PurchaseRequestItem it : PurchaseRequestItem.listFor(x.id)) {
            if (q.prices != null && q.prices.hasNonNull(it.id.toString())) {
                BigDecimal price = q.prices.get(it.id.toString()).decimalValue();
                if (q.vatIncluded) {
                    // ราคารวม VAT → แปลงเป็นก่อน VAT เพราะ PO คิด VAT แยก
                    price = price.multiply(Money.HUNDRED).divide(new BigDecimal("107"), 2, RoundingMode.HALF_UP);
                }
                lines.add(new PoItemInput(null, it.materialId, it.id, it.description, it.quantity, it.unit, price));
            }
        }
        if (lines.isEmpty()) {
            throw ApiException.badRequest("no_prices", "ใบเสนอราคานี้ไม่มีราคาสำหรับรายการใดเลย");
        }
        PoDto po = createPo(new PoRequest(s.id, x.projectId, x.warehouseId, DocNumberService.today(), x.requiredDate, null,
                BigDecimal.ZERO, s.vatRegistered, q.creditDays == null ? s.creditDays : q.creditDays, null,
                q.quoteRef == null ? null : "อ้างอิงใบเสนอราคา " + q.quoteRef, lines), x.id);
        PrQuote.update("selected = false where prId = ?1", x.id);
        q.selected = true;
        x.status = "ordered";
        audit.log("purchase_request", x.id, AuditService.ACTION_UPDATE, Map.of("status", "approved"),
                Map.of("status", "ordered", "po", po.docNo(), "supplier", s.name));
        return po;
    }

    // ================================================================= PO

    @Transactional
    public PageResult<PoRow> listPo(String status, UUID supplierId, UUID projectId, String q, int page, int size) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (status != null && !status.isBlank()) {
            if ("open".equals(status)) {
                w.append(" and status in ('approved', 'partial')");
            } else {
                w.append(" and status = :status");
                p.and("status", status);
            }
        }
        if (supplierId != null) {
            w.append(" and supplierId = :supplier");
            p.and("supplier", supplierId);
        }
        if (projectId != null) {
            w.append(" and projectId = :project");
            p.and("project", projectId);
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or lower(supplierName) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        PanacheQuery<PurchaseOrder> query = PurchaseOrder.find(w.toString(), Sort.descending("orderDate").and("docNo", Sort.Direction.Descending), p);
        long total = query.count();
        List<PurchaseOrder> list = query.page(Page.of(page, size)).list();
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.createdBy).toList());
        List<PoRow> rows = new ArrayList<>();
        for (PurchaseOrder x : list) {
            Project pr = x.projectId == null ? null : Project.findById(x.projectId);
            rows.add(new PoRow(x.id, x.docNo, x.supplierName, pr == null ? null : pr.code, x.orderDate, x.deliveryDate,
                    x.status, x.totalAmount, receivedPct(x.id), names.get(x.createdBy)));
        }
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public PoDto getPo(UUID id) {
        requireRead();
        return toDto(requirePo(id));
    }

    @Transactional
    public PoDto createPo(PoRequest req) {
        return createPo(req, null);
    }

    private PoDto createPo(PoRequest req, UUID prId) {
        requireWrite();
        PurchaseOrder x = new PurchaseOrder();
        x.docNo = docNumbers.next(projects.prefix("purchase_order", "PO"), req.orderDate());
        x.prId = prId;
        x.createdBy = currentUser.id();
        applyPo(x, req);
        x.persist();
        List<PurchaseOrderItem> items = writePoItems(x, req.items());
        recalcPo(x, items);
        audit.log("purchase_order", x.id, AuditService.ACTION_CREATE, null,
                Map.of("docNo", x.docNo, "supplier", x.supplierName, "total", x.totalAmount));
        return toDto(x);
    }

    @Transactional
    public PoDto updatePo(UUID id, PoRequest req) {
        requireWrite();
        PurchaseOrder x = requirePo(id);
        if (!"draft".equals(x.status)) {
            throw ApiException.conflict("not_editable", "แก้ไขได้เฉพาะใบสั่งซื้อฉบับร่าง");
        }
        applyPo(x, req);
        PurchaseOrderItem.delete("poId", x.id);
        List<PurchaseOrderItem> items = writePoItems(x, req.items());
        recalcPo(x, items);
        audit.log("purchase_order", x.id, AuditService.ACTION_UPDATE, null, Map.of("total", x.totalAmount));
        return toDto(x);
    }

    @Transactional
    public PoDto submitPo(UUID id) {
        requireWrite();
        PurchaseOrder x = requirePo(id);
        if (!"draft".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ส่งได้เฉพาะฉบับร่าง");
        }
        if (needsApproval(x)) {
            x.status = "pending_approval";
            notifications.notifyAll(notifications.usersWithPermission(Perm.PURCHASE_APPROVE), "approval_request",
                    "ขออนุมัติใบสั่งซื้อ " + x.docNo, x.supplierName + " " + x.totalAmount.toPlainString() + " บาท",
                    "/purchase/orders/" + x.id, "purchase_order", x.id);
        } else {
            x.status = "approved";
            x.approvedBy = currentUser.id();
            x.approvedAt = Instant.now();
        }
        audit.log("purchase_order", x.id, AuditService.ACTION_UPDATE, Map.of("status", "draft"), Map.of("status", x.status));
        return toDto(x);
    }

    @Transactional
    public PoDto decidePo(UUID id, boolean approve, String comment) {
        if (!currentUser.can(Perm.PURCHASE_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติใบสั่งซื้อ");
        }
        PurchaseOrder x = requirePo(id);
        if (!"pending_approval".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบสั่งซื้อนี้ไม่ได้รออนุมัติ");
        }
        if (currentUser.id().equals(x.createdBy) && !isOwner()) {
            throw ApiException.forbidden("self_approval", "อนุมัติใบสั่งซื้อของตัวเองไม่ได้");
        }
        x.status = approve ? "approved" : "draft";
        if (approve) {
            x.approvedBy = currentUser.id();
            x.approvedAt = Instant.now();
        }
        if (x.createdBy != null) {
            notifications.notify(x.createdBy, "approval_result", (approve ? "อนุมัติแล้ว: " : "ไม่อนุมัติ: ") + x.docNo,
                    UserNames.blankToNull(comment), "/purchase/orders/" + x.id, "purchase_order", x.id);
        }
        audit.log("purchase_order", x.id, approve ? AuditService.ACTION_APPROVE : AuditService.ACTION_REJECT, null,
                Map.of("comment", comment == null ? "" : comment));
        return toDto(x);
    }

    @Transactional
    public PoDto cancelPo(UUID id) {
        requireWrite();
        PurchaseOrder x = requirePo(id);
        if (!Set.of("draft", "pending_approval", "approved").contains(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบสั่งซื้อที่รับของแล้วยกเลิกไม่ได้ ให้ปิดใบสั่งซื้อแทน");
        }
        x.status = "cancelled";
        if (x.prId != null) {
            PurchaseRequest pr = PurchaseRequest.findById(x.prId);
            if (pr != null && "ordered".equals(pr.status)) {
                pr.status = "approved";
                PrQuote.update("selected = false where prId = ?1", pr.id);
            }
        }
        audit.log("purchase_order", x.id, AuditService.ACTION_UPDATE, null, Map.of("status", "cancelled"));
        return toDto(x);
    }

    /** ปิดใบสั่งซื้อที่รับของไม่ครบและจะไม่รับเพิ่ม */
    @Transactional
    public PoDto closePo(UUID id) {
        requireWrite();
        PurchaseOrder x = requirePo(id);
        if (!"partial".equals(x.status) && !"received".equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ปิดได้เฉพาะใบสั่งซื้อที่รับของแล้ว");
        }
        x.status = "closed";
        audit.log("purchase_order", x.id, AuditService.ACTION_UPDATE, null, Map.of("status", "closed"));
        return toDto(x);
    }

    @Transactional
    public void deletePo(UUID id) {
        requireWrite();
        PurchaseOrder x = requirePo(id);
        if (!"draft".equals(x.status)) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะฉบับร่าง");
        }
        x.softDelete();
        if (x.prId != null) {
            PurchaseRequest pr = PurchaseRequest.findById(x.prId);
            if (pr != null && "ordered".equals(pr.status)) {
                pr.status = "approved";
                PrQuote.update("selected = false where prId = ?1", pr.id);
            }
        }
        audit.log("purchase_order", x.id, AuditService.ACTION_DELETE, Map.of("docNo", x.docNo), null);
    }

    // ---------------------------------------------------------------- รับสินค้า

    @Transactional
    public PoDto receive(UUID poId, ReceiveRequest req) {
        if (!currentUser.can(Perm.PURCHASE_WRITE) && !currentUser.can(Perm.STOCK_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์รับสินค้า");
        }
        // ล็อกใบสั่งซื้อกันรับของพร้อมกันเกินจำนวนสั่ง
        PurchaseOrder po = lockPo(poId);
        if (!"approved".equals(po.status) && !"partial".equals(po.status)) {
            throw ApiException.conflict("invalid_status", "รับของได้เฉพาะใบสั่งซื้อที่อนุมัติแล้ว");
        }
        if (req.receiveDate().isAfter(DocNumberService.today())) {
            throw ApiException.badRequest("future_date", "วันที่รับของต้องไม่เกินวันนี้");
        }
        if (po.warehouseId == null && po.projectId == null) {
            throw ApiException.badRequest("no_destination", "ใบสั่งซื้อต้องระบุคลังหรือโครงการปลายทาง");
        }
        // ต้นทุนต่อหน่วยหลังเฉลี่ยส่วนลดท้ายบิล (ไม่รวม VAT)
        BigDecimal factor = po.subtotal.signum() == 0 ? BigDecimal.ONE
                : po.subtotal.subtract(po.discountAmount).divide(po.subtotal, 10, RoundingMode.HALF_UP);
        GoodsReceipt gr = new GoodsReceipt();
        gr.docNo = docNumbers.next(projects.prefix("goods_receipt", "GR"), req.receiveDate());
        gr.poId = po.id;
        gr.receiveDate = req.receiveDate();
        gr.warehouseId = po.warehouseId;
        gr.projectId = po.warehouseId == null ? po.projectId : null;
        gr.deliveryNoteNo = UserNames.blankToNull(req.deliveryNoteNo());
        gr.notes = UserNames.blankToNull(req.notes());
        gr.createdBy = currentUser.id();
        gr.persist();
        Set<UUID> seen = new HashSet<>();
        for (ReceiveLine line : req.lines()) {
            if (!seen.add(line.poItemId())) {
                throw ApiException.badRequest("duplicate_line", "รายการซ้ำ");
            }
            PurchaseOrderItem it = PurchaseOrderItem.findById(line.poItemId(), LockModeType.PESSIMISTIC_WRITE);
            if (it == null || !it.poId.equals(po.id)) {
                throw ApiException.badRequest("invalid_item", "รายการไม่ได้อยู่ในใบสั่งซื้อนี้");
            }
            BigDecimal remaining = it.quantity.subtract(it.receivedQty);
            if (line.quantity().compareTo(remaining) > 0) {
                throw ApiException.badRequest("over_receive", "\"" + it.description + "\" รับได้อีกไม่เกิน " + remaining.stripTrailingZeros().toPlainString());
            }
            if (po.warehouseId != null && it.materialId == null) {
                throw ApiException.badRequest("no_material", "\"" + it.description + "\" ไม่ได้ผูกกับวัสดุในฐานราคา จึงรับเข้าคลังไม่ได้");
            }
            BigDecimal unitCost = it.unitPrice.multiply(factor).setScale(4, RoundingMode.HALF_UP);
            GoodsReceiptItem gi = new GoodsReceiptItem();
            gi.grId = gr.id;
            gi.poItemId = it.id;
            gi.materialId = it.materialId;
            gi.description = it.description;
            gi.quantity = line.quantity();
            gi.unit = it.unit;
            gi.unitCost = unitCost;
            gi.persist();
            it.receivedQty = it.receivedQty.add(line.quantity());
            if (po.warehouseId != null) {
                stock.receive(it.materialId, po.warehouseId, line.quantity(), unitCost, gr.receiveDate, "goods_receipt", gr.id, po.docNo);
            }
        }
        updateReceiveStatus(po);
        audit.log("purchase_order", po.id, AuditService.ACTION_UPDATE, null, Map.of("goodsReceipt", gr.docNo, "status", po.status));
        return toDto(po);
    }

    @Transactional
    public PoDto voidReceipt(UUID grId) {
        if (!currentUser.can(Perm.PURCHASE_WRITE) && !currentUser.can(Perm.STOCK_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ยกเลิกใบรับสินค้า");
        }
        GoodsReceipt gr = grId == null ? null : GoodsReceipt.findById(grId, LockModeType.PESSIMISTIC_WRITE);
        if (gr == null || "void".equals(gr.status)) {
            throw ApiException.notFound("ไม่พบใบรับสินค้า");
        }
        PurchaseOrder po = lockPo(gr.poId);
        Number billed = (Number) em.createNativeQuery("select count(*) from ap_bills where po_id = ?1 and status <> 'void' and deleted_at is null")
                .setParameter(1, po.id).getSingleResult();
        if (billed.longValue() > 0) {
            throw ApiException.conflict("billed", "ใบสั่งซื้อนี้บันทึกบิลแล้ว ยกเลิกใบรับสินค้าไม่ได้");
        }
        stock.reverse("goods_receipt", gr.id, DocNumberService.today());
        for (GoodsReceiptItem gi : GoodsReceiptItem.listFor(gr.id)) {
            PurchaseOrderItem it = PurchaseOrderItem.findById(gi.poItemId, LockModeType.PESSIMISTIC_WRITE);
            it.receivedQty = it.receivedQty.subtract(gi.quantity).max(BigDecimal.ZERO);
        }
        gr.status = "void";
        if ("closed".equals(po.status)) {
            po.status = "partial";
        }
        updateReceiveStatus(po);
        audit.log("goods_receipt", gr.id, AuditService.ACTION_DELETE, Map.of("docNo", gr.docNo), Map.of("status", "void"));
        return toDto(po);
    }

    private void updateReceiveStatus(PurchaseOrder po) {
        em.flush();
        List<PurchaseOrderItem> items = PurchaseOrderItem.listFor(po.id);
        boolean all = items.stream().allMatch(i -> i.receivedQty.compareTo(i.quantity) >= 0);
        boolean any = items.stream().anyMatch(i -> i.receivedQty.signum() > 0);
        if ("closed".equals(po.status)) {
            return;
        }
        po.status = all ? "received" : any ? "partial" : "approved";
    }

    // ================================================================= internals

    private void applyPr(PurchaseRequest x, PrRequest req) {
        if (req.projectId() != null) {
            projects.requireVisible(req.projectId());
        }
        if (req.warehouseId() != null && Warehouse.findById(req.warehouseId()) == null) {
            throw ApiException.badRequest("invalid_warehouse", "ไม่พบคลัง");
        }
        if (req.projectId() == null && req.warehouseId() == null) {
            throw ApiException.badRequest("no_destination", "กรุณาระบุโครงการหรือคลังที่จะใช้ของ");
        }
        x.projectId = req.projectId();
        x.warehouseId = req.warehouseId();
        x.requestDate = req.requestDate();
        x.requiredDate = req.requiredDate();
        x.notes = UserNames.blankToNull(req.notes());
    }

    private void writePrItems(PurchaseRequest x, List<PrItemInput> items) {
        Set<UUID> keep = new HashSet<>();
        int order = 0;
        Map<UUID, PurchaseRequestItem> existing = new HashMap<>();
        PurchaseRequestItem.listFor(x.id).forEach(i -> existing.put(i.id, i));
        for (PrItemInput in : items) {
            PurchaseRequestItem it = in.id() == null ? null : existing.get(in.id());
            if (it == null) {
                it = new PurchaseRequestItem();
                it.prId = x.id;
            }
            if (in.materialId() != null && Material.findById(in.materialId()) == null) {
                throw ApiException.badRequest("invalid_material", "ไม่พบวัสดุ");
            }
            it.sortOrder = ++order;
            it.materialId = in.materialId();
            it.description = in.description().trim();
            it.quantity = in.quantity();
            it.unit = UserNames.blankToNull(in.unit());
            it.estUnitPrice = in.estUnitPrice();
            it.note = UserNames.blankToNull(in.note());
            if (it.id == null) {
                it.persist();
            }
            keep.add(it.id);
        }
        for (PurchaseRequestItem old : existing.values()) {
            if (!keep.contains(old.id)) {
                em.createNativeQuery("update purchase_order_items set pr_item_id = null where pr_item_id = ?1").setParameter(1, old.id).executeUpdate();
                old.delete();
            }
        }
    }

    private void applyPo(PurchaseOrder x, PoRequest req) {
        Supplier s = suppliers.require(req.supplierId());
        if (!s.active) {
            throw ApiException.badRequest("inactive_supplier", "ผู้ขายนี้ถูกปิดการใช้งาน");
        }
        if (req.projectId() != null) {
            projects.requireVisible(req.projectId());
        }
        if (req.warehouseId() != null && Warehouse.findById(req.warehouseId()) == null) {
            throw ApiException.badRequest("invalid_warehouse", "ไม่พบคลัง");
        }
        if (req.warehouseId() == null && req.projectId() == null) {
            throw ApiException.badRequest("no_destination", "กรุณาระบุคลังที่รับของ หรือโครงการ (ส่งตรงหน้างาน)");
        }
        x.supplierId = s.id;
        x.supplierName = s.name;
        x.supplierAddress = s.address;
        x.supplierTaxId = s.taxId;
        x.supplierBranchNo = s.branchNo;
        x.projectId = req.projectId();
        x.warehouseId = req.warehouseId();
        x.orderDate = req.orderDate();
        x.deliveryDate = req.deliveryDate();
        x.deliveryAddress = UserNames.blankToNull(req.deliveryAddress());
        if (x.deliveryAddress == null && x.projectId != null && x.warehouseId == null) {
            Project p = Project.findById(x.projectId);
            x.deliveryAddress = p.siteAddress;
        }
        x.discountAmount = Money.round2(req.discountAmount());
        x.vatPct = req.vatEnabled() ? new BigDecimal("7.00") : BigDecimal.ZERO;
        x.creditDays = req.creditDays();
        x.paymentTerms = UserNames.blankToNull(req.paymentTerms());
        x.notes = UserNames.blankToNull(req.notes());
    }

    private List<PurchaseOrderItem> writePoItems(PurchaseOrder x, List<PoItemInput> items) {
        List<PurchaseOrderItem> out = new ArrayList<>();
        int order = 0;
        for (PoItemInput in : items) {
            PurchaseOrderItem it = new PurchaseOrderItem();
            it.poId = x.id;
            it.sortOrder = ++order;
            if (in.materialId() != null && Material.findById(in.materialId()) == null) {
                throw ApiException.badRequest("invalid_material", "ไม่พบวัสดุ");
            }
            it.materialId = in.materialId();
            it.prItemId = in.prItemId();
            it.description = in.description().trim();
            it.quantity = in.quantity();
            it.unit = UserNames.blankToNull(in.unit());
            it.unitPrice = Money.round2(in.unitPrice());
            it.amount = Money.round2(it.quantity.multiply(it.unitPrice));
            it.persist();
            out.add(it);
        }
        return out;
    }

    static void recalcPo(PurchaseOrder x, List<PurchaseOrderItem> items) {
        BigDecimal subtotal = items.stream().map(i -> i.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        x.subtotal = Money.round2(subtotal);
        if (x.discountAmount.compareTo(x.subtotal) > 0) {
            throw ApiException.badRequest("invalid_discount", "ส่วนลดมากกว่ายอดรวม");
        }
        BigDecimal base = x.subtotal.subtract(x.discountAmount);
        x.vatAmount = Money.pct(base, x.vatPct);
        x.totalAmount = base.add(x.vatAmount);
    }

    private boolean needsApproval(PurchaseOrder x) {
        BigDecimal threshold = settings.getDecimal("purchase.approval_threshold", new BigDecimal("50000"));
        return x.totalAmount.compareTo(threshold) > 0;
    }

    private BigDecimal receivedPct(UUID poId) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select coalesce(sum(least(received_qty, quantity) * unit_price), 0), coalesce(sum(quantity * unit_price), 0)
                        from purchase_order_items where po_id = ?1""").setParameter(1, poId).getSingleResult();
        BigDecimal got = SqlValues.decimal0(r[0]);
        BigDecimal all = SqlValues.decimal0(r[1]);
        return all.signum() == 0 ? BigDecimal.ZERO : got.multiply(Money.HUNDRED).divide(all, 1, RoundingMode.HALF_UP);
    }

    private PurchaseRequest requirePr(UUID id) {
        requirePrAccess();
        PurchaseRequest x = id == null ? null : PurchaseRequest.findById(id);
        if (x == null || (!currentUser.can(Perm.PURCHASE_READ) && !currentUser.id().equals(x.createdBy))) {
            throw ApiException.notFound("ไม่พบใบขอซื้อ");
        }
        return x;
    }

    private void requirePrOwner(PurchaseRequest x) {
        if (!currentUser.id().equals(x.createdBy) && !currentUser.can(Perm.PURCHASE_WRITE)) {
            throw ApiException.forbidden("forbidden", "แก้ไขได้เฉพาะใบขอซื้อของตนเอง");
        }
    }

    private PurchaseOrder lockPo(UUID id) {
        PurchaseOrder x = id == null ? null : PurchaseOrder.findById(id, LockModeType.PESSIMISTIC_WRITE);
        if (x == null) {
            throw ApiException.notFound("ไม่พบใบสั่งซื้อ");
        }
        return x;
    }

    private PurchaseOrder requirePo(UUID id) {
        PurchaseOrder x = id == null ? null : PurchaseOrder.findById(id);
        if (x == null) {
            throw ApiException.notFound("ไม่พบใบสั่งซื้อ");
        }
        return x;
    }

    private void requirePrAccess() {
        if (!currentUser.can(Perm.PURCHASE_READ) && !currentUser.can(Perm.PURCHASE_REQUEST)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูใบขอซื้อ");
        }
    }

    private void requireRead() {
        if (!currentUser.can(Perm.PURCHASE_READ) && !currentUser.can(Perm.AP_READ) && !currentUser.can(Perm.STOCK_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูใบสั่งซื้อ");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.PURCHASE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์จัดซื้อ");
        }
    }

    private boolean isOwner() {
        com.ktt.auth.User u = com.ktt.auth.User.findById(currentUser.id());
        return u != null && "owner".equals(u.role.code);
    }

    private String projectLabel(UUID projectId) {
        Project p = projectId == null ? null : Project.findById(projectId);
        return p == null ? null : p.code + " " + p.name;
    }

    // ================================================================= dto

    PrDto toDto(PurchaseRequest x) {
        Project p = x.projectId == null ? null : Project.findById(x.projectId);
        List<PurchaseRequestItem> items = PurchaseRequestItem.listFor(x.id);
        Map<UUID, String> codes = materialCodes(items.stream().map(i -> i.materialId).toList());
        List<PrItemDto> its = items.stream().map(i -> new PrItemDto(i.id, i.sortOrder, i.materialId, codes.get(i.materialId),
                i.description, i.quantity, i.unit, i.estUnitPrice, i.note)).toList();
        List<PrQuote> quotes = currentUser.can(Perm.PURCHASE_READ) ? PrQuote.listFor(x.id) : List.of();
        Map<UUID, BigDecimal> ratings = suppliers.ratings(quotes.stream().map(q -> q.supplierId).toList());
        List<QuoteDto> qs = new ArrayList<>();
        for (PrQuote q : quotes) {
            Supplier s = Supplier.findById(q.supplierId);
            Map<String, BigDecimal> prices = new LinkedHashMap<>();
            if (q.prices != null) {
                q.prices.fieldNames().forEachRemaining(k -> prices.put(k, q.prices.get(k).decimalValue()));
            }
            BigDecimal exVat = q.vatIncluded ? q.total.multiply(Money.HUNDRED).divide(new BigDecimal("107"), 2, RoundingMode.HALF_UP) : q.total;
            qs.add(new QuoteDto(q.id, q.supplierId, s == null ? null : s.name, q.quoteRef, q.quoteDate, q.deliveryDays, q.creditDays,
                    q.vatIncluded, prices, q.total, exVat, q.selected, q.notes, ratings.get(q.supplierId)));
        }
        qs.sort(java.util.Comparator.comparing(QuoteDto::totalExVat));
        PurchaseOrder po = PurchaseOrder.find("prId = ?1 and status <> 'cancelled'", x.id).firstResult();
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(x.createdBy, x.decidedBy));
        boolean mine = currentUser.id().equals(x.createdBy) || currentUser.can(Perm.PURCHASE_WRITE);
        return new PrDto(x.id, x.docNo, x.projectId, p == null ? null : p.code, p == null ? null : p.name, x.warehouseId,
                x.requestDate, x.requiredDate, x.status, x.notes, names.get(x.createdBy), names.get(x.decidedBy), x.decidedAt,
                x.decisionComment, its, qs, po == null ? null : po.id, po == null ? null : po.docNo,
                mine && ("draft".equals(x.status) || "rejected".equals(x.status)),
                "submitted".equals(x.status) && currentUser.can(Perm.PURCHASE_APPROVE),
                "approved".equals(x.status) && currentUser.can(Perm.PURCHASE_WRITE), x.createdAt);
    }

    PoDto toDto(PurchaseOrder x) {
        Project p = x.projectId == null ? null : Project.findById(x.projectId);
        PurchaseRequest pr = x.prId == null ? null : PurchaseRequest.findById(x.prId);
        Warehouse wh = x.warehouseId == null ? null : Warehouse.findById(x.warehouseId);
        Supplier s = Supplier.findById(x.supplierId);
        List<PurchaseOrderItem> items = PurchaseOrderItem.listFor(x.id);
        Map<UUID, String> codes = materialCodes(items.stream().map(i -> i.materialId).toList());
        List<PoItemDto> its = items.stream().map(i -> new PoItemDto(i.id, i.sortOrder, i.materialId, codes.get(i.materialId), i.prItemId,
                i.description, i.quantity, i.unit, i.unitPrice, i.amount, i.receivedQty,
                i.quantity.subtract(i.receivedQty).max(BigDecimal.ZERO))).toList();
        List<GoodsReceipt> grs = GoodsReceipt.list("poId = ?1 order by receiveDate, createdAt", x.id);
        Map<UUID, String> grNames = UserNames.of(grs.stream().map(g -> g.createdBy).toList());
        List<GrRow> receipts = grs.stream().map(g -> {
            List<GoodsReceiptItem> gl = GoodsReceiptItem.listFor(g.id);
            BigDecimal value = gl.stream().map(l -> l.quantity.multiply(l.unitCost)).reduce(BigDecimal.ZERO, BigDecimal::add);
            Warehouse gw = g.warehouseId == null ? null : Warehouse.findById(g.warehouseId);
            return new GrRow(g.id, g.docNo, g.receiveDate, g.deliveryNoteNo, g.status, gw == null ? "ส่งตรงหน้างาน" : gw.name,
                    value.setScale(2, RoundingMode.HALF_UP), grNames.get(g.createdBy),
                    gl.stream().map(l -> new GrLine(l.description, l.quantity, l.unit, l.unitCost)).toList());
        }).toList();
        BigDecimal billed = SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(subtotal), 0) from ap_bills where po_id = ?1 and status <> 'void' and deleted_at is null
                        """).setParameter(1, x.id).getSingleResult());
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(x.createdBy, x.approvedBy));
        boolean write = currentUser.can(Perm.PURCHASE_WRITE);
        return new PoDto(x.id, x.docNo, x.supplierId, x.supplierName, x.supplierAddress, x.supplierTaxId, x.supplierBranchNo,
                s == null ? null : s.phone, x.projectId, p == null ? null : p.code, p == null ? null : p.name, x.prId,
                pr == null ? null : pr.docNo, x.warehouseId, wh == null ? null : wh.name, x.orderDate, x.deliveryDate,
                x.deliveryAddress, x.status, x.subtotal, x.discountAmount, x.vatPct.signum() > 0, x.vatPct, x.vatAmount,
                x.totalAmount, x.creditDays, x.paymentTerms, x.notes, names.get(x.createdBy), names.get(x.approvedBy),
                x.approvedAt, its, receipts, Money.round2(billed), write && "draft".equals(x.status),
                "pending_approval".equals(x.status) && currentUser.can(Perm.PURCHASE_APPROVE),
                Set.of("approved", "partial").contains(x.status) && (write || currentUser.can(Perm.STOCK_WRITE)),
                needsApproval(x), x.createdAt);
    }

    private Map<UUID, String> materialCodes(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        Set<UUID> unique = new HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("select id, code from materials where id in (:ids)").setParameter("ids", unique).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), (String) r[1]));
        return out;
    }
}
