package com.ktt.purchase;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "goods_receipt_items")
public class GoodsReceiptItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID grId;
    public UUID poItemId;
    public UUID materialId;
    public String description;
    public BigDecimal quantity;
    public String unit;
    public BigDecimal unitCost;

    public static List<GoodsReceiptItem> listFor(UUID grId) {
        return list("grId", grId);
    }
}
