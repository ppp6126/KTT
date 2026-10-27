package com.ktt.auth;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** ขั้นตอนที่ 2 ของการ login เมื่อผู้ใช้เปิด 2FA */
@Entity
@Table(name = "mfa_challenges")
public class MfaChallenge extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID userId;
    public String tokenHash;
    public Instant expiresAt;
    public int attempts;
    public Instant consumedAt;
    public Instant createdAt;

    @PrePersist
    void onPrePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public static MfaChallenge findByTokenHashForUpdate(String hash) {
        return find("tokenHash", hash).withLock(LockModeType.PESSIMISTIC_WRITE).firstResult();
    }
}
