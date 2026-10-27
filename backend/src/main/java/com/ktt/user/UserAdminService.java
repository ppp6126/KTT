package com.ktt.user;

import com.ktt.audit.AuditService;
import com.ktt.auth.MfaService;
import com.ktt.auth.PasswordHasher;
import com.ktt.auth.PasswordPolicy;
import com.ktt.auth.Role;
import com.ktt.auth.SessionService;
import com.ktt.auth.User;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.common.Tokens;
import com.ktt.security.CurrentUser;
import com.ktt.user.UserDtos.CreateUserRequest;
import com.ktt.user.UserDtos.CreatedUser;
import com.ktt.user.UserDtos.UpdateUserRequest;
import com.ktt.user.UserDtos.UserRow;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class UserAdminService {

    private static final String TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    @Inject
    PasswordHasher hasher;

    @Inject
    SessionService sessions;

    @Inject
    MfaService mfa;

    @Inject
    AuditService audit;

    @Inject
    CurrentUser currentUser;

    @Transactional
    public PageResult<UserRow> list(String q, UUID roleId, Boolean active, int page, int size) {
        StringBuilder where = new StringBuilder("1 = 1");
        Parameters params = new Parameters();
        if (q != null && !q.isBlank()) {
            where.append(" and (lower(name) like :q or lower(email) like :q)");
            params.and("q", "%" + q.trim().toLowerCase() + "%");
        }
        if (roleId != null) {
            where.append(" and role.id = :roleId");
            params.and("roleId", roleId);
        }
        if (active != null) {
            where.append(" and active = :active");
            params.and("active", active);
        }
        PanacheQuery<User> query = User.find(where.toString(), Sort.by("name"), params);
        long total = query.count();
        var items = query.page(Page.of(page, size)).list().stream().map(UserAdminService::toRow).toList();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public UserRow get(UUID id) {
        return toRow(require(id));
    }

    @Transactional
    public CreatedUser create(CreateUserRequest req) {
        String email = req.email().trim().toLowerCase();
        if (User.findByEmail(email) != null) {
            throw ApiException.conflict("email_taken", "อีเมลนี้มีผู้ใช้แล้ว");
        }
        Role role = requireRole(req.roleId());
        String temp = blankToNull(req.temporaryPassword());
        if (temp == null) {
            temp = randomTempPassword();
        } else {
            PasswordPolicy.check(temp, email);
        }
        User u = new User();
        u.email = email;
        u.name = req.name().trim();
        u.phone = blankToNull(req.phone());
        u.role = role;
        u.active = true;
        u.passwordHash = hasher.hash(temp);
        u.mustChangePassword = true;
        u.createdBy = currentUser.id();
        u.persist();
        UserRow row = toRow(u);
        audit.log("user", u.id, AuditService.ACTION_CREATE, null, auditView(u));
        return new CreatedUser(row, temp);
    }

    @Transactional
    public UserRow update(UUID id, UpdateUserRequest req) {
        User u = require(id);
        Map<String, Object> before = auditView(u);
        Role newRole = requireRole(req.roleId());
        boolean roleChanged = !u.role.id.equals(newRole.id);
        boolean deactivated = u.active && !req.active();

        if (u.id.equals(currentUser.id()) && (roleChanged || deactivated)) {
            throw ApiException.badRequest("cannot_modify_self", "ไม่สามารถเปลี่ยนบทบาทหรือปิดบัญชีของตัวเองได้");
        }
        if (Role.OWNER.equals(u.role.code) && u.active && (roleChanged || deactivated) && User.countActiveOwners() <= 1) {
            throw ApiException.badRequest("last_owner", "ต้องมีผู้ใช้บทบาทเจ้าของ/ผู้บริหารที่ใช้งานอยู่อย่างน้อย 1 คน");
        }

        u.name = req.name().trim();
        u.phone = blankToNull(req.phone());
        u.role = newRole;
        u.active = req.active();

        if (deactivated) {
            sessions.revokeAll(u.id, SessionService.REVOKE_USER_DISABLED, null);
        } else if (roleChanged) {
            sessions.revokeAll(u.id, SessionService.REVOKE_ROLE_CHANGED, null);
        }
        var d = audit.diff(before, auditView(u));
        audit.log("user", u.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toRow(u);
    }

    @Transactional
    public String resetPassword(UUID id, String temporaryPassword) {
        User u = require(id);
        String temp = blankToNull(temporaryPassword);
        if (temp == null) {
            temp = randomTempPassword();
        } else {
            PasswordPolicy.check(temp, u.email);
        }
        u.passwordHash = hasher.hash(temp);
        u.passwordChangedAt = Instant.now();
        u.mustChangePassword = true;
        u.failedLoginCount = 0;
        u.lockedUntil = null;
        sessions.revokeAll(u.id, SessionService.REVOKE_BY_ADMIN, null);
        audit.log("user", u.id, AuditService.ACTION_PASSWORD_RESET, null, Map.of("via", "admin"));
        return temp;
    }

    @Transactional
    public void resetMfa(UUID id) {
        User u = require(id);
        mfa.clear(u);
        sessions.revokeAll(u.id, SessionService.REVOKE_BY_ADMIN, null);
        audit.log("user", u.id, AuditService.ACTION_MFA_DISABLED, null, Map.of("via", "admin"));
    }

    @Transactional
    public void unlock(UUID id) {
        User u = require(id);
        u.lockedUntil = null;
        u.failedLoginCount = 0;
        audit.log("user", u.id, AuditService.ACTION_UPDATE, null, Map.of("unlocked", true));
    }

    @Transactional
    public void revokeSessions(UUID id) {
        User u = require(id);
        int n = sessions.revokeAll(u.id, SessionService.REVOKE_BY_ADMIN, null);
        audit.log("user", u.id, AuditService.ACTION_SESSION_REVOKED, null, Map.of("count", n, "via", "admin"));
    }

    @Transactional
    public void delete(UUID id) {
        User u = require(id);
        if (u.id.equals(currentUser.id())) {
            throw ApiException.badRequest("cannot_modify_self", "ไม่สามารถลบบัญชีของตัวเองได้");
        }
        if (Role.OWNER.equals(u.role.code) && u.active && User.countActiveOwners() <= 1) {
            throw ApiException.badRequest("last_owner", "ต้องมีผู้ใช้บทบาทเจ้าของ/ผู้บริหารที่ใช้งานอยู่อย่างน้อย 1 คน");
        }
        Map<String, Object> before = auditView(u);
        sessions.revokeAll(u.id, SessionService.REVOKE_USER_DISABLED, null);
        u.active = false;
        u.softDelete();
        audit.log("user", u.id, AuditService.ACTION_DELETE, before, null);
    }

    static UserRow toRow(User u) {
        return new UserRow(u.id, u.email, u.name, u.phone, u.role.id, u.role.code, u.role.name, u.active,
                u.mfaEnabled, u.isLocked(Instant.now()), u.mustChangePassword, u.lastLoginAt, u.createdAt);
    }

    /** ข้อมูลที่บันทึกใน audit (ห้ามใส่ password_hash / totp_secret) */
    private static Map<String, Object> auditView(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("email", u.email);
        m.put("name", u.name);
        m.put("phone", u.phone);
        m.put("role", u.role.code);
        m.put("active", u.active);
        return m;
    }

    private static User require(UUID id) {
        User u = User.findById(id);
        if (u == null) {
            throw ApiException.notFound("ไม่พบผู้ใช้");
        }
        return u;
    }

    private static Role requireRole(UUID id) {
        Role r = Role.findById(id);
        if (r == null) {
            throw ApiException.badRequest("invalid_role", "ไม่พบบทบาทที่เลือก");
        }
        return r;
    }

    private static String randomTempPassword() {
        var rnd = Tokens.secureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            sb.append(TEMP_ALPHABET.charAt(rnd.nextInt(TEMP_ALPHABET.length())));
        }
        // รับประกันว่ามีตัวเลขและตัวอักษร
        sb.setCharAt(rnd.nextInt(6), (char) ('2' + rnd.nextInt(8)));
        sb.setCharAt(6 + rnd.nextInt(6), (char) ('a' + rnd.nextInt(26)));
        return sb.toString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
