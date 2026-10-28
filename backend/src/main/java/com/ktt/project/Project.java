package com.ktt.project;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/** โครงการก่อสร้าง (สร้างจากใบเสนอราคาที่ลูกค้าตอบรับ หรือสร้างเอง) */
@Entity
@Table(name = "projects")
@SQLRestriction("deleted_at is null")
public class Project extends BaseEntity {

    public static final Set<String> STATUSES = Set.of("planning", "active", "on_hold", "completed", "cancelled");

    public String code;
    public String name;
    public UUID customerId;
    public UUID leadId;
    public UUID quotationId;
    public String siteAddress;
    public String status = "planning";
    public LocalDate plannedStart;
    public LocalDate plannedEnd;
    public LocalDate actualStart;
    public LocalDate actualEnd;
    /** กำหนดวันสิ้นสุดรับประกันเอง (null = วันส่งมอบจริง + ระยะรับประกันในสัญญา) */
    public LocalDate warrantyUntil;
    public UUID managerId;
    public UUID foremanId;
    public BigDecimal budgetCost;
    public BigDecimal progressPct = BigDecimal.ZERO;
    public String notes;
}
