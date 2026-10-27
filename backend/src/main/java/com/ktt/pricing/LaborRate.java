package com.ktt.pricing;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.util.Set;

@Entity
@Table(name = "labor_rates")
@SQLRestriction("deleted_at is null")
public class LaborRate extends BaseEntity {

    public static final Set<String> TRADES = Set.of("mason", "steel", "electric", "plumbing", "paint", "tile", "carpentry", "other");

    public String code;
    public String name;
    public String trade;
    public String unit;
    public BigDecimal rate = BigDecimal.ZERO;

    public static LaborRate findByCode(String code) {
        return find("code", code.trim()).firstResult();
    }
}
