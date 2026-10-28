package com.ktt.dashboard;

import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.SqlValues;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.ProjectDtos.ProjectRow;
import com.ktt.project.ProjectService;
import com.ktt.report.ReportService;
import com.ktt.report.ReportService.CostRow;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * แดชบอร์ดผู้บริหาร: ภาพรวมบริษัทในหน้าเดียว (ยอดขาย ต้นทุน กำไร ลูกหนี้ เจ้าหนี้ เงินสด โครงการเสี่ยง และเรื่องที่ต้องตัดสินใจ)
 * ยอดวางบิล/ต้นทุนเป็นยอดก่อน VAT; ยอดรับเงินเป็นยอดรวม VAT ตามใบเสร็จ
 */
@ApplicationScoped
public class DashboardService {

    public record Kpis(BigDecimal billedMtd, BigDecimal billedYtd, BigDecimal receivedMtd, BigDecimal receivedYtd,
                       BigDecimal costMtd, BigDecimal costYtd, BigDecimal grossMarginYtdPct, BigDecimal arOutstanding,
                       BigDecimal arOverdue, BigDecimal apOutstanding, BigDecimal apOverdue, BigDecimal backlog,
                       BigDecimal cashNext4Weeks) {
    }

    public record Month(String month, BigDecimal billed, BigDecimal received, BigDecimal cost) {
    }

    public record Stage(String status, long count, BigDecimal value) {
    }

    public record Pipeline(List<Stage> leads, long quotesOpen, BigDecimal quotesOpenValue, BigDecimal winRatePct,
                           long quotesWon, long quotesDecided) {
    }

    public record ProjectHealth(UUID id, String code, String name, String managerName, BigDecimal progressPct,
                                BigDecimal plannedPct, BigDecimal variancePct, BigDecimal budgetUsedPct, BigDecimal marginPct,
                                BigDecimal contractAmount, boolean behind, boolean overBudget) {
    }

    public record Alerts(long approvalsPending, long permitsSoon, long permitsExpired, long ticketsOpen, long ticketsUrgent,
                         long lowStock, long milestonesReady, long overdueReceivables, long overduePayables) {
    }

    public record Satisfaction(long count, BigDecimal overall, BigDecimal recommendPct) {
    }

    public record Dashboard(LocalDate asOf, Kpis kpis, List<Month> months, Pipeline pipeline, List<ProjectHealth> projects,
                            Alerts alerts, Satisfaction satisfaction) {
    }

    @Inject
    CurrentUser currentUser;

    @Inject
    ProjectService projects;

    @Inject
    ReportService reports;

    @Inject
    EntityManager em;

    @Transactional
    public Dashboard summary() {
        if (!currentUser.can(Perm.DASHBOARD_VIEW)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูแดชบอร์ดผู้บริหาร");
        }
        LocalDate today = DocNumberService.today();
        List<Month> months = months(today);
        String mtd = YearMonth.from(today).toString();
        String year = String.valueOf(today.getYear());
        BigDecimal billedMtd = BigDecimal.ZERO, billedYtd = BigDecimal.ZERO, recMtd = BigDecimal.ZERO, recYtd = BigDecimal.ZERO;
        BigDecimal costMtd = BigDecimal.ZERO, costYtd = BigDecimal.ZERO;
        for (Month m : months) {
            if (m.month().equals(mtd)) {
                billedMtd = m.billed();
                recMtd = m.received();
                costMtd = m.cost();
            }
            if (m.month().startsWith(year)) {
                billedYtd = billedYtd.add(m.billed());
                recYtd = recYtd.add(m.received());
                costYtd = costYtd.add(m.cost());
            }
        }
        Object[] ar = (Object[]) em.createNativeQuery("""
                select coalesce(sum(x.v), 0), coalesce(sum(x.v) filter (where x.due < ?1), 0), count(*) filter (where x.due < ?1) from (
                  select (total_amount - settled_amount) * case when total_amount > 0 then net_amount / total_amount else 1 end v, due_date due
                  from sales_docs where doc_type in ('invoice', 'invoice_tax') and status in ('issued', 'partial') and deleted_at is null) x""")
                .setParameter(1, today).getSingleResult();
        Object[] ap = (Object[]) em.createNativeQuery("""
                select coalesce(sum(total_amount - retention_amount - paid_amount), 0),
                       coalesce(sum(total_amount - retention_amount - paid_amount) filter (where due_date < ?1), 0),
                       count(*) filter (where due_date < ?1)
                from ap_bills where status in ('approved', 'partial') and deleted_at is null""").setParameter(1, today).getSingleResult();
        BigDecimal backlog = SqlValues.decimal0(em.createNativeQuery("""
                select coalesce(sum(greatest(r.amount - r.billed, 0)), 0) from (
                  select c.amount + coalesce((select sum(v.amount) from change_orders v where v.contract_id = c.id and v.status = 'approved' and v.deleted_at is null), 0) amount,
                         coalesce((select sum(case when d.doc_type = 'credit_note' then -d.taxable_amount else d.subtotal - d.discount_amount end)
                                   from sales_docs d where d.contract_id = c.id and d.kind <> 'advance' and d.status not in ('draft', 'void')
                                   and d.doc_type in ('invoice', 'invoice_tax', 'credit_note') and d.deleted_at is null), 0) billed
                  from contracts c where c.status = 'active' and c.deleted_at is null) r""").getSingleResult());
        BigDecimal cash4 = null;
        if (currentUser.can(Perm.FINANCE_READ) && currentUser.can(Perm.AP_READ)) {
            var cf = reports.cashFlow(4);
            cash4 = cf.rows().isEmpty() ? BigDecimal.ZERO : cf.rows().get(cf.rows().size() - 1).cumulative();
        }
        Kpis kpis = new Kpis(billedMtd, Money.round2(billedYtd), recMtd, Money.round2(recYtd), costMtd, Money.round2(costYtd),
                pct(billedYtd.subtract(costYtd), billedYtd), Money.round2(SqlValues.decimal0(ar[0])), Money.round2(SqlValues.decimal0(ar[1])),
                Money.round2(SqlValues.decimal0(ap[0])), Money.round2(SqlValues.decimal0(ap[1])), Money.round2(backlog), cash4);
        return new Dashboard(today, kpis, months, pipeline(today), health(), alerts(today, SqlValues.count(ar[2]), SqlValues.count(ap[2])),
                satisfaction(today));
    }

    @SuppressWarnings("unchecked")
    private List<Month> months(LocalDate today) {
        LocalDate from = today.withDayOfMonth(1).minusMonths(11);
        Map<String, BigDecimal[]> m = new LinkedHashMap<>();
        for (int i = 0; i < 12; i++) {
            m.put(YearMonth.from(from.plusMonths(i)).toString(), new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
        }
        List<Object[]> billed = em.createNativeQuery("""
                select to_char(doc_date, 'YYYY-MM'), sum(case when doc_type = 'credit_note' then -taxable_amount else subtotal - discount_amount end)
                from sales_docs where doc_type in ('invoice', 'invoice_tax', 'credit_note') and kind <> 'advance'
                and status not in ('draft', 'void') and deleted_at is null and doc_date >= ?1 group by 1""").setParameter(1, from).getResultList();
        billed.forEach(r -> add(m, (String) r[0], 0, r[1]));
        List<Object[]> rec = em.createNativeQuery("""
                select to_char(coalesce(paid_date, doc_date), 'YYYY-MM'), sum(total_amount)
                from sales_docs where doc_type in ('receipt', 'tax_receipt') and status not in ('draft', 'void') and deleted_at is null
                and coalesce(paid_date, doc_date) >= ?1 group by 1""").setParameter(1, from).getResultList();
        rec.forEach(r -> add(m, (String) r[0], 1, r[1]));
        List<Object[]> cost = em.createNativeQuery("""
                select to_char(d, 'YYYY-MM'), sum(v) from (
                  select m.movement_date d, -m.qty * m.unit_cost v from stock_movements m where m.project_id is not null and m.kind in ('issue', 'return')
                  union all
                  select g.receive_date, gi.quantity * gi.unit_cost from goods_receipt_items gi join goods_receipts g on g.id = gi.gr_id
                    where g.project_id is not null and g.warehouse_id is null and g.status = 'posted'
                  union all
                  select c.claim_date, c.amount from subcontract_claims c join subcontracts s on s.id = c.subcontract_id
                    where c.status <> 'draft' and s.deleted_at is null
                  union all
                  select t.work_date, t.wage from timesheets t
                  union all
                  select b.bill_date, b.subtotal from ap_bills b where b.project_id is not null and b.po_id is null
                    and b.subcontract_claim_id is null and b.subcontract_id is null
                    and b.status in ('approved', 'partial', 'paid') and b.deleted_at is null
                ) x where d >= ?1 group by 1""").setParameter(1, from).getResultList();
        cost.forEach(r -> add(m, (String) r[0], 2, r[1]));
        List<Month> out = new ArrayList<>();
        m.forEach((k, v) -> out.add(new Month(k, Money.round2(v[0]), Money.round2(v[1]), Money.round2(v[2]))));
        return out;
    }

    private static void add(Map<String, BigDecimal[]> m, String key, int idx, Object v) {
        BigDecimal[] a = m.get(key);
        if (a != null) {
            a[idx] = a[idx].add(SqlValues.decimal0(v));
        }
    }

    @SuppressWarnings("unchecked")
    private Pipeline pipeline(LocalDate today) {
        List<Object[]> rows = em.createNativeQuery("""
                select status, count(*), coalesce(sum(budget_est), 0) from leads where deleted_at is null
                and status not in ('won', 'lost') group by status""").getResultList();
        Map<String, Stage> byStatus = new HashMap<>();
        rows.forEach(r -> byStatus.put((String) r[0], new Stage((String) r[0], SqlValues.count(r[1]), Money.round2(SqlValues.decimal0(r[2])))));
        List<Stage> stages = new ArrayList<>();
        for (String s : List.of("new", "site_visit", "estimating", "quoted", "negotiating")) {
            stages.add(byStatus.getOrDefault(s, new Stage(s, 0, BigDecimal.ZERO)));
        }
        byStatus.keySet().stream().filter(s -> stages.stream().noneMatch(x -> x.status().equals(s))).forEach(s -> stages.add(byStatus.get(s)));
        Object[] q = (Object[]) em.createNativeQuery("""
                select count(*) filter (where status in ('sent', 'viewed')),
                       coalesce(sum(total_amount) filter (where status in ('sent', 'viewed')), 0),
                       count(*) filter (where status = 'accepted' and updated_at >= ?1),
                       count(*) filter (where status in ('accepted', 'rejected', 'expired') and updated_at >= ?1)
                from quotations where deleted_at is null and status <> 'superseded'""")
                .setParameter(1, today.minusMonths(12).atStartOfDay(DocNumberService.BANGKOK).toInstant()).getSingleResult();
        long won = SqlValues.count(q[2]);
        long decided = SqlValues.count(q[3]);
        return new Pipeline(stages, SqlValues.count(q[0]), Money.round2(SqlValues.decimal0(q[1])),
                decided == 0 ? null : BigDecimal.valueOf(won * 100).divide(BigDecimal.valueOf(decided), 1, RoundingMode.HALF_UP), won, decided);
    }

    private List<ProjectHealth> health() {
        List<ProjectRow> rows = projects.list(null, "active", null, 0, 200).items();
        Map<UUID, CostRow> cost = new HashMap<>();
        if (currentUser.can(Perm.COST_VIEW)) {
            reports.costSummary().forEach(c -> cost.put(c.projectId(), c));
        }
        List<ProjectHealth> out = new ArrayList<>();
        for (ProjectRow r : rows) {
            CostRow c = cost.get(r.id());
            BigDecimal prog = r.progressPct() == null ? BigDecimal.ZERO : r.progressPct();
            BigDecimal plan = r.plannedPct() == null ? BigDecimal.ZERO : r.plannedPct();
            BigDecimal variance = prog.subtract(plan);
            BigDecimal used = c == null ? null : c.budgetUsedPct();
            boolean behind = variance.compareTo(BigDecimal.valueOf(-5)) < 0;
            boolean over = used != null && used.compareTo(prog.add(BigDecimal.TEN)) > 0;
            out.add(new ProjectHealth(r.id(), r.code(), r.name(), r.managerName(), prog, plan, variance, used,
                    c == null ? null : c.marginPct(), r.contractAmount(), behind, over));
        }
        out.sort((a, b) -> Boolean.compare(b.behind() || b.overBudget(), a.behind() || a.overBudget()) != 0
                ? Boolean.compare(b.behind() || b.overBudget(), a.behind() || a.overBudget())
                : a.variancePct().compareTo(b.variancePct()));
        return out;
    }

    private Alerts alerts(LocalDate today, long arOver, long apOver) {
        Object[] r = (Object[]) em.createNativeQuery("""
                select
                  (select count(*) from quotations where status = 'pending_approval' and deleted_at is null)
                  + (select count(*) from change_orders where status = 'pending_approval' and deleted_at is null)
                  + (select count(*) from purchase_requests where status = 'submitted' and deleted_at is null)
                  + (select count(*) from purchase_orders where status = 'pending_approval' and deleted_at is null)
                  + (select count(*) from ap_bills where status = 'draft' and deleted_at is null)
                  + (select count(*) from payment_vouchers where status = 'draft' and deleted_at is null),
                  (select count(*) from permits where deleted_at is null and status in ('active', 'renewing') and expiry_date >= ?1 and expiry_date <= cast(?1 as date) + notify_days),
                  (select count(*) from permits where deleted_at is null and status in ('active', 'renewing') and expiry_date < ?1),
                  (select count(*) from service_tickets where deleted_at is null and status in ('open', 'scheduled', 'in_progress')),
                  (select count(*) from service_tickets where deleted_at is null and status in ('open', 'scheduled', 'in_progress') and priority = 'urgent'),
                  (select count(*) from stock_levels l join warehouses w on w.id = l.warehouse_id where l.min_qty > 0 and w.active and w.deleted_at is null
                     and coalesce((select sum(s.qty) from stock_movements s where s.material_id = l.material_id and s.warehouse_id = l.warehouse_id), 0) < l.min_qty),
                  (select count(*) from contract_milestones m join contracts c on c.id = m.contract_id where m.status = 'ready' and c.deleted_at is null)
                """).setParameter(1, today).getSingleResult();
        return new Alerts(SqlValues.count(r[0]), SqlValues.count(r[1]), SqlValues.count(r[2]), SqlValues.count(r[3]),
                SqlValues.count(r[4]), SqlValues.count(r[5]), SqlValues.count(r[6]), arOver, apOver);
    }

    private Satisfaction satisfaction(LocalDate today) {
        Object[] r = (Object[]) em.createNativeQuery("""
                select count(*), round(avg(overall)::numeric, 2),
                       round(100.0 * count(*) filter (where recommend) / nullif(count(recommend), 0), 1)
                from satisfaction_surveys where deleted_at is null and survey_date >= ?1""")
                .setParameter(1, today.minusMonths(12)).getSingleResult();
        return new Satisfaction(SqlValues.count(r[0]), SqlValues.decimal(r[1]), SqlValues.decimal(r[2]));
    }

    private static BigDecimal pct(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0) {
            return null;
        }
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 1, RoundingMode.HALF_UP);
    }
}
