package com.ktt.quotation;

import com.fasterxml.jackson.databind.JsonNode;
import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** ใบเสนอราคา หนึ่งแถวต่อหนึ่ง Revision (doc_no เดียวกัน, revision เพิ่มขึ้น) */
@Entity
@Table(name = "quotations")
@SQLRestriction("deleted_at is null")
public class Quotation extends BaseEntity {

    public static final String DRAFT = "draft";
    public static final String PENDING_APPROVAL = "pending_approval";
    public static final String APPROVED = "approved";
    public static final String SENT = "sent";
    public static final String ACCEPTED = "accepted";
    public static final String REJECTED = "rejected";
    public static final String EXPIRED = "expired";
    public static final String SUPERSEDED = "superseded";

    public String docNo;
    public int revision = 1;
    public UUID parentQuotationId;
    public UUID leadId;
    public UUID customerId;
    public UUID boqId;
    public String status = DRAFT;
    public String title;
    public LocalDate issueDate;
    public LocalDate validUntil;
    public String displayMode = "detailed";

    @JdbcTypeCode(SqlTypes.JSON)
    public JsonNode paymentTerms;

    public Integer durationDays;
    public String warrantyTerms;
    public String scopeIn;
    public String scopeOut;

    public String customerName;
    public String customerAddress;
    public String customerTaxId;
    public String customerBranchNo;
    public String customerPhone;
    public String referenceNo;
    public String paymentCondition;

    public BigDecimal subtotal = BigDecimal.ZERO;
    public BigDecimal discountPct = BigDecimal.ZERO;
    public BigDecimal discountAmount = BigDecimal.ZERO;
    public BigDecimal overheadPct = BigDecimal.ZERO;
    public BigDecimal overheadAmount = BigDecimal.ZERO;
    public boolean vatEnabled = true;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal vatAmount = BigDecimal.ZERO;
    public String roundingMode = "none";
    public BigDecimal roundingAmount = BigDecimal.ZERO;
    public BigDecimal whtPct = BigDecimal.ZERO;
    public BigDecimal whtAmount = BigDecimal.ZERO;
    public BigDecimal totalAmount = BigDecimal.ZERO;
    public BigDecimal costTotal;

    public String notes;
    public String lostReason;
    public String publicTokenHash;
    public String pdfKey;
    public Instant signedAt;
    public String signatureKey;
    public Instant sentAt;
    public Instant decidedAt;

    public boolean isEditable() {
        return DRAFT.equals(status);
    }

    public String displayNo() {
        return revision > 1 ? docNo + " Rev." + revision : docNo;
    }
}
