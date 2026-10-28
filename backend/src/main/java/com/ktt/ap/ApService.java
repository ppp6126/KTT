package com.ktt.ap;

import com.ktt.ap.ApDtos.BillDto;
import com.ktt.ap.ApDtos.BillRequest;
import com.ktt.ap.ApDtos.BillRow;
import com.ktt.ap.ApDtos.CertDto;
import com.ktt.ap.ApDtos.ItemDto;
import com.ktt.ap.ApDtos.ItemInput;
import com.ktt.ap.ApDtos.PaymentLink;
import com.ktt.ap.ApDtos.PvDto;
import com.ktt.ap.ApDtos.PvLineDto;
import com.ktt.ap.ApDtos.PvLineInput;
import com.ktt.ap.ApDtos.PvRequest;
import com.ktt.ap.ApDtos.PvRow;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.purchase.GoodsReceipt;
import com.ktt.purchase.GoodsReceiptItem;
import com.ktt.purchase.PurchaseOrder;
import com.ktt.purchase.Supplier;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * เจ้าหนี้: บิลผู้ขาย → ใบสำคัญจ่าย → ตัดหนี้ + หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)
 * บิลที่อ้างอิง PO ไม่นับเป็นต้นทุนโครงการซ้ำ (ต้นทุนวัสดุคิดตอนรับของ/เบิกใช้)
 */
@ApplicationScoped
public class ApService {

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
    NotificationService notifications;

    @Inject
    EntityManager em;

    // ================================================================= bills

    @Transactional
    public PageResult<BillRow> listBills(String status, UUID supplierId, UUID projectId, String q, boolean open, int page, int size) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        if (open) {
            w.append(" and status in ('approved', 'partial')");
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
            w.append(" and (lower(docNo) like :q or lower(supplierName) like :q or lower(supplierInvoiceNo) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        PanacheQuery<ApBill> query = ApBill.find(w.toString(), Sort.descending("billDate").and("docNo", Sort.Direction.Descending), p);
        long total = query.count();
        LocalDate today = DocNumberService.today();
        List<BillRow> rows = new ArrayList<>();
        for (ApBill b : query.page(Page.of(page, size)).list()) {
            Project pr = b.projectId == null ? null : Project.findById(b.projectId);
            boolean isOpen = Set.of("approved", "partial").contains(b.status);
            rows.add(new BillRow(b.id, b.docNo, b.supplierName, b.supplierInvoiceNo, b.billDate, b.dueDate,
                    pr == null ? null : pr.code, b.category, b.status, b.totalAmount, b.netPayable,
                    isOpen ? b.outstanding() : null, isOpen && b.dueDate != null && b.dueDate.isBefore(today)));
        }
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public BillDto getBill(UUID id) {
        requireRead();
        return toDto(requireBill(id));
    }

    @Transactional
    public BillDto createBill(BillRequest req) {
        requireWrite();
        ApBill b = new ApBill();
        b.docNo = docNumbers.next(projects.prefix("ap_bill", "AP"), req.billDate());
        b.createdBy = currentUser.id();
        apply(b, req);
        b.persist();
        writeItems(b, req.items());
        audit.log("ap_bill", b.id, AuditService.ACTION_CREATE, null, Map.of("docNo", b.docNo, "supplier", b.supplierName, "total", b.totalAmount));
        return toDto(b);
    }

    /** ใช้ภายใน: บิลจากงวดผู้รับเหมาช่วงที่อนุมัติแล้ว */
    @Transactional(Transactional.TxType.MANDATORY)
    public ApBill createFromClaim(UUID subcontractId, UUID claimId, UUID supplierId, UUID projectId, String description, BigDecimal amount,
                                  BigDecimal vatPct, BigDecimal whtPct, BigDecimal retention, LocalDate date) {
        ApBill b = new ApBill();
        b.docNo = docNumbers.next(projects.prefix("ap_bill", "AP"), date);
        b.createdBy = currentUser.id();
        Supplier s = Supplier.findById(supplierId);
        snapshot(b, s);
        b.billDate = date;
        b.dueDate = date.plusDays(s.creditDays);
        b.taxPeriod = period(date);
        b.projectId = projectId;
        b.subcontractId = subcontractId;
        b.subcontractClaimId = claimId;
        b.category = "subcontract";
        b.vatPct = vatPct;
        b.whtPct = whtPct;
        b.retentionAmount = Money.round2(retention);
        b.taxInvoice = vatPct.signum() > 0;
        b.persist();
        writeItems(b, List.of(new ItemInput(description, BigDecimal.ONE, "งวด", amount)));
        audit.log("ap_bill", b.id, AuditService.ACTION_CREATE, null, Map.of("docNo", b.docNo, "fromClaim", String.valueOf(claimId)));
        return b;
    }

    /** ร่างบิลจากใบสั่งซื้อ: รายการที่รับของแล้วแต่ยังไม่ตั้งหนี้ (ส่วนลดท้ายบิลเฉลี่ยเป็นบรรทัดติดลบ) */
    @Transactional
    public BillDto fromPo(UUID poId) {
        requireWrite();
        PurchaseOrder po = PurchaseOrder.findById(poId);
        if (po == null || !Set.of("approved", "partial", "received", "closed").contains(po.status)) {
            throw ApiException.badRequest("invalid_po", "ใบสั่งซื้อต้องอนุมัติและรับของแล้ว");
        }
        BigDecimal billed = SqlValues.decimal0(em.createNativeQuery(
                "select coalesce(sum(subtotal), 0) from ap_bills where po_id = ?1 and status <> 'void' and deleted_at is null")
                .setParameter(1, po.id).getSingleResult());
        List<ItemInput> items = new ArrayList<>();
        BigDecimal received = BigDecimal.ZERO;
        for (GoodsReceipt gr : GoodsReceipt.<GoodsReceipt>list("poId = ?1 and status = 'posted' order by receiveDate", po.id)) {
            for (GoodsReceiptItem gi : GoodsReceiptItem.listFor(gr.id)) {
                com.ktt.purchase.PurchaseOrderItem it = com.ktt.purchase.PurchaseOrderItem.findById(gi.poItemId);
                items.add(new ItemInput(gi.description + " (" + gr.docNo + ")", gi.quantity, gi.unit, it.unitPrice));
                received = received.add(Money.round2(gi.quantity.multiply(it.unitPrice)));
            }
        }
        if (items.isEmpty()) {
            throw ApiException.badRequest("nothing_received", "ใบสั่งซื้อนี้ยังไม่ได้รับของ");
        }
        if (po.discountAmount.signum() > 0 && po.subtotal.signum() > 0) {
            BigDecimal disc = Money.round2(po.discountAmount.multiply(received).divide(po.subtotal, 10, RoundingMode.HALF_UP));
            items.add(new ItemInput("ส่วนลดตามใบสั่งซื้อ", BigDecimal.ONE, null, disc.negate()));
        }
        if (billed.signum() > 0) {
            items.add(new ItemInput("หักยอดที่ตั้งหนี้แล้ว", BigDecimal.ONE, null, billed.negate()));
        }
        Supplier s = Supplier.findById(po.supplierId);
        LocalDate today = DocNumberService.today();
        return createBill(new BillRequest(po.supplierId, null, s.vatRegistered, today, today.plusDays(po.creditDays), null,
                po.projectId, po.id, "material", po.vatPct.signum() > 0, BigDecimal.ZERO, BigDecimal.ZERO,
                "ตั้งหนี้ตามใบสั่งซื้อ " + po.docNo, items));
    }

    @Transactional
    public BillDto updateBill(UUID id, BillRequest req) {
        requireWrite();
        ApBill b = requireBill(id);
        if (!"draft".equals(b.status)) {
            throw ApiException.conflict("not_editable", "แก้ไขได้เฉพาะบิลฉบับร่าง");
        }
        apply(b, req);
        ApBillItem.delete("billId", b.id);
        writeItems(b, req.items());
        audit.log("ap_bill", b.id, AuditService.ACTION_UPDATE, null, Map.of("total", b.totalAmount));
        return toDto(b);
    }

    @Transactional
    public BillDto approveBill(UUID id) {
        if (!currentUser.can(Perm.AP_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติบิล");
        }
        ApBill b = requireBill(id);
        if (!"draft".equals(b.status)) {
            throw ApiException.conflict("invalid_status", "อนุมัติได้เฉพาะบิลฉบับร่าง");
        }
        if (currentUser.id().equals(b.createdBy) && !isOwner()) {
            throw ApiException.forbidden("self_approval", "อนุมัติบิลที่ตัวเองบันทึกไม่ได้");
        }
        if (b.totalAmount.signum() <= 0) {
            throw ApiException.badRequest("invalid_amount", "ยอดบิลต้องมากกว่า 0");
        }
        if (b.taxInvoice && UserNames.blankToNull(b.supplierInvoiceNo) == null) {
            throw ApiException.badRequest("invoice_no_required", "ใบกำกับภาษีต้องระบุเลขที่ใบกำกับของผู้ขาย");
        }
        b.status = "approved";
        audit.log("ap_bill", b.id, AuditService.ACTION_APPROVE, Map.of("status", "draft"), Map.of("status", "approved"));
        return toDto(b);
    }

    @Transactional
    public BillDto voidBill(UUID id, String reason) {
        if (!currentUser.can(Perm.AP_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ยกเลิกบิล");
        }
        ApBill b = lockBill(id);
        if (b.paidAmount.signum() > 0 || "void".equals(b.status)) {
            throw ApiException.conflict("has_payment", "บิลที่จ่ายแล้วยกเลิกไม่ได้ ให้ยกเลิกใบสำคัญจ่ายก่อน");
        }
        Number inPv = (Number) em.createNativeQuery("""
                        select count(*) from payment_voucher_lines l join payment_vouchers v on v.id = l.pv_id
                        where l.bill_id = ?1 and v.status in ('draft', 'approved') and v.deleted_at is null""")
                .setParameter(1, b.id).getSingleResult();
        if (inPv.longValue() > 0) {
            throw ApiException.conflict("in_voucher", "บิลนี้อยู่ในใบสำคัญจ่ายที่ยังไม่จ่าย");
        }
        b.status = "void";
        b.notes = (b.notes == null ? "" : b.notes + "\n") + "ยกเลิก: " + (reason == null ? "" : reason.trim());
        unlinkSubcontract(b);
        audit.log("ap_bill", b.id, AuditService.ACTION_DELETE, null, Map.of("status", "void"));
        return toDto(b);
    }

    @Transactional
    public void deleteBill(UUID id) {
        requireWrite();
        ApBill b = lockBill(id);
        if (!"draft".equals(b.status)) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะบิลฉบับร่าง");
        }
        unlinkSubcontract(b);
        b.softDelete();
        audit.log("ap_bill", b.id, AuditService.ACTION_DELETE, Map.of("docNo", b.docNo), null);
    }

    // ================================================================= payment vouchers

    @Transactional
    public PageResult<PvRow> listPv(String status, UUID supplierId, int page, int size) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        if (supplierId != null) {
            w.append(" and supplierId = :s");
            p.and("s", supplierId);
        }
        PanacheQuery<PaymentVoucher> query = PaymentVoucher.find(w.toString(), Sort.descending("payDate").and("docNo", Sort.Direction.Descending), p);
        long total = query.count();
        return new PageResult<>(query.page(Page.of(page, size)).list().stream().map(v -> new PvRow(v.id, v.docNo, v.supplierName,
                v.payDate, v.method, v.status, v.grossAmount, v.whtAmount, v.netPaid)).toList(), total, page, size);
    }

    @Transactional
    public PvDto getPv(UUID id) {
        requireRead();
        return toDto(requirePv(id));
    }

    @Transactional
    public PvDto createPv(PvRequest req) {
        requireWrite();
        Supplier s = Supplier.findById(req.supplierId());
        if (s == null) {
            throw ApiException.badRequest("invalid_supplier", "ไม่พบผู้ขาย");
        }
        PaymentVoucher v = new PaymentVoucher();
        v.docNo = docNumbers.next(projects.prefix("payment_voucher", "PV"), req.payDate());
        v.supplierId = s.id;
        v.supplierName = s.name;
        v.payDate = req.payDate();
        v.method = req.method();
        v.bankRef = UserNames.blankToNull(req.bankRef());
        v.notes = UserNames.blankToNull(req.notes());
        v.createdBy = currentUser.id();
        v.persist();
        writeLines(v, req.lines());
        audit.log("payment_voucher", v.id, AuditService.ACTION_CREATE, null, Map.of("docNo", v.docNo, "net", v.netPaid));
        return toDto(v);
    }

    @Transactional
    public PvDto approvePv(UUID id) {
        if (!currentUser.can(Perm.AP_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์อนุมัติการจ่ายเงิน");
        }
        PaymentVoucher v = requirePv(id);
        if (!"draft".equals(v.status)) {
            throw ApiException.conflict("invalid_status", "อนุมัติได้เฉพาะฉบับร่าง");
        }
        if (currentUser.id().equals(v.createdBy) && !isOwner()) {
            throw ApiException.forbidden("self_approval", "อนุมัติใบสำคัญจ่ายของตัวเองไม่ได้");
        }
        v.status = "approved";
        v.approvedBy = currentUser.id();
        v.approvedAt = Instant.now();
        audit.log("payment_voucher", v.id, AuditService.ACTION_APPROVE, null, Map.of("status", "approved"));
        return toDto(v);
    }

    /** บันทึกว่าจ่ายเงินแล้ว: ตัดหนี้ทุกบิล และออก 50 ทวิ (หนึ่งใบต่ออัตราภาษี) */
    @Transactional
    public PvDto payPv(UUID id, LocalDate paidDate, String bankRef) {
        requireWrite();
        PaymentVoucher v = lockPv(id);
        if (!"approved".equals(v.status)) {
            throw ApiException.conflict("invalid_status", "ต้องอนุมัติใบสำคัญจ่ายก่อน");
        }
        if (paidDate != null) {
            v.payDate = paidDate;
        }
        if (UserNames.blankToNull(bankRef) != null) {
            v.bankRef = bankRef.trim();
        }
        // คำนวณ WHT ใหม่ ณ เวลาจ่ายจริง (บิลอาจถูกจ่ายบางส่วนไปแล้วระหว่างนี้)
        List<Object[]> lines = lines(v.id);
        Map<UUID, ApBill> bills = lockBills(lines);
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal whtTotal = BigDecimal.ZERO;
        Map<BigDecimal, BigDecimal> whtByRate = new LinkedHashMap<>();
        Map<BigDecimal, BigDecimal> incomeByRate = new LinkedHashMap<>();
        for (Object[] l : lines) {
            ApBill b = bills.get(SqlValues.uuid(l[0]));
            BigDecimal amount = SqlValues.decimal0(l[1]);
            if (!Set.of("approved", "partial").contains(b.status)) {
                throw ApiException.conflict("bill_closed", "บิล " + b.docNo + " ไม่อยู่ในสถานะค้างจ่าย");
            }
            if (amount.compareTo(b.outstanding()) > 0) {
                throw ApiException.conflict("over_payment", "บิล " + b.docNo + " ค้างจ่าย " + b.outstanding().toPlainString() + " บาท น้อยกว่ายอดที่จะจ่าย");
            }
            boolean isFinal = amount.compareTo(b.outstanding()) == 0;
            BigDecimal priorWht = priorWht(b.id);
            BigDecimal wht = ApCalculator.whtPortion(amount, b.payableGross(), b.whtAmount, priorWht, isFinal);
            BigDecimal income = ApCalculator.incomePortion(amount, b.payableGross(), whtBase(b), priorIncome(b.id), isFinal);
            em.createNativeQuery("update payment_voucher_lines set wht_amount = ?1, income_amount = ?4 where pv_id = ?2 and bill_id = ?3")
                    .setParameter(1, wht).setParameter(2, v.id).setParameter(3, b.id).setParameter(4, income).executeUpdate();
            b.paidAmount = Money.round2(b.paidAmount.add(amount));
            b.status = b.outstanding().signum() <= 0 ? "paid" : "partial";
            gross = gross.add(amount);
            whtTotal = whtTotal.add(wht);
            if (wht.signum() > 0) {
                whtByRate.merge(b.whtPct, wht, BigDecimal::add);
                incomeByRate.merge(b.whtPct, income, BigDecimal::add);
            }
        }
        v.grossAmount = Money.round2(gross);
        v.whtAmount = Money.round2(whtTotal);
        v.netPaid = v.grossAmount.subtract(v.whtAmount);
        v.status = "paid";
        Supplier s = Supplier.findById(v.supplierId);
        for (Map.Entry<BigDecimal, BigDecimal> e : whtByRate.entrySet()) {
            issueCertificate(v, s, e.getKey(), e.getValue(), incomeByRate.getOrDefault(e.getKey(), BigDecimal.ZERO));
        }
        audit.log("payment_voucher", v.id, AuditService.ACTION_UPDATE, Map.of("status", "approved"),
                Map.of("status", "paid", "net", v.netPaid, "wht", v.whtAmount));
        return toDto(v);
    }

    @Transactional
    public PvDto voidPv(UUID id, String reason) {
        if (!currentUser.can(Perm.AP_APPROVE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ยกเลิกใบสำคัญจ่าย");
        }
        PaymentVoucher v = lockPv(id);
        if ("void".equals(v.status)) {
            throw ApiException.conflict("already_void", "ยกเลิกแล้ว");
        }
        if ("paid".equals(v.status)) {
            List<Object[]> lines = lines(v.id);
            Map<UUID, ApBill> bills = lockBills(lines);
            for (Object[] l : lines) {
                ApBill b = bills.get(SqlValues.uuid(l[0]));
                b.paidAmount = Money.round2(b.paidAmount.subtract(SqlValues.decimal0(l[1]))).max(BigDecimal.ZERO);
                b.status = b.paidAmount.signum() == 0 ? "approved" : "partial";
            }
            WhtCertificate.update("status = 'void' where pvId = ?1", v.id);
        }
        v.status = "void";
        v.notes = (v.notes == null ? "" : v.notes + "\n") + "ยกเลิก: " + (reason == null ? "" : reason.trim());
        audit.log("payment_voucher", v.id, AuditService.ACTION_DELETE, null, Map.of("status", "void"));
        return toDto(v);
    }

    @Transactional
    public CertDto certificate(UUID id) {
        requireRead();
        WhtCertificate c = WhtCertificate.findById(id);
        if (c == null) {
            throw ApiException.notFound("ไม่พบหนังสือรับรอง");
        }
        return toDto(c);
    }

    // ================================================================= internals

    private void issueCertificate(PaymentVoucher v, Supplier s, BigDecimal rate, BigDecimal wht, BigDecimal income) {
        String book = String.valueOf(v.payDate.getYear() + 543);
        Number n = (Number) em.createNativeQuery("""
                        insert into doc_counters (prefix, period, last_no) values ('WHT', ?1, 1)
                        on conflict (prefix, period) do update set last_no = doc_counters.last_no + 1
                        returning last_no""").setParameter(1, book).getSingleResult();
        WhtCertificate c = new WhtCertificate();
        c.bookNo = book;
        c.runNo = n.intValue();
        c.pvId = v.id;
        c.form = "person".equals(s.personType) ? "pnd3" : "pnd53";
        c.payeeName = s.name;
        c.payeeTaxId = s.taxId;
        c.payeeAddress = s.address;
        c.payDate = v.payDate;
        c.incomeType = rate.compareTo(new BigDecimal("3")) == 0 ? "ค่าจ้างทำของ ค่าบริการ (มาตรา 3 เตรส)"
                : rate.compareTo(BigDecimal.ONE) == 0 ? "ค่าขนส่ง (มาตรา 3 เตรส)"
                : rate.compareTo(new BigDecimal("5")) == 0 ? "ค่าเช่า (มาตรา 3 เตรส)" : "เงินได้ตามมาตรา 3 เตรส";
        c.whtRate = rate;
        c.whtAmount = Money.round2(wht);
        // เงินได้จริงก่อน VAT ที่จ่ายครั้งนี้ (ไม่ย้อนจาก WHT ที่ปัดเศษแล้ว)
        c.amount = Money.round2(income);
        c.persist();
    }

    private void writeLines(PaymentVoucher v, List<PvLineInput> input) {
        Set<UUID> seen = new HashSet<>();
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal whtTotal = BigDecimal.ZERO;
        for (PvLineInput l : input) {
            if (!seen.add(l.billId())) {
                throw ApiException.badRequest("duplicate_bill", "เลือกบิลซ้ำ");
            }
            ApBill b = requireBill(l.billId());
            if (!b.supplierId.equals(v.supplierId)) {
                throw ApiException.badRequest("supplier_mismatch", "บิล " + b.docNo + " เป็นของผู้ขายรายอื่น");
            }
            if (!Set.of("approved", "partial").contains(b.status)) {
                throw ApiException.badRequest("bill_not_open", "บิล " + b.docNo + " ยังไม่อนุมัติหรือจ่ายครบแล้ว");
            }
            BigDecimal amount = Money.round2(l.amount());
            if (amount.compareTo(b.outstanding()) > 0) {
                throw ApiException.badRequest("over_payment", "บิล " + b.docNo + " ค้างจ่ายเพียง " + b.outstanding().toPlainString() + " บาท");
            }
            boolean isFinal = amount.compareTo(b.outstanding()) == 0;
            BigDecimal wht = ApCalculator.whtPortion(amount, b.payableGross(), b.whtAmount, priorWht(b.id), isFinal);
            BigDecimal income = ApCalculator.incomePortion(amount, b.payableGross(), whtBase(b), priorIncome(b.id), isFinal);
            em.createNativeQuery("insert into payment_voucher_lines (pv_id, bill_id, amount, wht_amount, income_amount) values (?1, ?2, ?3, ?4, ?5)")
                    .setParameter(1, v.id).setParameter(2, b.id).setParameter(3, amount).setParameter(4, wht)
                    .setParameter(5, income).executeUpdate();
            gross = gross.add(amount);
            whtTotal = whtTotal.add(wht);
        }
        v.grossAmount = Money.round2(gross);
        v.whtAmount = Money.round2(whtTotal);
        v.netPaid = v.grossAmount.subtract(v.whtAmount);
    }

    private BigDecimal priorWht(UUID billId) {
        return SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(l.wht_amount), 0) from payment_voucher_lines l join payment_vouchers v on v.id = l.pv_id
                        where l.bill_id = ?1 and v.status = 'paid' and v.deleted_at is null""").setParameter(1, billId).getSingleResult());
    }

    private BigDecimal priorIncome(UUID billId) {
        return SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(l.income_amount), 0) from payment_voucher_lines l join payment_vouchers v on v.id = l.pv_id
                        where l.bill_id = ?1 and v.status = 'paid' and v.deleted_at is null""").setParameter(1, billId).getSingleResult());
    }

    /** ฐานเงินได้ของบิลสำหรับหัก ณ ที่จ่าย (รวมเงินก่อน VAT) ; 0 ถ้าไม่หัก */
    private static BigDecimal whtBase(ApBill b) {
        return b.whtAmount.signum() == 0 ? BigDecimal.ZERO : b.subtotal;
    }

    /**
     * บิลถูกยกเลิก/ลบ: งวดเบิกกลับเป็นร่าง (ตรวจรับ/ตั้งหนี้ใหม่ได้) ; บิลคืนเงินประกันคืนยอดเงินประกันที่กันไว้
     */
    private void unlinkSubcontract(ApBill b) {
        if (b.subcontractClaimId != null) {
            if (b.subcontractId != null && b.retentionAmount.signum() > 0) {
                em.createNativeQuery("select id from subcontracts where id = ?1 for update").setParameter(1, b.subcontractId).getResultList();
                BigDecimal heldAfter = SqlValues.decimal0(em.createNativeQuery("""
                                select coalesce((select sum(retention_amount) from ap_bills where subcontract_id = ?1
                                       and subcontract_claim_id is not null and status <> 'void' and deleted_at is null and id <> ?2), 0)
                                       - (select retention_released from subcontracts where id = ?1)""")
                        .setParameter(1, b.subcontractId).setParameter(2, b.id).getSingleResult());
                if (heldAfter.signum() < 0) {
                    throw ApiException.conflict("retention_released", "คืนเงินประกันของสัญญานี้ไปแล้ว ต้องยกเลิกบิลคืนเงินประกันก่อน");
                }
            }
            em.createNativeQuery("""
                            update subcontract_claims set status = 'draft', ap_bill_id = null, approved_by = null, approved_at = null
                            where id = ?1 and (ap_bill_id is null or ap_bill_id = ?2)""")
                    .setParameter(1, b.subcontractClaimId).setParameter(2, b.id).executeUpdate();
        } else if (b.subcontractId != null) {
            em.createNativeQuery("update subcontracts set retention_released = greatest(retention_released - ?1, 0) where id = ?2")
                    .setParameter(1, b.subtotal).setParameter(2, b.subcontractId).executeUpdate();
        }
    }

    private ApBill lockBill(UUID id) {
        ApBill b = id == null ? null : ApBill.findById(id, LockModeType.PESSIMISTIC_WRITE);
        if (b == null) {
            throw ApiException.notFound("ไม่พบบิล");
        }
        return b;
    }

    /** ล็อกบิลทุกใบในใบสำคัญจ่าย (เรียงตาม id กัน deadlock) */
    private Map<UUID, ApBill> lockBills(List<Object[]> lines) {
        Map<UUID, ApBill> out = new LinkedHashMap<>();
        lines.stream().map(l -> SqlValues.uuid(l[0])).sorted().forEach(bid -> out.put(bid, lockBill(bid)));
        return out;
    }

    private PaymentVoucher lockPv(UUID id) {
        PaymentVoucher v = id == null ? null : PaymentVoucher.findById(id, LockModeType.PESSIMISTIC_WRITE);
        if (v == null) {
            throw ApiException.notFound("ไม่พบใบสำคัญจ่าย");
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> lines(UUID pvId) {
        return em.createNativeQuery("select bill_id, amount, wht_amount from payment_voucher_lines where pv_id = ?1")
                .setParameter(1, pvId).getResultList();
    }

    private void apply(ApBill b, BillRequest req) {
        Supplier s = Supplier.findById(req.supplierId());
        if (s == null) {
            throw ApiException.badRequest("invalid_supplier", "ไม่พบผู้ขาย");
        }
        if (!WHT.contains(req.whtPct().intValue()) || req.whtPct().compareTo(BigDecimal.valueOf(req.whtPct().intValue())) != 0) {
            throw ApiException.badRequest("invalid_wht", "หัก ณ ที่จ่ายต้องเป็น 0, 1, 2, 3 หรือ 5%");
        }
        if (req.projectId() != null) {
            projects.requireVisible(req.projectId());
        }
        if (req.poId() != null) {
            PurchaseOrder po = PurchaseOrder.findById(req.poId());
            if (po == null || !po.supplierId.equals(s.id)) {
                throw ApiException.badRequest("invalid_po", "ใบสั่งซื้อไม่ใช่ของผู้ขายรายนี้");
            }
        }
        if (req.dueDate() != null && req.dueDate().isBefore(req.billDate())) {
            throw ApiException.badRequest("invalid_due", "วันครบกำหนดต้องไม่ก่อนวันที่บิล");
        }
        snapshot(b, s);
        b.supplierInvoiceNo = UserNames.blankToNull(req.supplierInvoiceNo());
        b.taxInvoice = req.taxInvoice() && req.vatEnabled();
        b.billDate = req.billDate();
        b.dueDate = req.dueDate() != null ? req.dueDate() : req.billDate().plusDays(s.creditDays);
        b.taxPeriod = UserNames.blankToNull(req.taxPeriod()) != null ? req.taxPeriod() : period(req.billDate());
        b.projectId = req.projectId();
        b.poId = req.poId();
        b.category = req.category();
        b.vatPct = req.vatEnabled() ? new BigDecimal("7.00") : BigDecimal.ZERO;
        b.whtPct = req.whtPct();
        b.retentionAmount = Money.round2(req.retentionAmount());
        b.notes = UserNames.blankToNull(req.notes());
    }

    private static void snapshot(ApBill b, Supplier s) {
        b.supplierId = s.id;
        b.supplierName = s.name;
        b.supplierTaxId = s.taxId;
        b.supplierBranchNo = s.branchNo;
    }

    private void writeItems(ApBill b, List<ItemInput> input) {
        List<ApBillItem> items = new ArrayList<>();
        int order = 0;
        for (ItemInput in : input) {
            ApBillItem it = new ApBillItem();
            it.billId = b.id;
            it.sortOrder = ++order;
            it.description = in.description().trim();
            it.quantity = in.quantity();
            it.unit = UserNames.blankToNull(in.unit());
            it.unitPrice = Money.round2(in.unitPrice());
            it.persist();
            items.add(it);
        }
        ApCalculator.Result r = ApCalculator.compute(items.stream().map(i -> new ApCalculator.Line(i.quantity, i.unitPrice)).toList(),
                b.vatPct, b.whtPct, b.retentionAmount);
        for (int i = 0; i < items.size(); i++) {
            items.get(i).amount = r.lineAmounts().get(i);
        }
        if (r.net().signum() < 0) {
            throw ApiException.badRequest("invalid_amount", "ยอดหักมากกว่ายอดบิล");
        }
        b.subtotal = r.subtotal();
        b.vatAmount = r.vat();
        b.totalAmount = r.total();
        b.whtAmount = r.wht();
        b.netPayable = r.net();
    }

    static String period(LocalDate d) {
        return "%04d-%02d".formatted(d.getYear(), d.getMonthValue());
    }

    private ApBill requireBill(UUID id) {
        ApBill b = id == null ? null : ApBill.findById(id);
        if (b == null) {
            throw ApiException.notFound("ไม่พบบิล");
        }
        return b;
    }

    private PaymentVoucher requirePv(UUID id) {
        PaymentVoucher v = id == null ? null : PaymentVoucher.findById(id);
        if (v == null) {
            throw ApiException.notFound("ไม่พบใบสำคัญจ่าย");
        }
        return v;
    }

    private void requireRead() {
        if (!currentUser.can(Perm.AP_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูเจ้าหนี้");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.AP_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์บันทึกเจ้าหนี้");
        }
    }

    private boolean isOwner() {
        com.ktt.auth.User u = com.ktt.auth.User.findById(currentUser.id());
        return u != null && "owner".equals(u.role.code);
    }

    // ================================================================= dto

    BillDto toDto(ApBill b) {
        Project p = b.projectId == null ? null : Project.findById(b.projectId);
        PurchaseOrder po = b.poId == null ? null : PurchaseOrder.findById(b.poId);
        List<ItemDto> items = ApBillItem.listFor(b.id).stream().map(i -> new ItemDto(i.id, i.sortOrder, i.description, i.quantity,
                i.unit, i.unitPrice, i.amount)).toList();
        @SuppressWarnings("unchecked")
        List<Object[]> pays = em.createNativeQuery("""
                        select v.id, v.doc_no, v.pay_date, v.status, l.amount, l.wht_amount from payment_voucher_lines l
                        join payment_vouchers v on v.id = l.pv_id where l.bill_id = ?1 and v.deleted_at is null order by v.pay_date""")
                .setParameter(1, b.id).getResultList();
        List<PaymentLink> payments = pays.stream().map(r -> new PaymentLink(SqlValues.uuid(r[0]), (String) r[1], SqlValues.date(r[2]),
                (String) r[3], SqlValues.decimal0(r[4]), SqlValues.decimal0(r[5]))).toList();
        boolean open = Set.of("approved", "partial").contains(b.status);
        return new BillDto(b.id, b.docNo, b.supplierId, b.supplierName, b.supplierTaxId, b.supplierBranchNo, b.supplierInvoiceNo,
                b.taxInvoice, b.billDate, b.dueDate, b.taxPeriod, b.projectId, p == null ? null : p.code, p == null ? null : p.name,
                b.poId, po == null ? null : po.docNo, b.subcontractClaimId, b.category, b.subtotal, b.vatPct.signum() > 0, b.vatPct,
                b.vatAmount, b.totalAmount, b.retentionAmount, b.whtPct, b.whtAmount, b.netPayable, b.paidAmount,
                open ? b.outstanding() : null, b.status, b.notes, UserNames.one(b.createdBy), items, payments,
                "draft".equals(b.status) && currentUser.can(Perm.AP_WRITE),
                "draft".equals(b.status) && currentUser.can(Perm.AP_APPROVE),
                !"void".equals(b.status) && b.paidAmount.signum() == 0 && currentUser.can(Perm.AP_APPROVE), b.createdAt);
    }

    PvDto toDto(PaymentVoucher v) {
        Supplier s = Supplier.findById(v.supplierId);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select b.id, b.doc_no, b.supplier_invoice_no, b.bill_date, b.category, b.total_amount, l.amount, l.wht_amount
                        from payment_voucher_lines l join ap_bills b on b.id = l.bill_id where l.pv_id = ?1 order by b.bill_date""")
                .setParameter(1, v.id).getResultList();
        List<PvLineDto> lines = rows.stream().map(r -> new PvLineDto(SqlValues.uuid(r[0]), (String) r[1], (String) r[2],
                SqlValues.date(r[3]), (String) r[4], SqlValues.decimal0(r[5]), SqlValues.decimal0(r[6]), SqlValues.decimal0(r[7]))).toList();
        List<CertDto> certs = WhtCertificate.<WhtCertificate>list("pvId = ?1 order by runNo", v.id).stream().map(this::toDto).toList();
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(v.createdBy, v.approvedBy));
        return new PvDto(v.id, v.docNo, v.supplierId, v.supplierName, s == null ? null : s.taxId,
                s == null ? null : ((s.bankName == null ? "" : s.bankName + " ") + (s.bankAccount == null ? "" : s.bankAccount)).trim(),
                v.payDate, v.method, v.bankRef, v.grossAmount, v.whtAmount, v.netPaid, v.status, v.notes,
                names.get(v.createdBy), names.get(v.approvedBy), v.approvedAt, lines, certs,
                "draft".equals(v.status) && currentUser.can(Perm.AP_APPROVE),
                "approved".equals(v.status) && currentUser.can(Perm.AP_WRITE),
                !"void".equals(v.status) && currentUser.can(Perm.AP_APPROVE), v.createdAt);
    }

    CertDto toDto(WhtCertificate c) {
        PaymentVoucher v = PaymentVoucher.findById(c.pvId);
        return new CertDto(c.id, c.bookNo, c.runNo, c.form, c.payeeName, c.payeeTaxId, c.payeeAddress, c.payDate, c.incomeType,
                c.amount, c.whtRate, c.whtAmount, c.status, c.pvId, v == null ? null : v.docNo);
    }
}
