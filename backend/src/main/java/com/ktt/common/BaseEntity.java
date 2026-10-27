package com.ktt.common;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.time.Instant;
import java.util.UUID;

/**
 * คอลัมน์มาตรฐานของตารางหลัก: id (UUID), created_at, updated_at, created_by, deleted_at (soft delete).
 * entity ที่ soft delete ให้ใส่ {@code @SQLRestriction("deleted_at is null")} ที่คลาสลูก
 */
@MappedSuperclass
public abstract class BaseEntity extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @Column(name = "created_by", updatable = false)
    public UUID createdBy;

    @Column(name = "deleted_at")
    public Instant deletedAt;

    @PrePersist
    protected void onPrePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    protected void onPreUpdate() {
        updatedAt = Instant.now();
    }

    public void softDelete() {
        this.deletedAt = Instant.now();
    }
}
