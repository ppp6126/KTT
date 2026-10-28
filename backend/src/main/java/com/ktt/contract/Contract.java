package com.ktt.contract;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** สัญญาจ้างเหมา หนึ่งโครงการมีหนึ่งสัญญา มูลค่าเก็บแบบก่อน VAT */
@Entity
@Table(name = "contracts")
@SQLRestriction("deleted_at is null")
public class Contract extends BaseEntity {

    public static final String DRAFT = "draft";
    public static final String ACTIVE = "active";
    public static final String COMPLETED = "completed";
    public static final String TERMINATED = "terminated";

    public String docNo;
    public UUID projectId;
    public UUID quotationId;
    public UUID customerId;
    public String customerName;
    public String customerAddress;
    public String customerTaxId;
    public String customerBranchNo;
    public String title;
    public LocalDate contractDate;
    public LocalDate startDate;
    public LocalDate endDate;
    public BigDecimal amount = BigDecimal.ZERO;
    public boolean vatEnabled = true;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal advancePct = BigDecimal.ZERO;
    public BigDecimal retentionPct = BigDecimal.ZERO;
    public BigDecimal whtPct = BigDecimal.ZERO;
    public BigDecimal penaltyPerDay;
    public Integer warrantyMonths;
    public BigDecimal retentionReleased = BigDecimal.ZERO;
    public String status = DRAFT;
    public String terms;
    public String notes;
    public LocalDate signedAt;
}
