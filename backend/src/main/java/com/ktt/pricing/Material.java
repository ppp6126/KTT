package com.ktt.pricing;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "materials")
@SQLRestriction("deleted_at is null")
public class Material extends BaseEntity {

    public String code;
    public String name;
    public String unit;
    public UUID categoryId;
    public BigDecimal costPrice = BigDecimal.ZERO;
    public BigDecimal sellPrice = BigDecimal.ZERO;
    public String supplierName;
    public LocalDate priceUpdatedAt;

    public static Material findByCode(String code) {
        return find("code", code.trim()).firstResult();
    }
}
