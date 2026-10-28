package com.ktt.pricing;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;

@Entity
@Table(name = "equipment_rates")
@SQLRestriction("deleted_at is null")
public class EquipmentRate extends BaseEntity {

    public String code;
    public String name;
    public String unit;
    public BigDecimal rate = BigDecimal.ZERO;

    public static EquipmentRate findByCode(String code) {
        return find("code", code.trim()).firstResult();
    }
}
