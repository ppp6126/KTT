package com.ktt.stock;

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

/** เอกสารเบิก/โอน/ปรับยอด/รับคืน (บันทึกแล้วไม่แก้ไข ทำรายการกลับด้วยเอกสารใหม่) */
@Entity
@Table(name = "stock_docs")
public class StockDoc extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String docNo;
    public String kind;
    public LocalDate docDate;
    public UUID warehouseId;
    public UUID toWarehouseId;
    public UUID projectId;
    public String notes;
    public Instant createdAt;
    public UUID createdBy;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
