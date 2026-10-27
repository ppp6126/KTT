package com.ktt.purchase;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * ใบสั่งซื้อ: draft → (มูลค่าเกินเกณฑ์) pending_approval → approved → partial / received → closed ; cancelled
 * warehouseId = null หมายถึงส่งตรงหน้างาน ตัดเป็นต้นทุนโครงการทันทีที่รับของ
 */
@Entity
@Table(name = "purchase_orders")
@SQLRestriction("deleted_at is null")
public class PurchaseOrder extends BaseEntity {

    public String docNo;
    public UUID supplierId;
    public String supplierName;
    public String supplierAddress;
    public String supplierTaxId;
    public String supplierBranchNo;
    public UUID projectId;
    public UUID prId;
    public UUID warehouseId;
    public LocalDate orderDate;
    public LocalDate deliveryDate;
    public String deliveryAddress;
    public String status = "draft";
    public BigDecimal subtotal = BigDecimal.ZERO;
    public BigDecimal discountAmount = BigDecimal.ZERO;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal vatAmount = BigDecimal.ZERO;
    public BigDecimal totalAmount = BigDecimal.ZERO;
    public int creditDays;
    public String paymentTerms;
    public String notes;
    public UUID approvedBy;
    public Instant approvedAt;
}
