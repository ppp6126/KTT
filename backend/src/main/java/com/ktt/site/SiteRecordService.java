package com.ktt.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.project.ProjectTask;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.site.SiteDtos.IssueDto;
import com.ktt.site.SiteDtos.IssueRequest;
import com.ktt.site.SiteDtos.PhotoRef;
import com.ktt.site.SiteDtos.ProgressReportDto;
import com.ktt.site.SiteDtos.PunchDto;
import com.ktt.site.SiteDtos.PunchRequest;
import com.ktt.site.SiteDtos.QcDto;
import com.ktt.site.SiteDtos.QcItem;
import com.ktt.site.SiteDtos.QcRequest;
import com.ktt.site.SiteDtos.QcTemplateDto;
import com.ktt.site.SiteDtos.QcTemplateRequest;
import com.ktt.site.SiteDtos.SafetyDto;
import com.ktt.site.SiteDtos.SafetyRequest;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** ปัญหา/ความเสี่ยง, Punch list, QC, ความปลอดภัย และรายงานความคืบหน้าสำหรับลูกค้า */
@ApplicationScoped
public class SiteRecordService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    ProjectService projects;

    @Inject
    DailyReportService dailyReports;

    @Inject
    NotificationService notifications;

    @Inject
    ObjectMapper mapper;

    @Inject
    EntityManager em;

    // ================================================================= issues / risks

    @Transactional
    public List<IssueDto> issues(UUID projectId, String kind) {
        Project p = projects.requireVisible(projectId);
        List<ProjectIssue> list = kind == null || kind.isBlank()
                ? ProjectIssue.list("projectId = ?1 order by createdAt desc", p.id)
                : ProjectIssue.list("projectId = ?1 and kind = ?2 order by createdAt desc", p.id, kind);
        Map<UUID, String> names = UserNames.of(list.stream().flatMap(x -> java.util.stream.Stream.of(x.ownerId, x.createdBy)).toList());
        return list.stream().map(x -> toDto(x, names)).toList();
    }

    @Transactional
    public IssueDto saveIssue(UUID projectId, UUID id, IssueRequest req) {
        Project p = projects.requireReportable(projectId);
        ProjectIssue x;
        if (id == null) {
            x = new ProjectIssue();
            x.projectId = p.id;
            x.createdBy = currentUser.id();
        } else {
            x = ProjectIssue.findById(id);
            if (x == null || !x.projectId.equals(p.id)) {
                throw ApiException.notFound("ไม่พบรายการ");
            }
        }
        String before = x.status;
        UUID ownerBefore = x.ownerId;
        x.kind = req.kind();
        x.title = req.title().trim();
        x.description = UserNames.blankToNull(req.description());
        x.severity = req.severity();
        x.likelihood = "risk".equals(req.kind()) ? UserNames.blankToNull(req.likelihood()) : null;
        x.status = req.status();
        x.ownerId = req.ownerId();
        x.dueDate = req.dueDate();
        x.resolution = UserNames.blankToNull(req.resolution());
        if (("resolved".equals(x.status) || "closed".equals(x.status)) && x.closedAt == null) {
            x.closedAt = Instant.now();
        } else if ("open".equals(x.status) || "in_progress".equals(x.status)) {
            x.closedAt = null;
        }
        if (x.id == null) {
            x.persist();
        }
        if (x.ownerId != null && !x.ownerId.equals(ownerBefore) && !x.ownerId.equals(currentUser.id())) {
            notifications.notify(x.ownerId, "issue_assigned", ("risk".equals(x.kind) ? "ความเสี่ยง: " : "ปัญหา: ") + x.title,
                    p.code + " " + p.name, "/projects/" + p.id + "/issues", "project_issue", x.id);
        }
        if (id == null && "critical".equals(x.severity) && p.managerId != null && !p.managerId.equals(currentUser.id())) {
            notifications.notify(p.managerId, "issue_critical", "ปัญหาวิกฤต: " + x.title, p.code + " " + p.name,
                    "/projects/" + p.id + "/issues", "project_issue", x.id);
        }
        audit.log("project_issue", x.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE,
                before == null ? null : Map.of("status", before), Map.of("status", x.status, "title", x.title));
        return toDto(x, UserNames.of(java.util.Arrays.asList(x.ownerId, x.createdBy)));
    }

    @Transactional
    public void deleteIssue(UUID projectId, UUID id) {
        Project p = projects.requireReportable(projectId);
        ProjectIssue x = ProjectIssue.findById(id);
        if (x == null || !x.projectId.equals(p.id)) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        requireOwnerOrPm(x.createdBy);
        x.softDelete();
        audit.log("project_issue", x.id, AuditService.ACTION_DELETE, Map.of("title", x.title), null);
    }

    private IssueDto toDto(ProjectIssue x, Map<UUID, String> names) {
        boolean open = "open".equals(x.status) || "in_progress".equals(x.status);
        return new IssueDto(x.id, x.projectId, x.kind, x.title, x.description, x.severity, x.likelihood, x.status,
                x.ownerId, names.get(x.ownerId), x.dueDate, x.resolution, x.closedAt,
                open && x.dueDate != null && x.dueDate.isBefore(DocNumberService.today()), names.get(x.createdBy), x.createdAt);
    }

    // ================================================================= punch list

    @Transactional
    public List<PunchDto> punch(UUID projectId) {
        Project p = projects.requireVisible(projectId);
        List<PunchItem> list = PunchItem.list("projectId = ?1 order by itemNo", p.id);
        Map<UUID, Long> photos = dailyReports.photoCounts("punch_item", list.stream().map(x -> x.id).toList());
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.verifiedBy).toList());
        return list.stream().map(x -> toDto(x, photos.getOrDefault(x.id, 0L), names)).toList();
    }

    @Transactional
    public PunchDto savePunch(UUID projectId, UUID id, PunchRequest req) {
        Project p = projects.requireReportable(projectId);
        PunchItem x;
        if (id == null) {
            x = new PunchItem();
            x.projectId = p.id;
            x.createdBy = currentUser.id();
            Number max = (Number) em.createNativeQuery("select coalesce(max(item_no), 0) from punch_items where project_id = ?1")
                    .setParameter(1, p.id).getSingleResult();
            x.itemNo = max.intValue() + 1;
        } else {
            x = PunchItem.findById(id);
            if (x == null || !x.projectId.equals(p.id)) {
                throw ApiException.notFound("ไม่พบรายการ");
            }
        }
        if ("verified".equals(req.status()) && !"verified".equals(x.status) && !currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "ผู้จัดการโครงการเป็นผู้ตรวจรับงานแก้ไข");
        }
        x.location = UserNames.blankToNull(req.location());
        x.description = req.description().trim();
        x.responsible = UserNames.blankToNull(req.responsible());
        x.dueDate = req.dueDate();
        if (!req.status().equals(x.status)) {
            switch (req.status()) {
                case "fixed" -> {
                    x.fixedAt = Instant.now();
                    x.verifiedAt = null;
                    x.verifiedBy = null;
                }
                case "verified" -> {
                    if (x.fixedAt == null) {
                        x.fixedAt = Instant.now();
                    }
                    x.verifiedAt = Instant.now();
                    x.verifiedBy = currentUser.id();
                }
                default -> {
                    x.fixedAt = null;
                    x.verifiedAt = null;
                    x.verifiedBy = null;
                }
            }
            x.status = req.status();
        }
        if (x.id == null) {
            x.persist();
        }
        audit.log("punch_item", x.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("no", x.itemNo, "status", x.status));
        return toDto(x, DailyReportService.countPhotos("punch_item", x.id), UserNames.of(java.util.Collections.singletonList(x.verifiedBy)));
    }

    @Transactional
    public void deletePunch(UUID projectId, UUID id) {
        Project p = projects.requireReportable(projectId);
        PunchItem x = PunchItem.findById(id);
        if (x == null || !x.projectId.equals(p.id)) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        requireOwnerOrPm(x.createdBy);
        x.softDelete();
        audit.log("punch_item", x.id, AuditService.ACTION_DELETE, Map.of("no", x.itemNo), null);
    }

    private PunchDto toDto(PunchItem x, long photos, Map<UUID, String> names) {
        return new PunchDto(x.id, x.projectId, x.itemNo, x.location, x.description, x.responsible, x.dueDate, x.status,
                x.fixedAt, x.verifiedAt, names.get(x.verifiedBy), photos,
                "open".equals(x.status) && x.dueDate != null && x.dueDate.isBefore(DocNumberService.today()), x.createdAt);
    }

    // ================================================================= QC

    @Transactional
    public List<QcTemplateDto> qcTemplates() {
        return QcTemplate.<QcTemplate>list("order by category, name").stream().map(this::toDto).toList();
    }

    @Transactional
    public QcTemplateDto saveQcTemplate(UUID id, QcTemplateRequest req) {
        if (!currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขแม่แบบ QC");
        }
        QcTemplate t = id == null ? new QcTemplate() : QcTemplate.findById(id);
        if (t == null) {
            throw ApiException.notFound("ไม่พบแม่แบบ");
        }
        t.name = req.name().trim();
        t.category = UserNames.blankToNull(req.category());
        t.items = mapper.valueToTree(req.items().stream().map(String::trim).toList());
        if (t.id == null) {
            t.createdBy = currentUser.id();
            t.persist();
        }
        audit.log("qc_template", t.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null, Map.of("name", t.name));
        return toDto(t);
    }

    @Transactional
    public void deleteQcTemplate(UUID id) {
        if (!currentUser.can(Perm.PROJECT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขแม่แบบ QC");
        }
        QcTemplate t = QcTemplate.findById(id);
        if (t == null) {
            throw ApiException.notFound("ไม่พบแม่แบบ");
        }
        t.softDelete();
        audit.log("qc_template", t.id, AuditService.ACTION_DELETE, Map.of("name", t.name), null);
    }

    private QcTemplateDto toDto(QcTemplate t) {
        List<String> items = new ArrayList<>();
        if (t.items != null) {
            t.items.forEach(n -> items.add(n.asText()));
        }
        return new QcTemplateDto(t.id, t.name, t.category, items);
    }

    @Transactional
    public List<QcDto> qc(UUID projectId) {
        Project p = projects.requireVisible(projectId);
        List<QcInspection> list = QcInspection.list("projectId = ?1", Sort.descending("inspectedOn").and("createdAt", Sort.Direction.Descending), p.id);
        Map<UUID, Long> photos = dailyReports.photoCounts("qc_inspection", list.stream().map(x -> x.id).toList());
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.inspectorId).toList());
        return list.stream().map(x -> toDto(x, photos.getOrDefault(x.id, 0L), names)).toList();
    }

    @Transactional
    public QcDto saveQc(UUID projectId, UUID id, QcRequest req) {
        Project p = projects.requireReportable(projectId);
        QcInspection x;
        if (id == null) {
            x = new QcInspection();
            x.projectId = p.id;
            x.createdBy = currentUser.id();
        } else {
            x = QcInspection.findById(id);
            if (x == null || !x.projectId.equals(p.id)) {
                throw ApiException.notFound("ไม่พบรายการ");
            }
        }
        if (req.taskId() != null) {
            ProjectTask t = ProjectTask.findById(req.taskId());
            if (t == null || !t.projectId.equals(p.id)) {
                throw ApiException.badRequest("invalid_task", "งานไม่ได้อยู่ในโครงการนี้");
            }
        }
        x.taskId = req.taskId();
        x.title = req.title().trim();
        x.inspectedOn = req.inspectedOn();
        x.inspectorId = req.inspectorId() == null ? currentUser.id() : req.inspectorId();
        List<QcItem> items = req.items().stream()
                .map(i -> new QcItem(i.text().trim(), UserNames.blankToNull(i.result()), UserNames.blankToNull(i.note()))).toList();
        x.items = mapper.valueToTree(items);
        x.result = QcRules.result(items);
        x.notes = UserNames.blankToNull(req.notes());
        if (x.id == null) {
            x.persist();
        }
        if ("fail".equals(x.result) && p.managerId != null && !p.managerId.equals(currentUser.id())) {
            notifications.notify(p.managerId, "qc_failed", "QC ไม่ผ่าน: " + x.title, p.code + " " + p.name,
                    "/projects/" + p.id + "/qc", "qc_inspection", x.id);
        }
        audit.log("qc_inspection", x.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("title", x.title, "result", x.result));
        return toDto(x, DailyReportService.countPhotos("qc_inspection", x.id), UserNames.of(java.util.Collections.singletonList(x.inspectorId)));
    }

    @Transactional
    public void deleteQc(UUID projectId, UUID id) {
        Project p = projects.requireReportable(projectId);
        QcInspection x = QcInspection.findById(id);
        if (x == null || !x.projectId.equals(p.id)) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        requireOwnerOrPm(x.createdBy);
        x.softDelete();
        audit.log("qc_inspection", x.id, AuditService.ACTION_DELETE, Map.of("title", x.title), null);
    }

    private QcDto toDto(QcInspection x, long photos, Map<UUID, String> names) {
        List<QcItem> items = new ArrayList<>();
        if (x.items != null) {
            for (JsonNode n : x.items) {
                items.add(new QcItem(n.path("text").asText(), n.hasNonNull("result") ? n.get("result").asText() : null,
                        n.hasNonNull("note") ? n.get("note").asText() : null));
            }
        }
        ProjectTask t = x.taskId == null ? null : ProjectTask.findById(x.taskId);
        int pass = (int) items.stream().filter(i -> "pass".equals(i.result())).count();
        int fail = (int) items.stream().filter(i -> "fail".equals(i.result())).count();
        return new QcDto(x.id, x.projectId, x.taskId, t == null ? null : t.name, x.title, x.inspectedOn, x.inspectorId,
                names.get(x.inspectorId), x.result, items, x.notes, pass, fail, photos, x.createdAt);
    }

    // ================================================================= safety

    @Transactional
    public List<SafetyDto> safety(UUID projectId) {
        Project p = projects.requireVisible(projectId);
        List<SafetyLog> list = SafetyLog.list("projectId = ?1", Sort.descending("logDate").and("createdAt", Sort.Direction.Descending), p.id);
        Map<UUID, Long> photos = dailyReports.photoCounts("safety_log", list.stream().map(x -> x.id).toList());
        Map<UUID, String> names = UserNames.of(list.stream().map(x -> x.createdBy).toList());
        return list.stream().map(x -> toDto(x, photos.getOrDefault(x.id, 0L), names)).toList();
    }

    @Transactional
    public SafetyDto saveSafety(UUID projectId, UUID id, SafetyRequest req) {
        Project p = projects.requireReportable(projectId);
        SafetyLog x;
        if (id == null) {
            x = new SafetyLog();
            x.projectId = p.id;
            x.createdBy = currentUser.id();
        } else {
            x = SafetyLog.findById(id);
            if (x == null || !x.projectId.equals(p.id)) {
                throw ApiException.notFound("ไม่พบรายการ");
            }
        }
        x.logDate = req.logDate();
        x.kind = req.kind();
        x.title = req.title().trim();
        x.detail = UserNames.blankToNull(req.detail());
        x.peopleCount = req.peopleCount();
        x.injuredCount = req.injuredCount();
        x.severity = req.severity();
        x.correctiveAction = UserNames.blankToNull(req.correctiveAction());
        x.status = req.status();
        if (x.id == null) {
            x.persist();
            if ("incident".equals(x.kind) || "high".equals(x.severity)) {
                notifications.notifyAll(notifications.usersWithPermission(Perm.PROJECT_WRITE), "safety_incident",
                        "แจ้งเหตุความปลอดภัย: " + x.title, p.code + " " + p.name + (x.injuredCount > 0 ? " บาดเจ็บ " + x.injuredCount + " คน" : ""),
                        "/projects/" + p.id + "/safety", "safety_log", x.id);
            }
        }
        audit.log("safety_log", x.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("kind", x.kind, "title", x.title));
        return toDto(x, DailyReportService.countPhotos("safety_log", x.id), UserNames.of(java.util.Collections.singletonList(x.createdBy)));
    }

    @Transactional
    public void deleteSafety(UUID projectId, UUID id) {
        Project p = projects.requireReportable(projectId);
        SafetyLog x = SafetyLog.findById(id);
        if (x == null || !x.projectId.equals(p.id)) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        requireOwnerOrPm(x.createdBy);
        x.softDelete();
        audit.log("safety_log", x.id, AuditService.ACTION_DELETE, Map.of("title", x.title), null);
    }

    private SafetyDto toDto(SafetyLog x, long photos, Map<UUID, String> names) {
        return new SafetyDto(x.id, x.projectId, x.logDate, x.kind, x.title, x.detail, x.peopleCount, x.injuredCount,
                x.severity, x.correctiveAction, x.status, names.get(x.createdBy), photos, x.createdAt);
    }

    // ================================================================= progress report

    /** รายงานความคืบหน้าช่วงวันที่ (ค่าเริ่มต้น 7 วันล่าสุด) สำหรับพิมพ์ส่งลูกค้า */
    @Transactional
    public ProgressReportDto progressReport(UUID projectId, LocalDate from, LocalDate to) {
        Project p = projects.requireVisible(projectId);
        LocalDate end = to == null ? DocNumberService.today() : to;
        LocalDate start = from == null ? end.minusDays(6) : from;
        if (end.isBefore(start)) {
            throw ApiException.badRequest("invalid_dates", "ช่วงวันที่ไม่ถูกต้อง");
        }
        if (start.plusDays(366).isBefore(end)) {
            throw ApiException.badRequest("range_too_long", "เลือกช่วงได้ไม่เกิน 1 ปี");
        }
        List<DailyReport> reports = DailyReport.list("projectId = ?1 and reportDate between ?2 and ?3 and status <> 'draft' order by reportDate",
                p.id, start, end);
        Map<UUID, String> names = UserNames.of(reports.stream().map(x -> x.createdBy).toList());
        Map<UUID, Long> photoCounts = dailyReports.photoCounts("daily_report", reports.stream().map(x -> x.id).toList());
        List<SiteDtos.DailyReportRow> rows = reports.stream().map(x -> new SiteDtos.DailyReportRow(x.id, x.reportDate,
                x.status, x.weatherAm, x.weatherPm, x.workersTotal, x.workDone, photoCounts.getOrDefault(x.id, 0L),
                names.get(x.createdBy), x.submittedAt)).toList();
        int manDays = reports.stream().mapToInt(x -> x.workersTotal).sum();
        int rain = (int) reports.stream().filter(x -> "rain".equals(x.weatherAm) || "rain".equals(x.weatherPm)
                || "storm".equals(x.weatherAm) || "storm".equals(x.weatherPm)).count();
        String next = reports.isEmpty() ? null : reports.get(reports.size() - 1).workPlanned;
        StringBuilder work = new StringBuilder();
        for (DailyReport r : reports) {
            if (r.workDone != null) {
                work.append(r.reportDate).append(": ").append(r.workDone.trim()).append('\n');
            }
        }
        List<IssueDto> open = issues(p.id, null).stream()
                .filter(i -> "open".equals(i.status()) || "in_progress".equals(i.status())).toList();
        List<PhotoRef> photos = new ArrayList<>();
        if (!reports.isEmpty()) {
            Map<UUID, LocalDate> dates = new java.util.HashMap<>();
            reports.forEach(r -> dates.put(r.id, r.reportDate));
            @SuppressWarnings("unchecked")
            List<Object[]> att = em.createNativeQuery("""
                            select id, file_name, owner_id from attachments
                            where owner_type = 'daily_report' and owner_id in (:ids) and deleted_at is null
                              and lower(mime) like 'image/%'
                            order by created_at limit 24""").setParameter("ids", dates.keySet()).getResultList();
            for (Object[] a : att) {
                photos.add(new PhotoRef(SqlValues.uuid(a[0]), (String) a[1], dates.get(SqlValues.uuid(a[2])), null));
            }
        }
        com.ktt.project.ProjectDtos.ScheduleDto schedule = projects.schedule(p.id);
        return new ProgressReportDto(projects.get(p.id), schedule, start, end, rows, work.toString().trim(), next,
                manDays, rain, open, photos);
    }

    private void requireOwnerOrPm(UUID createdBy) {
        if (!currentUser.can(Perm.PROJECT_WRITE) && (createdBy == null || !createdBy.equals(currentUser.id()))) {
            throw ApiException.forbidden("forbidden", "ลบได้เฉพาะรายการของตนเอง");
        }
    }
}
