package com.ktt.lead;

import com.ktt.attachment.Attachment;
import com.ktt.audit.AuditService;
import com.ktt.auth.User;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.customer.Customer;
import com.ktt.lead.LeadDtos.ActivityDto;
import com.ktt.lead.LeadDtos.ActivityRequest;
import com.ktt.lead.LeadDtos.LeadDetail;
import com.ktt.lead.LeadDtos.LeadRequest;
import com.ktt.lead.LeadDtos.LeadRow;
import com.ktt.lead.LeadDtos.PipelineSummary;
import com.ktt.lead.LeadDtos.StatusRequest;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * FR-02 Lead pipeline. ผู้ที่ไม่มีสิทธิ์ lead.read_all เห็นเฉพาะลีดที่ตนรับผิดชอบหรือสร้างเอง
 */
@ApplicationScoped
public class LeadService {

    static final Map<String, String> STATUS_LABEL = Map.of(
            "new", "ลีดใหม่", "site_visit", "นัดดูไซต์", "estimating", "ประเมินราคา", "quoted", "เสนอราคาแล้ว",
            "negotiating", "ต่อรอง", "won", "ได้งาน", "lost", "ไม่ได้งาน");

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    // ---------------------------------------------------------------- query

    @Transactional
    public PageResult<LeadRow> list(String q, String status, UUID ownerId, UUID customerId, String sort, int page, int size) {
        Parameters p = new Parameters();
        String where = buildWhere(q, status, ownerId, customerId, p);
        Sort s = switch (sort == null ? "" : sort) {
            case "followup" -> Sort.ascending("nextFollowupAt");
            case "created" -> Sort.descending("createdAt");
            default -> Sort.descending("updatedAt");
        };
        PanacheQuery<Lead> query = Lead.find(where, s, p);
        long total = query.count();
        List<LeadRow> items = query.page(Page.of(page, size)).list().stream().map(l -> toRow((Lead) l)).toList();
        return new PageResult<>(items, total, page, size);
    }

    /** Kanban: ลีดที่ยังเปิดอยู่ทั้งหมด + ได้/ไม่ได้งานภายใน 60 วันล่าสุด */
    @Transactional
    public List<LeadRow> board(String q, UUID ownerId) {
        Parameters p = new Parameters();
        String where = buildWhere(q, null, ownerId, null, p)
                + " and (status not in ('won', 'lost') or updatedAt >= :recent)";
        p.and("recent", Instant.now().minus(60, ChronoUnit.DAYS));
        List<Lead> leads = Lead.find(where, Sort.descending("updatedAt"), p).page(Page.ofSize(1000)).list();
        return leads.stream().map(LeadService::toRow).toList();
    }

    @Transactional
    public List<PipelineSummary> summary() {
        Parameters p = new Parameters();
        String where = buildWhere(null, null, null, null, p);
        List<Lead> leads = Lead.list(where, p);
        Map<String, long[]> counts = new LinkedHashMap<>();
        Map<String, BigDecimal> budgets = new HashMap<>();
        for (String st : Lead.STATUSES) {
            counts.put(st, new long[]{0});
            budgets.put(st, BigDecimal.ZERO);
        }
        for (Lead l : leads) {
            counts.get(l.status)[0]++;
            if (l.budgetEst != null) {
                budgets.put(l.status, budgets.get(l.status).add(l.budgetEst));
            }
        }
        List<PipelineSummary> out = new ArrayList<>();
        counts.forEach((st, c) -> out.add(new PipelineSummary(st, c[0], budgets.get(st))));
        return out;
    }

    @Transactional
    public LeadDetail get(UUID id) {
        Lead l = requireVisible(id);
        List<LeadActivity> acts = LeadActivity.listFor(id);
        Map<UUID, String> names = userNames(acts.stream().map(a -> a.createdBy).filter(java.util.Objects::nonNull).toList());
        List<ActivityDto> activities = acts.stream()
                .map(a -> new ActivityDto(a.id, a.type, a.note, a.occurredAt, a.createdBy, names.get(a.createdBy)))
                .toList();
        return new LeadDetail(toRow(l), l.lostReason, activities, Attachment.countFor("lead", id));
    }

    // ---------------------------------------------------------------- commands

    @Transactional
    public LeadRow create(LeadRequest req) {
        Lead l = new Lead();
        apply(l, req);
        if (l.owner == null) {
            l.owner = User.findById(currentUser.id());
        }
        l.createdBy = currentUser.id();
        l.persist();
        audit.log("lead", l.id, AuditService.ACTION_CREATE, null, auditView(l));
        return toRow(l);
    }

    @Transactional
    public LeadRow update(UUID id, LeadRequest req) {
        Lead l = requireVisible(id);
        Map<String, Object> before = auditView(l);
        apply(l, req);
        var d = audit.diff(before, auditView(l));
        audit.log("lead", l.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toRow(l);
    }

    @Transactional
    public LeadRow changeStatus(UUID id, StatusRequest req) {
        Lead l = requireVisible(id);
        if (req.status().equals(l.status)) {
            return toRow(l);
        }
        if ("lost".equals(req.status()) && (req.lostReason() == null || req.lostReason().isBlank())) {
            throw ApiException.badRequest("lost_reason_required", "กรุณาระบุเหตุผลที่ไม่ได้งาน");
        }
        String from = l.status;
        l.status = req.status();
        l.lostReason = "lost".equals(req.status()) ? req.lostReason().trim() : null;
        LeadActivity a = new LeadActivity();
        a.leadId = l.id;
        a.type = "status_change";
        a.note = STATUS_LABEL.get(from) + " → " + STATUS_LABEL.get(l.status)
                + (l.lostReason != null ? " (" + l.lostReason + ")" : "");
        a.occurredAt = Instant.now();
        a.createdBy = currentUser.id();
        a.persist();
        audit.log("lead", l.id, AuditService.ACTION_UPDATE, Map.of("status", from), Map.of("status", l.status));
        return toRow(l);
    }

    /** ใช้จากโมดูลใบเสนอราคา: ส่งใบเสนอราคาแล้วเลื่อนลีดเป็น quoted อัตโนมัติ (ถ้ายังอยู่ช่วงก่อนหน้า) */
    @Transactional(Transactional.TxType.MANDATORY)
    public void advanceTo(UUID leadId, String status, String note) {
        Lead l = Lead.findById(leadId);
        if (l == null || Lead.STATUSES.indexOf(l.status) >= Lead.STATUSES.indexOf(status) || "lost".equals(l.status)) {
            return;
        }
        String from = l.status;
        l.status = status;
        LeadActivity a = new LeadActivity();
        a.leadId = l.id;
        a.type = "status_change";
        a.note = STATUS_LABEL.get(from) + " → " + STATUS_LABEL.get(status) + (note == null ? "" : " (" + note + ")");
        a.occurredAt = Instant.now();
        a.createdBy = currentUser.id();
        a.persist();
    }

    @Transactional
    public void delete(UUID id) {
        Lead l = requireVisible(id);
        if (!currentUser.can(Perm.LEAD_DELETE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ลบลีด");
        }
        Number q = (Number) Lead.getEntityManager()
                .createNativeQuery("select count(*) from quotations where lead_id = ?1 and deleted_at is null")
                .setParameter(1, id).getSingleResult();
        if (q.longValue() > 0) {
            throw ApiException.conflict("lead_in_use", "ลีดนี้มีใบเสนอราคาแล้ว ลบไม่ได้ ให้เปลี่ยนสถานะเป็นไม่ได้งานแทน");
        }
        Map<String, Object> before = auditView(l);
        l.softDelete();
        audit.log("lead", l.id, AuditService.ACTION_DELETE, before, null);
    }

    @Transactional
    public ActivityDto addActivity(UUID leadId, ActivityRequest req) {
        Lead l = requireVisible(leadId);
        LeadActivity a = new LeadActivity();
        a.leadId = l.id;
        a.type = req.type();
        a.note = req.note().trim();
        a.occurredAt = req.occurredAt() == null ? Instant.now() : req.occurredAt();
        a.createdBy = currentUser.id();
        a.persist();
        l.updatedAt = Instant.now();
        return new ActivityDto(a.id, a.type, a.note, a.occurredAt, a.createdBy, userNames(List.of(a.createdBy)).get(a.createdBy));
    }

    @Transactional
    public void deleteActivity(UUID leadId, UUID activityId) {
        requireVisible(leadId);
        LeadActivity a = LeadActivity.findById(activityId);
        if (a == null || !a.leadId.equals(leadId) || "status_change".equals(a.type)) {
            throw ApiException.notFound("ไม่พบกิจกรรม");
        }
        if (!currentUser.id().equals(a.createdBy) && !currentUser.can(Perm.LEAD_READ_ALL)) {
            throw ApiException.forbidden("forbidden", "ลบได้เฉพาะกิจกรรมที่คุณบันทึกเอง");
        }
        a.softDelete();
    }

    // ---------------------------------------------------------------- access

    /** โยน 404 ถ้าไม่พบหรือไม่มีสิทธิ์เห็น (ไม่บอกว่ามีอยู่) */
    @Transactional(Transactional.TxType.MANDATORY)
    public Lead requireVisible(UUID id) {
        Lead l = Lead.findById(id);
        if (l == null || !canSee(l)) {
            throw ApiException.notFound("ไม่พบลีด");
        }
        return l;
    }

    public boolean canSee(Lead l) {
        if (currentUser.can(Perm.LEAD_READ_ALL)) {
            return true;
        }
        UUID me = currentUser.id();
        return me != null && (me.equals(l.createdBy) || (l.owner != null && me.equals(l.owner.id)));
    }

    private String buildWhere(String q, String status, UUID ownerId, UUID customerId, Parameters p) {
        StringBuilder w = new StringBuilder("1 = 1");
        if (!currentUser.can(Perm.LEAD_READ_ALL)) {
            w.append(" and (owner.id = :me or createdBy = :me)");
            p.and("me", currentUser.id());
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(title) like :q or lower(customer.name) like :q or lower(siteAddress) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (status != null && !status.isBlank()) {
            w.append(" and status = :status");
            p.and("status", status);
        }
        if (ownerId != null) {
            w.append(" and owner.id = :owner");
            p.and("owner", ownerId);
        }
        if (customerId != null) {
            w.append(" and customer.id = :customer");
            p.and("customer", customerId);
        }
        return w.toString();
    }

    private void apply(Lead l, LeadRequest req) {
        Customer c = Customer.findById(req.customerId());
        if (c == null) {
            throw ApiException.badRequest("invalid_customer", "ไม่พบลูกค้าที่เลือก");
        }
        l.customer = c;
        l.title = req.title().trim();
        l.jobType = req.jobType();
        l.siteAddress = blankToNull(req.siteAddress());
        l.budgetEst = req.budgetEst();
        l.nextFollowupAt = req.nextFollowupAt();
        if (req.ownerId() != null) {
            User owner = User.findById(req.ownerId());
            if (owner == null || !owner.active) {
                throw ApiException.badRequest("invalid_owner", "ไม่พบผู้รับผิดชอบที่เลือก");
            }
            l.owner = owner;
        }
    }

    static LeadRow toRow(Lead l) {
        return new LeadRow(l.id, l.title, l.jobType, l.status, l.customer.id, l.customer.name, l.customer.phone,
                l.owner == null ? null : l.owner.id, l.owner == null ? null : l.owner.name, l.budgetEst,
                l.nextFollowupAt, l.siteAddress, l.createdAt, l.updatedAt);
    }

    private static Map<String, Object> auditView(Lead l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("customer", l.customer == null ? null : l.customer.name);
        m.put("title", l.title);
        m.put("jobType", l.jobType);
        m.put("siteAddress", l.siteAddress);
        m.put("budgetEst", l.budgetEst);
        m.put("owner", l.owner == null ? null : l.owner.name);
        m.put("nextFollowupAt", l.nextFollowupAt == null ? null : l.nextFollowupAt.toString());
        return m;
    }

    static Map<UUID, String> userNames(List<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        Set<UUID> unique = new java.util.HashSet<>(ids);
        unique.remove(null);
        if (unique.isEmpty()) {
            return out;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = Lead.getEntityManager().createNativeQuery("select id, name from users where id in (:ids)")
                .setParameter("ids", unique).getResultList();
        for (Object[] r : rows) {
            out.put((UUID) r[0], (String) r[1]);
        }
        return out;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
