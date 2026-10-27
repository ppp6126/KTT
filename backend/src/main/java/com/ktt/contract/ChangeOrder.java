package com.ktt.contract;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** งานเพิ่ม-ลด (VO): draft → pending_approval → approved / rejected ; ยกเลิกได้ก่อนอนุมัติ */
@Entity
@Table(name = "change_orders")
@SQLRestriction("deleted_at is null")
public class ChangeOrder extends BaseEntity {

    public String docNo;
    public UUID contractId;
    public UUID projectId;
    public String title;
    public String reason;
    public boolean requestedByCustomer = true;
    public BigDecimal amount = BigDecimal.ZERO;
    public BigDecimal costAmount;
    public int daysExtension;
    public String status = "draft";
    public LocalDate issueDate;
    public LocalDate customerApprovedAt;
    public UUID decidedBy;
    public Instant decidedAt;
    public String decisionComment;
}
