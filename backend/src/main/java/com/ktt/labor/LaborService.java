package com.ktt.labor;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.labor.LaborDtos.Entry;
import com.ktt.labor.LaborDtos.EntryDto;
import com.ktt.labor.LaborDtos.TimesheetDto;
import com.ktt.labor.LaborDtos.WageLine;
import com.ktt.labor.LaborDtos.WagePaymentDto;
import com.ktt.labor.LaborDtos.WorkerDto;
import com.ktt.labor.LaborDtos.WorkerRequest;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.purchase.Supplier;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * แรงงานรายวัน: บันทึกวันทำงานต่อโครงการ (ค่าแรงคิด ณ อัตราขณะบันทึก) → ทำจ่ายค่าแรงตามงวด
 * ค่าแรง = วันทำงาน × ค่าแรงรายวัน + ชั่วโมง OT × อัตรา OT ; เป็นต้นทุนโครงการทันทีที่บันทึก
 */
@ApplicationScoped
public class LaborService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    ProjectService projects;

    @Inject
    EntityManager em;

    // ================================================================= workers

    @Transactional
    public List<WorkerDto> workers(boolean activeOnly) {
        requireRead();
        return Worker.<Worker>list(activeOnly ? "active = true order by name" : "order by active desc, name").stream().map(this::toDto).toList();
    }

    @Transactional
    public WorkerDto saveWorker(UUID id, WorkerRequest req) {
        requireWrite();
        Worker w = id == null ? new Worker() : Worker.findById(id);
        if (w == null) {
            throw ApiException.notFound("ไม่พบแรงงาน");
        }
        w.name = req.name().trim();
        w.nickname = UserNames.blankToNull(req.nickname());
        w.trade = UserNames.blankToNull(req.trade());
        w.dailyWage = Money.round2(req.dailyWage());
        w.otRate = Money.round2(req.otRate());
        w.phone = UserNames.blankToNull(req.phone());
        w.idCard = UserNames.blankToNull(req.idCard());
        w.supplierId = req.supplierId();
        w.active = req.active();
        if (w.id == null) {
            w.createdBy = currentUser.id();
            w.persist();
        }
        audit.log("worker", w.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("name", w.name, "dailyWage", w.dailyWage));
        return toDto(w);
    }

    // ================================================================= timesheet

    @Transactional
    public TimesheetDto timesheet(UUID projectId, LocalDate from, LocalDate to) {
        requireRead();
        projects.requireVisible(projectId);
        checkRange(from, to);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select worker_id, work_date, days, ot_hours, wage, note, wage_payment_id from timesheets
                        where project_id = ?1 and work_date between ?2 and ?3 order by work_date""")
                .setParameter(1, projectId).setParameter(2, from).setParameter(3, to).getResultList();
        List<EntryDto> entries = new ArrayList<>();
        Set<UUID> ids = new HashSet<>();
        BigDecimal wage = BigDecimal.ZERO;
        BigDecimal days = BigDecimal.ZERO;
        for (Object[] r : rows) {
            UUID wid = SqlValues.uuid(r[0]);
            ids.add(wid);
            BigDecimal w = SqlValues.decimal0(r[4]);
            BigDecimal d = SqlValues.decimal0(r[2]);
            wage = wage.add(w);
            days = days.add(d);
            entries.add(new EntryDto(wid, SqlValues.date(r[1]), d, SqlValues.decimal0(r[3]), w, (String) r[5], r[6] != null));
        }
        List<WorkerDto> workers = new ArrayList<>();
        for (Worker w : Worker.<Worker>list("order by name")) {
            if (w.active || ids.contains(w.id)) {
                workers.add(toDto(w));
            }
        }
        return new TimesheetDto(projectId, from, to, workers, entries, Money.round2(wage), days);
    }

    @Transactional
    public TimesheetDto saveTimesheet(UUID projectId, List<Entry> entries) {
        requireWrite();
        Project p = projects.requireVisible(projectId);
        LocalDate min = null;
        LocalDate max = null;
        for (Entry e : entries) {
            if (e.workDate().isAfter(DocNumberService.today())) {
                throw ApiException.badRequest("future_date", "บันทึกวันทำงานล่วงหน้าไม่ได้");
            }
            Worker w = Worker.findById(e.workerId());
            if (w == null) {
                throw ApiException.badRequest("invalid_worker", "ไม่พบแรงงาน");
            }
            Object[] existing = existing(w.id, e.workDate(), p.id);
            if (existing != null && existing[1] != null) {
                throw ApiException.conflict("locked", w.name + " วันที่ " + e.workDate() + " ทำจ่ายค่าแรงไปแล้ว แก้ไขไม่ได้");
            }
            if (e.days().signum() == 0 && e.otHours().signum() == 0) {
                em.createNativeQuery("delete from timesheets where worker_id = ?1 and work_date = ?2 and project_id = ?3")
                        .setParameter(1, w.id).setParameter(2, e.workDate()).setParameter(3, p.id).executeUpdate();
            } else {
                if (e.days().signum() == 0) {
                    throw ApiException.badRequest("ot_without_day", "บันทึก OT ต้องมีวันทำงาน");
                }
                BigDecimal wage = Money.round2(e.days().multiply(w.dailyWage).add(e.otHours().multiply(w.otRate)));
                em.createNativeQuery("""
                                insert into timesheets (work_date, project_id, worker_id, days, ot_hours, wage, note, created_by)
                                values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                                on conflict (worker_id, work_date, project_id)
                                do update set days = excluded.days, ot_hours = excluded.ot_hours, wage = excluded.wage, note = excluded.note
                                """).setParameter(1, e.workDate()).setParameter(2, p.id).setParameter(3, w.id)
                        .setParameter(4, e.days()).setParameter(5, e.otHours()).setParameter(6, wage)
                        .setParameter(7, UserNames.blankToNull(e.note())).setParameter(8, currentUser.id()).executeUpdate();
            }
            min = min == null || e.workDate().isBefore(min) ? e.workDate() : min;
            max = max == null || e.workDate().isAfter(max) ? e.workDate() : max;
        }
        // คนเดียวกันทำงานรวมทุกโครงการในวันเดียวกันต้องไม่เกิน 1.5 วัน
        Number over = (Number) em.createNativeQuery("""
                        select count(*) from (select worker_id, work_date from timesheets group by worker_id, work_date having sum(days) > 1.5) x
                        """).getSingleResult();
        if (over.longValue() > 0) {
            throw ApiException.badRequest("too_many_days", "แรงงานบางคนมีวันทำงานรวมทุกโครงการเกิน 1.5 วันในวันเดียว");
        }
        audit.log("project", p.id, AuditService.ACTION_UPDATE, null, Map.of("timesheet", entries.size() + " entries"));
        LocalDate from = min == null ? DocNumberService.today().minusDays(6) : min;
        LocalDate to = max == null ? DocNumberService.today() : max;
        if (ChronoUnit.DAYS.between(from, to) > 62) {
            from = to.minusDays(62);
        }
        return timesheet(p.id, from, to);
    }

    private Object[] existing(UUID workerId, LocalDate date, UUID projectId) {
        @SuppressWarnings("unchecked")
        List<Object[]> r = em.createNativeQuery("select id, wage_payment_id from timesheets where worker_id = ?1 and work_date = ?2 and project_id = ?3")
                .setParameter(1, workerId).setParameter(2, date).setParameter(3, projectId).getResultList();
        return r.isEmpty() ? null : r.get(0);
    }

    // ================================================================= wage payments

    @Transactional
    public List<WageLine> preview(LocalDate from, LocalDate to, UUID projectId) {
        requireRead();
        checkRange(from, to);
        if (projectId != null) {
            projects.requireVisible(projectId);
        }
        return lines(null, from, to, projectId);
    }

    @Transactional
    public List<WagePaymentDto> payments() {
        requireRead();
        @SuppressWarnings("unchecked")
        List<Object> ids = em.createNativeQuery("select id from wage_payments order by period_to desc, created_at desc limit 200").getResultList();
        return ids.stream().map(i -> toDto(SqlValues.uuid(i))).toList();
    }

    @Transactional
    public WagePaymentDto createPayment(LocalDate from, LocalDate to, UUID projectId, String notes) {
        requireWrite();
        checkRange(from, to);
        if (projectId != null) {
            projects.requireVisible(projectId);
        }
        List<WageLine> lines = lines(null, from, to, projectId);
        if (lines.isEmpty()) {
            throw ApiException.badRequest("nothing_to_pay", "ไม่มีค่าแรงค้างจ่ายในช่วงนี้");
        }
        BigDecimal total = lines.stream().map(WageLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        String docNo = docNumbers.next(projects.prefix("wage_payment", "WG"), to);
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                        insert into wage_payments (id, doc_no, period_from, period_to, project_id, total, notes, created_by)
                        values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)""")
                .setParameter(1, id).setParameter(2, docNo).setParameter(3, from).setParameter(4, to).setParameter(5, projectId)
                .setParameter(6, Money.round2(total)).setParameter(7, UserNames.blankToNull(notes)).setParameter(8, currentUser.id())
                .executeUpdate();
        List<UUID> visible = projectId == null ? visibleScope() : null;
        var upd = em.createNativeQuery("""
                        update timesheets set wage_payment_id = ?1 where wage_payment_id is null and work_date between ?2 and ?3
                        and (cast(?4 as uuid) is null or project_id = ?4)""" + (visible == null ? "" : " and project_id in (?5)"))
                .setParameter(1, id).setParameter(2, from).setParameter(3, to).setParameter(4, projectId);
        if (visible != null) {
            upd.setParameter(5, visible);
        }
        upd.executeUpdate();
        audit.log("wage_payment", id, AuditService.ACTION_CREATE, null, Map.of("docNo", docNo, "total", total));
        return toDto(id);
    }

    @Transactional
    public WagePaymentDto pay(UUID id, LocalDate paidDate) {
        requireWrite();
        int n = em.createNativeQuery("update wage_payments set status = 'paid', paid_date = ?2 where id = ?1 and status = 'draft'")
                .setParameter(1, id).setParameter(2, paidDate).executeUpdate();
        if (n == 0) {
            throw ApiException.conflict("invalid_status", "จ่ายได้เฉพาะรายการที่ยังไม่จ่าย");
        }
        audit.log("wage_payment", id, AuditService.ACTION_UPDATE, null, Map.of("status", "paid"));
        return toDto(id);
    }

    @Transactional
    public WagePaymentDto voidPayment(UUID id) {
        requireWrite();
        int n = em.createNativeQuery("update wage_payments set status = 'void' where id = ?1 and status <> 'void'").setParameter(1, id).executeUpdate();
        if (n == 0) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        em.createNativeQuery("update timesheets set wage_payment_id = null where wage_payment_id = ?1").setParameter(1, id).executeUpdate();
        audit.log("wage_payment", id, AuditService.ACTION_DELETE, null, Map.of("status", "void"));
        return toDto(id);
    }

    // ================================================================= internals

    private List<WageLine> lines(UUID paymentId, LocalDate from, LocalDate to, UUID projectId) {
        String where = paymentId != null ? "t.wage_payment_id = :pay"
                : "t.wage_payment_id is null and t.work_date between :from and :to" + (projectId == null ? "" : " and t.project_id = :project");
        // ไม่ระบุโครงการ: จำกัดเฉพาะโครงการที่ผู้ใช้เห็น (ยกเว้นมีสิทธิ์ดูทุกโครงการ)
        List<UUID> visible = paymentId == null && projectId == null ? visibleScope() : null;
        if (visible != null) {
            where += " and t.project_id in (:visible)";
        }
        var q = em.createNativeQuery("""
                        select w.id, w.name, w.trade, sum(t.days), sum(t.ot_hours), sum(t.wage) from timesheets t join workers w on w.id = t.worker_id
                        where """ + " " + where + " group by w.id, w.name, w.trade order by w.name");
        if (paymentId != null) {
            q.setParameter("pay", paymentId);
        } else {
            q.setParameter("from", from).setParameter("to", to);
            if (projectId != null) {
                q.setParameter("project", projectId);
            }
            if (visible != null) {
                q.setParameter("visible", visible);
            }
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(r -> new WageLine(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], SqlValues.decimal0(r[3]),
                SqlValues.decimal0(r[4]), Money.round2(SqlValues.decimal0(r[5])))).toList();
    }

    private WagePaymentDto toDto(UUID id) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select w.id, w.doc_no, w.period_from, w.period_to, w.project_id, p.code, w.total, w.paid_date, w.status, w.notes, u.name
                        from wage_payments w left join projects p on p.id = w.project_id left join users u on u.id = w.created_by where w.id = ?1""")
                .setParameter(1, id).getResultList();
        if (rows.isEmpty()) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        Object[] r = rows.get(0);
        return new WagePaymentDto(SqlValues.uuid(r[0]), (String) r[1], SqlValues.date(r[2]), SqlValues.date(r[3]), SqlValues.uuid(r[4]),
                (String) r[5], SqlValues.decimal0(r[6]), SqlValues.date(r[7]), (String) r[8], (String) r[9],
                lines(id, null, null, null), (String) r[10]);
    }

    /** null = เห็นทุกโครงการ ; ไม่งั้นคืน id โครงการที่ผู้ใช้เห็น */
    private List<UUID> visibleScope() {
        return currentUser.can(Perm.PROJECT_READ_ALL) ? null : projects.visibleProjectIds();
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw ApiException.badRequest("invalid_range", "ช่วงวันที่ไม่ถูกต้อง");
        }
        if (ChronoUnit.DAYS.between(from, to) > 92) {
            throw ApiException.badRequest("range_too_long", "เลือกช่วงได้ไม่เกิน 3 เดือน");
        }
    }

    private WorkerDto toDto(Worker w) {
        Supplier s = w.supplierId == null ? null : Supplier.findById(w.supplierId);
        return new WorkerDto(w.id, w.name, w.nickname, w.trade, w.dailyWage, w.otRate, w.phone,
                currentUser.can(Perm.LABOR_WRITE) ? w.idCard : null, w.supplierId, s == null ? null : s.name, w.active);
    }

    private void requireRead() {
        if (!currentUser.can(Perm.LABOR_READ) && !currentUser.can(Perm.LABOR_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูข้อมูลแรงงาน");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.LABOR_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์บันทึกข้อมูลแรงงาน");
        }
    }
}
