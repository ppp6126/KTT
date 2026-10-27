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
import java.util.List;
import java.util.UUID;

/** หนึ่งแถวต่อหนึ่งการ login (หนึ่งอุปกรณ์/เบราว์เซอร์) */
@Entity
@Table(name = "user_sessions")
public class UserSession extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID userId;
    public String refreshTokenHash;
    public String prevTokenHash;
    public Instant rotatedAt;
    public Instant idleExpiresAt;
    public Instant absoluteExpiresAt;
    public Instant lastUsedAt;
    public String ip;
    public String userAgent;
    public Instant revokedAt;
    public String revokeReason;
    public Instant createdAt;

    @PrePersist
    void onPrePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public boolean isActive(Instant now) {
        return revokedAt == null && idleExpiresAt.isAfter(now) && absoluteExpiresAt.isAfter(now);
    }

    public void revoke(String reason) {
        if (revokedAt == null) {
            revokedAt = Instant.now();
            revokeReason = reason;
        }
    }

    public static UserSession findByTokenHashForUpdate(String hash) {
        return find("refreshTokenHash", hash).withLock(LockModeType.PESSIMISTIC_WRITE).firstResult();
    }

    public static UserSession findByPrevTokenHash(String hash) {
        return find("prevTokenHash", hash).firstResult();
    }

    public static List<UserSession> listActive(UUID userId) {
        return list("userId = ?1 and revokedAt is null and idleExpiresAt > ?2 and absoluteExpiresAt > ?2 order by lastUsedAt desc",
                userId, Instant.now());
    }

    public static List<UserSession> listNotRevoked(UUID userId) {
        return list("userId = ?1 and revokedAt is null", userId);
    }
}
