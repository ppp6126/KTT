package com.ktt.finance;

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
@Table(name = "sales_doc_items")
public class SalesDocItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID docId;
    public int sortOrder;
    public String description;
    public BigDecimal quantity = BigDecimal.ONE;
    public String unit;
    public BigDecimal unitPrice = BigDecimal.ZERO;
    public BigDecimal amount = BigDecimal.ZERO;
    public UUID milestoneId;

    public static List<SalesDocItem> listFor(UUID docId) {
        return list("docId = ?1 order by sortOrder", docId);
    }
}
