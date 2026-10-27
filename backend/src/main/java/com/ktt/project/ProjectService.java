package com.ktt.project;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.customer.Customer;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.ProjectDtos.CategoryProgress;
import com.ktt.project.ProjectDtos.ContractSummary;
import com.ktt.project.ProjectDtos.Counters;
import com.ktt.project.ProjectDtos.CurvePoint;
import com.ktt.project.ProjectDtos.Member;
import com.ktt.project.ProjectDtos.MemberInput;
import com.ktt.project.ProjectDtos.ProjectDto;
import com.ktt.project.ProjectDtos.ProjectRow;
import com.ktt.project.ProjectDtos.SaveRequest;
import com.ktt.project.ProjectDtos.ScheduleDto;
import com.ktt.project.ProjectDtos.TaskDto;
import com.ktt.project.ProjectDtos.TaskInput;
import com.ktt.quotation.Quotation;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * โครงการ ทีมงาน และแผนงาน (Gantt) พร้อมความคืบหน้าแผน/จริง
 * <p>
 * สิทธิ์เห็นโครงการ: project.read_all เห็นทุกโครงการ, project.read เห็นเฉพาะโครงการที่ตนเป็น PM / โฟร์แมน /
 * สมาชิก หรือผู้สร้าง (โครงการอื่นตอบ 404 เหมือนไม่มีอยู่)
 */
@ApplicationScoped
public class ProjectService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    DocNumberService docNumbers;

    @Inject
    AppSettings settings;

    @Inject
    EntityManager em;

    // ================================================================= access

    public boolean canSee(Project p) {
        if (currentUser.can(Perm.PROJECT_READ_ALL)) {
            return true;
        }
        if (!currentUser.can(Perm.PROJECT_READ)) {
            return false;
        }
        UUID me = currentUser.id();
        if (me == null) {
            return false;
        }
        if (me.equals(p.managerId) || me.equals(p.foremanId) || me.equals(p.createdBy)) {
            return true;
        }
        Number n = (Number) em.createNativeQuery("select count(*) from project_members where project_id = ?1 and user_id = ?2")
                .setParameter(1, p.id).setParameter(2, me).getSingleResult();
        return n.longValue() > 0;
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public Project requireVisible(UUID id) {
        Project p = id == null ? null : Project.findById(id);
        if (p == null || !canSee(p)) {
            throw ApiException.notFound("ไม่พบโครงการ");
        }
        return p;
    }

    /** ต้องเห็นโครงการ และมีสิทธิ์ site.report (หรือ project.write) จึงบันทึกข้อมูลหน้างานได้ */
    @Transactional(Transactional.TxType.MANDATORY)
    public Project requireReportable(UUID id) {
        Project p = requireVisible(id);
        if (!currentUser.can(Perm.SITE_REPORT) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์บันทึกข้อมูลหน้างาน");
        }
        if (Set.of("completed", "cancelled").contains(p.status) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.conflict("project_closed", "โครงการปิดแล้ว");
        }
        return p;
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public Project requireWritable(UUID id) {
        if (!currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขโครงการ");
        }
        return requireVisible(id);
    }

    /** เงื่อนไข HQL จำกัดโครงการที่ผู้ใช้เห็น: field คือชื่อฟิลด์ id ของโครงการในคิวรี เช่น "id" หรือ "projectId" */
    public void scope(StringBuilder w, Parameters params, String field) {
        if (currentUser.can(Perm.PROJECT_READ_ALL)) {
            return;
        }
        w.append(" and ").append(field).append(" in :visibleProjects");
        params.and("visibleProjects", visibleProjectIds());
    }

    /** id โครงการที่ผู้ใช้ (ที่ไม่มี project.read_all) เห็น; คืนรายการที่มี UUID ศูนย์ถ้าไม่มี เพื่อให้ IN () ใช้ได้ */
    @SuppressWarnings("unchecked")
    public List<UUID> visibleProjectIds() {
        UUID me = currentUser.id();
        List<UUID> out = new ArrayList<>();
        if (me != null && currentUser.can(Perm.PROJECT_READ)) {
            List<Object> rows = em.createNativeQuery("""
                            select id from projects where deleted_at is null and (manager_id = ?1 or foreman_id = ?1 or created_by = ?1)
                            union select project_id from project_members where user_id = ?1
                            """).setParameter(1, me).getResultList();
            rows.forEach(r -> out.add(SqlValues.uuid(r)));
        }
        if (out.isEmpty()) {
            out.add(new UUID(0, 0));
        }
        return out;
    }

    // ================================================================= query

    @Transactional
    public PageResult<ProjectRow> list(String q, String status, UUID customerId, int page, int size) {
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        scope(w, p, "id");
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(code) like :q or customerId in (select c.id from Customer c where lower(c.name) like :q))");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (status != null && !status.isBlank()) {
            if ("open".equals(status)) {
                w.append(" and status in ('planning', 'active', 'on_hold')");
            } else {
                w.append(" and status = :status");
                p.and("status", status);
            }
        }
        if (customerId != null) {
            w.append(" and customerId = :customer");
            p.and("customer", customerId);
        }
        PanacheQuery<Project> query = Project.find(w.toString(), Sort.descending("createdAt"), p);
        long total = query.count();
        List<Project> list = query.page(Page.of(page, size)).list();
        Map<UUID, String> users = UserNames.of(list.stream().map(x -> x.managerId).toList());
        Map<UUID, String> customers = customerNames(list.stream().map(x -> x.customerId).toList());
        Map<UUID, BigDecimal> contracts = contractAmounts(list.stream().map(x -> x.id).toList());
        LocalDate today = DocNumberService.today();
        List<ProjectRow> rows = new ArrayList<>();
        for (Project x : list) {
            BigDecimal planned = ScheduleCalculator.planned(calcTasks(ProjectTask.listFor(x.id)), today);
            rows.add(new ProjectRow(x.id, x.code, x.name, x.customerId, customers.get(x.customerId), x.status,
                    x.plannedStart, x.plannedEnd, x.progressPct, planned, users.get(x.managerId), contracts.get(x.id),
                    x.updatedAt));
        }
        return new PageResult<>(rows, total, page, size);
    }

    @Transactional
    public ProjectDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    // ================================================================= create / update

    @Transactional
    public ProjectDto create(SaveRequest req) {
        if (!currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์สร้างโครงการ");
        }
        Project p = new Project();
        p.code = docNumbers.next(prefix("project", "PJ"), DocNumberService.today());
        p.createdBy = currentUser.id();
        apply(p, req);
        p.persist();
        saveMembers(p, req.members());
        audit.log("project", p.id, AuditService.ACTION_CREATE, null, Map.of("code", p.code, "name", p.name));
        return toDto(p);
    }

    /** ใช้ตอนแปลงใบเสนอราคาเป็นสัญญา (ContractService) */
    @Transactional(Transactional.TxType.MANDATORY)
    public Project createFromQuotation(Quotation q, String name, String siteAddress, BigDecimal budgetCost) {
        Project p = new Project();
        p.code = docNumbers.next(prefix("project", "PJ"), DocNumberService.today());
        p.name = name;
        p.customerId = q.customerId;
        p.leadId = q.leadId;
        p.quotationId = q.id;
        p.siteAddress = siteAddress;
        p.status = "planning";
        p.managerId = currentUser.id();
        p.budgetCost = budgetCost;
        p.createdBy = currentUser.id();
        if (q.durationDays != null && q.durationDays > 0) {
            p.plannedStart = DocNumberService.today();
            p.plannedEnd = p.plannedStart.plusDays(q.durationDays - 1L);
        }
        p.persist();
        audit.log("project", p.id, AuditService.ACTION_CREATE, null,
                Map.of("code", p.code, "name", p.name, "fromQuotation", q.displayNo()));
        return p;
    }

    @Transactional
    public ProjectDto update(UUID id, SaveRequest req) {
        Project p = requireWritable(id);
        Map<String, Object> before = auditView(p);
        apply(p, req);
        saveMembers(p, req.members());
        var d = audit.diff(before, auditView(p));
        audit.log("project", p.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toDto(p);
    }

    @Transactional
    public void delete(UUID id) {
        Project p = requireWritable(id);
        Number docs = (Number) em.createNativeQuery("""
                        select (select count(*) from contracts where project_id = ?1 and deleted_at is null)
                             + (select count(*) from sales_docs where project_id = ?1 and deleted_at is null)
                             + (select count(*) from daily_reports where project_id = ?1 and deleted_at is null)
                        """).setParameter(1, p.id).getSingleResult();
        if (docs.longValue() > 0) {
            throw ApiException.conflict("in_use", "โครงการมีสัญญา เอกสารการเงิน หรือรายงานหน้างานแล้ว ให้เปลี่ยนสถานะเป็นยกเลิกแทน");
        }
        p.softDelete();
        audit.log("project", p.id, AuditService.ACTION_DELETE, Map.of("code", p.code, "name", p.name), null);
    }

    private void apply(Project p, SaveRequest req) {
        if (req.plannedStart() != null && req.plannedEnd() != null && req.plannedEnd().isBefore(req.plannedStart())) {
            throw ApiException.badRequest("invalid_dates", "วันสิ้นสุดตามแผนต้องไม่ก่อนวันเริ่ม");
        }
        if (req.actualStart() != null && req.actualEnd() != null && req.actualEnd().isBefore(req.actualStart())) {
            throw ApiException.badRequest("invalid_dates", "วันแล้วเสร็จจริงต้องไม่ก่อนวันเริ่มจริง");
        }
        Customer c = Customer.findById(req.customerId());
        if (c == null) {
            throw ApiException.badRequest("invalid_customer", "ไม่พบลูกค้า");
        }
        requireActiveUser(req.managerId());
        requireActiveUser(req.foremanId());
        p.name = req.name().trim();
        p.customerId = c.id;
        p.siteAddress = UserNames.blankToNull(req.siteAddress());
        p.status = req.status() == null ? (p.status == null ? "planning" : p.status) : req.status();
        p.plannedStart = req.plannedStart();
        p.plannedEnd = req.plannedEnd();
        p.actualStart = req.actualStart();
        p.actualEnd = req.actualEnd();
        p.managerId = req.managerId();
        p.foremanId = req.foremanId();
        if (currentUser.canViewCost()) {
            p.budgetCost = req.budgetCost();
        }
        p.notes = UserNames.blankToNull(req.notes());
        if ("active".equals(p.status) && p.actualStart == null) {
            p.actualStart = DocNumberService.today();
        }
        if ("completed".equals(p.status) && p.actualEnd == null) {
            p.actualEnd = DocNumberService.today();
        }
    }

    private void saveMembers(Project p, List<MemberInput> members) {
        if (members == null) {
            return;
        }
        em.createNativeQuery("delete from project_members where project_id = ?1").setParameter(1, p.id).executeUpdate();
        Set<UUID> seen = new HashSet<>();
        for (MemberInput m : members) {
            if (!seen.add(m.userId())) {
                continue;
            }
            requireActiveUser(m.userId());
            em.createNativeQuery("insert into project_members (project_id, user_id, role_label) values (?1, ?2, ?3)")
                    .setParameter(1, p.id).setParameter(2, m.userId()).setParameter(3, UserNames.blankToNull(m.roleLabel()))
                    .executeUpdate();
        }
    }

    private void requireActiveUser(UUID id) {
        if (id == null) {
            return;
        }
        Number n = (Number) em.createNativeQuery("select count(*) from users where id = ?1 and is_active = true and deleted_at is null")
                .setParameter(1, id).getSingleResult();
        if (n.longValue() == 0) {
            throw ApiException.badRequest("invalid_user", "ไม่พบผู้ใช้ที่เลือก หรือถูกปิดการใช้งาน");
        }
    }

    // ================================================================= schedule

    @Transactional
    public ScheduleDto schedule(UUID projectId) {
        Project p = requireVisible(projectId);
        return scheduleOf(p);
    }

    /**
     * บันทึกแผนงานทั้งชุด: งานที่มี id เดิมจะถูกแก้ไข งานที่ไม่มี id สร้างใหม่ งานเดิมที่ไม่อยู่ในรายการถูกลบ
     * (ประวัติความคืบหน้าในรายงานประจำวันของงานที่ถูกลบจะหายไปด้วย)
     */
    @Transactional
    public ScheduleDto saveTasks(UUID projectId, List<TaskInput> inputs) {
        Project p = requireWritable(projectId);
        Map<UUID, ProjectTask> existing = new HashMap<>();
        for (ProjectTask t : ProjectTask.listFor(p.id)) {
            existing.put(t.id, t);
        }
        Map<String, ProjectTask> byKey = new LinkedHashMap<>();
        Set<UUID> kept = new HashSet<>();
        int order = 0;
        for (TaskInput in : inputs) {
            if (byKey.containsKey(in.key())) {
                throw ApiException.badRequest("duplicate_key", "รหัสงานซ้ำ: " + in.key());
            }
            if (in.plannedStart() != null && in.plannedEnd() != null && in.plannedEnd().isBefore(in.plannedStart())) {
                throw ApiException.badRequest("invalid_dates", "งาน \"" + in.name() + "\" วันสิ้นสุดก่อนวันเริ่ม");
            }
            ProjectTask t;
            if (in.id() != null) {
                t = existing.get(in.id());
                if (t == null) {
                    throw ApiException.badRequest("invalid_task", "ไม่พบงานเดิมในโครงการนี้");
                }
                kept.add(t.id);
            } else {
                t = new ProjectTask();
                t.projectId = p.id;
            }
            t.sortOrder = ++order;
            t.name = in.name().trim();
            t.plannedStart = in.plannedStart();
            t.plannedEnd = in.plannedEnd();
            t.actualStart = in.actualStart();
            t.actualEnd = in.actualEnd();
            t.weight = in.weight();
            t.progressPct = in.progressPct();
            t.assigneeId = in.assigneeId();
            t.isMilestone = in.isMilestone();
            t.parentId = null;
            t.predecessorId = null;
            if (t.id == null) {
                t.persist();
            }
            byKey.put(in.key(), t);
        }
        // ลบงานที่ไม่อยู่ในรายการก่อนผูก parent ใหม่ (ON DELETE CASCADE ของ parent ไม่กระทบงานที่ยังอยู่เพราะ parent ถูกล้างแล้ว)
        em.flush();
        for (ProjectTask t : existing.values()) {
            if (!kept.contains(t.id)) {
                t.delete();
            }
        }
        em.flush();
        for (TaskInput in : inputs) {
            ProjectTask t = byKey.get(in.key());
            if (in.parentKey() != null && !in.parentKey().isBlank()) {
                ProjectTask parent = byKey.get(in.parentKey());
                if (parent == null || parent == t) {
                    throw ApiException.badRequest("invalid_parent", "หมวดงานของ \"" + in.name() + "\" ไม่ถูกต้อง");
                }
                t.parentId = parent.id;
            }
            if (in.predecessorKey() != null && !in.predecessorKey().isBlank()) {
                ProjectTask pre = byKey.get(in.predecessorKey());
                if (pre == null || pre == t) {
                    throw ApiException.badRequest("invalid_predecessor", "งานก่อนหน้าของ \"" + in.name() + "\" ไม่ถูกต้อง");
                }
                t.predecessorId = pre.id;
            }
        }
        assertNoCycle(new ArrayList<>(byKey.values()));
        recomputeProgress(p);
        audit.log("project", p.id, AuditService.ACTION_UPDATE, null, Map.of("schedule", inputs.size() + " tasks"));
        return scheduleOf(p);
    }

    /** อัปเดตความคืบหน้างานเดียว (จากรายงานประจำวัน) */
    @Transactional(Transactional.TxType.MANDATORY)
    public void applyTaskProgress(Project p, UUID taskId, BigDecimal pct, LocalDate date) {
        ProjectTask t = ProjectTask.findById(taskId);
        if (t == null || !t.projectId.equals(p.id)) {
            throw ApiException.badRequest("invalid_task", "งานไม่ได้อยู่ในโครงการนี้");
        }
        t.progressPct = pct;
        if (pct.signum() > 0 && t.actualStart == null) {
            t.actualStart = date;
        }
        if (pct.compareTo(new BigDecimal("100")) >= 0 && t.actualEnd == null) {
            t.actualEnd = date;
        } else if (pct.compareTo(new BigDecimal("100")) < 0) {
            t.actualEnd = null;
        }
    }

    /** คำนวณ % รวมใหม่และบันทึกจุด S-Curve ของวันนี้ */
    @Transactional(Transactional.TxType.MANDATORY)
    public void recomputeProgress(Project p) {
        em.flush();
        BigDecimal actual = ScheduleCalculator.actual(calcTasks(ProjectTask.listFor(p.id)));
        p.progressPct = actual;
        em.createNativeQuery("""
                        insert into project_progress_snapshots (project_id, snap_date, actual_pct) values (?1, ?2, ?3)
                        on conflict (project_id, snap_date) do update set actual_pct = excluded.actual_pct
                        """)
                .setParameter(1, p.id).setParameter(2, DocNumberService.today()).setParameter(3, actual).executeUpdate();
    }

    ScheduleDto scheduleOf(Project p) {
        List<ProjectTask> tasks = ProjectTask.listFor(p.id);
        List<ScheduleCalculator.Task> ct = calcTasks(tasks);
        LocalDate today = DocNumberService.today();
        Map<UUID, ScheduleCalculator.Rollup> roll = ScheduleCalculator.rollup(ct, today);
        Set<UUID> parents = new HashSet<>();
        tasks.forEach(t -> {
            if (t.parentId != null) {
                parents.add(t.parentId);
            }
        });
        Map<UUID, Integer> depth = new HashMap<>();
        Map<UUID, ProjectTask> byId = new HashMap<>();
        tasks.forEach(t -> byId.put(t.id, t));
        Map<UUID, String> names = UserNames.of(tasks.stream().map(t -> t.assigneeId).toList());
        List<TaskDto> out = new ArrayList<>();
        for (ProjectTask t : treeOrder(tasks)) {
            int d = t.parentId == null ? 0 : depth.getOrDefault(t.parentId, 0) + 1;
            depth.put(t.id, d);
            ScheduleCalculator.Rollup r = roll.get(t.id);
            boolean leaf = !parents.contains(t.id);
            boolean late = r.actualPct().compareTo(r.plannedPct()) < 0
                    && t.plannedEnd != null && today.isAfter(t.plannedEnd);
            out.add(new TaskDto(t.id, t.parentId, t.sortOrder, d, t.name, t.plannedStart, t.plannedEnd, t.actualStart,
                    t.actualEnd, t.weight, leaf ? t.progressPct : r.actualPct(), r.plannedPct(), r.weight(),
                    t.predecessorId, t.assigneeId, names.get(t.assigneeId), t.isMilestone, leaf, late));
        }
        BigDecimal totalWeight = ScheduleCalculator.leaves(ct).stream().map(x -> x.weight())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<CategoryProgress> cats = new ArrayList<>();
        for (ProjectTask t : tasks) {
            if (t.parentId == null) {
                ScheduleCalculator.Rollup r = roll.get(t.id);
                BigDecimal wp = totalWeight.signum() == 0 ? BigDecimal.ZERO
                        : r.weight().multiply(new BigDecimal("100")).divide(totalWeight, 2, java.math.RoundingMode.HALF_UP);
                cats.add(new CategoryProgress(t.id, t.name, wp, r.actualPct(), r.plannedPct()));
            }
        }
        BigDecimal actual = ScheduleCalculator.actual(ct);
        BigDecimal planned = ScheduleCalculator.planned(ct, today);
        return new ScheduleDto(p.id, today, actual, planned, actual.subtract(planned), out, cats, curve(p, ct));
    }

    private List<CurvePoint> curve(Project p, List<ScheduleCalculator.Task> ct) {
        int span = 0;
        List<ScheduleCalculator.CurvePoint> plan = ScheduleCalculator.plannedCurve(ct, 1);
        if (!plan.isEmpty()) {
            span = plan.size();
        }
        int step = span > 120 ? 7 : 1;
        if (step > 1) {
            plan = ScheduleCalculator.plannedCurve(ct, step);
        }
        @SuppressWarnings("unchecked")
        List<Object[]> snaps = em.createNativeQuery("select snap_date, actual_pct from project_progress_snapshots where project_id = ?1 order by snap_date")
                .setParameter(1, p.id).getResultList();
        // รวมจุดแผนและจุดจริงเรียงตามวันที่ (ค่าที่ไม่มีของอีกเส้นส่ง null ให้กราฟเชื่อมเส้นเอง)
        Map<LocalDate, BigDecimal[]> merged = new java.util.TreeMap<>();
        for (ScheduleCalculator.CurvePoint cp : plan) {
            merged.computeIfAbsent(cp.date(), k -> new BigDecimal[2])[0] = cp.plannedPct();
        }
        for (Object[] r : snaps) {
            merged.computeIfAbsent(SqlValues.date(r[0]), k -> new BigDecimal[2])[1] = SqlValues.decimal(r[1]);
        }
        List<CurvePoint> out = new ArrayList<>();
        merged.forEach((d, v) -> out.add(new CurvePoint(d, v[0], v[1])));
        return out;
    }

    static List<ScheduleCalculator.Task> calcTasks(List<ProjectTask> tasks) {
        return tasks.stream().map(t -> new ScheduleCalculator.Task(t.id, t.parentId, t.weight, t.progressPct,
                t.plannedStart, t.plannedEnd)).toList();
    }

    /** เรียงแบบต้นไม้ (แม่ก่อนลูก) ตาม sort_order */
    static List<ProjectTask> treeOrder(List<ProjectTask> tasks) {
        Map<UUID, List<ProjectTask>> kids = new HashMap<>();
        Set<UUID> ids = new HashSet<>();
        tasks.forEach(t -> ids.add(t.id));
        for (ProjectTask t : tasks) {
            UUID parent = t.parentId != null && ids.contains(t.parentId) ? t.parentId : null;
            kids.computeIfAbsent(parent, k -> new ArrayList<>()).add(t);
        }
        kids.values().forEach(l -> l.sort(java.util.Comparator.comparingInt(x -> x.sortOrder)));
        List<ProjectTask> out = new ArrayList<>();
        walk(null, kids, out, new HashSet<>());
        return out;
    }

    private static void walk(UUID parent, Map<UUID, List<ProjectTask>> kids, List<ProjectTask> out, Set<UUID> seen) {
        for (ProjectTask t : kids.getOrDefault(parent, List.of())) {
            if (seen.add(t.id)) {
                out.add(t);
                walk(t.id, kids, out, seen);
            }
        }
    }

    private static void assertNoCycle(List<ProjectTask> tasks) {
        Map<UUID, ProjectTask> byId = new HashMap<>();
        tasks.forEach(t -> byId.put(t.id, t));
        for (ProjectTask t : tasks) {
            Set<UUID> seen = new HashSet<>();
            ProjectTask cur = t;
            while (cur != null && cur.parentId != null) {
                if (!seen.add(cur.id)) {
                    throw ApiException.badRequest("cycle", "โครงสร้างหมวดงานวนซ้ำกัน");
                }
                cur = byId.get(cur.parentId);
            }
            seen.clear();
            cur = t;
            while (cur != null && cur.predecessorId != null) {
                if (!seen.add(cur.id)) {
                    throw ApiException.badRequest("cycle", "งานก่อนหน้าวนซ้ำกัน");
                }
                cur = byId.get(cur.predecessorId);
            }
        }
    }

    // ================================================================= dto

    ProjectDto toDto(Project p) {
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(p.managerId, p.foremanId));
        Customer c = Customer.findById(p.customerId);
        @SuppressWarnings("unchecked")
        List<Object[]> mrows = em.createNativeQuery("""
                        select m.user_id, u.name, m.role_label from project_members m join users u on u.id = m.user_id
                        where m.project_id = ?1 order by u.name
                        """).setParameter(1, p.id).getResultList();
        List<Member> members = mrows.stream().map(r -> new Member(SqlValues.uuid(r[0]), (String) r[1], (String) r[2])).toList();
        Quotation q = p.quotationId == null ? null : Quotation.findById(p.quotationId);
        BigDecimal planned = ScheduleCalculator.planned(calcTasks(ProjectTask.listFor(p.id)), DocNumberService.today());
        boolean cost = currentUser.canViewCost();
        return new ProjectDto(p.id, p.code, p.name, p.customerId, c == null ? null : c.name, p.leadId, p.quotationId,
                q == null ? null : q.displayNo(), p.siteAddress, p.status, p.plannedStart, p.plannedEnd, p.actualStart,
                p.actualEnd, p.managerId, names.get(p.managerId), p.foremanId, names.get(p.foremanId),
                cost ? p.budgetCost : null, p.progressPct, planned, p.notes, members,
                currentUser.can(Perm.CONTRACT_READ) || currentUser.can(Perm.FINANCE_READ) ? contractSummary(p.id) : null,
                counters(p.id), currentUser.can(Perm.PROJECT_WRITE),
                currentUser.can(Perm.SITE_REPORT) || currentUser.can(Perm.PROJECT_WRITE), p.createdAt, p.updatedAt);
    }

    private ContractSummary contractSummary(UUID projectId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select c.id, c.doc_no, c.status, c.amount,
                               c.amount + coalesce((select sum(v.amount) from change_orders v
                                                    where v.contract_id = c.id and v.status = 'approved' and v.deleted_at is null), 0),
                               coalesce((select sum(case when d.doc_type = 'credit_note' then -d.taxable_amount else d.taxable_amount end)
                                         from sales_docs d where d.contract_id = c.id and d.deleted_at is null and d.status <> 'void'
                                           and d.status <> 'draft' and d.doc_type in ('invoice', 'invoice_tax', 'credit_note')), 0),
                               coalesce((select sum(d.settled_amount) from sales_docs d where d.contract_id = c.id
                                           and d.deleted_at is null and d.status <> 'void' and d.doc_type in ('invoice', 'invoice_tax')), 0)
                        from contracts c where c.project_id = ?1 and c.deleted_at is null
                        """).setParameter(1, projectId).getResultList();
        if (rows.isEmpty()) {
            return null;
        }
        Object[] r = rows.get(0);
        return new ContractSummary(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], SqlValues.decimal(r[3]),
                SqlValues.decimal(r[4]), SqlValues.decimal(r[5]), SqlValues.decimal(r[6]));
    }

    private Counters counters(UUID projectId) {
        Object[] r = (Object[]) em.createNativeQuery("""
                        select
                          (select count(*) from project_issues where project_id = ?1 and kind = 'issue' and status in ('open', 'in_progress') and deleted_at is null),
                          (select count(*) from project_issues where project_id = ?1 and kind = 'risk' and status in ('open', 'in_progress') and deleted_at is null),
                          (select count(*) from punch_items where project_id = ?1 and status <> 'verified' and deleted_at is null),
                          (select count(*) from daily_reports where project_id = ?1 and deleted_at is null),
                          (select count(*) from qc_inspections where project_id = ?1 and result in ('pending', 'fail') and deleted_at is null),
                          (select count(*) from safety_logs where project_id = ?1 and status = 'open' and deleted_at is null),
                          (select count(*) from attachments where owner_type = 'project' and owner_id = ?1 and deleted_at is null)
                        """).setParameter(1, projectId).getSingleResult();
        return new Counters(SqlValues.count(r[0]), SqlValues.count(r[1]), SqlValues.count(r[2]), SqlValues.count(r[3]),
                SqlValues.count(r[4]), SqlValues.count(r[5]), SqlValues.count(r[6]));
    }

    private Map<UUID, String> customerNames(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        Set<UUID> unique = new HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("select id, name from customers where id in (:ids)").setParameter("ids", unique).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), (String) r[1]));
        return out;
    }

    private Map<UUID, BigDecimal> contractAmounts(List<UUID> projectIds) {
        Map<UUID, BigDecimal> out = new HashMap<>();
        if (projectIds.isEmpty() || !currentUser.can(Perm.CONTRACT_READ)) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select c.project_id, c.amount + coalesce((select sum(v.amount) from change_orders v
                               where v.contract_id = c.id and v.status = 'approved' and v.deleted_at is null), 0)
                        from contracts c where c.project_id in (:ids) and c.deleted_at is null
                        """).setParameter("ids", projectIds).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), SqlValues.decimal(r[1])));
        return out;
    }

    public String prefix(String type, String def) {
        com.fasterxml.jackson.databind.JsonNode n = settings.get("doc.prefixes");
        if (n != null && n.hasNonNull(type) && !n.get(type).asText().isBlank()) {
            return n.get(type).asText();
        }
        return def;
    }

    private static Map<String, Object> auditView(Project p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", p.name);
        m.put("status", p.status);
        m.put("plannedStart", String.valueOf(p.plannedStart));
        m.put("plannedEnd", String.valueOf(p.plannedEnd));
        m.put("managerId", String.valueOf(p.managerId));
        m.put("foremanId", String.valueOf(p.foremanId));
        m.put("budgetCost", p.budgetCost);
        return m;
    }
}
