package com.ktt.report;

import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.SqlValues;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * รายงาน: ต้นทุนโครงการ (job costing), BOQ เทียบการใช้จริง, ภาษีซื้อ-ขาย, ภ.ง.ด.3/53, ประมาณการกระแสเงินสด
 * <p>
 * ต้นทุนจริงของโครงการ
 * <ul>
 *   <li>วัสดุ = เบิกจากคลัง − รับคืน + รับของส่งตรงหน้างาน (มูลค่าก่อน VAT)</li>
 *   <li>ผู้รับเหมาช่วง = งวดเบิกที่ตรวจรับแล้ว + บิลหมวดผู้รับเหมาช่วงที่บันทึกเอง (ไม่ผ่านงวดเบิก)</li>
 *   <li>ค่าแรง = ค่าแรงตามบันทึกเวลาทำงาน</li>
 *   <li>อื่น ๆ = บิลเจ้าหนี้ที่ระบุโครงการ ไม่อ้างอิง PO/งวดจ้างช่วง (เช่น ค่าเช่าเครื่องจักร ค่าขนส่ง)</li>
 * </ul>
 * ภาระผูกพัน (committed) = PO ที่ยังไม่รับของ + สัญญาจ้างช่วงที่ยังไม่เบิก
 */
@ApplicationScoped
public class ReportService {

    @Inject
    CurrentUser currentUser;

    @Inject
    ProjectService projects;

    @Inject
    EntityManager em;

    // ================================================================= job costing

    public record CostLine(String category, String label, BigDecimal actual, BigDecimal committed) {
    }

    public record CostMonth(String month, BigDecimal material, BigDecimal subcontract, BigDecimal labor, BigDecimal other) {
    }

    public record ProjectCost(UUID projectId, String code, String name, BigDecimal revenue, BigDecimal billed,
                              BigDecimal budget, BigDecimal actualCost, BigDecimal committed, BigDecimal forecastCost,
                              BigDecimal grossProfit, BigDecimal marginPct, BigDecimal budgetUsedPct, BigDecimal progressPct,
                              List<CostLine> lines, List<CostMonth> months) {
    }

    public record CostRow(UUID projectId, String code, String name, String status, BigDecimal revenue, BigDecimal budget,
                          BigDecimal actualCost, BigDecimal committed, BigDecimal marginPct, BigDecimal budgetUsedPct,
                          BigDecimal progressPct) {
    }

    @Transactional
    public ProjectCost projectCost(UUID projectId) {
        requireCost();
        Project p = projects.requireVisible(projectId);
        Map<String, BigDecimal> actual = actualByCategory(p.id);
        BigDecimal[] com = committed(p.id);
        BigDecimal committedPo = com[0];
        BigDecimal committedSc = com[1];
        List<CostLine> lines = List.of(
                new CostLine("material", "วัสดุ", actual.get("material"), Money.round2(committedPo)),
                new CostLine("subcontract", "ผู้รับเหมาช่วง", actual.get("subcontract"), Money.round2(committedSc)),
                new CostLine("labor", "ค่าแรง", actual.get("labor"), BigDecimal.ZERO.setScale(2)),
                new CostLine("other", "ค่าใช้จ่ายอื่น", actual.get("other"), BigDecimal.ZERO.setScale(2)));
        BigDecimal actualCost = lines.stream().map(CostLine::actual).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal committed = lines.stream().map(CostLine::committed).reduce(BigDecimal.ZERO, BigDecimal::add);
        Object[] rev = revenue(p.id);
        BigDecimal revenue = SqlValues.decimal0(rev[0]);
        BigDecimal billed = SqlValues.decimal0(rev[1]);
        BigDecimal budget = p.budgetCost == null ? BigDecimal.ZERO : p.budgetCost;
        BigDecimal forecast = actualCost.add(committed).max(budget);
        BigDecimal gp = revenue.subtract(forecast);
        return new ProjectCost(p.id, p.code, p.name, revenue, billed, budget, Money.round2(actualCost), Money.round2(committed),
                Money.round2(forecast), Money.round2(gp), pct(gp, revenue), pct(actualCost, budget), p.progressPct, lines, months(p.id));
    }

    @Transactional
    public List<CostRow> costSummary() {
        requireCost();
        StringBuilder w = new StringBuilder("status <> 'cancelled'");
        io.quarkus.panache.common.Parameters params = new io.quarkus.panache.common.Parameters();
        projects.scope(w, params, "id");
        List<CostRow> out = new ArrayList<>();
        for (Project p : Project.<Project>list(w + " order by code desc", params)) {
            Map<String, BigDecimal> a = actualByCategory(p.id);
            BigDecimal actual = a.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal revenue = SqlValues.decimal0(revenue(p.id)[0]);
            BigDecimal budget = p.budgetCost == null ? BigDecimal.ZERO : p.budgetCost;
            BigDecimal[] com = committed(p.id);
            BigDecimal committed = com[0].add(com[1]);
            BigDecimal forecast = actual.add(committed).max(budget);
            out.add(new CostRow(p.id, p.code, p.name, p.status, revenue, budget, Money.round2(actual), Money.round2(committed),
                    pct(revenue.subtract(forecast), revenue), pct(actual, budget), p.progressPct));
        }
        return out;
    }

    /**
     * ภาระผูกพัน [PO ที่ยังไม่รับของ (หลังส่วนลดท้ายบิล), สัญญาจ้างช่วงที่ยังไม่เบิก] ก่อน VAT
     * ใช้ร่วมกันทั้งรายงานต้นทุนรายโครงการและสรุปทุกโครงการ
     */
    private BigDecimal[] committed(UUID projectId) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select
                          coalesce((select sum(greatest(i.quantity - i.received_qty, 0) * i.unit_price
                                     * case when o.subtotal > 0 then (o.subtotal - o.discount_amount) / o.subtotal else 1 end)
                                    from purchase_order_items i join purchase_orders o on o.id = i.po_id
                                    where o.project_id = ?1 and o.status in ('approved', 'partial') and o.deleted_at is null), 0),
                          coalesce((select sum(greatest(s.amount - coalesce((select sum(c.amount) from subcontract_claims c
                                     where c.subcontract_id = s.id and c.status <> 'draft'), 0), 0))
                                    from subcontracts s where s.project_id = ?1 and s.status = 'active' and s.deleted_at is null), 0)
                        """).setParameter(1, projectId).getSingleResult();
        return new BigDecimal[]{Money.round2(SqlValues.decimal0(r[0])), Money.round2(SqlValues.decimal0(r[1]))};
    }

    /*
     * บิลเจ้าหนี้ที่นับเป็นต้นทุนโดยตรง: ไม่อ้างอิง PO (วัสดุคิดตอนรับ/เบิก), ไม่ใช่บิลจากงวดเบิก (นับจากงวดแล้ว)
     * และไม่ใช่บิลคืนเงินประกัน (ต้นทุนนับไปแล้วตอนงวดเบิก) ; หมวด subcontract → ผู้รับเหมาช่วง, อื่น ๆ → ค่าใช้จ่ายอื่น
     */
    private static final String DIRECT_BILL = """
            b.project_id = ?1 and b.po_id is null and b.subcontract_claim_id is null and b.subcontract_id is null
            and b.status in ('approved', 'partial', 'paid') and b.deleted_at is null""";

    private Map<String, BigDecimal> actualByCategory(UUID projectId) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select
                          coalesce((select sum(-m.qty * m.unit_cost) from stock_movements m where m.project_id = ?1 and m.kind in ('issue', 'return')), 0)
                          + coalesce((select sum(gi.quantity * gi.unit_cost) from goods_receipt_items gi join goods_receipts g on g.id = gi.gr_id
                                      where g.project_id = ?1 and g.warehouse_id is null and g.status = 'posted'), 0),
                          coalesce((select sum(c.amount) from subcontract_claims c join subcontracts s on s.id = c.subcontract_id
                                      where s.project_id = ?1 and c.status <> 'draft' and s.deleted_at is null), 0)
                          + coalesce((select sum(b.subtotal) from ap_bills b where b.category = 'subcontract' and %1$s), 0),
                          coalesce((select sum(t.wage) from timesheets t where t.project_id = ?1), 0),
                          coalesce((select sum(b.subtotal) from ap_bills b where b.category <> 'subcontract' and %1$s), 0)
                        """.formatted(DIRECT_BILL)).setParameter(1, projectId).getSingleResult();
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        out.put("material", Money.round2(SqlValues.decimal0(r[0])));
        out.put("subcontract", Money.round2(SqlValues.decimal0(r[1])));
        out.put("labor", Money.round2(SqlValues.decimal0(r[2])));
        out.put("other", Money.round2(SqlValues.decimal0(r[3])));
        return out;
    }

    /** [มูลค่าสัญญาปรับปรุง, วางบิลแล้ว] ก่อน VAT */
    private Object[] revenue(UUID projectId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select c.amount + coalesce((select sum(v.amount) from change_orders v where v.contract_id = c.id
                                 and v.status = 'approved' and v.deleted_at is null), 0),
                               coalesce((select sum(case when d.doc_type = 'credit_note' then -d.taxable_amount else d.subtotal - d.discount_amount end)
                                 from sales_docs d where d.contract_id = c.id and d.kind <> 'advance' and d.status not in ('draft', 'void')
                                 and d.doc_type in ('invoice', 'invoice_tax', 'credit_note') and d.deleted_at is null), 0)
                        from contracts c where c.project_id = ?1 and c.deleted_at is null and c.status <> 'terminated'""")
                .setParameter(1, projectId).getResultList();
        return rows.isEmpty() ? new Object[]{BigDecimal.ZERO, BigDecimal.ZERO} : rows.get(0);
    }

    private List<CostMonth> months(UUID projectId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select to_char(d, 'YYYY-MM') m, sum(mat), sum(sub), sum(lab), sum(oth) from (
                          select m.movement_date d, -m.qty * m.unit_cost mat, 0 sub, 0 lab, 0 oth from stock_movements m
                            where m.project_id = ?1 and m.kind in ('issue', 'return')
                          union all
                          select g.receive_date, gi.quantity * gi.unit_cost, 0, 0, 0 from goods_receipt_items gi join goods_receipts g on g.id = gi.gr_id
                            where g.project_id = ?1 and g.warehouse_id is null and g.status = 'posted'
                          union all
                          select c.claim_date, 0, c.amount, 0, 0 from subcontract_claims c join subcontracts s on s.id = c.subcontract_id
                            where s.project_id = ?1 and c.status <> 'draft' and s.deleted_at is null
                          union all
                          select t.work_date, 0, 0, t.wage, 0 from timesheets t where t.project_id = ?1
                          union all
                          select b.bill_date,  0,
                                 case when b.category = 'subcontract' then b.subtotal else 0 end, 0,
                                 case when b.category = 'subcontract' then 0 else b.subtotal end
                            from ap_bills b where %1$s
                        ) x group by m order by m""".formatted(DIRECT_BILL)).setParameter(1, projectId).getResultList();
        return rows.stream().map(r -> new CostMonth((String) r[0], Money.round2(SqlValues.decimal0(r[1])), Money.round2(SqlValues.decimal0(r[2])),
                Money.round2(SqlValues.decimal0(r[3])), Money.round2(SqlValues.decimal0(r[4])))).toList();
    }

    // ================================================================= BOQ vs actual

    public record UsageRow(UUID materialId, String code, String name, String unit, BigDecimal boqQty, BigDecimal usedQty,
                           BigDecimal variance, BigDecimal usedPct, BigDecimal boqCost, BigDecimal usedCost) {
    }

    @Transactional
    public List<UsageRow> materialUsage(UUID projectId) {
        requireCost();
        Project p = projects.requireVisible(projectId);
        UUID boqId = null;
        if (p.quotationId != null) {
            List<?> b = em.createNativeQuery("select boq_id from quotations where id = ?1").setParameter(1, p.quotationId).getResultList();
            boqId = b.isEmpty() ? null : SqlValues.uuid(b.get(0));
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        with boq as (
                          select material_id, sum(quantity) qty, sum(quantity * coalesce(unit_material_cost, 0)) cost from boq_items
                          where boq_id = cast(?2 as uuid) and material_id is not null group by material_id
                        ), used as (
                          select material_id, sum(q) qty, sum(v) cost from (
                            select m.material_id, -m.qty q, -m.qty * m.unit_cost v from stock_movements m
                              where m.project_id = ?1 and m.kind in ('issue', 'return')
                            union all
                            select gi.material_id, gi.quantity, gi.quantity * gi.unit_cost from goods_receipt_items gi
                              join goods_receipts g on g.id = gi.gr_id
                              where g.project_id = ?1 and g.warehouse_id is null and g.status = 'posted' and gi.material_id is not null
                          ) x group by material_id
                        )
                        select mt.id, mt.code, mt.name, mt.unit, coalesce(b.qty, 0), coalesce(u.qty, 0), coalesce(b.cost, 0), coalesce(u.cost, 0)
                        from (select material_id from boq union select material_id from used) k
                        join materials mt on mt.id = k.material_id
                        left join boq b on b.material_id = k.material_id
                        left join used u on u.material_id = k.material_id
                        order by mt.name""").setParameter(1, p.id).setParameter(2, boqId).getResultList();
        return rows.stream().map(r -> {
            BigDecimal boq = SqlValues.decimal0(r[4]);
            BigDecimal used = SqlValues.decimal0(r[5]);
            return new UsageRow(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], (String) r[3], boq, used, used.subtract(boq),
                    pct(used, boq), Money.round2(SqlValues.decimal0(r[6])), Money.round2(SqlValues.decimal0(r[7])));
        }).toList();
    }

    // ================================================================= ภาษี

    public record VatRow(LocalDate date, String docNo, String partyName, String partyTaxId, String partyBranch,
                         BigDecimal base, BigDecimal vat, String note, UUID refId) {
    }

    public record VatReport(String period, String kind, List<VatRow> rows, BigDecimal totalBase, BigDecimal totalVat) {
    }

    /** รายงานภาษีขาย: ใบกำกับภาษีทุกชนิด (ยกเลิกแสดงยอด 0) ใบลดหนี้เป็นยอดติดลบ */
    @Transactional
    public VatReport salesVat(String period) {
        requireTax();
        LocalDate[] range = range(period);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select doc_date, doc_no, customer_name, customer_tax_id, customer_branch_no,
                               case when status = 'void' then 0 when doc_type = 'credit_note' then -taxable_amount else taxable_amount end,
                               case when status = 'void' then 0 when doc_type = 'credit_note' then -vat_amount else vat_amount end,
                               case when status = 'void' then 'ยกเลิก' when doc_type = 'credit_note' then 'ใบลดหนี้' else null end, id
                        from sales_docs where doc_type in ('invoice_tax', 'tax_receipt', 'credit_note') and status <> 'draft'
                          and doc_date between ?1 and ?2 and deleted_at is null and vat_pct > 0
                        order by doc_date, doc_no""").setParameter(1, range[0]).setParameter(2, range[1]).getResultList();
        return vatReport(period, "sales", rows);
    }

    /** รายงานภาษีซื้อ: บิลที่เป็นใบกำกับภาษีเต็มรูป ตามเดือนภาษีที่เลือกใช้สิทธิ์ */
    @Transactional
    public VatReport purchaseVat(String period) {
        requireTax();
        range(period);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select bill_date, supplier_invoice_no, supplier_name, supplier_tax_id, supplier_branch_no, subtotal, vat_amount,
                               doc_no, id
                        from ap_bills where tax_invoice = true and tax_period = ?1 and status in ('approved', 'partial', 'paid')
                          and deleted_at is null and vat_amount <> 0
                        order by bill_date, supplier_invoice_no""").setParameter(1, period).getResultList();
        return vatReport(period, "purchase", rows);
    }

    private VatReport vatReport(String period, String kind, List<Object[]> rows) {
        List<VatRow> out = new ArrayList<>();
        BigDecimal base = BigDecimal.ZERO;
        BigDecimal vat = BigDecimal.ZERO;
        for (Object[] r : rows) {
            BigDecimal b = SqlValues.decimal0(r[5]);
            BigDecimal v = SqlValues.decimal0(r[6]);
            base = base.add(b);
            vat = vat.add(v);
            out.add(new VatRow(SqlValues.date(r[0]), (String) r[1], (String) r[2], (String) r[3], (String) r[4], b, v, (String) r[7],
                    SqlValues.uuid(r[8])));
        }
        return new VatReport(period, kind, out, Money.round2(base), Money.round2(vat));
    }

    public record WhtRow(UUID certificateId, String certNo, LocalDate payDate, String payeeName, String payeeTaxId,
                         String payeeAddress, String incomeType, BigDecimal rate, BigDecimal amount, BigDecimal wht) {
    }

    public record WhtReport(String period, String form, List<WhtRow> rows, BigDecimal totalAmount, BigDecimal totalWht) {
    }

    /** ภ.ง.ด.3 (บุคคลธรรมดา) / ภ.ง.ด.53 (นิติบุคคล) ตามวันที่จ่ายเงิน ยื่นภายในวันที่ 7 ของเดือนถัดไป */
    @Transactional
    public WhtReport whtReport(String period, String form) {
        requireTax();
        if (!"pnd3".equals(form) && !"pnd53".equals(form)) {
            throw ApiException.badRequest("invalid_form", "แบบต้องเป็น pnd3 หรือ pnd53");
        }
        LocalDate[] range = range(period);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select id, book_no || '/' || run_no, pay_date, payee_name, payee_tax_id, payee_address, income_type, wht_rate, amount, wht_amount
                        from wht_certificates where form = ?1 and status = 'issued' and pay_date between ?2 and ?3
                        order by pay_date, book_no, run_no""").setParameter(1, form).setParameter(2, range[0]).setParameter(3, range[1]).getResultList();
        List<WhtRow> out = new ArrayList<>();
        BigDecimal a = BigDecimal.ZERO;
        BigDecimal w = BigDecimal.ZERO;
        for (Object[] r : rows) {
            BigDecimal amt = SqlValues.decimal0(r[8]);
            BigDecimal wht = SqlValues.decimal0(r[9]);
            a = a.add(amt);
            w = w.add(wht);
            out.add(new WhtRow(SqlValues.uuid(r[0]), (String) r[1], SqlValues.date(r[2]), (String) r[3], (String) r[4], (String) r[5],
                    (String) r[6], SqlValues.decimal0(r[7]), amt, wht));
        }
        return new WhtReport(period, form, out, Money.round2(a), Money.round2(w));
    }

    // ================================================================= cash flow

    public record CashWeek(LocalDate weekStart, BigDecimal inflow, BigDecimal outflow, BigDecimal net, BigDecimal cumulative,
                           List<CashItem> items) {
    }

    public record CashItem(String direction, String kind, String label, LocalDate date, BigDecimal amount) {
    }

    public record CashFlow(LocalDate asOf, int weeks, BigDecimal overdueIn, BigDecimal overdueOut, List<CashWeek> rows) {
    }

    /**
     * ประมาณการเงินเข้า-ออกรายสัปดาห์ (สัปดาห์เริ่มวันจันทร์)
     * เข้า: ใบแจ้งหนี้ค้างรับตามวันครบกำหนด + งวดงานที่ยังไม่วางบิลตามกำหนดงวด (ยอดสุทธิโดยประมาณหลังหักประกัน/หัก ณ ที่จ่าย)
     * ออก: บิลเจ้าหนี้ค้างจ่ายตามวันครบกำหนด + PO ที่ยังไม่รับของ (กำหนดส่ง + เครดิต) + ค่าแรงค้างจ่าย (สิ้นสัปดาห์นี้)
     * รายการเกินกำหนดรวมไว้ในสัปดาห์แรก
     */
    @Transactional
    public CashFlow cashFlow(int weeks) {
        if (!currentUser.can(Perm.FINANCE_READ) || !currentUser.can(Perm.AP_READ)) {
            throw ApiException.forbidden("forbidden", "ต้องมีสิทธิ์ดูทั้งลูกหนี้และเจ้าหนี้");
        }
        int n = Math.max(4, Math.min(26, weeks));
        LocalDate today = DocNumberService.today();
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<CashItem> items = new ArrayList<>();
        @SuppressWarnings("unchecked")
        List<Object[]> ins = em.createNativeQuery("""
                        select doc_no, customer_name, coalesce(due_date, doc_date),
                               (total_amount - settled_amount) * case when total_amount > 0 then net_amount / total_amount else 1 end
                        from sales_docs where doc_type in ('invoice', 'invoice_tax') and status in ('issued', 'partial') and deleted_at is null""")
                .getResultList();
        for (Object[] r : ins) {
            items.add(new CashItem("in", "invoice", r[0] + " " + r[1], SqlValues.date(r[2]), Money.round2(SqlValues.decimal0(r[3]).max(BigDecimal.ZERO))));
        }
        @SuppressWarnings("unchecked")
        List<Object[]> ms = em.createNativeQuery("""
                        select c.doc_no || ' ' || m.name, m.due_date,
                               m.amount * (1 + case when c.vat_enabled then c.vat_pct / 100 else 0 end) - m.amount * (c.retention_pct + c.wht_pct) / 100
                        from contract_milestones m join contracts c on c.id = m.contract_id
                        where m.status in ('pending', 'ready') and m.due_date is not null and c.status = 'active' and c.deleted_at is null""")
                .getResultList();
        for (Object[] r : ms) {
            items.add(new CashItem("in", "milestone", (String) r[0], SqlValues.date(r[1]), Money.round2(SqlValues.decimal0(r[2]))));
        }
        @SuppressWarnings("unchecked")
        List<Object[]> outs = em.createNativeQuery("""
                        select doc_no, supplier_name, coalesce(due_date, bill_date), (total_amount - retention_amount - paid_amount)
                               - greatest(wht_amount - coalesce((select sum(l.wht_amount) from payment_voucher_lines l
                                   join payment_vouchers v on v.id = l.pv_id where l.bill_id = b.id and v.status = 'paid'), 0), 0)
                        from ap_bills b where status in ('approved', 'partial') and deleted_at is null""").getResultList();
        for (Object[] r : outs) {
            items.add(new CashItem("out", "bill", r[0] + " " + r[1], SqlValues.date(r[2]), Money.round2(SqlValues.decimal0(r[3]).max(BigDecimal.ZERO))));
        }
        @SuppressWarnings("unchecked")
        List<Object[]> pos = em.createNativeQuery("""
                        select o.doc_no, o.supplier_name, coalesce(o.delivery_date, o.order_date) + o.credit_days,
                               sum(greatest(i.quantity - i.received_qty, 0) * i.unit_price) * (1 + o.vat_pct / 100)
                        from purchase_orders o join purchase_order_items i on i.po_id = o.id
                        where o.status in ('approved', 'partial') and o.deleted_at is null
                        group by o.id, o.doc_no, o.supplier_name, o.delivery_date, o.order_date, o.credit_days, o.vat_pct""").getResultList();
        for (Object[] r : pos) {
            BigDecimal amt = Money.round2(SqlValues.decimal0(r[3]));
            if (amt.signum() > 0) {
                items.add(new CashItem("out", "po", r[0] + " " + r[1], SqlValues.date(r[2]), amt));
            }
        }
        BigDecimal wages = SqlValues.decimal0(em.createNativeQuery("""
                        select coalesce(sum(t.wage), 0) from timesheets t left join wage_payments w on w.id = t.wage_payment_id
                        where t.wage_payment_id is null or w.status = 'draft'""").getSingleResult());
        if (wages.signum() > 0) {
            items.add(new CashItem("out", "wage", "ค่าแรงค้างจ่าย", start.plusDays(5), Money.round2(wages)));
        }
        List<CashWeek> rows = new ArrayList<>();
        BigDecimal cum = BigDecimal.ZERO;
        BigDecimal overdueIn = BigDecimal.ZERO;
        BigDecimal overdueOut = BigDecimal.ZERO;
        for (CashItem it : items) {
            if (it.date() != null && it.date().isBefore(today)) {
                if ("in".equals(it.direction())) {
                    overdueIn = overdueIn.add(it.amount());
                } else {
                    overdueOut = overdueOut.add(it.amount());
                }
            }
        }
        for (int i = 0; i < n; i++) {
            LocalDate ws = start.plusWeeks(i);
            LocalDate we = ws.plusDays(6);
            final int idx = i;
            List<CashItem> wk = items.stream().filter(it -> {
                LocalDate d = it.date() == null ? today : it.date();
                return idx == 0 ? !d.isAfter(we) : !d.isBefore(ws) && !d.isAfter(we);
            }).sorted(java.util.Comparator.comparing(CashItem::date, java.util.Comparator.nullsFirst(java.util.Comparator.naturalOrder()))).toList();
            BigDecimal in = wk.stream().filter(x -> "in".equals(x.direction())).map(CashItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal out = wk.stream().filter(x -> "out".equals(x.direction())).map(CashItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            cum = cum.add(in).subtract(out);
            rows.add(new CashWeek(ws, Money.round2(in), Money.round2(out), Money.round2(in.subtract(out)), Money.round2(cum), wk));
        }
        return new CashFlow(today, n, Money.round2(overdueIn), Money.round2(overdueOut), rows);
    }

    // ================================================================= helpers

    private static LocalDate[] range(String period) {
        try {
            YearMonth ym = YearMonth.parse(period);
            return new LocalDate[]{ym.atDay(1), ym.atEndOfMonth()};
        } catch (Exception e) {
            throw ApiException.badRequest("invalid_period", "เดือนต้องเป็นรูปแบบ ปปปป-ดด");
        }
    }

    private static BigDecimal pct(BigDecimal part, BigDecimal whole) {
        return whole == null || whole.signum() == 0 ? null : part.multiply(Money.HUNDRED).divide(whole, 1, RoundingMode.HALF_UP);
    }

    private void requireCost() {
        if (!currentUser.canViewCost()) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูต้นทุน");
        }
    }

    private void requireTax() {
        if (!currentUser.can(Perm.TAX_REPORT)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูรายงานภาษี");
        }
    }
}
