package com.ktt.auth;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;

@Entity
@Table(name = "users")
@SQLRestriction("deleted_at is null")
public class User extends BaseEntity {

    public String email;
    public String name;
    public String phone;

    public String passwordHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id")
    public Role role;

    @Column(name = "is_active")
    public boolean active = true;

    public boolean mustChangePassword;
    public Instant passwordChangedAt;

    /** TOTP secret ที่เข้ารหัสแล้ว (ดู DataCrypto) */
    public String totpSecret;
    public boolean mfaEnabled;
    public long totpLastStep;

    public int failedLoginCount;
    public Instant lockedUntil;
    public Instant lastLoginAt;

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    public static User findByEmail(String email) {
        if (email == null) {
            return null;
        }
        return find("lower(email) = ?1", email.trim().toLowerCase()).firstResult();
    }

    public static long countActiveOwners() {
        return count("role.code = ?1 and active = true", Role.OWNER);
    }
}
