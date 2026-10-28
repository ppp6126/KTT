package com.ktt.aftercare;

import com.ktt.aftercare.AftercareDtos.ActionRequest;
import com.ktt.aftercare.AftercareDtos.ManagerScore;
import com.ktt.aftercare.AftercareDtos.ProjectScore;
import com.ktt.aftercare.AftercareDtos.ResolveRequest;
import com.ktt.aftercare.AftercareDtos.ScheduleRequest;
import com.ktt.aftercare.AftercareDtos.SurveyDto;
import com.ktt.aftercare.AftercareDtos.SurveyRequest;
import com.ktt.aftercare.AftercareDtos.SurveySummary;
import com.ktt.aftercare.AftercareDtos.TicketDto;
import com.ktt.aftercare.AftercareDtos.TicketLog;
import com.ktt.aftercare.AftercareDtos.TicketRequest;
import com.ktt.aftercare.AftercareDtos.TicketRow;
import com.ktt.aftercare.AftercareDtos.TicketStats;
import com.ktt.aftercare.AftercareDtos.WarrantyRow;
import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.Money;
import com.ktt.common.PageResult;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.customer.Customer;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import com.ktt.settings.AppSettings;
import io.quarkus.panache.common.Parameters;
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
 * งานหลังส่งมอบ: รับประกันผลงาน แจ้งซ่อม และความพึงพอใจ
 * สถานะแจ้งซ่อม: open → scheduled → in_progress → resolved → closed (หรือ rejected) เปิดใหม่ได้จาก resolved/closed/rejected
 */
@ApplicationScoped
public class AftercareService {

    static final Set<String> ACTIVE = Set.of("open", "scheduled", "in_progress");

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
    AppSettings settings;

    @Inject
    EntityManager em;

    private void requireRead() {
        if (!currentUser.can(Perm.SERVICE_READ) && !currentUser.can(Perm.SERVICE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูงานแจ้งซ่อม");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.SERVICE_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์บันทึกงานแจ้งซ่อม");
        }
    }

    // ================================================================= warranty

    /** วันสิ้นสุดรับประกันของโครงการ (null = ยังไม่ส่งมอบ) */
    public LocalDate warrantyEnd(Project p) {
        Number months = (Number) em.createNativeQuery("""
                        select warranty_months from contracts where project_id = ?1 and deleted_at is null
                        order by created_at desc limit 1""").setParameter(1, p.id).getResultStream().findFirst().orElse(null);
        return WarrantyRules.warrantyEnd(p.warrantyUntil, p.actualEnd, months == null ? null : months.intValue(),
                settings.getInt("service.default_warranty_months", 12));
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public List<WarrantyRow> warranties(String state) {
        requireRead();
        int def = settings.getInt("service.default_warranty_months", 12);
        List<Object[]> rows = em.createNativeQuery("""
                select p.id, p.code, p.name, c.name, p.actual_end, k.warranty_months, p.warranty_until,
                       (select count(*) from service_tickets t where t.project_id = p.id and t.deleted_at is null and t.status in ('open', 'scheduled', 'in_progress')),
                       (select count(*) from service_tickets t where t.project_id = p.id and t.deleted_at is null),
                       (select coalesce(sum(t.labor_cost + t.material_cost), 0) from service_tickets t where t.project_id = p.id and t.deleted_at is null and t.in_warranty)
                from projects p
                join customers c on c.id = p.customer_id
                left join lateral (select warranty_months from contracts where project_id = p.id and deleted_at is null order by created_at desc limit 1) k on true
                where p.deleted_at is null and (p.status = 'completed' or p.actual_end is not null or p.warranty_until is not null)
                order by p.actual_end desc nulls last""").getResultList();
        LocalDate today = DocNumberService.today();
        List<WarrantyRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            LocalDate handover = SqlValues.date(r[4]);
            Integer months = r[5] == null ? null : ((Number) r[5]).intValue();
            LocalDate override = SqlValues.date(r[6]);
            LocalDate end = WarrantyRules.warrantyEnd(override, handover, months, def);
            String st = WarrantyRules.state(end, today);
            if (state != null && !state.isBlank() && !state.equals(st)) {
                continue;
            }
            out.add(new WarrantyRow(SqlValues.uuid(r[0]), (String) r[1], (String) r[2], (String) r[3], handover, months, end,
                    override != null, st, end == null ? null : ChronoUnit.DAYS.between(today, end), SqlValues.count(r[7]),
                    SqlValues.count(r[8]), SqlValues.decimal0(r[9])));
        }
        return out;
    }

    @Transactional
    public void setWarrantyUntil(UUID projectId, LocalDate until) {
        requireWrite();
        Project p = Project.findById(projectId);
        if (p == null) {
            throw ApiException.notFound("ไม่พบโครงการ");
        }
        LocalDate before = p.warrantyUntil;
        p.warrantyUntil = until;
        audit.log("project", p.id, AuditService.ACTION_UPDATE, Map.of("warrantyUntil", String.valueOf(before)), Map.of("warrantyUntil", String.valueOf(until)));
    }

    // ================================================================= tickets

    @Transactional
    public PageResult<TicketRow> list(String status, UUID projectId, String q, int page, int size) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if ("active".equals(status)) {
            w.append(" and status in ('open', 'scheduled', 'in_progress')");
        } else if (status != null && !status.isBlank()) {
            w.append(" and status = :st");
            p.and("st", status);
        }
        if (projectId != null) {
            w.append(" and projectId = :pid");
            p.and("pid", projectId);
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(docNo) like :q or lower(title) like :q or lower(reporterName) like :q or customerId in (select c.id from Customer c where lower(c.name) like :q))");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        var query = ServiceTicket.<ServiceTicket>find(w + " order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end, reportedAt desc", p);
        long total = query.count();
        List<ServiceTicket> rows = query.page(page, size).list();
        return new PageResult<>(toRows(rows), total, page, size);
    }

    private List<TicketRow> toRows(List<ServiceTicket> rows) {
        Map<UUID, String> custs = customerNames(rows.stream().map(t -> t.customerId).toList());
        Map<UUID, String> codes = projectCodes(rows.stream().map(t -> t.projectId).toList());
        Map<UUID, String> users = UserNames.of(rows.stream().map(t -> t.assigneeId).filter(java.util.Objects::nonNull).toList());
        Instant now = Instant.now();
        return rows.stream().map(t -> new TicketRow(t.id, t.docNo, t.title, t.category, t.priority, t.status, t.projectId,
                codes.get(t.projectId), custs.get(t.customerId), t.inWarranty, t.reportedAt, t.appointmentAt,
                users.get(t.assigneeId), ChronoUnit.DAYS.between(t.reportedAt, ACTIVE.contains(t.status) ? now : (t.resolvedAt != null ? t.resolvedAt : now)))).toList();
    }

    @Transactional
    public TicketDto get(UUID id) {
        requireRead();
        return toDto(find(id));
    }

    private ServiceTicket find(UUID id) {
        ServiceTicket t = id == null ? null : ServiceTicket.findById(id);
        if (t == null) {
            throw ApiException.notFound("ไม่พบงานแจ้งซ่อม");
        }
        return t;
    }

    @Transactional
    public TicketDto create(TicketRequest req) {
        requireWrite();
        ServiceTicket t = new ServiceTicket();
        apply(t, req);
        t.reportedAt = req.reportedAt() != null ? req.reportedAt() : Instant.now();
        if (t.reportedAt.isAfter(Instant.now().plusSeconds(300))) {
            throw ApiException.badRequest("future_date", "วันเวลาที่แจ้งต้องไม่เป็นอนาคต");
        }
        t.inWarranty = computeWarranty(t);
        t.docNo = docNumbers.next(projects.prefix("service_ticket", "SR"), DocNumberService.today());
        t.createdBy = currentUser.id();
        t.persist();
        log(t, "open", "รับแจ้ง" + (t.inWarranty ? " (อยู่ในระยะรับประกัน)" : " (นอกระยะรับประกัน)"));
        audit.log("service_ticket", t.id, AuditService.ACTION_CREATE, null, Map.of("docNo", t.docNo, "title", t.title));
        if ("urgent".equals(t.priority) || "high".equals(t.priority)) {
            notifications.notifyAll(notifications.usersWithPermission(Perm.SERVICE_WRITE), "service_ticket",
                    ("urgent".equals(t.priority) ? "แจ้งซ่อมด่วน " : "แจ้งซ่อม ") + t.docNo + ": " + t.title,
                    customerName(t.customerId), "/service/tickets/" + t.id, "service_ticket", t.id);
        }
        return toDto(t);
    }

    @Transactional
    public TicketDto update(UUID id, TicketRequest req) {
        requireWrite();
        ServiceTicket t = find(id);
        if (!ACTIVE.contains(t.status)) {
            throw ApiException.conflict("not_editable", "งานที่แก้ไขเสร็จหรือปิดแล้วแก้ไขรายละเอียดไม่ได้ ให้เปิดงานใหม่ก่อน");
        }
        apply(t, req);
        if (req.reportedAt() != null) {
            t.reportedAt = req.reportedAt();
        }
        t.inWarranty = computeWarranty(t);
        audit.log("service_ticket", t.id, AuditService.ACTION_UPDATE, null, Map.of("title", t.title));
        return toDto(t);
    }

    private void apply(ServiceTicket t, TicketRequest req) {
        UUID customerId = req.customerId();
        if (req.projectId() != null) {
            Project p = Project.findById(req.projectId());
            if (p == null) {
                throw ApiException.badRequest("invalid_project", "ไม่พบโครงการ");
            }
            customerId = p.customerId;
            if (req.siteAddress() == null || req.siteAddress().isBlank()) {
                t.siteAddress = p.siteAddress;
            }
        }
        if (customerId == null || Customer.findById(customerId) == null) {
            throw ApiException.badRequest("invalid_customer", "กรุณาเลือกลูกค้าหรือโครงการ");
        }
        t.projectId = req.projectId();
        t.customerId = customerId;
        t.title = req.title().trim();
        t.description = UserNames.blankToNull(req.description());
        t.category = req.category();
        t.priority = req.priority();
        t.channel = req.channel();
        t.reporterName = UserNames.blankToNull(req.reporterName());
        t.reporterPhone = UserNames.blankToNull(req.reporterPhone());
        if (req.siteAddress() != null && !req.siteAddress().isBlank()) {
            t.siteAddress = req.siteAddress().trim();
        }
    }

    private boolean computeWarranty(ServiceTicket t) {
        if (t.projectId == null) {
            return false;
        }
        Project p = Project.findById(t.projectId);
        LocalDate reported = t.reportedAt.atZone(DocNumberService.BANGKOK).toLocalDate();
        return WarrantyRules.inWarranty(reported, warrantyEnd(p));
    }

    @Transactional
    public TicketDto schedule(UUID id, ScheduleRequest req) {
        requireWrite();
        ServiceTicket t = find(id);
        if (!ACTIVE.contains(t.status)) {
            throw ApiException.conflict("invalid_status", "นัดหมายได้เฉพาะงานที่ยังไม่เสร็จ");
        }
        if (req.appointmentAt() == null && req.assigneeId() == null) {
            throw ApiException.badRequest("missing", "กรุณาระบุผู้รับผิดชอบหรือวันนัด");
        }
        UUID before = t.assigneeId;
        t.assigneeId = req.assigneeId();
        t.appointmentAt = req.appointmentAt();
        if ("open".equals(t.status) && t.appointmentAt != null) {
            t.status = "scheduled";
        }
        String who = t.assigneeId == null ? "" : " ช่าง " + UserNames.one(t.assigneeId);
        log(t, t.status, "นัดหมาย" + who + (UserNames.blankToNull(req.note()) == null ? "" : " — " + req.note().trim()));
        if (t.assigneeId != null && !t.assigneeId.equals(before)) {
            notifications.notify(t.assigneeId, "service_ticket", "มอบหมายงานซ่อม " + t.docNo + ": " + t.title,
                    customerName(t.customerId), "/service/tickets/" + t.id, "service_ticket", t.id);
        }
        audit.log("service_ticket", t.id, AuditService.ACTION_UPDATE, null, Map.of("assignee", String.valueOf(t.assigneeId), "appointment", String.valueOf(t.appointmentAt)));
        return toDto(t);
    }

    @Transactional
    public TicketDto resolve(UUID id, ResolveRequest req) {
        requireWrite();
        ServiceTicket t = find(id);
        if (!ACTIVE.contains(t.status)) {
            throw ApiException.conflict("invalid_status", "งานนี้ไม่ได้อยู่ระหว่างดำเนินการ");
        }
        t.resolution = req.resolution().trim();
        t.laborCost = Money.round2(req.laborCost());
        t.materialCost = Money.round2(req.materialCost());
        t.chargeAmount = t.inWarranty ? BigDecimal.ZERO : Money.round2(req.chargeAmount());
        t.status = "resolved";
        t.resolvedAt = Instant.now();
        log(t, "resolved", t.resolution);
        audit.log("service_ticket", t.id, AuditService.ACTION_UPDATE, null, Map.of("status", "resolved"));
        return toDto(t);
    }

    @Transactional
    public TicketDto action(UUID id, ActionRequest req) {
        requireWrite();
        ServiceTicket t = find(id);
        String note = UserNames.blankToNull(req.note());
        switch (req.action()) {
            case "start" -> {
                if (!Set.of("open", "scheduled").contains(t.status)) {
                    throw ApiException.conflict("invalid_status", "เริ่มงานได้เฉพาะงานที่รอดำเนินการ");
                }
                t.status = "in_progress";
                log(t, t.status, note == null ? "เริ่มซ่อม" : note);
            }
            case "close" -> {
                if (!"resolved".equals(t.status)) {
                    throw ApiException.conflict("invalid_status", "ปิดงานได้หลังบันทึกแก้ไขเสร็จ");
                }
                t.status = "closed";
                t.closedAt = Instant.now();
                log(t, t.status, note == null ? "ลูกค้ายืนยัน ปิดงาน" : note);
            }
            case "reject" -> {
                if (!ACTIVE.contains(t.status)) {
                    throw ApiException.conflict("invalid_status", "ปฏิเสธได้เฉพาะงานที่ยังไม่เสร็จ");
                }
                if (note == null) {
                    throw ApiException.badRequest("reason_required", "กรุณาระบุเหตุผล");
                }
                t.status = "rejected";
                t.closedAt = Instant.now();
                log(t, t.status, note);
            }
            case "reopen" -> {
                if (ACTIVE.contains(t.status)) {
                    throw ApiException.conflict("invalid_status", "งานยังเปิดอยู่");
                }
                if (note == null) {
                    throw ApiException.badRequest("reason_required", "กรุณาระบุเหตุผลที่เปิดงานใหม่");
                }
                t.status = "open";
                t.resolvedAt = null;
                t.closedAt = null;
                log(t, t.status, "เปิดงานใหม่: " + note);
            }
            default -> {
                if (note == null) {
                    throw ApiException.badRequest("note_required", "กรุณากรอกบันทึก");
                }
                log(t, null, note);
            }
        }
        audit.log("service_ticket", t.id, AuditService.ACTION_UPDATE, null, Map.of("action", req.action()));
        return toDto(t);
    }

    @Transactional
    public void delete(UUID id) {
        requireWrite();
        ServiceTicket t = find(id);
        if (!"open".equals(t.status)) {
            throw ApiException.conflict("not_deletable", "ลบได้เฉพาะงานที่ยังไม่ดำเนินการ (ใช้ปฏิเสธแทน)");
        }
        t.softDelete();
        audit.log("service_ticket", t.id, AuditService.ACTION_DELETE, Map.of("docNo", t.docNo), null);
    }

    @Transactional
    public TicketStats stats() {
        requireRead();
        Object[] r = (Object[]) em.createNativeQuery("""
                select count(*) filter (where status = 'open'),
                       count(*) filter (where status = 'scheduled'),
                       count(*) filter (where status = 'in_progress'),
                       count(*) filter (where status in ('open', 'scheduled', 'in_progress') and priority = 'urgent'),
                       count(*) filter (where status in ('open', 'scheduled') and appointment_at < now()),
                       round(avg(extract(epoch from resolved_at - reported_at) / 86400) filter (where resolved_at is not null and resolved_at > now() - interval '180 days')::numeric, 1),
                       coalesce(sum(labor_cost + material_cost) filter (where in_warranty and coalesce(resolved_at, reported_at) >= date_trunc('year', now())), 0)
                from service_tickets where deleted_at is null""").getSingleResult();
        return new TicketStats(SqlValues.count(r[0]), SqlValues.count(r[1]), SqlValues.count(r[2]), SqlValues.count(r[3]),
                SqlValues.count(r[4]), SqlValues.decimal(r[5]), SqlValues.decimal0(r[6]));
    }

    private void log(ServiceTicket t, String status, String note) {
        em.createNativeQuery("insert into service_ticket_logs (ticket_id, status, note, created_by) values (?1, ?2, ?3, ?4)")
                .setParameter(1, t.id).setParameter(2, status).setParameter(3, note).setParameter(4, currentUser.id())
                .executeUpdate();
    }

    @SuppressWarnings("unchecked")
    private TicketDto toDto(ServiceTicket t) {
        Customer c = Customer.findById(t.customerId);
        Project p = t.projectId == null ? null : Project.findById(t.projectId);
        List<Object[]> logs = em.createNativeQuery("""
                        select created_at, status, note, created_by from service_ticket_logs where ticket_id = ?1 order by created_at""")
                .setParameter(1, t.id).getResultList();
        Set<UUID> uids = new HashSet<>();
        logs.forEach(l -> {
            if (l[3] != null) uids.add(SqlValues.uuid(l[3]));
        });
        if (t.assigneeId != null) uids.add(t.assigneeId);
        if (t.createdBy != null) uids.add(t.createdBy);
        Map<UUID, String> names = UserNames.of(uids);
        List<TicketLog> tl = logs.stream().map(l -> new TicketLog(SqlValues.instant(l[0]), (String) l[1], (String) l[2],
                names.get(SqlValues.uuid(l[3])))).toList();
        List<SurveyDto> surveys = toSurveyDtos(Survey.list("ticketId = ?1 order by surveyDate desc", t.id));
        return new TicketDto(t.id, t.docNo, t.projectId, p == null ? null : p.code, p == null ? null : p.name, t.customerId,
                c == null ? null : c.name, c == null ? null : c.phone, t.title, t.description, t.category, t.priority, t.channel,
                t.reporterName, t.reporterPhone, t.siteAddress, t.reportedAt, t.inWarranty, p == null ? null : warrantyEnd(p),
                t.status, t.assigneeId, names.get(t.assigneeId), t.appointmentAt, t.resolvedAt, t.closedAt, t.resolution,
                t.laborCost, t.materialCost, t.chargeAmount, tl, surveys, names.get(t.createdBy), t.createdAt);
    }

    // ================================================================= surveys

    @Transactional
    public List<SurveyDto> surveys(UUID projectId, LocalDate from, LocalDate to) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (projectId != null) {
            w.append(" and projectId = :pid");
            p.and("pid", projectId);
        }
        if (from != null) {
            w.append(" and surveyDate >= :from");
            p.and("from", from);
        }
        if (to != null) {
            w.append(" and surveyDate <= :to");
            p.and("to", to);
        }
        return toSurveyDtos(Survey.list(w + " order by surveyDate desc, createdAt desc", p));
    }

    @Transactional
    public SurveyDto createSurvey(SurveyRequest req) {
        requireWrite();
        Survey s = new Survey();
        UUID customerId = req.customerId();
        if (req.ticketId() != null) {
            ServiceTicket t = find(req.ticketId());
            customerId = t.customerId;
            s.ticketId = t.id;
            s.projectId = t.projectId;
        }
        if (req.projectId() != null) {
            Project p = Project.findById(req.projectId());
            if (p == null) {
                throw ApiException.badRequest("invalid_project", "ไม่พบโครงการ");
            }
            s.projectId = p.id;
            customerId = customerId == null ? p.customerId : customerId;
        }
        if (customerId == null || Customer.findById(customerId) == null) {
            throw ApiException.badRequest("invalid_customer", "กรุณาเลือกลูกค้า โครงการ หรืองานแจ้งซ่อม");
        }
        if (req.surveyDate().isAfter(DocNumberService.today())) {
            throw ApiException.badRequest("future_date", "วันที่สอบถามต้องไม่เป็นอนาคต");
        }
        s.customerId = customerId;
        s.surveyDate = req.surveyDate();
        s.method = req.method();
        s.respondent = UserNames.blankToNull(req.respondent());
        s.quality = req.quality();
        s.timeliness = req.timeliness();
        s.communication = req.communication();
        s.cleanliness = req.cleanliness();
        s.overall = req.overall();
        s.recommend = req.recommend();
        s.comment = UserNames.blankToNull(req.comment());
        s.createdBy = currentUser.id();
        s.persist();
        audit.log("satisfaction_survey", s.id, AuditService.ACTION_CREATE, null, Map.of("overall", s.overall));
        if (s.overall <= 2) {
            notifications.notifyAll(notifications.usersWithPermission(Perm.DASHBOARD_VIEW), "low_satisfaction",
                    "ลูกค้าให้คะแนนพึงพอใจต่ำ (" + s.overall + "/5): " + customerName(customerId),
                    s.comment == null ? "" : s.comment, "/service/satisfaction", "satisfaction_survey", s.id);
        }
        return toSurveyDtos(List.of(s)).get(0);
    }

    @Transactional
    public void deleteSurvey(UUID id) {
        requireWrite();
        Survey s = Survey.findById(id);
        if (s == null) {
            throw ApiException.notFound("ไม่พบแบบสอบถาม");
        }
        s.softDelete();
        audit.log("satisfaction_survey", s.id, AuditService.ACTION_DELETE, null, null);
    }

    @Transactional
    public SurveySummary summary(LocalDate from, LocalDate to) {
        requireRead();
        List<Survey> rows = Survey.list("surveyDate >= ?1 and surveyDate <= ?2", from, to);
        Map<UUID, List<Survey>> byProject = new LinkedHashMap<>();
        rows.stream().filter(s -> s.projectId != null).forEach(s -> byProject.computeIfAbsent(s.projectId, k -> new ArrayList<>()).add(s));
        Map<UUID, Project> pmap = new HashMap<>();
        if (!byProject.isEmpty()) {
            Project.<Project>list("id in ?1", byProject.keySet()).forEach(p -> pmap.put(p.id, p));
        }
        List<ProjectScore> ps = new ArrayList<>();
        Map<UUID, List<Integer>> byMgr = new LinkedHashMap<>();
        byProject.forEach((pid, list) -> {
            Project p = pmap.get(pid);
            List<Integer> scores = list.stream().map(s -> s.overall).toList();
            ps.add(new ProjectScore(pid, p == null ? null : p.code, p == null ? null : p.name, list.size(), WarrantyRules.average(scores)));
            if (p != null && p.managerId != null) {
                byMgr.computeIfAbsent(p.managerId, k -> new ArrayList<>()).addAll(scores);
            }
        });
        ps.sort((a, b) -> a.overall() == null ? 1 : b.overall() == null ? -1 : a.overall().compareTo(b.overall()));
        Map<UUID, String> mnames = UserNames.of(byMgr.keySet());
        List<ManagerScore> ms = byMgr.entrySet().stream()
                .map(e -> new ManagerScore(e.getKey(), mnames.get(e.getKey()), e.getValue().size(), WarrantyRules.average(e.getValue())))
                .sorted((a, b) -> b.overall().compareTo(a.overall())).toList();
        return new SurveySummary(rows.size(),
                WarrantyRules.average(rows.stream().map(s -> (Integer) s.overall).toList()),
                WarrantyRules.average(rows.stream().map(s -> s.quality).toList()),
                WarrantyRules.average(rows.stream().map(s -> s.timeliness).toList()),
                WarrantyRules.average(rows.stream().map(s -> s.communication).toList()),
                WarrantyRules.average(rows.stream().map(s -> s.cleanliness).toList()),
                WarrantyRules.recommendPct(rows.stream().map(s -> s.recommend).toList()), ps, ms);
    }

    private List<SurveyDto> toSurveyDtos(List<Survey> rows) {
        Map<UUID, String> custs = customerNames(rows.stream().map(s -> s.customerId).toList());
        Map<UUID, String> codes = projectCodes(rows.stream().map(s -> s.projectId).toList());
        Map<UUID, String> users = UserNames.of(rows.stream().map(s -> s.createdBy).filter(java.util.Objects::nonNull).toList());
        Map<UUID, String> tickets = new HashMap<>();
        List<UUID> tids = rows.stream().map(s -> s.ticketId).filter(java.util.Objects::nonNull).toList();
        if (!tids.isEmpty()) {
            ServiceTicket.<ServiceTicket>list("id in ?1", tids).forEach(t -> tickets.put(t.id, t.docNo));
        }
        return rows.stream().map(s -> new SurveyDto(s.id, s.customerId, custs.get(s.customerId), s.projectId, codes.get(s.projectId),
                s.ticketId, tickets.get(s.ticketId), s.surveyDate, s.method, s.respondent, s.quality, s.timeliness, s.communication,
                s.cleanliness, s.overall, s.recommend, s.comment, users.get(s.createdBy))).toList();
    }

    // ================================================================= helpers

    private String customerName(UUID id) {
        Customer c = id == null ? null : Customer.findById(id);
        return c == null ? "" : c.name;
    }

    private Map<UUID, String> customerNames(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        List<UUID> list = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (!list.isEmpty()) {
            Customer.<Customer>list("id in ?1", list).forEach(c -> out.put(c.id, c.name));
        }
        return out;
    }

    private Map<UUID, String> projectCodes(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        List<UUID> list = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (!list.isEmpty()) {
            Project.<Project>list("id in ?1", list).forEach(p -> out.put(p.id, p.code));
        }
        return out;
    }
}
