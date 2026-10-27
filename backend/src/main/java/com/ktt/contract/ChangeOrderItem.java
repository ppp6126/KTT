package com.ktt.contract;

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
@Table(name = "change_order_items")
public class ChangeOrderItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID changeOrderId;
    public int sortOrder;
    public String description;
    public BigDecimal quantity = BigDecimal.ONE;
    public String unit;
    public BigDecimal unitPrice = BigDecimal.ZERO;
    public BigDecimal unitCost;
    public BigDecimal amount = BigDecimal.ZERO;

    public static List<ChangeOrderItem> listFor(UUID changeOrderId) {
        return list("changeOrderId = ?1 order by sortOrder", changeOrderId);
    }
}
