package com.ktt.calendar;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.project.Project;
import com.ktt.project.ProjectService;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * ปฏิทินรวม: นัดหมายที่บันทึกเอง + วันสำคัญที่ดึงจากทุกโมดูล (ตามสิทธิ์ของผู้ใช้)
 * แหล่ง: แผนโครงการ/หมุดหมาย, ติดตามลีด, ใบเสนอราคาหมดอายุ, งวดงานครบกำหนด, ลูกหนี้/เจ้าหนี้ครบกำหนด,
 * PO กำหนดส่ง, ใบอนุญาตหมดอายุ, นัดซ่อม
 */
@ApplicationScoped
public class CalendarService {

    public record Item(String id, String source, String kind, String title, String subtitle, LocalDate date, Instant startsAt,
                       Instant endsAt, boolean allDay, String link, String projectCode, BigDecimal amount, boolean editable) {
    }

    public record EventRequest(@NotBlank(message = "กรุณากรอกหัวข้อ") @Size(max = 255) String title,
                               @NotBlank @Pattern(regexp = "meeting|site_visit|inspection|delivery|handover|other") String kind,
                               @NotNull Instant startsAt, Instant endsAt, boolean allDay, @Size(max = 255) String location,
                               UUID projectId, boolean isPrivate, @Size(max = 5000) String notes) {
    }

    public record EventDto(UUID id, String title, String kind, Instant startsAt, Instant endsAt, boolean allDay, String location,
                           UUID projectId, String projectCode, boolean isPrivate, String notes, UUID createdBy, String createdByName,
                           boolean editable) {
    }

    @Inject
    CurrentUser currentUser;

    @Inject
    ProjectService projects;

    @Inject
    AuditService audit;

    @Inject
    EntityManager em;

    @Transactional
    public List<Item> items(LocalDate from, LocalDate to, String sources) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 120) {
            throw ApiException.badRequest("invalid_range", "ช่วงวันที่ต้องไม่เกิน 120 วัน");
        }
        String src = sources == null || sources.isBlank() ? "all" : sources;
        List<Item> out = new ArrayList<>();
        UUID me = currentUser.id();
        Instant fromI = from.atStartOfDay(DocNumberService.BANGKOK).toInstant();
        Instant toI = to.plusDays(1).atStartOfDay(DocNumberService.BANGKOK).toInstant();

        if (want(src, "event")) {
            List<CalendarEvent> ev = CalendarEvent.list("startsAt < ?1 and coalesce(endsAt, startsAt) >= ?2 and (isPrivate = false or createdBy = ?3) order by startsAt",
                    toI, fromI, me);
            if (!currentUser.can(Perm.PROJECT_READ_ALL)) {
                // นัดหมายที่ผูกกับโครงการ แสดงเฉพาะโครงการที่ผู้ใช้เห็น (หรือที่ตัวเองสร้าง)
                java.util.Set<UUID> vis = new java.util.HashSet<>(projects.visibleProjectIds());
                ev = ev.stream().filter(e -> e.projectId == null || vis.contains(e.projectId) || me.equals(e.createdBy)).toList();
            }
            Map<UUID, String> codes = projectCodes(ev.stream().map(e -> e.projectId).toList());
            for (CalendarEvent e : ev) {
                out.add(new Item("ev:" + e.id, "event", e.kind, e.title, e.location, e.startsAt.atZone(DocNumberService.BANGKOK).toLocalDate(),
                        e.startsAt, e.endsAt, e.allDay, null, codes.get(e.projectId), null, canEdit(e)));
            }
        }
        boolean seeProjects = currentUser.can(Perm.PROJECT_READ) || currentUser.can(Perm.PROJECT_READ_ALL);
        String projScope = currentUser.can(Perm.PROJECT_READ_ALL) ? "" : " and p.id in (:vis)";
        if (want(src, "project") && seeProjects) {
            rows("""
                    select 'ps:' || p.id, 'project_start', 'เริ่มโครงการ ' || p.name, p.code, p.planned_start, '/projects/' || p.id, p.code, null::numeric
                    from projects p where p.deleted_at is null and p.status in ('planning', 'active') and p.planned_start between :f and :t""" + projScope + """
                     union all
                    select 'pe:' || p.id, 'project_end', 'กำหนดเสร็จ ' || p.name, p.code, p.planned_end, '/projects/' || p.id, p.code, null
                    from projects p where p.deleted_at is null and p.status in ('planning', 'active', 'on_hold') and p.planned_end between :f and :t""" + projScope + """
                     union all
                    select 'tm:' || k.id, 'milestone', k.name, p.name, k.planned_end, '/projects/' || p.id || '/schedule', p.code, null
                    from project_tasks k join projects p on p.id = k.project_id
                    where k.is_milestone and coalesce(k.progress_pct, 0) < 100 and p.deleted_at is null and k.planned_end between :f and :t""" + projScope,
                    from, to, true, out, "project");
        }
        if (want(src, "sales") && (currentUser.can(Perm.LEAD_READ) || currentUser.can(Perm.LEAD_READ_ALL))) {
            String scope = currentUser.can(Perm.LEAD_READ_ALL) ? "" : " and (l.owner_id = :me or l.created_by = :me)";
            Query q = em.createNativeQuery("""
                    select 'ld:' || l.id, l.title, c.name, l.next_followup_at, '/leads/' || l.id from leads l join customers c on c.id = l.customer_id
                    where l.deleted_at is null and l.status not in ('won', 'lost') and l.next_followup_at >= :fi and l.next_followup_at < :ti""" + scope)
                    .setParameter("fi", fromI).setParameter("ti", toI);
            if (!scope.isEmpty()) {
                q.setParameter("me", me);
            }
            for (Object o : q.getResultList()) {
                Object[] r = (Object[]) o;
                Instant at = SqlValues.instant(r[3]);
                out.add(new Item((String) r[0], "sales", "lead_followup", "ติดตาม: " + r[1], (String) r[2],
                        at.atZone(DocNumberService.BANGKOK).toLocalDate(), at, null, false, (String) r[4], null, null, false));
            }
        }
        if (want(src, "sales") && currentUser.can(Perm.QUOTATION_READ)) {
            rows("""
                    select 'qe:' || q.id, 'quotation_expiry', 'ใบเสนอราคาหมดอายุ ' || q.doc_no, c.name, q.valid_until, '/quotations/' || q.id, null, q.total_amount
                    from quotations q join customers c on c.id = q.customer_id
                    where q.deleted_at is null and q.status in ('sent', 'viewed') and q.valid_until between :f and :t""" + (currentUser.can(Perm.LEAD_READ_ALL) ? "" : """
                     and (q.created_by = :me or q.lead_id in (select l.id from leads l where l.owner_id = :me or l.created_by = :me))"""),
                    from, to, false, out, "sales", currentUser.can(Perm.LEAD_READ_ALL) ? Map.of() : Map.of("me", me));
        }
        if (want(src, "finance") && (currentUser.can(Perm.FINANCE_READ) || currentUser.can(Perm.CONTRACT_READ))) {
            rows("""
                    select 'cm:' || m.id, 'milestone_due', 'งวดงาน ' || m.name, p.code || ' ' || p.name, m.due_date, '/projects/' || p.id || '/contract', p.code, m.amount
                    from contract_milestones m join contracts k on k.id = m.contract_id join projects p on p.id = k.project_id
                    where m.status in ('pending', 'ready') and k.deleted_at is null and m.due_date between :f and :t""" + projScope,
                    from, to, true, out, "finance");
        }
        if (want(src, "finance") && currentUser.can(Perm.FINANCE_READ)) {
            rows("""
                    select 'ar:' || d.id, 'receivable_due', 'ลูกหนี้ครบกำหนด ' || d.doc_no, d.customer_name, d.due_date, '/finance/docs/' || d.id, null, d.net_amount - d.settled_amount
                    from sales_docs d where d.deleted_at is null and d.doc_type in ('invoice', 'invoice_tax') and d.status in ('issued', 'partial')
                    and d.due_date between :f and :t""" + (currentUser.can(Perm.PROJECT_READ_ALL) ? "" : " and (d.project_id is null or d.project_id in (:vis))"),
                    from, to, true, out, "finance");
        }
        if (want(src, "finance") && currentUser.can(Perm.AP_READ)) {
            rows("""
                    select 'ap:' || b.id, 'payable_due', 'จ่ายเจ้าหนี้ ' || b.doc_no, s.name, b.due_date, '/ap/bills/' || b.id, null, b.net_payable - b.paid_amount
                    from ap_bills b join suppliers s on s.id = b.supplier_id where b.deleted_at is null and b.status in ('approved', 'partial')
                    and b.due_date between :f and :t""", from, to, false, out, "finance");
        }
        if (want(src, "purchase") && currentUser.can(Perm.PURCHASE_READ)) {
            rows("""
                    select 'po:' || o.id, 'po_delivery', 'ของเข้า ' || o.doc_no, o.supplier_name, o.delivery_date, '/purchase/orders/' || o.id, null, o.total_amount
                    from purchase_orders o where o.deleted_at is null and o.status in ('approved', 'partial') and o.delivery_date between :f and :t""",
                    from, to, false, out, "purchase");
        }
        if (want(src, "permit") && (currentUser.can(Perm.PERMIT_READ) || currentUser.can(Perm.PERMIT_WRITE))) {
            rows("""
                    select 'pm:' || x.id, 'permit_expiry', 'หมดอายุ: ' || x.name, x.number, x.expiry_date, '/permits', null, null
                    from permits x where x.deleted_at is null and x.status in ('active', 'renewing') and x.expiry_date between :f and :t""",
                    from, to, false, out, "permit");
        }
        if (want(src, "service") && (currentUser.can(Perm.SERVICE_READ) || currentUser.can(Perm.SERVICE_WRITE))) {
            @SuppressWarnings("unchecked")
            List<Object[]> r = em.createNativeQuery("""
                    select t.id, t.doc_no, t.title, c.name, t.appointment_at from service_tickets t join customers c on c.id = t.customer_id
                    where t.deleted_at is null and t.status in ('open', 'scheduled', 'in_progress') and t.appointment_at >= :fi and t.appointment_at < :ti""")
                    .setParameter("fi", fromI).setParameter("ti", toI).getResultList();
            for (Object[] x : r) {
                Instant at = SqlValues.instant(x[4]);
                out.add(new Item("sr:" + x[0], "service", "service_visit", "นัดซ่อม " + x[1] + ": " + x[2], (String) x[3],
                        at.atZone(DocNumberService.BANGKOK).toLocalDate(), at, null, false, "/service/tickets/" + x[0], null, null, false));
            }
        }
        out.sort(Comparator.comparing(Item::date).thenComparing(i -> i.startsAt() == null ? Instant.MIN : i.startsAt()));
        return out;
    }

    private static boolean want(String sources, String s) {
        return "all".equals(sources) || List.of(sources.split(",")).contains(s);
    }

    /** คอลัมน์: id, kind, title, subtitle, date, link, projectCode, amount */
    @SuppressWarnings("unchecked")
    private void rows(String sql, LocalDate from, LocalDate to, boolean scoped, List<Item> out, String source) {
        rows(sql, from, to, scoped, out, source, Map.of());
    }

    @SuppressWarnings("unchecked")
    private void rows(String sql, LocalDate from, LocalDate to, boolean scoped, List<Item> out, String source, Map<String, Object> extra) {
        Query q = em.createNativeQuery(sql).setParameter("f", from).setParameter("t", to);
        extra.forEach(q::setParameter);
        if (scoped && !currentUser.can(Perm.PROJECT_READ_ALL) && sql.contains(":vis")) {
            q.setParameter("vis", projects.visibleProjectIds());
        }
        for (Object o : q.getResultList()) {
            Object[] r = (Object[]) o;
            out.add(new Item((String) r[0], source, (String) r[1], (String) r[2], (String) r[3], SqlValues.date(r[4]), null, null,
                    true, (String) r[5], (String) r[6], SqlValues.decimal(r[7]), false));
        }
    }

    // ================================================================= events

    private boolean canEdit(CalendarEvent e) {
        return currentUser.id() != null && (currentUser.id().equals(e.createdBy) || currentUser.can(Perm.SETTINGS_MANAGE));
    }

    private CalendarEvent find(UUID id) {
        CalendarEvent e = id == null ? null : CalendarEvent.findById(id);
        if (e == null || (e.isPrivate && !currentUser.id().equals(e.createdBy))) {
            throw ApiException.notFound("ไม่พบนัดหมาย");
        }
        return e;
    }

    @Transactional
    public EventDto get(UUID id) {
        return toDto(find(id));
    }

    @Transactional
    public EventDto save(UUID id, EventRequest req) {
        CalendarEvent e = id == null ? new CalendarEvent() : find(id);
        if (id != null && !canEdit(e)) {
            throw ApiException.forbidden("forbidden", "แก้ไขได้เฉพาะนัดหมายที่ตัวเองสร้าง");
        }
        if (req.endsAt() != null && req.endsAt().isBefore(req.startsAt())) {
            throw ApiException.badRequest("invalid_range", "เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม");
        }
        if (req.projectId() != null) {
            projects.requireVisible(req.projectId());
        }
        e.title = req.title().trim();
        e.kind = req.kind();
        e.startsAt = req.startsAt();
        e.endsAt = req.endsAt();
        e.allDay = req.allDay();
        e.location = UserNames.blankToNull(req.location());
        e.projectId = req.projectId();
        e.isPrivate = req.isPrivate();
        e.notes = UserNames.blankToNull(req.notes());
        if (e.id == null) {
            e.createdBy = currentUser.id();
            e.persist();
        }
        audit.log("calendar_event", e.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null, Map.of("title", e.title));
        return toDto(e);
    }

    @Transactional
    public void delete(UUID id) {
        CalendarEvent e = find(id);
        if (!canEdit(e)) {
            throw ApiException.forbidden("forbidden", "ลบได้เฉพาะนัดหมายที่ตัวเองสร้าง");
        }
        e.softDelete();
        audit.log("calendar_event", e.id, AuditService.ACTION_DELETE, Map.of("title", e.title), null);
    }

    private EventDto toDto(CalendarEvent e) {
        Project p = e.projectId == null ? null : Project.findById(e.projectId);
        return new EventDto(e.id, e.title, e.kind, e.startsAt, e.endsAt, e.allDay, e.location, e.projectId, p == null ? null : p.code,
                e.isPrivate, e.notes, e.createdBy, UserNames.one(e.createdBy), canEdit(e));
    }

    private Map<UUID, String> projectCodes(List<UUID> ids) {
        Map<UUID, String> out = new java.util.HashMap<>();
        List<UUID> list = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (!list.isEmpty()) {
            Project.<Project>list("id in ?1", list).forEach(p -> out.put(p.id, p.code));
        }
        return out;
    }
}
