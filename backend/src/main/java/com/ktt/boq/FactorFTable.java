package com.ktt.boq;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;

/** ตาราง Factor F (กรมบัญชีกลาง) ที่บริษัทกรอกเอง */
@Entity
@Table(name = "factor_f_tables")
@SQLRestriction("deleted_at is null")
public class FactorFTable extends BaseEntity {

    public String name;
    public String workType;
    public BigDecimal advancePct;
    public BigDecimal retentionPct;
    public BigDecimal interestPct;
    public BigDecimal vatPct;
    public String note;
}
