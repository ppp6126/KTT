package com.ktt.auth;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** ลบข้อมูล token ที่หมดอายุแล้ว (session เก็บไว้ 30 วันเพื่อการตรวจสอบย้อนหลัง) */
@ApplicationScoped
public class AuthCleanupJob {

    private static final Logger LOG = Logger.getLogger(AuthCleanupJob.class);

    @Scheduled(cron = "0 30 3 * * ?", timeZone = "Asia/Bangkok")
    @Transactional
    void cleanup() {
        Instant now = Instant.now();
        Instant keep = now.minus(30, ChronoUnit.DAYS);
        long challenges = MfaChallenge.delete("expiresAt < ?1", now.minus(1, ChronoUnit.DAYS));
        long resets = PasswordResetToken.delete("expiresAt < ?1", now.minus(1, ChronoUnit.DAYS));
        long sessions = UserSession.delete("absoluteExpiresAt < ?1 or (revokedAt is not null and revokedAt < ?1)", keep);
        LOG.infof("Auth cleanup: %d challenges, %d reset tokens, %d sessions removed", challenges, resets, sessions);
    }
}
