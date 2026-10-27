package com.ktt.stock;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** สมุดคุมสินค้า: qty บวก = เข้า ลบ = ออก ; unitCost = ต้นทุนถัวเฉลี่ย ณ เวลาที่เคลื่อนไหว */
@Entity
@Table(name = "stock_movements")
public class StockMovement extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public LocalDate movementDate;
    public UUID materialId;
    public UUID warehouseId;
    public BigDecimal qty;
    public BigDecimal unitCost = BigDecimal.ZERO;
    public String kind;
    public UUID projectId;
    public String refType;
    public UUID refId;
    public String note;
    public Instant createdAt;
    public UUID createdBy;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
