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
@Table(name = "purchase_order_items")
public class PurchaseOrderItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID poId;
    public int sortOrder;
    public UUID materialId;
    public UUID prItemId;
    public String description;
    public BigDecimal quantity;
    public String unit;
    public BigDecimal unitPrice = BigDecimal.ZERO;
    public BigDecimal amount = BigDecimal.ZERO;
    public BigDecimal receivedQty = BigDecimal.ZERO;

    public static List<PurchaseOrderItem> listFor(UUID poId) {
        return list("poId = ?1 order by sortOrder", poId);
    }
}
