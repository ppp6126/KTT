package com.ktt.purchase;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** ใบรับสินค้า (บันทึกแล้วตัดสต็อก/ต้นทุนทันที ยกเลิกได้ถ้าของยังไม่ถูกเบิกออก) */
@Entity
@Table(name = "goods_receipts")
public class GoodsReceipt extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String docNo;
    public UUID poId;
    public LocalDate receiveDate;
    public UUID warehouseId;
    public UUID projectId;
    public String deliveryNoteNo;
    public String notes;
    public String status = "posted";
    public Instant createdAt;
    public UUID createdBy;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
