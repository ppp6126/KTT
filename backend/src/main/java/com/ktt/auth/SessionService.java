package com.ktt.auth;

import com.ktt.common.ApiException;
import com.ktt.common.RequestInfo;
import com.ktt.common.Tokens;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * จัดการ refresh token: สร้าง, หมุน (rotation), ตรวจการใช้ token เก่าซ้ำ (reuse detection), ยกเลิก.
 * DB เก็บเฉพาะ SHA-256 ของ token
 */
@ApplicationScoped
public class SessionService {

    private static final Logger LOG = Logger.getLogger(SessionService.class);

    public static final String REVOKE_LOGOUT = "logout";
    public static final String REVOKE_REUSE = "token_reuse";
    public static final String REVOKE_PASSWORD = "password_changed";
    public static final String REVOKE_USER_DISABLED = "user_disabled";
    public static final String REVOKE_ROLE_CHANGED = "role_changed";
    public static final String REVOKE_BY_USER = "revoked_by_user";
    public static final String REVOKE_BY_ADMIN = "revoked_by_admin";
    public static final String REVOKE_EXPIRED = "expired";

    @Inject
    AuthConfig config;

    @Inject
    RequestInfo requestInfo;

    @Inject
    SessionActiveChecker checker;

    public record NewSession(UserSession session, String refreshToken) {
    }

    public record Rotated(UserSession session, String refreshToken) {
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public NewSession create(User user) {
        Instant now = Instant.now();
        String raw = Tokens.random(32);
        UserSession s = new UserSession();
        s.userId = user.id;
        s.refreshTokenHash = Tokens.sha256Hex(raw);
        s.absoluteExpiresAt = now.plus(config.refreshAbsoluteTimeout());
        s.idleExpiresAt = min(now.plus(config.refreshIdleTimeout()), s.absoluteExpiresAt);
        s.lastUsedAt = now;
        s.ip = requestInfo.ip();
        s.userAgent = requestInfo.userAgent();
        s.persist();
        return new NewSession(s, raw);
    }

    /**
     * หมุน refresh token. ไม่ rollback เมื่อโยน ApiException เพื่อให้การยกเลิก session (กรณี reuse) ถูกบันทึกจริง
     */
    @Transactional(value = Transactional.TxType.MANDATORY, dontRollbackOn = ApiException.class)
    public Rotated rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw ApiException.unauthorized("no_refresh_token", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
        }
        Instant now = Instant.now();
        String hash = Tokens.sha256Hex(rawToken);
        UserSession s = UserSession.findByTokenHashForUpdate(hash);

        if (s == null) {
            UserSession previous = UserSession.findByPrevTokenHash(hash);
            if (previous != null && previous.revokedAt == null && previous.rotatedAt != null
                    && previous.rotatedAt.plus(config.refreshReuseGrace()).isAfter(now)) {
                // หลายแท็บ refresh พร้อมกัน: แท็บนี้ส่ง token เก่ามา ให้ลองใหม่ด้วย cookie ล่าสุด
                throw ApiException.conflict("refresh_retry", "กรุณาลองใหม่");
            }
            if (previous != null && previous.revokedAt == null) {
                // token เก่าถูกนำกลับมาใช้หลังพ้นช่วงผ่อนผัน = สงสัยว่า token ถูกขโมย ตัด session ทันที
                LOG.warnf("Refresh token reuse detected for session %s (user %s)", previous.id, previous.userId);
                previous.revoke(REVOKE_REUSE);
                checker.invalidate(previous.id);
            }
            throw ApiException.unauthorized("invalid_refresh_token", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
        }
        if (!s.isActive(now)) {
            if (s.revokedAt == null) {
                s.revoke(REVOKE_EXPIRED);
            }
            throw ApiException.unauthorized("session_expired", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
        }

        String raw = Tokens.random(32);
        s.prevTokenHash = s.refreshTokenHash;
        s.refreshTokenHash = Tokens.sha256Hex(raw);
        s.rotatedAt = now;
        s.lastUsedAt = now;
        s.idleExpiresAt = min(now.plus(config.refreshIdleTimeout()), s.absoluteExpiresAt);
        s.ip = requestInfo.ip();
        s.userAgent = requestInfo.userAgent();
        return new Rotated(s, raw);
    }

    /** หา session จาก refresh token (ใช้ตอน logout) */
    @Transactional(Transactional.TxType.MANDATORY)
    public UserSession findByRefreshToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return null;
        }
        return UserSession.find("refreshTokenHash", Tokens.sha256Hex(rawToken)).firstResult();
    }

    @Transactional(Transactional.TxType.MANDATORY)
    public void revoke(UserSession s, String reason) {
        s.revoke(reason);
        checker.invalidate(s.id);
    }

    /** ยกเลิกทุก session ของผู้ใช้ ยกเว้น exceptSessionId (null = ทั้งหมด) */
    @Transactional(Transactional.TxType.MANDATORY)
    public int revokeAll(UUID userId, String reason, UUID exceptSessionId) {
        List<UserSession> sessions = UserSession.listNotRevoked(userId);
        int count = 0;
        for (UserSession s : sessions) {
            if (exceptSessionId != null && exceptSessionId.equals(s.id)) {
                continue;
            }
            s.revoke(reason);
            checker.invalidate(s.id);
            count++;
        }
        return count;
    }

    public Instant absoluteExpiry(UserSession s) {
        return s.absoluteExpiresAt;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }
}
