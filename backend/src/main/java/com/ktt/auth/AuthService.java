package com.ktt.auth;

import com.ktt.audit.AuditService;
import com.ktt.auth.AuthDtos.ChangePasswordRequest;
import com.ktt.auth.AuthDtos.LoginRequest;
import com.ktt.auth.AuthDtos.LoginResponse;
import com.ktt.auth.AuthDtos.Me;
import com.ktt.auth.AuthDtos.MfaVerifyRequest;
import com.ktt.auth.AuthDtos.ResetPasswordRequest;
import com.ktt.auth.AuthDtos.RoleRef;
import com.ktt.auth.AuthDtos.SessionInfo;
import com.ktt.common.ApiException;
import com.ktt.common.RequestInfo;
import com.ktt.common.Tokens;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * ขั้นตอนยืนยันตัวตนทั้งหมด. เมธอดที่ต้องบันทึกความล้มเหลว (นับรหัสผิด, ล็อกบัญชี) ใช้
 * {@code dontRollbackOn = ApiException.class} เพื่อให้ข้อมูลถูก commit แม้จะตอบ error กลับไป
 */
@ApplicationScoped
public class AuthService {

    private static final Logger LOG = Logger.getLogger(AuthService.class);

    @Inject
    AuthConfig config;

    @Inject
    PasswordHasher hasher;

    @Inject
    TokenService tokens;

    @Inject
    SessionService sessions;

    @Inject
    MfaService mfa;

    @Inject
    AuditService audit;

    @Inject
    LoginThrottle throttle;

    @Inject
    RequestInfo requestInfo;

    @Inject
    PasswordResetMailer resetMailer;

    /** body = สิ่งที่ส่งกลับใน JSON, refreshToken = ค่าที่ต้องใส่ cookie (null = ไม่ต้องตั้ง cookie) */
    public record AuthOutcome(LoginResponse body, String refreshToken, long refreshMaxAgeSeconds) {
    }

    // ------------------------------------------------------------------ login

    @Transactional(dontRollbackOn = ApiException.class)
    public AuthOutcome login(LoginRequest req) {
        throttle.hit("login", requestInfo.ip());
        Instant now = Instant.now();
        User user = User.findByEmail(req.email());

        if (user == null) {
            hasher.verifyDummy(req.password());
            audit.logAs(null, "user", null, AuditService.ACTION_LOGIN_FAILED, null,
                    Map.of("email", req.email(), "reason", "unknown_email"));
            throw invalidCredentials();
        }
        if (user.isLocked(now)) {
            audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOGIN_FAILED, null, Map.of("reason", "locked"));
            throw ApiException.locked("account_locked",
                    "บัญชีถูกล็อกชั่วคราวเนื่องจากใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ");
        }
        if (!hasher.verify(req.password(), user.passwordHash)) {
            registerFailure(user, now, "bad_password");
            throw invalidCredentials();
        }
        // ตรวจสถานะหลังรหัสผ่านถูก เพื่อไม่ให้คนนอกรู้ว่าบัญชีนี้มีอยู่
        if (!user.active) {
            audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOGIN_FAILED, null, Map.of("reason", "inactive"));
            throw ApiException.forbidden("account_disabled", "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
        }

        user.failedLoginCount = 0;
        user.lockedUntil = null;
        if (hasher.needsRehash(user.passwordHash)) {
            user.passwordHash = hasher.hash(req.password());
        }

        if (user.mfaEnabled) {
            String raw = Tokens.random(32);
            MfaChallenge c = new MfaChallenge();
            c.userId = user.id;
            c.tokenHash = Tokens.sha256Hex(raw);
            c.expiresAt = now.plus(config.mfaChallengeTtl());
            c.persist();
            return new AuthOutcome(LoginResponse.mfa(raw), null, 0);
        }
        return completeLogin(user, "password");
    }

    @Transactional(dontRollbackOn = ApiException.class)
    public AuthOutcome verifyMfa(MfaVerifyRequest req) {
        throttle.hit("mfa", requestInfo.ip());
        Instant now = Instant.now();
        MfaChallenge c = MfaChallenge.findByTokenHashForUpdate(Tokens.sha256Hex(req.mfaToken()));
        if (c == null || c.consumedAt != null || !c.expiresAt.isAfter(now) || c.attempts >= config.mfaMaxAttempts()) {
            if (c != null && c.consumedAt == null) {
                c.consumedAt = now;
            }
            throw ApiException.unauthorized("mfa_expired", "หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");
        }
        User user = User.findById(c.userId);
        if (user == null || !user.active || !user.mfaEnabled) {
            c.consumedAt = now;
            throw ApiException.unauthorized("mfa_expired", "หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");
        }
        if (!mfa.verifyCodeOrRecovery(user, req.code())) {
            c.attempts++;
            audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOGIN_FAILED, null, Map.of("reason", "bad_mfa_code"));
            int left = config.mfaMaxAttempts() - c.attempts;
            throw new ApiException(401, "invalid_mfa_code",
                    left > 0 ? "รหัสไม่ถูกต้อง (เหลืออีก " + left + " ครั้ง)" : "รหัสไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่",
                    Map.of("attemptsLeft", Math.max(left, 0)));
        }
        c.consumedAt = now;
        return completeLogin(user, "password+mfa");
    }

    private AuthOutcome completeLogin(User user, String method) {
        SessionService.NewSession ns = sessions.create(user);
        TokenService.AccessToken at = tokens.issue(user, ns.session().id);
        user.lastLoginAt = Instant.now();
        audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOGIN, null,
                Map.of("method", method, "sessionId", ns.session().id.toString()));
        return new AuthOutcome(
                LoginResponse.tokens(at.token(), at.expiresIn(), toMe(user, at.permissions(), at.restriction())),
                ns.refreshToken(),
                secondsUntil(ns.session().absoluteExpiresAt));
    }

    private void registerFailure(User user, Instant now, String reason) {
        user.failedLoginCount++;
        audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOGIN_FAILED, null,
                Map.of("reason", reason, "count", user.failedLoginCount));
        if (user.failedLoginCount >= config.maxFailedLogins()) {
            user.lockedUntil = now.plus(config.lockDuration());
            user.failedLoginCount = 0;
            audit.logAs(user.id, "user", user.id, AuditService.ACTION_LOCKED, null,
                    Map.of("until", user.lockedUntil.toString()));
        }
    }

    private static ApiException invalidCredentials() {
        return ApiException.unauthorized("invalid_credentials", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    // ------------------------------------------------------------------ refresh / logout

    @Transactional(dontRollbackOn = ApiException.class)
    public AuthOutcome refresh(String refreshToken) {
        SessionService.Rotated r = sessions.rotate(refreshToken);
        User user = User.findById(r.session().userId);
        if (user == null || !user.active) {
            sessions.revoke(r.session(), SessionService.REVOKE_USER_DISABLED);
            throw ApiException.unauthorized("session_expired", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
        }
        TokenService.AccessToken at = tokens.issue(user, r.session().id);
        return new AuthOutcome(
                LoginResponse.tokens(at.token(), at.expiresIn(), toMe(user, at.permissions(), at.restriction())),
                r.refreshToken(),
                secondsUntil(r.session().absoluteExpiresAt));
    }

    @Transactional
    public void logout(String refreshToken, UUID currentSessionId) {
        UserSession s = sessions.findByRefreshToken(refreshToken);
        if (s == null && currentSessionId != null) {
            s = UserSession.findById(currentSessionId);
        }
        if (s != null && s.revokedAt == null) {
            sessions.revoke(s, SessionService.REVOKE_LOGOUT);
            audit.logAs(s.userId, "user", s.userId, AuditService.ACTION_LOGOUT, null,
                    Map.of("sessionId", s.id.toString()));
        }
    }

    // ------------------------------------------------------------------ me

    @Transactional
    public Me me(UUID userId) {
        User user = User.findById(userId);
        if (user == null) {
            throw ApiException.unauthorized("unauthorized", "กรุณาเข้าสู่ระบบ");
        }
        return toMe(user, tokens.effectivePermissions(user), tokens.restrictionFor(user));
    }

    public Me toMe(User user, Set<String> permissions, String restriction) {
        long codesLeft = user.mfaEnabled ? MfaRecoveryCode.countUnused(user.id) : 0;
        return new Me(user.id, user.email, user.name, user.phone,
                new RoleRef(user.role.id, user.role.code, user.role.name),
                permissions, user.mfaEnabled, codesLeft, user.mustChangePassword, restriction, user.lastLoginAt);
    }

    /** ออก access token ใหม่ให้ session ปัจจุบัน (หลังเปลี่ยนรหัสผ่าน/เปิด 2FA ที่ทำให้ข้อจำกัดหายไป) */
    @Transactional
    public LoginResponse reissue(UUID userId, UUID sessionId) {
        User user = User.findById(userId);
        UserSession s = sessionId == null ? null : UserSession.findById(sessionId);
        if (user == null || s == null || !s.isActive(Instant.now())) {
            throw ApiException.unauthorized("session_expired", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
        }
        TokenService.AccessToken at = tokens.issue(user, s.id);
        return LoginResponse.tokens(at.token(), at.expiresIn(), toMe(user, at.permissions(), at.restriction()));
    }

    // ------------------------------------------------------------------ password

    @Transactional
    public void changePassword(UUID userId, UUID currentSessionId, ChangePasswordRequest req) {
        throttle.hit("password", requestInfo.ip());
        User user = User.findById(userId);
        if (user == null) {
            throw ApiException.unauthorized("unauthorized", "กรุณาเข้าสู่ระบบ");
        }
        if (!hasher.verify(req.currentPassword(), user.passwordHash)) {
            throw ApiException.badRequest("wrong_password", "รหัสผ่านปัจจุบันไม่ถูกต้อง");
        }
        if (req.currentPassword().equals(req.newPassword())) {
            throw ApiException.badRequest("same_password", "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
        }
        PasswordPolicy.check(req.newPassword(), user.email);
        setPassword(user, req.newPassword());
        sessions.revokeAll(user.id, SessionService.REVOKE_PASSWORD, currentSessionId);
        audit.log("user", user.id, AuditService.ACTION_PASSWORD_CHANGED, null, null);
    }

    /** ตอบสำเร็จเสมอไม่ว่าอีเมลจะมีในระบบหรือไม่ (กันการเดาอีเมล) */
    @Transactional
    public void forgotPassword(String email) {
        throttle.hit("forgot", requestInfo.ip());
        User user = User.findByEmail(email);
        if (user == null || !user.active) {
            LOG.debugf("Password reset requested for unknown/inactive email");
            return;
        }
        Instant now = Instant.now();
        // ยกเลิกลิงก์เก่าที่ยังไม่ได้ใช้
        PasswordResetToken.update("usedAt = ?1 where userId = ?2 and usedAt is null", now, user.id);
        String raw = Tokens.random(32);
        PasswordResetToken t = new PasswordResetToken();
        t.userId = user.id;
        t.tokenHash = Tokens.sha256Hex(raw);
        t.expiresAt = now.plus(config.passwordResetTtl());
        t.persist();
        resetMailer.send(user, raw, config.passwordResetTtl());
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest req) {
        throttle.hit("reset", requestInfo.ip());
        Instant now = Instant.now();
        PasswordResetToken t = PasswordResetToken.findByTokenHashForUpdate(Tokens.sha256Hex(req.token()));
        if (t == null || t.usedAt != null || !t.expiresAt.isAfter(now)) {
            throw ApiException.badRequest("invalid_reset_token", "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว");
        }
        User user = User.findById(t.userId);
        if (user == null || !user.active) {
            throw ApiException.badRequest("invalid_reset_token", "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว");
        }
        PasswordPolicy.check(req.newPassword(), user.email);
        setPassword(user, req.newPassword());
        user.failedLoginCount = 0;
        user.lockedUntil = null;
        t.usedAt = now;
        sessions.revokeAll(user.id, SessionService.REVOKE_PASSWORD, null);
        audit.logAs(user.id, "user", user.id, AuditService.ACTION_PASSWORD_RESET, null, Map.of("via", "email"));
    }

    void setPassword(User user, String newPassword) {
        user.passwordHash = hasher.hash(newPassword);
        user.passwordChangedAt = Instant.now();
        user.mustChangePassword = false;
    }

    // ------------------------------------------------------------------ sessions

    @Transactional
    public List<SessionInfo> listSessions(UUID userId, UUID currentSessionId) {
        return UserSession.listActive(userId).stream()
                .map(s -> new SessionInfo(s.id, s.ip, s.userAgent, s.createdAt, s.lastUsedAt, s.idleExpiresAt,
                        s.id.equals(currentSessionId)))
                .toList();
    }

    @Transactional
    public void revokeSession(UUID userId, UUID sessionId) {
        UserSession s = UserSession.findById(sessionId);
        if (s == null || !s.userId.equals(userId)) {
            throw ApiException.notFound("ไม่พบ session");
        }
        sessions.revoke(s, SessionService.REVOKE_BY_USER);
        audit.log("user", userId, AuditService.ACTION_SESSION_REVOKED, null, Map.of("sessionId", sessionId.toString()));
    }

    @Transactional
    public int revokeOtherSessions(UUID userId, UUID currentSessionId) {
        int n = sessions.revokeAll(userId, SessionService.REVOKE_BY_USER, currentSessionId);
        Map<String, Object> after = new HashMap<>();
        after.put("count", n);
        audit.log("user", userId, AuditService.ACTION_SESSION_REVOKED, null, after);
        return n;
    }

    private static long secondsUntil(Instant t) {
        return Math.max(0, Duration.between(Instant.now(), t).toSeconds());
    }
}
