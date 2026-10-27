package com.ktt.purchase;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** ใบขอซื้อ: draft → submitted → approved / rejected → ordered */
@Entity
@Table(name = "purchase_requests")
@SQLRestriction("deleted_at is null")
public class PurchaseRequest extends BaseEntity {

    public String docNo;
    public UUID projectId;
    public UUID warehouseId;
    public LocalDate requestDate;
    public LocalDate requiredDate;
    public String status = "draft";
    public String notes;
    public UUID decidedBy;
    public Instant decidedAt;
    public String decisionComment;
}
