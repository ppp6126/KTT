package com.ktt.boq;

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
@Table(name = "factor_f_table_rows")
public class FactorFTableRow extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID tableId;
    public BigDecimal cost;
    public BigDecimal factor;

    public static List<FactorFTableRow> listFor(UUID tableId) {
        return list("tableId = ?1 order by cost", tableId);
    }
}
