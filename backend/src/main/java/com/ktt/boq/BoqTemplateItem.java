package com.ktt.boq;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "boq_template_items")
public class BoqTemplateItem extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID templateId;
    public UUID parentId;
    public short level;
    public int sortOrder;
    public String description;
    public String unit;
    public BigDecimal quantity = BigDecimal.ZERO;
    public UUID materialId;
    public UUID laborId;
    public UUID equipmentId;
    public String note;
    public Instant createdAt;
    public Instant updatedAt;

    @PrePersist
    void onPrePersist() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    public static List<BoqTemplateItem> listFor(UUID templateId) {
        return list("templateId = ?1 order by level, sortOrder", templateId);
    }
}
