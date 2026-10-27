package com.ktt.site;

import com.fasterxml.jackson.databind.JsonNode;
import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

/** แม่แบบรายการตรวจ QC (รายการข้อความ) */
@Entity
@Table(name = "qc_templates")
@SQLRestriction("deleted_at is null")
public class QcTemplate extends BaseEntity {

    public String name;
    public String category;

    @JdbcTypeCode(SqlTypes.JSON)
    public JsonNode items;
}
