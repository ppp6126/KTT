package com.ktt.audit;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/** บันทึกว่าใครทำอะไรเมื่อไหร่ (ไม่มี soft delete ไม่มีการแก้ไข) */
@Entity
@Table(name = "audit_logs")
public class AuditLog extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID userId;
    public String entityType;
    public UUID entityId;
    public String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before")
    public JsonNode before;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after")
    public JsonNode after;

    public String ip;
    public String userAgent;
    public Instant createdAt;

    @PrePersist
    void onPrePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
