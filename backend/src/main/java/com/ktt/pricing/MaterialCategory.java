package com.ktt.pricing;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.util.UUID;

@Entity
@Table(name = "material_categories")
@SQLRestriction("deleted_at is null")
public class MaterialCategory extends BaseEntity {

    public String name;
    public UUID parentId;
    public int sortOrder;

    public static MaterialCategory findByName(String name) {
        return find("lower(name) = ?1", name.trim().toLowerCase()).firstResult();
    }
}
