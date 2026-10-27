package com.ktt.ap;

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
@Table(name = "ap_bill_items")
public class ApBillItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID billId;
    public int sortOrder;
    public String description;
    public BigDecimal quantity = BigDecimal.ONE;
    public String unit;
    public BigDecimal unitPrice = BigDecimal.ZERO;
    public BigDecimal amount = BigDecimal.ZERO;

    public static List<ApBillItem> listFor(UUID billId) {
        return list("billId = ?1 order by sortOrder", billId);
    }
}
