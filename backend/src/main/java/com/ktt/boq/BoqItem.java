package com.ktt.boq;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** แถวของ BOQ (หมวด / งานย่อย / รายการ) ราคาเป็น snapshot ณ วันถอดแบบ */
@Entity
@Table(name = "boq_items")
public class BoqItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID boqId;
    public UUID parentId;
    public short level;
    public int sortOrder;
    public String description;
    public String unit;
    public BigDecimal quantity = BigDecimal.ZERO;
    public UUID materialId;
    public UUID laborId;
    public UUID equipmentId;
    public BigDecimal unitMaterialCost = BigDecimal.ZERO;
    /** ราคาขายวัสดุต่อหน่วย (สำรองไว้ ปัจจุบันเท่ากับต้นทุน) */
    public BigDecimal unitMaterial = BigDecimal.ZERO;
    public BigDecimal unitLabor = BigDecimal.ZERO;
    public BigDecimal unitEquipment = BigDecimal.ZERO;
    public BigDecimal lineCost = BigDecimal.ZERO;
    public BigDecimal lineSell = BigDecimal.ZERO;
    public String note;
    public Instant createdAt;
    public Instant updatedAt;

    @PrePersist
    void onPrePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onPreUpdate() {
        updatedAt = Instant.now();
    }

    public static List<BoqItem> listFor(UUID boqId) {
        return list("boqId = ?1 order by level, sortOrder", boqId);
    }
}
