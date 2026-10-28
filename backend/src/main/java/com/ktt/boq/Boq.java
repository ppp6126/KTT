package com.ktt.boq;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.util.UUID;

/** BOQ หนึ่งชุดของลีด (มีได้หลายทางเลือก เช่น Option A เกรดมาตรฐาน / Option B เกรดพรีเมียม) */
@Entity
@Table(name = "boqs")
@SQLRestriction("deleted_at is null")
public class Boq extends BaseEntity {

    public UUID leadId;
    public String name;
    public String optionLabel;
    public BigDecimal overheadPct = BigDecimal.ZERO;
    public BigDecimal profitPct = BigDecimal.ZERO;
    public BigDecimal contingencyPct = BigDecimal.ZERO;
    public BigDecimal discountAmount = BigDecimal.ZERO;
    public BigDecimal vatPct = new BigDecimal("7.00");
    public BigDecimal whtPct = BigDecimal.ZERO;
    public BigDecimal subtotalCost = BigDecimal.ZERO;
    public BigDecimal subtotalSell = BigDecimal.ZERO;
    public BigDecimal grandTotal = BigDecimal.ZERO;
    public BigDecimal marginPct = BigDecimal.ZERO;

    /** Factor F ใช้เฉพาะแบบฟอร์มราชการ ปร.5: none / manual / table */
    @Column(name = "factor_f_mode")
    public String factorFMode = "none";
    @Column(name = "factor_f_value")
    public BigDecimal factorFValue;
    @Column(name = "factor_f_table_id")
    public UUID factorFTableId;
    public String projectName;
    public String projectLocation;
    public String ownerAgency;
    public String notes;
}
