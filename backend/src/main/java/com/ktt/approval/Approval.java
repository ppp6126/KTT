package com.ktt.approval;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** คำขออนุมัติ (FR-10) เช่น ส่วนลดเกินเกณฑ์ต้องให้ผู้บริหารอนุมัติ */
@Entity
@Table(name = "approvals")
public class Approval extends PanacheEntityBase {

    public static final String PENDING = "pending";
    public static final String APPROVED = "approved";
    public static final String REJECTED = "rejected";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String targetType;
    public UUID targetId;
    public String reason;
    public String status = PENDING;
    public UUID requestedBy;
    public UUID decidedBy;
    public String comment;
    public Instant decidedAt;
    public Instant createdAt;
    public Instant updatedAt;

    @PrePersist
    void onPrePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onPreUpdate() {
        updatedAt = Instant.now();
    }

    public static Approval latestFor(String targetType, UUID targetId) {
        return find("targetType = ?1 and targetId = ?2 order by createdAt desc", targetType, targetId).firstResult();
    }
}
