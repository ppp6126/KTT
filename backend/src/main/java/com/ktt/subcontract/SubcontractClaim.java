package com.ktt.subcontract;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** งวดเบิกของผู้รับเหมาช่วง: draft → approved (ตรวจรับงาน) → billed (ตั้งหนี้แล้ว) */
@Entity
@Table(name = "subcontract_claims")
public class SubcontractClaim extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID subcontractId;
    public int claimNo;
    public LocalDate claimDate;
    public String description;
    public BigDecimal progressPct;
    public BigDecimal amount;
    public String status = "draft";
    public UUID apBillId;
    public UUID approvedBy;
    public Instant approvedAt;
    public Instant createdAt;
    public UUID createdBy;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public static List<SubcontractClaim> listFor(UUID subcontractId) {
        return list("subcontractId = ?1 order by claimNo", subcontractId);
    }
}
