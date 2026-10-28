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
@Table(name = "purchase_request_items")
public class PurchaseRequestItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID prId;
    public int sortOrder;
    public UUID materialId;
    public String description;
    public BigDecimal quantity;
    public String unit;
    public BigDecimal estUnitPrice;
    public String note;

    public static List<PurchaseRequestItem> listFor(UUID prId) {
        return list("prId = ?1 order by sortOrder", prId);
    }
}
