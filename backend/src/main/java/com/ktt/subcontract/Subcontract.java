package com.ktt.subcontract;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** สัญญาจ้างผู้รับเหมาช่วง: draft → active → completed ; cancelled */
@Entity
@Table(name = "subcontracts")
@SQLRestriction("deleted_at is null")
public class Subcontract extends BaseEntity {

    public String docNo;
    public UUID projectId;
    public UUID supplierId;
    public String title;
    public String scope;
    public BigDecimal amount = BigDecimal.ZERO;
    public BigDecimal vatPct = BigDecimal.ZERO;
    public BigDecimal retentionPct = new BigDecimal("5");
    public BigDecimal whtPct = new BigDecimal("3");
    public LocalDate startDate;
    public LocalDate endDate;
    public String status = "draft";
    public BigDecimal retentionReleased = BigDecimal.ZERO;
    public String notes;
}
