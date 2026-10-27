package com.ktt.auth;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "mfa_recovery_codes")
public class MfaRecoveryCode extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID userId;
    public String codeHash;
    public Instant usedAt;
    public Instant createdAt;

    @PrePersist
    void onPrePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public static MfaRecoveryCode findUnused(UUID userId, String codeHash) {
        return find("userId = ?1 and codeHash = ?2 and usedAt is null", userId, codeHash).firstResult();
    }

    public static long countUnused(UUID userId) {
        return count("userId = ?1 and usedAt is null", userId);
    }

    public static long deleteAllFor(UUID userId) {
        return delete("userId", userId);
    }
}
