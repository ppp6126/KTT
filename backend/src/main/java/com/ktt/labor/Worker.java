package com.ktt.labor;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.util.UUID;

/** แรงงานรายวัน */
@Entity
@Table(name = "workers")
@SQLRestriction("deleted_at is null")
public class Worker extends BaseEntity {

    public String name;
    public String nickname;
    public String trade;
    public BigDecimal dailyWage = BigDecimal.ZERO;
    public BigDecimal otRate = BigDecimal.ZERO;
    public String phone;
    public String idCard;
    public UUID supplierId;
    public boolean active = true;
}
