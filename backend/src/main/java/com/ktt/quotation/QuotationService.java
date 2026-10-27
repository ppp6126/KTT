package com.ktt.quotation;

import com.ktt.approval.Approval;
import com.ktt.audit.AuditService;
import com.ktt.boq.Boq;
import com.ktt.boq.BoqDtos;
import com.ktt.boq.BoqService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.customer.Customer;
import com.ktt.docnum.DocNumberService;
import com.ktt.lead.Lead;
import com.ktt.lead.LeadService;
import com.ktt.notification.NotificationService;
import com.ktt.quotation.QuotationDtos.ApprovalInfo;
import com.ktt.quotation.QuotationDtos.CreateRequest;
import com.ktt.quotation.QuotationDtos.ItemDto;
import com.ktt.quotation.QuotationDtos.ItemInput;
import com.ktt.quotation.QuotationDtos.PendingApproval;
import com.ktt.quotation.QuotationDtos.QuotationDto;
import com.ktt.quotation.QuotationDtos.QuotationRow;
import com.ktt.quotation.QuotationDtos.RevisionRow;
import com.ktt.quotation.QuotationDtos.UpdateRequest;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.settings.SettingsService;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * FR-07 ถึง FR-10: ใบเสนอราคา เลขอัตโนมัติ, Revision, สถานะ, วันหมดอายุ, ส่วนลด 0–15% พร้อมขออนุมัติเมื่อเกินเกณฑ์
 * <pre>
 * draft ──ส่ง──► (ส่วนลด > เกณฑ์) pending_approval ──อนุมัติ──► approved ──ส่ง──► sent ──► accepted / rejected / expired
 *        └──────────────────────────────────────────────────────────────────────┘
 * sent/approved/rejected/expired ──แก้ไข──► Revision ใหม่ (draft) ; เมื่อส่ง Revision ใหม่ ฉบับเดิมเป็น superseded
 * </pre>
 * ใบที่ส่งแล้วแก้ไขไม่ได้ ต้องสร้าง Revision ใหม่ (เก็บประวัติครบ)
 */
@ApplicationScoped
public class QuotationService {

    private static final Set<Integer> WHT = Set.of(0, 1, 2, 3, 5);

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    SettingsService settings;

    @Inject
    LeadService leads;

    @Inject
    BoqService boqs;

    @Inject
    NotificationService notifications;

    // ================================================================= query

    @Transactional
    public PageResult<QuotationRow> list(String q, String status, UUID leadId, UUID customerId, boolean latestOnly,
                                         int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        scope(w, p);
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or lower(customerName) like :q or lower(title) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        } else if (latestOnly) {
            w.append(" and status <> 'superseded'");
        }
        if (leadId != null) {
            w.append(" and leadId = :lead");
            p.and("lead", leadId);
        }
        if (customerId != null) {
            w.append(" and customerId = :customer");
            p.and("customer", customerId);
        }
        PanacheQuery<Quotation> query = Quotation.find(w.toString(), Sort.descending("issueDate").and("docNo", Sort.Direction.Descending).and("revision", Sort.Direction.Descending), p);
        long total = query.count();
        List<Quotation> list = query.page(Page.of(page, size)).list();
        Map<UUID, String> names = userNames(list.stream().map(x -> x.createdBy).toList());
        boolean cost = currentUser.canViewCost();
        List<QuotationRow> rows = list.stream().map(x -> new QuotationRow(x.id, x.docNo, x.revision, x.displayNo(), x.status,
                x.title, x.customerId, x.customerName, x.leadId, x.issueDate, x.validUntil, x.discountPct, x.totalAmount,
                cost ? margin(x) : null, names.get(x.createdBy), x.updatedAt)).toList();
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public QuotationDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    @Transactional
    public List<RevisionRow> revisions(UUID id) {
        Quotation x = requireVisible(id);
        List<Quotation> all = Quotation.list("docNo = ?1 order by revision desc", x.docNo);
        return all.stream().map(r -> new RevisionRow(r.id, r.revision, r.status, r.totalAmount, r.createdAt, r.sentAt)).toList();
    }

    // ================================================================= create / edit

    @Transactional
    public QuotationDto create(CreateRequest req) {
        requireWrite();
        Customer c = Customer.findById(req.customerId());
        if (c == null) {
            throw ApiException.badRequest("invalid_customer", "ไม่พบลูกค้า");
        }
        Lead lead = null;
        if (req.leadId() != null) {
            lead = leads.requireVisible(req.leadId());
            if (!lead.customer.id.equals(c.id)) {
                throw ApiException.badRequest("lead_customer_mismatch", "ลีดนี้เป็นของลูกค้ารายอื่น");
            }
        }
        SettingsService.QuotationSettings qs = settings.quotation();
        LocalDate today = DocNumberService.today();

        Quotation x = new Quotation();
        x.docNo = docNumbers.next(qs.docPrefix(), today);
        x.revision = 1;
        x.customerId = c.id;
        x.leadId = lead == null ? null : lead.id;
        x.title = blankToNull(req.title()) != null ? req.title().trim() : lead == null ? null : lead.title;
        snapshotCustomer(x, c);
        x.issueDate = today;
        x.validUntil = today.plusDays(qs.defaultValidityDays());
        x.overheadPct = Money.z(qs.defaultOverheadPct());
        x.vatEnabled = qs.defaultVatEnabled();
        x.roundingMode = qs.defaultRounding();
        x.paymentCondition = blankToNull(qs.defaultPaymentCondition());
        x.warrantyTerms = blankToNull(qs.defaultWarranty());
        x.displayMode = "summary".equals(req.mode()) ? "summary" : "detailed";
        x.createdBy = currentUser.id();
        x.persist();

        List<QuotationItem> items = new ArrayList<>();
        if (req.boqId() != null && !"manual".equals(req.mode())) {
            BoqDtos.BoqDto boq = boqs.get(req.boqId());
            if (x.leadId != null && !x.leadId.equals(boq.leadId())) {
                throw ApiException.badRequest("boq_lead_mismatch", "BOQ ไม่ได้อยู่ในลีดนี้");
            }
            x.boqId = boq.id();
            x.costTotal = boq.subtotalCost();
            items = itemsFromBoq(x.id, boq, "summary".equals(req.mode()));
        }
        recalc(x, items);
        audit.log("quotation", x.id, AuditService.ACTION_CREATE, null,
                Map.of("docNo", x.docNo, "customer", x.customerName, "total", x.totalAmount));
        return toDto(x, items);
    }

    @Transactional
    public QuotationDto update(UUID id, UpdateRequest req) {
        requireWrite();
        Quotation x = requireVisible(id);
        if (!x.isEditable()) {
            throw ApiException.conflict("not_editable", "ใบเสนอราคาที่ส่งหรือขออนุมัติแล้วแก้ไขไม่ได้ ให้สร้าง Revision ใหม่");
        }
        if (!WHT.contains(req.whtPct().intValue()) || req.whtPct().scale() > 2) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
        if (req.validUntil().isBefore(req.issueDate())) {
            throw ApiException.badRequest("invalid_validity", "วันหมดอายุต้องไม่ก่อนวันที่ออกเอกสาร");
        }
        Map<String, Object> before = auditView(x);
        x.title = blankToNull(req.title());
        x.customerName = req.customerName().trim();
        x.customerAddress = blankToNull(req.customerAddress());
        x.customerTaxId = blankToNull(req.customerTaxId());
        x.customerBranchNo = blankToNull(req.customerBranchNo());
        x.customerPhone = blankToNull(req.customerPhone());
        x.issueDate = req.issueDate();
        x.validUntil = req.validUntil();
        x.referenceNo = blankToNull(req.referenceNo());
        x.paymentCondition = blankToNull(req.paymentCondition());
        x.displayMode = req.displayMode() == null ? "detailed" : req.displayMode();
        x.discountPct = req.discountPct().setScale(2, RoundingMode.HALF_UP);
        x.overheadPct = req.overheadPct();
        x.vatEnabled = req.vatEnabled();
        x.vatPct = req.vatPct();
        x.roundingMode = req.roundingMode();
        x.whtPct = req.whtPct();
        x.durationDays = req.durationDays();
        x.warrantyTerms = blankToNull(req.warrantyTerms());
        x.scopeIn = blankToNull(req.scopeIn());
        x.scopeOut = blankToNull(req.scopeOut());
        x.notes = blankToNull(req.notes());

        QuotationItem.delete("quotationId", x.id);
        List<QuotationItem> items = new ArrayList<>();
        int order = 0;
        boolean cost = currentUser.canViewCost();
        BigDecimal costTotal = BigDecimal.ZERO;
        boolean hasCost = false;
        for (ItemInput in : req.items()) {
            QuotationItem it = new QuotationItem();
            it.quotationId = x.id;
            it.sortOrder = ++order;
            it.itemType = in.itemType();
            it.description = in.description().trim();
            if ("item".equals(in.itemType())) {
                it.quantity = Money.z(in.quantity());
                it.unit = blankToNull(in.unit());
                it.unitPrice = Money.round2(in.unitPrice());
                // ผู้ไม่มีสิทธิ์ cost.view ส่งต้นทุนมาไม่ได้ (ใช้ค่าเดิมจาก BOQ ไม่ได้เช่นกัน จึงล้างทิ้ง)
                it.unitCost = cost && in.unitCost() != null ? Money.round2(in.unitCost()) : null;
                if (it.unitCost != null) {
                    hasCost = true;
                    costTotal = costTotal.add(Money.round2(it.unitCost.multiply(it.quantity)));
                }
            }
            it.persist();
            items.add(it);
        }
        if (cost) {
            x.costTotal = hasCost ? costTotal : null;
        }
        recalc(x, items);
        var d = audit.diff(before, auditView(x));
        audit.log("quotation", x.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toDto(x, items);
    }

    // ================================================================= workflow

    /** ส่งลูกค้า: ถ้าส่วนลดเกินเกณฑ์และยังไม่ได้รับอนุมัติ จะส่งเรื่องขออนุมัติแทน */
    @Transactional
    public QuotationDto send(UUID id) {
        requireWrite();
        Quotation x = requireVisible(id);
        if (!Set.of(Quotation.DRAFT, Quotation.APPROVED).contains(x.status)) {
            throw ApiException.conflict("invalid_status", "ส่งได้เฉพาะใบเสนอราคาที่เป็นร่างหรืออนุมัติแล้ว");
        }
        List<QuotationItem> items = QuotationItem.listFor(x.id);
        if (items.stream().noneMatch(i -> "item".equals(i.itemType))) {
            throw ApiException.badRequest("no_items", "ใบเสนอราคาต้องมีอย่างน้อย 1 รายการ");
        }
        int threshold = settings.quotation().discountApprovalThresholdPct();
        if (Quotation.DRAFT.equals(x.status) && x.discountPct.compareTo(BigDecimal.valueOf(threshold)) > 0) {
            Approval a = new Approval();
            a.targetType = "quotation";
            a.targetId = x.id;
            a.reason = "discount_over_" + threshold + "pct";
            a.requestedBy = currentUser.id();
            a.persist();
            x.status = Quotation.PENDING_APPROVAL;
            notifications.notifyAll(notifications.usersWithPermission(Perm.QUOTATION_APPROVE), "approval_request",
                    "ขออนุมัติส่วนลด " + x.discountPct.stripTrailingZeros().toPlainString() + "%: " + x.displayNo(),
                    x.customerName, "/approvals", "quotation", x.id);
            audit.log("quotation", x.id, AuditService.ACTION_UPDATE, Map.of("status", Quotation.DRAFT),
                    Map.of("status", x.status, "reason", a.reason));
            return toDto(x, items);
        }
        x.status = Quotation.SENT;
        x.sentAt = Instant.now();
        // ฉบับก่อนหน้าทั้งหมด (ที่ยังไม่ถูกตอบรับ) ถือว่าถูกแทนที่
        Quotation.update("status = 'superseded' where docNo = ?1 and id <> ?2 and status in ('sent', 'approved', 'rejected', 'expired', 'pending_approval', 'draft')",
                x.docNo, x.id);
        if (x.leadId != null) {
            leads.advanceTo(x.leadId, "quoted", "ส่งใบเสนอราคา " + x.displayNo());
        }
        audit.log("quotation", x.id, AuditService.ACTION_UPDATE, Map.of("status", "draft/approved"), Map.of("status", Quotation.SENT));
        return toDto(x, items);
    }

    @Transactional
    public QuotationDto accept(UUID id) {
        requireWrite();
        Quotation x = requireVisible(id);
        if (!Quotation.SENT.equals(x.status) && !Quotation.EXPIRED.equals(x.status)) {
            throw ApiException.conflict("invalid_status", "บันทึกการตอบรับได้เฉพาะใบเสนอราคาที่ส่งแล้ว");
        }
        x.status = Quotation.ACCEPTED;
        x.decidedAt = Instant.now();
        if (x.leadId != null) {
            leads.advanceTo(x.leadId, "won", "ลูกค้าอนุมัติ " + x.displayNo());
        }
        audit.log("quotation", x.id, AuditService.ACTION_APPROVE, Map.of("status", Quotation.SENT), Map.of("status", x.status));
        return toDto(x, QuotationItem.listFor(x.id));
    }

    @Transactional
    public QuotationDto reject(UUID id, String reason) {
        requireWrite();
        Quotation x = requireVisible(id);
        if (!Quotation.SENT.equals(x.status) && !Quotation.EXPIRED.equals(x.status)) {
            throw ApiException.conflict("invalid_status", "บันทึกการปฏิเสธได้เฉพาะใบเสนอราคาที่ส่งแล้ว");
        }
        x.status = Quotation.REJECTED;
        x.lostReason = blankToNull(reason);
        x.decidedAt = Instant.now();
        audit.log("quotation", x.id, AuditService.ACTION_REJECT, Map.of("status", Quotation.SENT),
                Map.of("status", x.status, "reason", x.lostReason == null ? "" : x.lostReason));
        return toDto(x, QuotationItem.listFor(x.id));
    }

    /** US-12 สร้าง Revision ใหม่จากฉบับนี้ (ฉบับเดิมเก็บไว้ครบ) */
    @Transactional
    public QuotationDto revise(UUID id) {
        requireWrite();
        Quotation src = requireVisible(id);
        if (Set.of(Quotation.DRAFT, Quotation.ACCEPTED, Quotation.SUPERSEDED).contains(src.status)) {
            throw ApiException.conflict("invalid_status", src.isEditable() ? "ฉบับร่างแก้ไขได้โดยตรง"
                    : "ใบเสนอราคานี้ถูกตอบรับแล้วหรือมีฉบับใหม่กว่า");
        }
        Number drafts = (Number) Quotation.getEntityManager()
                .createNativeQuery("select count(*) from quotations where doc_no = ?1 and status in ('draft', 'pending_approval') and deleted_at is null")
                .setParameter(1, src.docNo).getSingleResult();
        if (drafts.longValue() > 0) {
            throw ApiException.conflict("draft_exists", "มี Revision ที่ยังเป็นร่างอยู่แล้ว");
        }
        Number maxRev = (Number) Quotation.getEntityManager()
                .createNativeQuery("select max(revision) from quotations where doc_no = ?1").setParameter(1, src.docNo).getSingleResult();
        Quotation x = new Quotation();
        copyFields(src, x);
        x.revision = maxRev.intValue() + 1;
        x.parentQuotationId = src.id;
        x.status = Quotation.DRAFT;
        x.issueDate = DocNumberService.today();
        x.validUntil = x.issueDate.plusDays(settings.quotation().defaultValidityDays());
        x.createdBy = currentUser.id();
        x.persist();
        List<QuotationItem> items = new ArrayList<>();
        for (QuotationItem s : QuotationItem.listFor(src.id)) {
            QuotationItem it = new QuotationItem();
            it.quotationId = x.id;
            it.sortOrder = s.sortOrder;
            it.itemType = s.itemType;
            it.description = s.description;
            it.quantity = s.quantity;
            it.unit = s.unit;
            it.unitPrice = s.unitPrice;
            it.unitCost = s.unitCost;
            it.persist();
            items.add(it);
        }
        recalc(x, items);
        audit.log("quotation", x.id, AuditService.ACTION_CREATE, null,
                Map.of("docNo", x.docNo, "revision", x.revision, "from", src.id.toString()));
        return toDto(x, items);
    }

    @Transactional
    public void delete(UUID id) {
        requireWrite();
        Quotation x = requireVisible(id);
        if (!Quotation.DRAFT.equals(x.status)) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะฉบับร่าง");
        }
        x.softDelete();
        audit.log("quotation", x.id, AuditService.ACTION_DELETE, Map.of("docNo", x.displayNo()), null);
    }

    @Transactional
    public void logPrint(UUID id) {
        Quotation x = requireVisible(id);
        audit.log("quotation", x.id, AuditService.ACTION_EXPORT, null, Map.of("print", x.displayNo()));
    }

    // ================================================================= approvals

    @Transactional
    public List<PendingApproval> pendingApprovals() {
        List<Approval> list = Approval.list("targetType = 'quotation' and status = 'pending' order by createdAt");
        Map<UUID, String> names = userNames(list.stream().map(a -> a.requestedBy).toList());
        List<PendingApproval> out = new ArrayList<>();
        for (Approval a : list) {
            Quotation x = Quotation.findById(a.targetId);
            if (x == null) {
                continue;
            }
            out.add(new PendingApproval(a.id, x.id, x.displayNo(), x.customerName, x.title, x.discountPct, x.totalAmount,
                    margin(x), names.get(a.requestedBy), a.createdAt));
        }
        return out;
    }

    @Transactional
    public QuotationDto decide(UUID approvalId, boolean approve, String comment) {
        if (!currentUser.can(Perm.QUOTATION_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติ");
        }
        Approval a = Approval.findById(approvalId);
        if (a == null || !Approval.PENDING.equals(a.status)) {
            throw ApiException.notFound("ไม่พบคำขออนุมัติที่รอดำเนินการ");
        }
        Quotation x = Quotation.findById(a.targetId);
        if (x == null || !Quotation.PENDING_APPROVAL.equals(x.status)) {
            throw ApiException.conflict("invalid_status", "ใบเสนอราคาไม่ได้อยู่ในสถานะรออนุมัติ");
        }
        if (a.requestedBy != null && a.requestedBy.equals(currentUser.id()) && !"owner".equals(roleCode())) {
            throw ApiException.forbidden("self_approval", "อนุมัติคำขอของตัวเองไม่ได้");
        }
        a.status = approve ? Approval.APPROVED : Approval.REJECTED;
        a.decidedBy = currentUser.id();
        a.decidedAt = Instant.now();
        a.comment = blankToNull(comment);
        x.status = approve ? Quotation.APPROVED : Quotation.DRAFT;
        if (a.requestedBy != null) {
            notifications.notify(a.requestedBy, "approval_result",
                    (approve ? "อนุมัติแล้ว: " : "ไม่อนุมัติ: ") + x.displayNo(),
                    a.comment, "/quotations/" + x.id, "approval", a.id);
        }
        audit.log("quotation", x.id, approve ? AuditService.ACTION_APPROVE : AuditService.ACTION_REJECT, null,
                Map.of("approval", a.id.toString(), "comment", a.comment == null ? "" : a.comment));
        return toDto(x, QuotationItem.listFor(x.id));
    }

    // ================================================================= expiry job (เรียกจาก QuotationJobs)

    @Transactional
    public int expireOverdue() {
        return Quotation.update("status = 'expired' where status = 'sent' and validUntil < ?1", DocNumberService.today());
    }

    @Transactional
    public void notifyExpiringSoon() {
        int days = settings.quotation().expiryNoticeDays();
        if (days <= 0) {
            return;
        }
        LocalDate today = DocNumberService.today();
        List<Quotation> soon = Quotation.list("status = 'sent' and validUntil >= ?1 and validUntil <= ?2", today, today.plusDays(days));
        for (Quotation x : soon) {
            if (x.createdBy != null) {
                notifications.notify(x.createdBy, "quotation_expiring", "ใบเสนอราคาใกล้หมดอายุ: " + x.displayNo(),
                        x.customerName + " หมดอายุ " + x.validUntil, "/quotations/" + x.id, "quotation", x.id);
            }
        }
    }

    // ================================================================= internals

    private void requireWrite() {
        if (!currentUser.can(Perm.QUOTATION_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขใบเสนอราคา");
        }
    }

    private String roleCode() {
        com.ktt.auth.User u = com.ktt.auth.User.findById(currentUser.id());
        return u == null ? null : u.role.code;
    }

    /** ผู้ไม่มี lead.read_all เห็นเฉพาะใบที่ตนสร้าง หรือของลีดที่ตนรับผิดชอบ */
    private void scope(StringBuilder w, Parameters p) {
        if (!currentUser.can(Perm.LEAD_READ_ALL)) {
            w.append(" and (createdBy = :me or leadId in (select l.id from Lead l where l.owner.id = :me or l.createdBy = :me))");
            p.and("me", currentUser.id());
        }
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public Quotation requireVisible(UUID id) {
        Quotation x = Quotation.findById(id);
        if (x == null) {
            throw ApiException.notFound("ไม่พบใบเสนอราคา");
        }
        if (!currentUser.can(Perm.LEAD_READ_ALL) && !currentUser.id().equals(x.createdBy)) {
            Lead l = x.leadId == null ? null : Lead.findById(x.leadId);
            if (l == null || !leads.canSee(l)) {
                throw ApiException.notFound("ไม่พบใบเสนอราคา");
            }
        }
        return x;
    }

    private static void snapshotCustomer(Quotation x, Customer c) {
        x.customerName = c.name;
        x.customerAddress = c.billingAddress;
        x.customerTaxId = c.taxId;
        x.customerBranchNo = c.branchNo;
        x.customerPhone = c.phone;
    }

    private static List<QuotationItem> itemsFromBoq(UUID quotationId, BoqDtos.BoqDto boq, boolean summary) {
        List<QuotationItem> out = new ArrayList<>();
        int order = 0;
        for (BoqDtos.ItemDto bi : boq.items()) {
            if (summary) {
                if (bi.parentId() != null) {
                    continue;
                }
                QuotationItem it = new QuotationItem();
                it.quotationId = quotationId;
                it.sortOrder = ++order;
                it.itemType = "item";
                it.description = bi.description();
                if (bi.leaf()) {
                    it.quantity = bi.quantity();
                    it.unit = bi.unit();
                    it.unitPrice = bi.unitSell() == null ? bi.lineSell() : bi.unitSell();
                    it.unitCost = bi.lineCost() == null || bi.quantity().signum() == 0 ? null
                            : bi.lineCost().divide(bi.quantity(), 2, RoundingMode.HALF_UP);
                } else {
                    it.quantity = BigDecimal.ONE;
                    it.unit = "งาน";
                    it.unitPrice = bi.lineSell();
                    it.unitCost = bi.lineCost();
                }
                it.persist();
                out.add(it);
            } else {
                QuotationItem it = new QuotationItem();
                it.quotationId = quotationId;
                it.sortOrder = ++order;
                if (!bi.leaf()) {
                    it.itemType = "heading";
                    it.description = bi.number() + " " + bi.description();
                } else {
                    it.itemType = "item";
                    it.description = bi.description();
                    it.quantity = bi.quantity();
                    it.unit = bi.unit();
                    it.unitPrice = bi.unitSell() == null ? BigDecimal.ZERO : bi.unitSell();
                    it.unitCost = bi.lineCost() == null || bi.quantity().signum() == 0 ? null
                            : bi.lineCost().divide(bi.quantity(), 2, RoundingMode.HALF_UP);
                }
                it.persist();
                out.add(it);
            }
        }
        return out;
    }

    static void recalc(Quotation x, List<QuotationItem> items) {
        List<QuotationCalculator.Line> lines = items.stream()
                .map(i -> new QuotationCalculator.Line(i.itemType, i.quantity, i.unitPrice)).toList();
        QuotationCalculator.Result r = QuotationCalculator.compute(new QuotationCalculator.Input(lines, x.discountPct,
                x.overheadPct, x.vatEnabled, x.vatPct, x.roundingMode, x.whtPct));
        for (int i = 0; i < items.size(); i++) {
            items.get(i).amount = r.lineAmounts().get(i);
        }
        x.subtotal = r.subtotal();
        x.discountAmount = r.discountAmount();
        x.overheadAmount = r.overheadAmount();
        x.vatAmount = r.vatAmount();
        x.roundingAmount = r.roundingAmount();
        x.whtAmount = r.whtAmount();
        x.totalAmount = r.total();
    }

    /** Margin = (ยอดก่อน VAT − ต้นทุน) / ยอดก่อน VAT */
    static BigDecimal margin(Quotation x) {
        if (x.costTotal == null) {
            return null;
        }
        BigDecimal base = x.subtotal.subtract(x.discountAmount).add(x.overheadAmount);
        if (base.signum() == 0) {
            return null;
        }
        return base.subtract(x.costTotal).multiply(Money.HUNDRED).divide(base, 2, RoundingMode.HALF_UP);
    }

    QuotationDto toDto(Quotation x) {
        return toDto(x, QuotationItem.listFor(x.id));
    }

    QuotationDto toDto(Quotation x, List<QuotationItem> items) {
        boolean cost = currentUser.canViewCost();
        Approval a = Approval.latestFor("quotation", x.id);
        ApprovalInfo info = null;
        if (a != null) {
            Map<UUID, String> n = userNames(java.util.Arrays.asList(a.requestedBy, a.decidedBy));
            info = new ApprovalInfo(a.id, a.status, a.reason, n.get(a.requestedBy), n.get(a.decidedBy), a.comment,
                    a.createdAt, a.decidedAt);
        }
        int threshold = settings.quotation().discountApprovalThresholdPct();
        Lead lead = x.leadId == null ? null : Lead.findById(x.leadId);
        Number maxRev = (Number) Quotation.getEntityManager()
                .createNativeQuery("select max(revision) from quotations where doc_no = ?1 and deleted_at is null")
                .setParameter(1, x.docNo).getSingleResult();
        List<ItemDto> itemDtos = items.stream().map(i -> new ItemDto(i.id, i.sortOrder, i.itemType, i.description,
                i.quantity, i.unit, i.unitPrice, i.amount, cost ? i.unitCost : null)).toList();
        return new QuotationDto(x.id, x.docNo, x.revision, x.displayNo(), x.status, x.title, x.customerId, x.leadId,
                lead == null ? null : lead.title, x.boqId, x.customerName, x.customerAddress, x.customerTaxId,
                x.customerBranchNo, x.customerPhone, x.issueDate, x.validUntil, x.referenceNo, x.paymentCondition,
                x.displayMode, x.subtotal, x.discountPct, x.discountAmount, x.overheadPct, x.overheadAmount, x.vatEnabled,
                x.vatPct, x.vatAmount, x.roundingMode, x.roundingAmount, x.whtPct, x.whtAmount, x.totalAmount,
                cost ? x.costTotal : null, cost ? margin(x) : null, x.durationDays, x.warrantyTerms, x.scopeIn,
                x.scopeOut, x.notes, x.lostReason, x.sentAt, x.decidedAt,
                userNames(java.util.Collections.singletonList(x.createdBy)).get(x.createdBy), x.createdAt, x.updatedAt,
                itemDtos, info, x.discountPct.compareTo(BigDecimal.valueOf(threshold)) > 0, threshold, x.isEditable(),
                maxRev == null || maxRev.intValue() == x.revision);
    }

    private static void copyFields(Quotation s, Quotation x) {
        x.docNo = s.docNo;
        x.leadId = s.leadId;
        x.customerId = s.customerId;
        x.boqId = s.boqId;
        x.title = s.title;
        x.displayMode = s.displayMode;
        x.paymentTerms = s.paymentTerms;
        x.durationDays = s.durationDays;
        x.warrantyTerms = s.warrantyTerms;
        x.scopeIn = s.scopeIn;
        x.scopeOut = s.scopeOut;
        x.customerName = s.customerName;
        x.customerAddress = s.customerAddress;
        x.customerTaxId = s.customerTaxId;
        x.customerBranchNo = s.customerBranchNo;
        x.customerPhone = s.customerPhone;
        x.referenceNo = s.referenceNo;
        x.paymentCondition = s.paymentCondition;
        x.discountPct = s.discountPct;
        x.overheadPct = s.overheadPct;
        x.vatEnabled = s.vatEnabled;
        x.vatPct = s.vatPct;
        x.roundingMode = s.roundingMode;
        x.whtPct = s.whtPct;
        x.costTotal = s.costTotal;
        x.notes = s.notes;
    }

    private static Map<String, Object> auditView(Quotation x) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("customerName", x.customerName);
        m.put("issueDate", x.issueDate == null ? null : x.issueDate.toString());
        m.put("validUntil", x.validUntil == null ? null : x.validUntil.toString());
        m.put("discountPct", x.discountPct);
        m.put("overheadPct", x.overheadPct);
        m.put("vatEnabled", x.vatEnabled);
        m.put("roundingMode", x.roundingMode);
        m.put("whtPct", x.whtPct);
        m.put("totalAmount", x.totalAmount);
        return m;
    }

    static Map<UUID, String> userNames(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        java.util.Set<UUID> unique = new java.util.HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = Quotation.getEntityManager().createNativeQuery("select id, name from users where id in (:ids)")
                .setParameter("ids", unique).getResultList();
        rows.forEach(r -> out.put((UUID) r[0], (String) r[1]));
        return out;
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
