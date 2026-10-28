package com.ktt.permit;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.SqlValues;
import com.ktt.common.UserNames;
import com.ktt.docnum.DocNumberService;
import com.ktt.notification.NotificationService;
import com.ktt.permit.PermitDtos.PermitDto;
import com.ktt.permit.PermitDtos.RenewRequest;
import com.ktt.permit.PermitDtos.SaveRequest;
import com.ktt.project.Project;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import io.quarkus.panache.common.Parameters;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** ใบอนุญาตและเอกสารที่มีวันหมดอายุ: แจ้งเตือนก่อนหมดอายุ และต่ออายุโดยเก็บประวัติฉบับเดิม */
@ApplicationScoped
public class PermitService {

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    @Inject
    NotificationService notifications;

    @Inject
    EntityManager em;

    private void requireRead() {
        if (!currentUser.can(Perm.PERMIT_READ) && !currentUser.can(Perm.PERMIT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์ดูใบอนุญาต");
        }
    }

    private void requireWrite() {
        if (!currentUser.can(Perm.PERMIT_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขใบอนุญาต");
        }
    }

    /**
     * filter: all / soon (ใกล้หมดอายุ) / expired / history (ต่ออายุแล้วหรือยกเลิก)
     */
    @Transactional
    public List<PermitDto> list(String filter, UUID projectId, String kind, String q) {
        requireRead();
        StringBuilder w = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if ("history".equals(filter)) {
            w.append(" and status in ('renewed', 'cancelled')");
        } else {
            w.append(" and status in ('active', 'renewing')");
        }
        if (projectId != null) {
            w.append(" and projectId = :pid");
            p.and("pid", projectId);
        }
        if (kind != null && !kind.isBlank()) {
            w.append(" and kind = :kind");
            p.and("kind", kind);
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(name) like :q or lower(number) like :q or lower(issuer) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        w.append(" order by expiryDate asc nulls last, name");
        List<Permit> rows = Permit.list(w.toString(), p);
        LocalDate today = DocNumberService.today();
        if ("soon".equals(filter) || "expired".equals(filter)) {
            rows = rows.stream().filter(r -> filter.equals(ExpiryRules.state(r.expiryDate, r.notifyDays, today))).toList();
        }
        return toDtos(rows);
    }

    @Transactional
    public PermitDto get(UUID id) {
        requireRead();
        return toDtos(List.of(find(id))).get(0);
    }

    private Permit find(UUID id) {
        Permit p = id == null ? null : Permit.findById(id);
        if (p == null) {
            throw ApiException.notFound("ไม่พบเอกสาร");
        }
        return p;
    }

    @Transactional
    public PermitDto save(UUID id, SaveRequest req) {
        requireWrite();
        Permit p = id == null ? new Permit() : find(id);
        if (id != null && !Set.of("active", "renewing").contains(p.status)) {
            throw ApiException.conflict("not_editable", "เอกสารที่ต่ออายุหรือยกเลิกแล้วแก้ไขไม่ได้");
        }
        if (req.projectId() != null && Project.findById(req.projectId()) == null) {
            throw ApiException.badRequest("invalid_project", "ไม่พบโครงการ");
        }
        if (req.issueDate() != null && req.expiryDate() != null && req.expiryDate().isBefore(req.issueDate())) {
            throw ApiException.badRequest("invalid_dates", "วันหมดอายุต้องไม่ก่อนวันออกเอกสาร");
        }
        boolean expiryChanged = id == null || !java.util.Objects.equals(p.expiryDate, req.expiryDate());
        p.kind = req.kind();
        p.name = req.name().trim();
        p.number = UserNames.blankToNull(req.number());
        p.issuer = UserNames.blankToNull(req.issuer());
        p.projectId = req.projectId();
        p.issueDate = req.issueDate();
        p.expiryDate = req.expiryDate();
        p.notifyDays = req.notifyDays();
        p.ownerId = req.ownerId();
        p.notes = UserNames.blankToNull(req.notes());
        if (expiryChanged) {
            p.lastNotifiedOn = null;
        }
        if (p.id == null) {
            p.createdBy = currentUser.id();
            p.persist();
        }
        audit.log("permit", p.id, id == null ? AuditService.ACTION_CREATE : AuditService.ACTION_UPDATE, null,
                Map.of("name", p.name, "expiry", String.valueOf(p.expiryDate)));
        return get(p.id);
    }

    /** ต่ออายุ: สร้างฉบับใหม่ (ย้ายไฟล์แนบไม่ได้ ให้แนบฉบับใหม่) ฉบับเดิมเปลี่ยนเป็น renewed */
    @Transactional
    public PermitDto renew(UUID id, RenewRequest req) {
        requireWrite();
        Permit old = find(id);
        if (!Set.of("active", "renewing").contains(old.status)) {
            throw ApiException.conflict("not_active", "เอกสารนี้ต่ออายุไปแล้วหรือถูกยกเลิก");
        }
        if (req.expiryDate() == null || (old.expiryDate != null && !req.expiryDate().isAfter(old.expiryDate))) {
            throw ApiException.badRequest("invalid_expiry", "วันหมดอายุใหม่ต้องหลังวันหมดอายุเดิม");
        }
        if (req.issueDate() != null && req.expiryDate().isBefore(req.issueDate())) {
            throw ApiException.badRequest("invalid_dates", "วันหมดอายุต้องไม่ก่อนวันออกเอกสาร");
        }
        Permit n = new Permit();
        n.kind = old.kind;
        n.name = old.name;
        n.number = req.number() == null || req.number().isBlank() ? old.number : req.number().trim();
        n.issuer = old.issuer;
        n.projectId = old.projectId;
        n.issueDate = req.issueDate() != null ? req.issueDate() : DocNumberService.today();
        n.expiryDate = req.expiryDate();
        n.notifyDays = old.notifyDays;
        n.ownerId = old.ownerId;
        n.notes = UserNames.blankToNull(req.notes()) != null ? req.notes().trim() : old.notes;
        n.renewedFromId = old.id;
        n.createdBy = currentUser.id();
        n.persist();
        old.status = "renewed";
        audit.log("permit", old.id, AuditService.ACTION_UPDATE, Map.of("status", "active", "expiry", String.valueOf(old.expiryDate)),
                Map.of("status", "renewed", "renewedTo", n.id.toString(), "expiry", String.valueOf(n.expiryDate)));
        return get(n.id);
    }

    @Transactional
    public PermitDto setStatus(UUID id, String status) {
        requireWrite();
        Permit p = find(id);
        if (!Set.of("active", "renewing").contains(p.status)) {
            throw ApiException.conflict("not_active", "เปลี่ยนสถานะเอกสารนี้ไม่ได้");
        }
        String before = p.status;
        p.status = status;
        audit.log("permit", p.id, AuditService.ACTION_UPDATE, Map.of("status", before), Map.of("status", status));
        return get(p.id);
    }

    @Transactional
    public void delete(UUID id) {
        requireWrite();
        Permit p = find(id);
        p.softDelete();
        audit.log("permit", p.id, AuditService.ACTION_DELETE, Map.of("name", p.name), null);
    }

    /** งานประจำวัน: แจ้งผู้รับผิดชอบ (หรือผู้มีสิทธิ์ permit.write ถ้าไม่ระบุ) ตามกติกา ExpiryRules */
    @Transactional
    public int notifyExpiring() {
        LocalDate today = DocNumberService.today();
        List<Permit> rows = Permit.list("status in ('active', 'renewing') and expiryDate is not null and expiryDate <= :lim",
                Parameters.with("lim", today.plusDays(365)));
        List<UUID> writers = null;
        int sent = 0;
        for (Permit p : rows) {
            if (!ExpiryRules.shouldNotify(p.expiryDate, p.notifyDays, p.lastNotifiedOn, today)) {
                continue;
            }
            long left = ExpiryRules.daysLeft(p.expiryDate, today);
            String title = left < 0 ? "หมดอายุแล้ว " + (-left) + " วัน: " + p.name
                    : left == 0 ? "หมดอายุวันนี้: " + p.name : "อีก " + left + " วันหมดอายุ: " + p.name;
            Set<UUID> to = new LinkedHashSet<>();
            if (p.ownerId != null) {
                to.add(p.ownerId);
            } else {
                if (writers == null) {
                    writers = notifications.usersWithPermission(Perm.PERMIT_WRITE);
                }
                to.addAll(writers);
            }
            notifications.notifyAll(to, "permit_expiry", title, p.number == null ? "" : "เลขที่ " + p.number, "/permits", "permit", p.id);
            p.lastNotifiedOn = today;
            sent++;
        }
        return sent;
    }

    // ================================================================= mapping

    @SuppressWarnings("unchecked")
    private List<PermitDto> toDtos(List<Permit> rows) {
        Set<UUID> users = new HashSet<>();
        Set<UUID> pids = new HashSet<>();
        Set<UUID> ids = new HashSet<>();
        rows.forEach(r -> {
            if (r.ownerId != null) users.add(r.ownerId);
            if (r.projectId != null) pids.add(r.projectId);
            ids.add(r.id);
        });
        Map<UUID, String> names = UserNames.of(users);
        Map<UUID, String[]> projects = new HashMap<>();
        if (!pids.isEmpty()) {
            for (Project pr : Project.<Project>list("id in ?1", pids)) {
                projects.put(pr.id, new String[]{pr.code, pr.name});
            }
        }
        Map<UUID, Integer> files = new HashMap<>();
        if (!ids.isEmpty()) {
            List<Object[]> fc = em.createNativeQuery("""
                            select owner_id, count(*) from attachments where owner_type = 'permit' and deleted_at is null
                            and owner_id in (:ids) group by owner_id""").setParameter("ids", ids).getResultList();
            fc.forEach(r -> files.put(SqlValues.uuid(r[0]), (int) SqlValues.count(r[1])));
        }
        LocalDate today = DocNumberService.today();
        return rows.stream().map(r -> {
            String[] pr = projects.get(r.projectId);
            String state = Set.of("renewed", "cancelled").contains(r.status) ? r.status : ExpiryRules.state(r.expiryDate, r.notifyDays, today);
            return new PermitDto(r.id, r.kind, r.name, r.number, r.issuer, r.projectId, pr == null ? null : pr[0], pr == null ? null : pr[1],
                    r.issueDate, r.expiryDate, r.notifyDays, ExpiryRules.daysLeft(r.expiryDate, today), state, r.ownerId,
                    names.get(r.ownerId), r.status, r.renewedFromId, r.notes, files.getOrDefault(r.id, 0), r.updatedAt);
        }).toList();
    }
}
