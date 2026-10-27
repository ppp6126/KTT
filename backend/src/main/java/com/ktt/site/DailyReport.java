package com.ktt.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** รายงานประจำวันหน้างาน (หนึ่งโครงการหนึ่งฉบับต่อวัน): draft → submitted → acknowledged */
@Entity
@Table(name = "daily_reports")
@SQLRestriction("deleted_at is null")
public class DailyReport extends BaseEntity {

    public UUID projectId;
    public LocalDate reportDate;
    public String weatherAm;
    public String weatherPm;

    @JdbcTypeCode(SqlTypes.JSON)
    public JsonNode workers;

    public int workersTotal;
    public String workDone;
    public String workPlanned;
    public String problems;
    public String materialsIn;
    public String equipment;
    public String visitors;
    public String safetyNote;
    public String status = "draft";
    public Instant submittedAt;
    public UUID submittedBy;
    public Instant acknowledgedAt;
    public UUID acknowledgedBy;
}
