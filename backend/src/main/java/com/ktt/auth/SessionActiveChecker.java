package com.ktt.auth;

import io.quarkus.cache.CacheInvalidate;
import io.quarkus.cache.CacheInvalidateAll;
import io.quarkus.cache.CacheResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * ตรวจว่า session ของ access token ยังใช้งานได้ (ไม่ถูก logout/ยกเลิก และผู้ใช้ยัง active).
 * cache 30 วินาที (quarkus.cache.caffeine."session-active") เพื่อไม่ต้อง query ทุก request
 */
@ApplicationScoped
public class SessionActiveChecker {

    @CacheResult(cacheName = "session-active")
    @Transactional
    public boolean isActive(UUID sessionId) {
        UserSession s = UserSession.findById(sessionId);
        if (s == null || s.revokedAt != null || !s.absoluteExpiresAt.isAfter(Instant.now())) {
            return false;
        }
        User u = User.findById(s.userId);
        return u != null && u.active;
    }

    @CacheInvalidate(cacheName = "session-active")
    public void invalidate(UUID sessionId) {
        // ลบ cache ของ session นี้ (เรียกหลัง revoke)
    }

    @CacheInvalidateAll(cacheName = "session-active")
    public void invalidateAll() {
        // ใช้เมื่อยกเลิกหลาย session พร้อมกัน
    }
}
