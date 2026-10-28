package com.ktt.quotation;

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
@Table(name = "quotation_items")
public class QuotationItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID quotationId;
    public int sortOrder;
    /** item / heading / note */
    public String itemType = "item";
    public String description;
    public BigDecimal quantity;
    public String unit;
    public BigDecimal unitPrice;
    public BigDecimal amount = BigDecimal.ZERO;
    public BigDecimal unitCost;

    public static List<QuotationItem> listFor(UUID quotationId) {
        return list("quotationId = ?1 order by sortOrder", quotationId);
    }
}
