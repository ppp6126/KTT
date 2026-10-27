package com.ktt.pricing;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** ประวัติการเปลี่ยนราคา (เทียบราคาย้อนหลัง) */
@Entity
@Table(name = "price_history")
public class PriceHistory extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String itemType;
    public UUID itemId;
    public String priceField;
    public BigDecimal oldPrice;
    public BigDecimal newPrice;
    public Instant changedAt;
    public UUID changedBy;

    @PrePersist
    void onPrePersist() {
        if (changedAt == null) {
            changedAt = Instant.now();
        }
    }

    public static void record(String itemType, UUID itemId, String field, BigDecimal oldPrice, BigDecimal newPrice, UUID by) {
        if (oldPrice != null && newPrice != null && oldPrice.compareTo(newPrice) == 0) {
            return;
        }
        PriceHistory h = new PriceHistory();
        h.itemType = itemType;
        h.itemId = itemId;
        h.priceField = field;
        h.oldPrice = oldPrice;
        h.newPrice = newPrice;
        h.changedBy = by;
        h.persist();
    }
}
