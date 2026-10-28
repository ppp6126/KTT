package com.ktt.ap;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * บิลผู้ขาย/ผู้รับเหมาช่วง (เจ้าหนี้): draft → approved → partial / paid ; void
 * paidAmount = ยอดที่ตัดหนี้แล้ว (เงินโอน + ภาษีหัก ณ ที่จ่าย) ไม่รวมเงินประกันผลงานที่เรากันไว้
 */
@Entity
@Table(name = "ap_bills")
@SQLRestriction("deleted_at is null")
public class ApBill extends BaseEntity {

    public String docNo;
    public UUID supplierId;
    public String supplierName;
    public String supplierTaxId;
    public String supplierBranchNo;
    public String supplierInvoiceNo;
    public boolean taxInvoice;
    public LocalDate billDate;
    public LocalDate dueDate;
    public String taxPeriod;
    public UUID projectId;
    public UUID poId;
    public UUID subcontractClaimId;
    /** สัญญาจ้างช่วงที่บิลนี้ผูกอยู่ (งวดเบิก หรือ คืนเงินประกันเมื่อ subcontractClaimId ว่าง) */
    public UUID subcontractId;
    public String category = "material";
    public BigDecimal subtotal = BigDecimal.ZERO;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal vatAmount = BigDecimal.ZERO;
    public BigDecimal totalAmount = BigDecimal.ZERO;
    public BigDecimal retentionAmount = BigDecimal.ZERO;
    public BigDecimal whtPct = BigDecimal.ZERO;
    public BigDecimal whtAmount = BigDecimal.ZERO;
    public BigDecimal netPayable = BigDecimal.ZERO;
    public BigDecimal paidAmount = BigDecimal.ZERO;
    public String status = "draft";
    public String notes;

    /** ยอดที่ต้องตัดหนี้ทั้งหมด (ไม่รวมเงินประกันที่กันไว้) */
    public BigDecimal payableGross() {
        return totalAmount.subtract(retentionAmount);
    }

    public BigDecimal outstanding() {
        return payableGross().subtract(paidAmount);
    }
}
