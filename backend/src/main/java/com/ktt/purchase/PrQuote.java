package com.ktt.purchase;

import com.fasterxml.jackson.databind.JsonNode;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** ราคาที่ผู้ขายเสนอสำหรับใบขอซื้อ ใช้เปรียบเทียบราคา (prices = {prItemId: ราคาต่อหน่วย}) */
@Entity
@Table(name = "pr_quotes")
public class PrQuote extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID prId;
    public UUID supplierId;
    public String quoteRef;
    public LocalDate quoteDate;
    public Integer deliveryDays;
    public Integer creditDays;
    public boolean vatIncluded;

    @JdbcTypeCode(SqlTypes.JSON)
    public JsonNode prices;

    public BigDecimal total = BigDecimal.ZERO;
    public boolean selected;
    public String notes;
    public Instant createdAt;
    public UUID createdBy;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public static List<PrQuote> listFor(UUID prId) {
        return list("prId = ?1 order by total", prId);
    }
}
