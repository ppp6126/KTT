package com.ktt.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ktt.attachment.Attachment;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.project.ProjectTask;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.site.SiteDtos.DailyReportDto;
import com.ktt.site.SiteDtos.DailyReportRequest;
import com.ktt.site.SiteDtos.DailyReportRow;
import com.ktt.site.SiteDtos.TaskProgressDto;
import com.ktt.site.SiteDtos.TaskProgressInput;
import com.ktt.site.SiteDtos.WorkerLine;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * รายงานประจำวัน (Daily Report) โฟร์แมนกรอกจากมือถือ แนบรูปผ่านไฟล์แนบ (owner_type = daily_report)
 * ส่งรายงานแล้วความคืบหน้างานที่กรอกจะอัปเดตแผนงานและ S-Curve ทันที และแจ้ง PM ให้รับทราบ
 */
@ApplicationScoped
public class DailyReportService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    ProjectService projects;

    @Inject
    NotificationService notifications;

    @Inject
    ObjectMapper mapper;

    @Inject
    EntityManager em;

    @Transactional
    public PageResult<DailyReportRow> list(UUID projectId, int page, int size) {
        Project p = projects.requireVisible(projectId);
        PanacheQuery<DailyReport> q = DailyReport.find("projectId = ?1", Sort.descending("reportDate"), p.id);
        long total = q.count();
        List<DailyReport> list = q.page(Page.of(page, size)).list();
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.createdBy).toList());
        Map<UUID, Long> photos = photoCounts("daily_report", list.stream().map(x -> x.id).toList());
        return new PageResult<>(list.stream().map(x -> new DailyReportRow(x.id, x.reportDate, x.status, x.weatherAm,
                x.weatherPm, x.workersTotal, summary(x.workDone), photos.getOrDefault(x.id, 0L), names.get(x.createdBy),
                x.submittedAt)).toList(), total, page, size);
    }

    @Transactional
    public DailyReportDto get(UUID id) {
        return toDto(requireVisible(id));
    }

    @Transactional
    public DailyReportDto create(UUID projectId, DailyReportRequest req) {
        Project p = projects.requireReportable(projectId);
        if (req.reportDate().isAfter(DocNumberService.today())) {
            throw ApiException.badRequest("future_date", "บันทึกรายงานล่วงหน้าไม่ได้");
        }
        DailyReport existing = DailyReport.find("projectId = ?1 and reportDate = ?2", p.id, req.reportDate()).firstResult();
        if (existing != null) {
            throw new ApiException(409, "report_exists", "มีรายงานของวันที่นี้แล้ว", Map.of("id", existing.id.toString()));
        }
        DailyReport r = new DailyReport();
        r.projectId = p.id;
        r.createdBy = currentUser.id();
        apply(r, req);
        r.persist();
        writeTasks(r, p, req.tasks());
        audit.log("daily_report", r.id, AuditService.ACTION_CREATE, null, Map.of("project", p.code, "date", r.reportDate.toString()));
        return toDto(r);
    }

    @Transactional
    public DailyReportDto update(UUID id, DailyReportRequest req) {
        DailyReport r = requireEditable(id);
        Project p = Project.findById(r.projectId);
        if (!r.reportDate.equals(req.reportDate())) {
            if (req.reportDate().isAfter(DocNumberService.today())) {
                throw ApiException.badRequest("future_date", "บันทึกรายงานล่วงหน้าไม่ได้");
            }
            if (DailyReport.count("projectId = ?1 and reportDate = ?2 and id <> ?3", p.id, req.reportDate(), r.id) > 0) {
                throw ApiException.conflict("report_exists", "มีรายงานของวันที่นี้แล้ว");
            }
        }
        apply(r, req);
        writeTasks(r, p, req.tasks());
        audit.log("daily_report", r.id, AuditService.ACTION_UPDATE, null, Map.of("date", r.reportDate.toString()));
        return toDto(r);
    }

    @Transactional
    public DailyReportDto submit(UUID id) {
        DailyReport r = requireEditable(id);
        if (!"draft".equals(r.status)) {
            throw ApiException.conflict("invalid_status", "ส่งรายงานนี้แล้ว");
        }
        Project p = Project.findById(r.projectId);
        // ตั้งสถานะก่อนคำนวณ เพื่อให้จุด S-Curve ณ วันที่รายงานนับค่าจากรายงานฉบับนี้ด้วย
        r.status = "submitted";
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("select task_id, progress_pct from daily_report_tasks where report_id = ?1")
                .setParameter(1, r.id).getResultList();
        for (Object[] row : rows) {
            projects.applyTaskProgress(p, SqlValues.uuid(row[0]), SqlValues.decimal(row[1]), r.reportDate);
        }
        if (!rows.isEmpty()) {
            // จุด S-Curve บันทึกตามวันที่รายงาน (รายงานย้อนหลังไม่ทับความคืบหน้าจากรายงานที่ใหม่กว่า)
            projects.recomputeProgress(p, r.reportDate);
        }
        if ("planning".equals(p.status)) {
            p.status = "active";
            if (p.actualStart == null) {
                p.actualStart = r.reportDate;
            }
        }
        r.submittedAt = Instant.now();
        r.submittedBy = currentUser.id();
        if (p.managerId != null && !p.managerId.equals(currentUser.id())) {
            notifications.notify(p.managerId, "daily_report", "รายงานประจำวัน " + p.code + " " + r.reportDate,
                    summary(r.workDone), "/daily-reports/" + r.id, "daily_report", r.id);
        }
        audit.log("daily_report", r.id, AuditService.ACTION_UPDATE, Map.of("status", "draft"), Map.of("status", r.status));
        return toDto(r);
    }

    @Transactional
    public DailyReportDto acknowledge(UUID id) {
        DailyReport r = requireVisible(id);
        if (!currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "ผู้จัดการโครงการเท่านั้นที่รับทราบรายงานได้");
        }
        if (!"submitted".equals(r.status)) {
            throw ApiException.conflict("invalid_status", "รับทราบได้เฉพาะรายงานที่ส่งแล้ว");
        }
        r.status = "acknowledged";
        r.acknowledgedAt = Instant.now();
        r.acknowledgedBy = currentUser.id();
        audit.log("daily_report", r.id, AuditService.ACTION_APPROVE, null, Map.of("status", r.status));
        return toDto(r);
    }

    @Transactional
    public void delete(UUID id) {
        DailyReport r = requireEditable(id);
        if (!"draft".equals(r.status)) {
            throw ApiException.conflict("not_editable", "ลบได้เฉพาะรายงานที่ยังไม่ส่ง");
        }
        r.softDelete();
        audit.log("daily_report", r.id, AuditService.ACTION_DELETE, Map.of("date", r.reportDate.toString()), null);
    }

    /** โครงการที่กำลังทำแต่วันนี้ยังไม่มีรายงาน → แจ้งโฟร์แมน (เรียกจาก SiteJobs) */
    @Transactional
    public int remindMissing() {
        LocalDate today = DocNumberService.today();
        List<Project> active = Project.list("status = 'active' and foremanId is not null");
        int n = 0;
        for (Project p : active) {
            if (DailyReport.count("projectId = ?1 and reportDate = ?2", p.id, today) == 0) {
                notifications.notify(p.foremanId, "daily_report_missing", "ยังไม่ได้ส่งรายงานประจำวัน " + p.code,
                        p.name, "/projects/" + p.id + "/daily", "project", p.id);
                n++;
            }
        }
        return n;
    }

    // ================================================================= internals

    @Transactional(Transactional.TxType.MANDATORY)
    public DailyReport requireVisible(UUID id) {
        DailyReport r = id == null ? null : DailyReport.findById(id);
        if (r == null) {
            throw ApiException.notFound("ไม่พบรายงาน");
        }
        projects.requireVisible(r.projectId);
        return r;
    }

    /** ผู้เขียนแก้ได้จนถึงก่อนรับทราบ (ร่างหรือส่งแล้ว) ; PM แก้ได้ทุกฉบับที่ยังไม่รับทราบ */
    private DailyReport requireEditable(UUID id) {
        DailyReport r = requireVisible(id);
        projects.requireReportable(r.projectId);
        if ("acknowledged".equals(r.status)) {
            throw ApiException.conflict("not_editable", "รายงานที่รับทราบแล้วแก้ไขไม่ได้");
        }
        if (!currentUser.id().equals(r.createdBy) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "แก้ไขได้เฉพาะรายงานของตนเอง");
        }
        return r;
    }

    private void apply(DailyReport r, DailyReportRequest req) {
        r.reportDate = req.reportDate();
        r.weatherAm = UserNames.blankToNull(req.weatherAm());
        r.weatherPm = UserNames.blankToNull(req.weatherPm());
        List<WorkerLine> workers = req.workers() == null ? List.of() : req.workers().stream().filter(w -> w.count() > 0).toList();
        r.workers = mapper.valueToTree(workers);
        r.workersTotal = workers.stream().mapToInt(WorkerLine::count).sum();
        r.workDone = UserNames.blankToNull(req.workDone());
        r.workPlanned = UserNames.blankToNull(req.workPlanned());
        r.problems = UserNames.blankToNull(req.problems());
        r.materialsIn = UserNames.blankToNull(req.materialsIn());
        r.equipment = UserNames.blankToNull(req.equipment());
        r.visitors = UserNames.blankToNull(req.visitors());
        r.safetyNote = UserNames.blankToNull(req.safetyNote());
    }

    private void writeTasks(DailyReport r, Project p, List<TaskProgressInput> tasks) {
        em.createNativeQuery("delete from daily_report_tasks where report_id = ?1").setParameter(1, r.id).executeUpdate();
        if (tasks == null) {
            return;
        }
        Set<UUID> seen = new HashSet<>();
        for (TaskProgressInput t : tasks) {
            if (!seen.add(t.taskId())) {
                continue;
            }
            ProjectTask task = ProjectTask.findById(t.taskId());
            if (task == null || !task.projectId.equals(p.id)) {
                throw ApiException.badRequest("invalid_task", "งานไม่ได้อยู่ในโครงการนี้");
            }
            if (ProjectTask.count("parentId", task.id) > 0) {
                throw ApiException.badRequest("not_leaf", "\"" + task.name + "\" เป็นหมวดงาน ให้รายงานที่งานย่อย");
            }
            em.createNativeQuery("insert into daily_report_tasks (report_id, task_id, progress_pct, note) values (?1, ?2, ?3, ?4)")
                    .setParameter(1, r.id).setParameter(2, task.id).setParameter(3, t.progressPct())
                    .setParameter(4, UserNames.blankToNull(t.note())).executeUpdate();
        }
        // ถ้ารายงานส่งไปแล้ว (แก้ไขภายหลัง) ให้ปรับแผนงานตามค่าใหม่ทันที
        if (!"draft".equals(r.status)) {
            for (TaskProgressInput t : tasks) {
                projects.applyTaskProgress(p, t.taskId(), t.progressPct(), r.reportDate);
            }
            projects.recomputeProgress(p, r.reportDate);
        }
    }

    Map<UUID, Long> photoCounts(String ownerType, List<UUID> ids) {
        Map<UUID, Long> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select owner_id, count(*) from attachments where owner_type = :type and owner_id in (:ids)
                        and deleted_at is null group by owner_id""")
                .setParameter("type", ownerType).setParameter("ids", ids).getResultList();
        rows.forEach(r -> out.put(SqlValues.uuid(r[0]), SqlValues.count(r[1])));
        return out;
    }

    static String summary(String s) {
        if (s == null) {
            return null;
        }
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() > 140 ? one.substring(0, 140) + "…" : one;
    }

    DailyReportDto toDto(DailyReport r) {
        Project p = Project.findById(r.projectId);
        Map<UUID, String> names = UserNames.of(java.util.Arrays.asList(r.createdBy, r.submittedBy, r.acknowledgedBy));
        List<WorkerLine> workers = new ArrayList<>();
        if (r.workers != null && r.workers.isArray()) {
            for (JsonNode n : r.workers) {
                workers.add(new WorkerLine(n.path("trade").asText(), n.path("count").asInt()));
            }
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                        select t.id, t.name, t.progress_pct, d.progress_pct, d.note
                        from daily_report_tasks d join project_tasks t on t.id = d.task_id
                        where d.report_id = ?1 order by t.sort_order""").setParameter(1, r.id).getResultList();
        List<TaskProgressDto> tasks = rows.stream().map(x -> new TaskProgressDto(SqlValues.uuid(x[0]), (String) x[1],
                SqlValues.decimal(x[2]), SqlValues.decimal(x[3]), (String) x[4])).toList();
        boolean reporter = currentUser.can(Perm.SITE_REPORT) || currentUser.can(Perm.PROJECT_WRITE);
        boolean mine = currentUser.id() != null && currentUser.id().equals(r.createdBy);
        boolean editable = reporter && !"acknowledged".equals(r.status) && (mine || currentUser.can(Perm.PROJECT_WRITE));
        return new DailyReportDto(r.id, r.projectId, p.code, p.name, r.reportDate, r.weatherAm, r.weatherPm, workers,
                r.workersTotal, r.workDone, r.workPlanned, r.problems, r.materialsIn, r.equipment, r.visitors,
                r.safetyNote, r.status, r.submittedAt, names.get(r.submittedBy), r.acknowledgedAt,
                names.get(r.acknowledgedBy), names.get(r.createdBy), tasks, editable,
                editable && "draft".equals(r.status),
                "submitted".equals(r.status) && currentUser.can(Perm.PROJECT_WRITE), r.createdAt);
    }

    static long countPhotos(String ownerType, UUID id) {
        return Attachment.countFor(ownerType, id);
    }
}
