package com.ktt.ap;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** ใบสำคัญจ่าย: draft → approved → paid (ตัดหนี้ + ออก 50 ทวิ) ; void */
@Entity
@Table(name = "payment_vouchers")
@SQLRestriction("deleted_at is null")
public class PaymentVoucher extends BaseEntity {

    public String docNo;
    public UUID supplierId;
    public String supplierName;
    public LocalDate payDate;
    public String method = "transfer";
    public String bankRef;
    public BigDecimal grossAmount = BigDecimal.ZERO;
    public BigDecimal whtAmount = BigDecimal.ZERO;
    public BigDecimal netPaid = BigDecimal.ZERO;
    public String status = "draft";
    public UUID approvedBy;
    public Instant approvedAt;
    public String notes;
}
