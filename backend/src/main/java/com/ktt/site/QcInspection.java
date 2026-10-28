package com.ktt.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.UUID;

/** ผลตรวจคุณภาพ: items = [{text, result: pass|fail|na, note}] */
@Entity
@Table(name = "qc_inspections")
@SQLRestriction("deleted_at is null")
public class QcInspection extends BaseEntity {

    public UUID projectId;
    public UUID taskId;
    public String title;
    public LocalDate inspectedOn;
    public UUID inspectorId;
    public String result = "pending";

    @JdbcTypeCode(SqlTypes.JSON)
    public JsonNode items;

    public String notes;
}
