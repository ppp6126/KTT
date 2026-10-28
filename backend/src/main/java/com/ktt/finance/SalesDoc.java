package com.ktt.finance;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** เอกสารการเงินฝั่งขายทุกประเภทในตารางเดียว แยกด้วย docType */
@Entity
@Table(name = "sales_docs")
@SQLRestriction("deleted_at is null")
public class SalesDoc extends BaseEntity {

    public static final String INVOICE = "invoice";
    public static final String INVOICE_TAX = "invoice_tax";
    public static final String BILLING_NOTE = "billing_note";
    public static final String RECEIPT = "receipt";
    public static final String TAX_RECEIPT = "tax_receipt";
    public static final String CREDIT_NOTE = "credit_note";

    /** ใบเสร็จรับคืนเงินประกันผลงาน (ไม่อ้างอิงใบแจ้งหนี้) */
    public static final String KIND_RETENTION = "retention";

    public static final Set<String> INVOICES = Set.of(INVOICE, INVOICE_TAX);
    /** เอกสารที่เป็นใบกำกับภาษี (ใบลดหนี้อ้างอิงได้) */
    public static final Set<String> TAX_DOCS = Set.of(INVOICE_TAX, TAX_RECEIPT);

    public static final Map<String, String> TITLES = Map.of(
            INVOICE, "ใบแจ้งหนี้",
            INVOICE_TAX, "ใบแจ้งหนี้/ใบกำกับภาษี",
            BILLING_NOTE, "ใบวางบิล",
            RECEIPT, "ใบเสร็จรับเงิน",
            TAX_RECEIPT, "ใบเสร็จรับเงิน/ใบกำกับภาษี",
            CREDIT_NOTE, "ใบลดหนี้");

    public static final Map<String, String> DEFAULT_PREFIX = Map.of(
            INVOICE, "IV", INVOICE_TAX, "IT", BILLING_NOTE, "BL", RECEIPT, "RC", TAX_RECEIPT, "RT", CREDIT_NOTE, "CN");

    public String docType;
    public String docNo;
    public LocalDate docDate;
    public LocalDate dueDate;
    public String status = "draft";
    public UUID customerId;
    public String customerName;
    public String customerAddress;
    public String customerTaxId;
    public String customerBranchNo;
    public UUID projectId;
    public UUID contractId;
    public UUID refDocId;
    public String kind = "normal";
    public BigDecimal subtotal = BigDecimal.ZERO;
    public BigDecimal discountAmount = BigDecimal.ZERO;
    public BigDecimal advanceDeduct = BigDecimal.ZERO;
    public BigDecimal taxableAmount = BigDecimal.ZERO;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal vatAmount = BigDecimal.ZERO;
    public BigDecimal totalAmount = BigDecimal.ZERO;
    public BigDecimal retentionPct = BigDecimal.ZERO;
    public BigDecimal retentionAmount = BigDecimal.ZERO;
    public BigDecimal whtPct = BigDecimal.ZERO;
    public BigDecimal whtAmount = BigDecimal.ZERO;
    public BigDecimal netAmount = BigDecimal.ZERO;
    public BigDecimal settledAmount = BigDecimal.ZERO;
    public BigDecimal originalAmount;
    public BigDecimal correctAmount;
    public String reason;
    public String paymentMethod;
    public String paymentRef;
    public LocalDate paidDate;
    public String notes;
    public Instant issuedAt;
    public Instant voidedAt;

    public boolean isDraft() {
        return "draft".equals(status);
    }

    public BigDecimal outstanding() {
        return totalAmount.subtract(settledAmount);
    }
}
