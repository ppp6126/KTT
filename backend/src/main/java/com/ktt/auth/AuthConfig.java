package com.ktt.auth;

import io.smallrye.config.ConfigMapping;

import java.time.Duration;

@ConfigMapping(prefix = "ktt.auth")
public interface AuthConfig {

    Duration accessTokenTtl();

    Duration refreshIdleTimeout();

    Duration refreshAbsoluteTimeout();

    /** ช่วงเวลาที่ยอมให้ token เก่าถูกส่งซ้ำ (หลายแท็บ refresh พร้อมกัน) โดยตอบ 409 ให้ลองใหม่แทนการตัด session */
    Duration refreshReuseGrace();

    int maxFailedLogins();

    Duration lockDuration();

    Duration mfaChallengeTtl();

    int mfaMaxAttempts();

    Duration passwordResetTtl();

    int ipMaxAttempts();

    Duration ipWindow();

    String cookieName();

    String cookiePath();

    boolean cookieSecure();
}
