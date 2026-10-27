package com.ktt.finance;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.contract.Contract;
import com.ktt.contract.ContractMilestone;
import com.ktt.contract.ContractService;
import com.ktt.customer.Customer;
import com.ktt.docnum.DocNumberService;
import com.ktt.finance.FinanceDtos.AgingRow;
import com.ktt.finance.FinanceDtos.BillingNoteRequest;
import com.ktt.finance.FinanceDtos.CreditNoteRequest;
import com.ktt.finance.FinanceDtos.DocLink;
import com.ktt.finance.FinanceDtos.FromContractRequest;
import com.ktt.finance.FinanceDtos.InvoiceRequest;
import com.ktt.finance.FinanceDtos.ItemDto;
import com.ktt.finance.FinanceDtos.ItemInput;
import com.ktt.finance.FinanceDtos.PaymentRequest;
import com.ktt.finance.FinanceDtos.Receivables;
import com.ktt.finance.FinanceDtos.SalesDocDto;
import com.ktt.finance.FinanceDtos.SalesDocRow;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.settings.AppSettings;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * เอกสารการเงินฝั่งขาย
 * <pre>
 * งวดงาน (ready) ──► ใบแจ้งหนี้ draft ──ออกเอกสาร──► issued ──รับชำระ──► partial / paid
 *                                                     │            └─► ออกใบเสร็จ (/ใบกำกับภาษี) อัตโนมัติ
 *                                                     └─► รวมหลายใบเป็นใบวางบิล
 * ใบกำกับภาษี (ใบแจ้งหนี้/ใบกำกับภาษี, ใบเสร็จ/ใบกำกับภาษี) ──► ใบลดหนี้
 * </pre>
 * เลขที่เอกสารออกตอนกด "ออกเอกสาร" (ฉบับร่างยังไม่มีเลข) เพื่อให้เลขใบกำกับภาษีเรียงต่อเนื่องไม่มีช่องว่าง
 * เอกสารที่ออกแล้วแก้ไขไม่ได้ ต้องยกเลิก (void) แล้วออกใหม่ หรือออกใบลดหนี้
 */
@ApplicationScoped
public class SalesDocService {

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
    ContractService contracts;

    @Inject
    AppSettings settings;

    @Inject
    EntityManager em;

    // ================================================================= access

    @Transactional(Transactional.TxType.MANDATORY)
    public SalesDoc requireVisible(UUID id) {
        SalesDoc d = id == null ? null : SalesDoc.findById(id);
        if (d == null || !currentUser.can(Perm.FINANCE_READ)) {
            throw ApiException.notFound("ไม่พบเอกสาร");
        }
        if (d.projectId != null) {
            Project p = Project.findById(d.projectId);
            if (p == null || !projects.canSee(p)) {
                throw ApiException.notFound("ไม่พบเอกสาร");
            }
        }
        return d;
    }

    private SalesDoc requireWritable(UUID id) {
        requireWrite();
        return requireVisible(id);
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.FINANCE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ออกเอกสารการเงิน");
        }
    }

    // ================================================================= query

    @Transactional
    public PageResult<SalesDocRow> list(String type, String status, String q, UUID customerId, UUID projectId,
                                        UUID contractId, boolean openOnly, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (!currentUser.can(Perm.PROJECT_READ_ALL)) {
            w.append(" and (projectId is null or projectId in :visibleProjects)");
            p.and("visibleProjects", projects.visibleProjectIds());
        }
        if (type != null && !type.isBlank()) {
            if ("invoices".equals(type)) {
                w.append(" and docType in ('invoice', 'invoice_tax')");
            } else if ("receipts".equals(type)) {
                w.append(" and docType in ('receipt', 'tax_receipt')");
            } else {
                w.append(" and docType = :type");
                p.and("type", type);
            }
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        if (openOnly) {
            w.append(" and status in ('issued', 'partial')");
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or lower(customerName) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (customerId != null) {
            w.append(" and customerId = :customer");
            p.and("customer", customerId);
        }
        if (projectId != null) {
            w.append(" and projectId = :project");
            p.and("project", projectId);
        }
        if (contractId != null) {
            w.append(" and contractId = :contract");
            p.and("contract", contractId);
        }
        PanacheQuery<SalesDoc> query = SalesDoc.find(w.toString(),
                Sort.descending("docDate").and("createdAt", Sort.Direction.Descending), p);
        long total = query.count();
        List<SalesDoc> list = query.page(Page.of(page, size)).list();
        Map<UUID, String> codes = projectCodes(list.stream().map(x -> x.projectId).toList());
        LocalDate today = DocNumberService.today();
        List<SalesDocRow> rows = list.stream().map(x -> new SalesDocRow(x.id, x.docType, x.docNo, x.docDate, x.dueDate,
                x.status, x.customerName, codes.get(x.projectId), x.kind, x.totalAmount, x.netAmount, x.settledAmount,
                SalesDoc.INVOICES.contains(x.docType) ? x.outstanding() : null,
                SalesDoc.INVOICES.contains(x.docType) && Set.of("issued", "partial").contains(x.status)
                        && x.dueDate != null && x.dueDate.isBefore(today))).toList();
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public SalesDocDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    // ================================================================= invoices

    @Transactional
    public SalesDocDto createInvoice(InvoiceRequest req) {
        requireWrite();
        SalesDoc d = new SalesDoc();
        d.docType = req.docType();
        d.docNo = draftNo();
        d.createdBy = currentUser.id();
        linkParties(d, req.customerId(), req.contractId(), req.projectId());
        applyInvoice(d, req);
        d.persist();
        List<SalesDocItem> items = writeItems(d, req.items());
        recalc(d, items);
        audit.log("sales_doc", d.id, AuditService.ACTION_CREATE, null, Map.of("type", d.docType, "total", d.totalAmount));
        return toDto(d, items);
    }

    @Transactional
    public SalesDocDto updateInvoice(UUID id, InvoiceRequest req) {
        SalesDoc d = requireWritable(id);
        if (!d.isDraft() || !SalesDoc.INVOICES.contains(d.docType)) {
            throw ApiException.conflict("not_editable", "แก้ไขได้เฉพาะใบแจ้งหนี้ฉบับร่าง");
        }
        d.docType = req.docType();
        applyInvoice(d, req);
        SalesDocItem.delete("docId", d.id);
        List<SalesDocItem> items = writeItems(d, req.items());
        recalc(d, items);
        audit.log("sales_doc", d.id, AuditService.ACTION_UPDATE, null, Map.of("total", d.totalAmount));
        return toDto(d, items);
    }

    /** ใบแจ้งหนี้จากงวดงานที่ส่งมอบแล้ว หรือใบเรียกเงินล่วงหน้าตามสัญญา */
    @Transactional
    public SalesDocDto fromContract(FromContractRequest req) {
        requireWrite();
        Contract c = contracts.requireVisible(req.contractId());
        if (!Contract.ACTIVE.equals(c.status) && !Contract.COMPLETED.equals(c.status)) {
            throw ApiException.conflict("contract_not_active", "ต้องเปิดใช้สัญญาก่อนจึงวางบิลได้");
        }
        SalesDoc d = new SalesDoc();
        d.docType = req.docType();
        d.docNo = draftNo();
        d.createdBy = currentUser.id();
        d.docDate = DocNumberService.today();
        d.dueDate = d.docDate.plusDays(settings.getInt("finance.default_due_days", 30));
        linkParties(d, null, c.id, null);
        d.vatPct = c.vatEnabled ? c.vatPct : BigDecimal.ZERO;
        d.whtPct = c.whtPct;
        List<ItemInput> inputs = new ArrayList<>();
        if (req.advance()) {
            if (c.advancePct.signum() <= 0) {
                throw ApiException.badRequest("no_advance", "สัญญานี้ไม่มีเงินล่วงหน้า");
            }
            Number existing = (Number) em.createNativeQuery("""
                            select count(*) from sales_docs where contract_id = ?1 and kind = 'advance'
                            and status <> 'void' and deleted_at is null""").setParameter(1, c.id).getSingleResult();
            if (existing.longValue() > 0) {
                throw ApiException.conflict("advance_exists", "เรียกเก็บเงินล่วงหน้าของสัญญานี้แล้ว");
            }
            d.kind = "advance";
            inputs.add(new ItemInput("เงินล่วงหน้า " + c.advancePct.stripTrailingZeros().toPlainString() + "% ตามสัญญาเลขที่ " + c.docNo,
                    BigDecimal.ONE, "งาน", Money.pct(c.amount, c.advancePct), null));
        } else {
            if (req.milestoneIds() == null || req.milestoneIds().isEmpty()) {
                throw ApiException.badRequest("no_milestones", "กรุณาเลือกงวดงานที่จะวางบิล");
            }
            d.kind = "milestone";
            d.retentionPct = c.retentionPct;
            BigDecimal base = BigDecimal.ZERO;
            for (UUID msId : req.milestoneIds()) {
                ContractMilestone m = ContractMilestone.findById(msId);
                if (m == null || !m.contractId.equals(c.id)) {
                    throw ApiException.badRequest("invalid_milestone", "งวดงานไม่ได้อยู่ในสัญญานี้");
                }
                if (!"ready".equals(m.status) && !"pending".equals(m.status)) {
                    throw ApiException.conflict("milestone_billed", "งวด \"" + m.name + "\" วางบิลแล้ว");
                }
                if (billedMilestone(m.id, null)) {
                    throw ApiException.conflict("milestone_billed", "งวด \"" + m.name + "\" มีใบแจ้งหนี้ฉบับร่างอยู่แล้ว");
                }
                String label = m.changeOrderId != null ? m.name
                        : "งวดที่ " + m.seq + " " + m.name + " (" + m.pct.stripTrailingZeros().toPlainString() + "%)";
                inputs.add(new ItemInput(label, BigDecimal.ONE, "งวด", m.amount, m.id));
                if (m.changeOrderId == null) {
                    base = base.add(m.amount);
                }
            }
            // หักคืนเงินล่วงหน้าตามสัดส่วนเฉพาะงวดตามสัญญา (งวด VO ไม่หัก)
            d.advanceDeduct = c.advancePct.signum() > 0 ? Money.pct(base, c.advancePct) : BigDecimal.ZERO;
        }
        d.persist();
        List<SalesDocItem> items = writeItems(d, inputs);
        recalc(d, items);
        audit.log("sales_doc", d.id, AuditService.ACTION_CREATE, null,
                Map.of("type", d.docType, "contract", c.docNo, "kind", d.kind, "total", d.totalAmount));
        return toDto(d, items);
    }

    // ================================================================= issue / pay

    @Transactional
    public SalesDocDto issue(UUID id) {
        SalesDoc d = requireWritable(id);
        if (!d.isDraft()) {
            throw ApiException.conflict("invalid_status", "เอกสารนี้ออกแล้ว");
        }
        List<SalesDocItem> items = SalesDocItem.listFor(d.id);
        if (SalesDoc.INVOICES.contains(d.docType)) {
            if (items.isEmpty() || d.totalAmount.signum() <= 0) {
                throw ApiException.badRequest("invalid_amount", "ยอดรวมต้องมากกว่า 0");
            }
            for (SalesDocItem it : items) {
                if (it.milestoneId != null) {
                    if (billedMilestone(it.milestoneId, d.id)) {
                        throw ApiException.conflict("milestone_billed", "งวดงาน \"" + it.description + "\" ถูกวางบิลในเอกสารอื่นแล้ว");
                    }
                    ContractMilestone m = ContractMilestone.findById(it.milestoneId);
                    m.status = "billed";
                }
            }
        }
        if (SalesDoc.CREDIT_NOTE.equals(d.docType)) {
            SalesDoc ref = SalesDoc.findById(d.refDocId);
            if (ref == null || "void".equals(ref.status)) {
                throw ApiException.conflict("invalid_ref", "ใบกำกับภาษีที่อ้างอิงถูกยกเลิกแล้ว");
            }
        }
        d.docNo = docNumbers.next(prefix(d.docType), d.docDate);
        d.status = "issued";
        d.issuedAt = Instant.now();
        audit.log("sales_doc", d.id, AuditService.ACTION_UPDATE, Map.of("status", "draft"),
                Map.of("status", d.status, "docNo", d.docNo));
        return toDto(d, items);
    }

    /**
     * รับชำระใบแจ้งหนี้และออกใบเสร็จอัตโนมัติ
     * ใบแจ้งหนี้ธรรมดาที่มี VAT → ใบเสร็จรับเงิน/ใบกำกับภาษี (VAT ตามสัดส่วนเงินที่รับ)
     * ใบแจ้งหนี้/ใบกำกับภาษี หรือไม่มี VAT → ใบเสร็จรับเงิน
     */
    @Transactional
    public SalesDocDto recordPayment(UUID invoiceId, PaymentRequest req) {
        SalesDoc inv = requireWritable(invoiceId);
        if (!SalesDoc.INVOICES.contains(inv.docType) || !Set.of("issued", "partial").contains(inv.status)) {
            throw ApiException.conflict("invalid_status", "รับชำระได้เฉพาะใบแจ้งหนี้ที่ออกแล้วและยังค้างชำระ");
        }
        BigDecimal cash = Money.round2(req.cashAmount());
        BigDecimal wht = Money.round2(req.whtAmount());
        BigDecimal retention = Money.round2(req.retentionAmount());
        BigDecimal settled = cash.add(wht).add(retention);
        if (settled.signum() <= 0) {
            throw ApiException.badRequest("invalid_amount", "ยอดรับชำระต้องมากกว่า 0");
        }
        BigDecimal remaining = inv.outstanding();
        if (settled.compareTo(remaining) > 0) {
            throw ApiException.badRequest("over_payment", "ยอดรับชำระรวมเกินยอดค้าง " + remaining.toPlainString() + " บาท");
        }
        if (req.paidDate().isBefore(inv.docDate)) {
            throw ApiException.badRequest("invalid_date", "วันที่รับชำระต้องไม่ก่อนวันที่ใบแจ้งหนี้");
        }
        boolean isFinal = settled.compareTo(remaining) == 0;
        boolean taxReceipt = SalesDoc.INVOICE.equals(inv.docType) && inv.vatAmount.signum() > 0;

        SalesDoc r = new SalesDoc();
        r.docType = taxReceipt ? SalesDoc.TAX_RECEIPT : SalesDoc.RECEIPT;
        r.docDate = req.paidDate();
        r.docNo = docNumbers.next(prefix(r.docType), r.docDate);
        r.status = "paid";
        r.customerId = inv.customerId;
        r.customerName = inv.customerName;
        r.customerAddress = inv.customerAddress;
        r.customerTaxId = inv.customerTaxId;
        r.customerBranchNo = inv.customerBranchNo;
        r.projectId = inv.projectId;
        r.contractId = inv.contractId;
        r.refDocId = inv.id;
        r.kind = inv.kind;
        r.vatPct = inv.vatPct;
        BigDecimal priorVat = (BigDecimal) em.createQuery("""
                        select coalesce(sum(d.vatAmount), 0) from SalesDoc d
                        where d.refDocId = ?1 and d.docType in ('receipt', 'tax_receipt') and d.status <> 'void'
                        """, BigDecimal.class).setParameter(1, inv.id).getSingleResult();
        BigDecimal vat = FinanceCalculator.vatPortion(settled, inv.totalAmount, inv.vatAmount, priorVat, isFinal);
        r.vatAmount = vat;
        r.taxableAmount = settled.subtract(vat);
        r.subtotal = r.taxableAmount;
        r.totalAmount = settled;
        r.whtAmount = wht;
        r.whtPct = inv.whtPct;
        r.retentionAmount = retention;
        r.retentionPct = inv.retentionPct;
        r.netAmount = cash;
        r.settledAmount = settled;
        r.paymentMethod = req.method();
        r.paymentRef = UserNames.blankToNull(req.reference());
        r.paidDate = req.paidDate();
        r.notes = UserNames.blankToNull(req.notes());
        r.issuedAt = Instant.now();
        r.createdBy = currentUser.id();
        r.persist();
        SalesDocItem it = new SalesDocItem();
        it.docId = r.id;
        it.sortOrder = 1;
        it.description = "รับชำระตาม" + SalesDoc.TITLES.get(inv.docType) + " เลขที่ " + inv.docNo
                + (inv.projectId == null ? "" : " " + projectName(inv.projectId));
        it.quantity = BigDecimal.ONE;
        it.unitPrice = r.taxableAmount;
        it.amount = r.taxableAmount;
        it.persist();

        inv.settledAmount = Money.round2(inv.settledAmount.add(settled));
        inv.status = isFinal ? "paid" : "partial";
        inv.paidDate = req.paidDate();
        if (isFinal) {
            for (SalesDocItem li : SalesDocItem.listFor(inv.id)) {
                if (li.milestoneId != null) {
                    ContractMilestone m = ContractMilestone.findById(li.milestoneId);
                    if (m != null) {
                        m.status = "paid";
                    }
                }
            }
        }
        audit.log("sales_doc", inv.id, AuditService.ACTION_UPDATE, null,
                Map.of("payment", settled, "receipt", r.docNo, "status", inv.status));
        return toDto(r);
    }

    // ================================================================= billing note / credit note

    @Transactional
    public SalesDocDto createBillingNote(BillingNoteRequest req) {
        requireWrite();
        Customer c = Customer.findById(req.customerId());
        if (c == null) {
            throw ApiException.badRequest("invalid_customer", "ไม่พบลูกค้า");
        }
        SalesDoc d = new SalesDoc();
        d.docType = SalesDoc.BILLING_NOTE;
        d.docNo = draftNo();
        d.docDate = req.docDate();
        d.dueDate = req.dueDate();
        d.notes = UserNames.blankToNull(req.notes());
        d.createdBy = currentUser.id();
        snapshot(d, c);
        d.persist();
        int order = 0;
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal net = BigDecimal.ZERO;
        Set<UUID> projectIds = new HashSet<>();
        for (UUID invId : new java.util.LinkedHashSet<>(req.invoiceIds())) {
            SalesDoc inv = requireVisible(invId);
            if (!SalesDoc.INVOICES.contains(inv.docType) || !Set.of("issued", "partial").contains(inv.status)) {
                throw ApiException.badRequest("invalid_invoice", "ใบวางบิลรวมได้เฉพาะใบแจ้งหนี้ที่ออกแล้วและค้างชำระ (" + inv.docNo + ")");
            }
            if (!inv.customerId.equals(c.id)) {
                throw ApiException.badRequest("customer_mismatch", "ใบแจ้งหนี้ " + inv.docNo + " เป็นของลูกค้ารายอื่น");
            }
            em.createNativeQuery("insert into billing_note_lines (billing_note_id, invoice_id, sort_order) values (?1, ?2, ?3)")
                    .setParameter(1, d.id).setParameter(2, inv.id).setParameter(3, ++order).executeUpdate();
            total = total.add(inv.outstanding());
            net = net.add(inv.netAmount.subtract(inv.settledAmount.min(inv.netAmount)));
            if (inv.projectId != null) {
                projectIds.add(inv.projectId);
            }
        }
        if (projectIds.size() == 1) {
            d.projectId = projectIds.iterator().next();
        }
        d.totalAmount = Money.round2(total);
        d.subtotal = d.totalAmount;
        d.netAmount = Money.round2(net);
        audit.log("sales_doc", d.id, AuditService.ACTION_CREATE, null, Map.of("type", d.docType, "invoices", order));
        return toDto(d);
    }

    @Transactional
    public SalesDocDto createCreditNote(CreditNoteRequest req) {
        if (!currentUser.can(Perm.FINANCE_VOID)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ออกใบลดหนี้");
        }
        SalesDoc ref = requireVisible(req.refDocId());
        if (!SalesDoc.TAX_DOCS.contains(ref.docType) || ref.isDraft() || "void".equals(ref.status)) {
            throw ApiException.badRequest("invalid_ref", "ใบลดหนี้ต้องอ้างอิงใบกำกับภาษีที่ออกแล้ว");
        }
        BigDecimal credited = (BigDecimal) em.createQuery("""
                        select coalesce(sum(d.taxableAmount), 0) from SalesDoc d
                        where d.refDocId = ?1 and d.docType = 'credit_note' and d.status <> 'void'
                        """, BigDecimal.class).setParameter(1, ref.id).getSingleResult();
        BigDecimal original = Money.round2(ref.taxableAmount.subtract(credited));
        if (req.correctAmount().compareTo(original) >= 0) {
            throw ApiException.badRequest("invalid_amount", "มูลค่าที่ถูกต้องต้องน้อยกว่ามูลค่าเดิม " + original.toPlainString() + " บาท");
        }
        if (req.docDate().isBefore(ref.docDate)) {
            throw ApiException.badRequest("invalid_date", "วันที่ใบลดหนี้ต้องไม่ก่อนวันที่ใบกำกับภาษีเดิม");
        }
        FinanceCalculator.CreditResult cr = FinanceCalculator.credit(original, req.correctAmount(), ref.vatPct.signum() > 0, ref.vatPct);
        SalesDoc d = new SalesDoc();
        d.docType = SalesDoc.CREDIT_NOTE;
        d.docNo = draftNo();
        d.docDate = req.docDate();
        d.customerId = ref.customerId;
        d.customerName = ref.customerName;
        d.customerAddress = ref.customerAddress;
        d.customerTaxId = ref.customerTaxId;
        d.customerBranchNo = ref.customerBranchNo;
        d.projectId = ref.projectId;
        d.contractId = ref.contractId;
        d.refDocId = ref.id;
        d.vatPct = ref.vatPct;
        d.originalAmount = original;
        d.correctAmount = Money.round2(req.correctAmount());
        d.subtotal = cr.difference();
        d.taxableAmount = cr.difference();
        d.vatAmount = cr.vatAmount();
        d.totalAmount = cr.total();
        d.netAmount = cr.total();
        d.reason = req.reason().trim();
        d.notes = UserNames.blankToNull(req.notes());
        d.createdBy = currentUser.id();
        d.persist();
        SalesDocItem it = new SalesDocItem();
        it.docId = d.id;
        it.sortOrder = 1;
        it.description = "ลดหนี้ตาม" + SalesDoc.TITLES.get(ref.docType) + " เลขที่ " + ref.docNo;
        it.quantity = BigDecimal.ONE;
        it.unitPrice = cr.difference();
        it.amount = cr.difference();
        it.persist();
        audit.log("sales_doc", d.id, AuditService.ACTION_CREATE, null, Map.of("type", d.docType, "ref", ref.docNo, "total", d.totalAmount));
        return toDto(d);
    }

    // ================================================================= void / delete

    @Transactional
    public SalesDocDto voidDoc(UUID id, String reason) {
        if (!currentUser.can(Perm.FINANCE_VOID)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ยกเลิกเอกสาร");
        }
        SalesDoc d = requireVisible(id);
        if (d.isDraft()) {
            throw ApiException.conflict("is_draft", "ฉบับร่างให้ลบแทนการยกเลิก");
        }
        if ("void".equals(d.status)) {
            throw ApiException.conflict("already_void", "เอกสารนี้ถูกยกเลิกแล้ว");
        }
        if (SalesDoc.INVOICES.contains(d.docType)) {
            Number deps = (Number) em.createNativeQuery("""
                            select count(*) from sales_docs where ref_doc_id = ?1 and status <> 'void' and deleted_at is null
                            """).setParameter(1, d.id).getSingleResult();
            if (deps.longValue() > 0) {
                throw ApiException.conflict("has_receipts", "ใบแจ้งหนี้นี้มีใบเสร็จหรือใบลดหนี้แล้ว ให้ยกเลิกเอกสารเหล่านั้นก่อน");
            }
            for (SalesDocItem li : SalesDocItem.listFor(d.id)) {
                if (li.milestoneId != null) {
                    ContractMilestone m = ContractMilestone.findById(li.milestoneId);
                    if (m != null) {
                        m.status = "ready";
                    }
                }
            }
        }
        if (Set.of(SalesDoc.RECEIPT, SalesDoc.TAX_RECEIPT).contains(d.docType) && d.refDocId != null) {
            Number deps = (Number) em.createNativeQuery("""
                            select count(*) from sales_docs where ref_doc_id = ?1 and doc_type = 'credit_note' and status <> 'void' and deleted_at is null
                            """).setParameter(1, d.id).getSingleResult();
            if (deps.longValue() > 0) {
                throw ApiException.conflict("has_credit", "ใบเสร็จนี้มีใบลดหนี้อ้างอิงอยู่ ให้ยกเลิกใบลดหนี้ก่อน");
            }
            // คืนยอดค้างให้ใบแจ้งหนี้
            SalesDoc inv = SalesDoc.findById(d.refDocId);
            if (inv != null && !"void".equals(inv.status)) {
                inv.settledAmount = Money.round2(inv.settledAmount.subtract(d.settledAmount)).max(BigDecimal.ZERO);
                inv.status = inv.settledAmount.signum() == 0 ? "issued" : "partial";
                for (SalesDocItem li : SalesDocItem.listFor(inv.id)) {
                    if (li.milestoneId != null) {
                        ContractMilestone m = ContractMilestone.findById(li.milestoneId);
                        if (m != null && "paid".equals(m.status)) {
                            m.status = "billed";
                        }
                    }
                }
            }
        }
        String from = d.status;
        d.status = "void";
        d.voidedAt = Instant.now();
        d.reason = (d.reason == null ? "" : d.reason + "\n") + "ยกเลิก: " + reason.trim();
        audit.log("sales_doc", d.id, AuditService.ACTION_DELETE, Map.of("status", from),
                Map.of("status", "void", "reason", reason.trim()));
        return toDto(d);
    }

    @Transactional
    public void delete(UUID id) {
        SalesDoc d = requireWritable(id);
        if (!d.isDraft()) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะฉบับร่าง เอกสารที่ออกแล้วให้ยกเลิกแทน");
        }
        d.softDelete();
        audit.log("sales_doc", d.id, AuditService.ACTION_DELETE, Map.of("type", d.docType), null);
    }

    @Transactional
    public void logPrint(UUID id) {
        SalesDoc d = requireVisible(id);
        audit.log("sales_doc", d.id, AuditService.ACTION_EXPORT, null, Map.of("print", d.docNo));
    }

    // ================================================================= receivables

    @Transactional
    public Receivables receivables() {
        if (!currentUser.can(Perm.FINANCE_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูลูกหนี้");
        }
        LocalDate today = DocNumberService.today();
        StringBuilder w = new StringBuilder("docType in ('invoice', 'invoice_tax') and status in ('issued', 'partial')");
        Parameters p = new Parameters();
        if (!currentUser.can(Perm.PROJECT_READ_ALL)) {
            w.append(" and (projectId is null or projectId in :visibleProjects)");
            p.and("visibleProjects", projects.visibleProjectIds());
        }
        List<SalesDoc> open = SalesDoc.list(w.toString(), p);
        Map<UUID, BigDecimal[]> by = new LinkedHashMap<>();
        Map<UUID, String> names = new HashMap<>();
        for (SalesDoc d : open) {
            BigDecimal[] b = by.computeIfAbsent(d.customerId, k -> zeros(7));
            names.put(d.customerId, d.customerName);
            BigDecimal amt = d.outstanding();
            long late = d.dueDate == null ? 0 : ChronoUnit.DAYS.between(d.dueDate, today);
            int bucket = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
            b[bucket] = b[bucket].add(amt);
            b[5] = b[5].add(amt);
        }
        // เงินประกันผลงานที่ลูกค้ากันไว้ (ยังไม่คืน) ต่อสัญญา → รวมตามลูกค้า
        @SuppressWarnings("unchecked")
        List<Object[]> ret = em.createNativeQuery("""
                        select c.customer_id, c.customer_name,
                               coalesce((select sum(d.retention_amount) from sales_docs d where d.contract_id = c.id
                                         and d.doc_type in ('invoice', 'invoice_tax') and d.status not in ('draft', 'void') and d.deleted_at is null), 0)
                               - c.retention_released
                        from contracts c where c.deleted_at is null
                        """).getResultList();
        Set<UUID> visible = currentUser.can(Perm.PROJECT_READ_ALL) ? null : new HashSet<>(projects.visibleProjectIds());
        for (Object[] r : ret) {
            BigDecimal held = SqlValues.decimal0(r[2]);
            if (held.signum() <= 0) {
                continue;
            }
            UUID cid = SqlValues.uuid(r[0]);
            if (visible != null) {
                Number n = (Number) em.createNativeQuery("select count(*) from contracts where customer_id = ?1 and project_id in (:ids) and deleted_at is null")
                        .setParameter(1, cid).setParameter("ids", visible).getSingleResult();
                if (n.longValue() == 0) {
                    continue;
                }
            }
            names.putIfAbsent(cid, (String) r[1]);
            BigDecimal[] b = by.computeIfAbsent(cid, k -> zeros(7));
            b[6] = b[6].add(held);
        }
        List<AgingRow> rows = new ArrayList<>();
        BigDecimal[] t = zeros(7);
        by.forEach((cid, b) -> {
            rows.add(row(cid, names.get(cid), b));
            for (int i = 0; i < 7; i++) {
                t[i] = t[i].add(b[i]);
            }
        });
        rows.sort((a, b) -> b.total().compareTo(a.total()));
        return new Receivables(today, rows, row(null, "รวม", t));
    }

    private static AgingRow row(UUID id, String name, BigDecimal[] b) {
        return new AgingRow(id, name, Money.round2(b[0]), Money.round2(b[1]), Money.round2(b[2]), Money.round2(b[3]),
                Money.round2(b[4]), Money.round2(b[5]), Money.round2(b[6]));
    }

    private static BigDecimal[] zeros(int n) {
        BigDecimal[] a = new BigDecimal[n];
        java.util.Arrays.fill(a, BigDecimal.ZERO);
        return a;
    }

    // ================================================================= internals

    private void linkParties(SalesDoc d, UUID customerId, UUID contractId, UUID projectId) {
        if (contractId != null) {
            Contract c = contracts.requireVisible(contractId);
            d.contractId = c.id;
            d.projectId = c.projectId;
            d.customerId = c.customerId;
            d.customerName = c.customerName;
            d.customerAddress = c.customerAddress;
            d.customerTaxId = c.customerTaxId;
            d.customerBranchNo = c.customerBranchNo;
            return;
        }
        if (projectId != null) {
            Project p = projects.requireVisible(projectId);
            d.projectId = p.id;
            customerId = customerId == null ? p.customerId : customerId;
        }
        Customer c = customerId == null ? null : Customer.findById(customerId);
        if (c == null) {
            throw ApiException.badRequest("invalid_customer", "กรุณาเลือกลูกค้า");
        }
        snapshot(d, c);
    }

    private static void snapshot(SalesDoc d, Customer c) {
        d.customerId = c.id;
        d.customerName = c.name;
        d.customerAddress = c.billingAddress;
        d.customerTaxId = c.taxId;
        d.customerBranchNo = c.branchNo;
    }

    private void applyInvoice(SalesDoc d, InvoiceRequest req) {
        if (!WHT.contains(req.whtPct().intValue()) || req.whtPct().compareTo(BigDecimal.valueOf(req.whtPct().intValue())) != 0) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
        if (req.dueDate() != null && req.dueDate().isBefore(req.docDate())) {
            throw ApiException.badRequest("invalid_due", "วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร");
        }
        d.docDate = req.docDate();
        d.dueDate = req.dueDate();
        d.kind = d.contractId == null ? "normal" : req.kind() == null ? d.kind : req.kind();
        if (UserNames.blankToNull(req.customerName()) != null) {
            d.customerName = req.customerName().trim();
            d.customerAddress = UserNames.blankToNull(req.customerAddress());
            d.customerTaxId = UserNames.blankToNull(req.customerTaxId());
            d.customerBranchNo = UserNames.blankToNull(req.customerBranchNo());
        }
        d.discountAmount = Money.round2(req.discountAmount());
        d.advanceDeduct = Money.round2(req.advanceDeduct());
        d.vatPct = req.vatEnabled() ? req.vatPct() : BigDecimal.ZERO;
        d.retentionPct = req.retentionPct();
        d.whtPct = req.whtPct();
        d.notes = UserNames.blankToNull(req.notes());
    }

    private List<SalesDocItem> writeItems(SalesDoc d, List<ItemInput> inputs) {
        List<SalesDocItem> out = new ArrayList<>();
        int order = 0;
        for (ItemInput in : inputs) {
            SalesDocItem it = new SalesDocItem();
            it.docId = d.id;
            it.sortOrder = ++order;
            it.description = in.description().trim();
            it.quantity = in.quantity();
            it.unit = UserNames.blankToNull(in.unit());
            it.unitPrice = Money.round2(in.unitPrice());
            if (in.milestoneId() != null) {
                ContractMilestone m = ContractMilestone.findById(in.milestoneId());
                if (m == null || d.contractId == null || !m.contractId.equals(d.contractId)) {
                    throw ApiException.badRequest("invalid_milestone", "งวดงานไม่ได้อยู่ในสัญญาของเอกสารนี้");
                }
                it.milestoneId = m.id;
            }
            it.persist();
            out.add(it);
        }
        return out;
    }

    private static void recalc(SalesDoc d, List<SalesDocItem> items) {
        FinanceCalculator.Result r = FinanceCalculator.compute(new FinanceCalculator.Input(
                items.stream().map(i -> new FinanceCalculator.Line(i.quantity, i.unitPrice)).toList(),
                d.discountAmount, d.advanceDeduct, d.vatPct.signum() > 0, d.vatPct, d.retentionPct, d.whtPct));
        for (int i = 0; i < items.size(); i++) {
            items.get(i).amount = r.lineAmounts().get(i);
        }
        if (r.taxable().signum() < 0) {
            throw ApiException.badRequest("invalid_amount", "ส่วนลดและเงินล่วงหน้าที่หักรวมกันเกินยอดรวม");
        }
        d.subtotal = r.subtotal();
        d.taxableAmount = r.taxable();
        d.vatAmount = r.vatAmount();
        d.totalAmount = r.total();
        d.retentionAmount = r.retentionAmount();
        d.whtAmount = r.whtAmount();
        d.netAmount = r.net();
    }

    /** งวดนี้อยู่ในใบแจ้งหนี้อื่นที่ยังไม่ถูกยกเลิกหรือไม่ */
    private boolean billedMilestone(UUID milestoneId, UUID exceptDocId) {
        Number n = (Number) em.createNativeQuery("""
                        select count(*) from sales_doc_items i join sales_docs d on d.id = i.doc_id
                        where i.milestone_id = ?1 and d.status <> 'void' and d.deleted_at is null
                          and d.doc_type in ('invoice', 'invoice_tax') and (cast(?2 as uuid) is null or d.id <> ?2)
                        """).setParameter(1, milestoneId).setParameter(2, exceptDocId).getSingleResult();
        return n.longValue() > 0;
    }

    private String prefix(String docType) {
        return projects.prefix(docType, SalesDoc.DEFAULT_PREFIX.get(docType));
    }

    private static String draftNo() {
        return "ร่าง-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private String projectName(UUID projectId) {
        Project p = Project.findById(projectId);
        return p == null ? "" : "(" + p.name + ")";
    }

    private Map<UUID, String> projectCodes(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        Set<UUID> unique = new HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("select id, code from projects where id in (:ids)").setParameter("ids", unique).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), (String) r[1]));
        return out;
    }

    private static DocLink link(SalesDoc d) {
        return new DocLink(d.id, d.docType, d.docNo, d.docDate, d.status, d.totalAmount, d.netAmount,
                SalesDoc.INVOICES.contains(d.docType) ? d.outstanding() : null);
    }

    SalesDocDto toDto(SalesDoc d) {
        return toDto(d, SalesDocItem.listFor(d.id));
    }

    SalesDocDto toDto(SalesDoc d, List<SalesDocItem> items) {
        Project p = d.projectId == null ? null : Project.findById(d.projectId);
        Contract c = d.contractId == null ? null : Contract.findById(d.contractId);
        SalesDoc ref = d.refDocId == null ? null : SalesDoc.findById(d.refDocId);
        List<DocLink> related = SalesDoc.<SalesDoc>list("refDocId = ?1 order by docDate, createdAt", d.id).stream()
                .map(SalesDocService::link).toList();
        List<DocLink> lines = new ArrayList<>();
        if (SalesDoc.BILLING_NOTE.equals(d.docType)) {
            @SuppressWarnings("unchecked")
            List<Object> ids = em.createNativeQuery("select invoice_id from billing_note_lines where billing_note_id = ?1 order by sort_order")
                    .setParameter(1, d.id).getResultList();
            for (Object o : ids) {
                SalesDoc inv = SalesDoc.findById(SqlValues.uuid(o));
                if (inv != null) {
                    lines.add(link(inv));
                }
            }
        } else if (SalesDoc.INVOICES.contains(d.docType)) {
            @SuppressWarnings("unchecked")
            List<Object> ids = em.createNativeQuery("""
                            select l.billing_note_id from billing_note_lines l join sales_docs b on b.id = l.billing_note_id
                            where l.invoice_id = ?1 and b.deleted_at is null""").setParameter(1, d.id).getResultList();
            for (Object o : ids) {
                SalesDoc bn = SalesDoc.findById(SqlValues.uuid(o));
                if (bn != null) {
                    lines.add(link(bn));
                }
            }
        }
        boolean write = currentUser.can(Perm.FINANCE_WRITE);
        boolean isInvoice = SalesDoc.INVOICES.contains(d.docType);
        List<ItemDto> its = items.stream().map(i -> new ItemDto(i.id, i.sortOrder, i.description, i.quantity, i.unit,
                i.unitPrice, i.amount, i.milestoneId)).toList();
        return new SalesDocDto(d.id, d.docType, SalesDoc.TITLES.get(d.docType), d.docNo, d.docDate, d.dueDate, d.status,
                d.customerId, d.customerName, d.customerAddress, d.customerTaxId, d.customerBranchNo, d.projectId,
                p == null ? null : p.code, p == null ? null : p.name, d.contractId, c == null ? null : c.docNo, d.kind,
                d.subtotal, d.discountAmount, d.advanceDeduct, d.taxableAmount, d.vatPct.signum() > 0, d.vatPct,
                d.vatAmount, d.totalAmount, d.retentionPct, d.retentionAmount, d.whtPct, d.whtAmount, d.netAmount,
                d.settledAmount, isInvoice ? d.outstanding() : null, d.originalAmount, d.correctAmount, d.reason,
                d.paymentMethod, d.paymentRef, d.paidDate, d.notes, d.issuedAt, d.voidedAt, UserNames.one(d.createdBy),
                its, ref == null ? null : link(ref), related, lines,
                write && d.isDraft() && isInvoice,
                write && d.isDraft(),
                write && isInvoice && Set.of("issued", "partial").contains(d.status),
                currentUser.can(Perm.FINANCE_VOID) && !d.isDraft() && !"void".equals(d.status),
                currentUser.can(Perm.FINANCE_VOID) && SalesDoc.TAX_DOCS.contains(d.docType) && !d.isDraft() && !"void".equals(d.status));
    }
}
