package com.ktt.stock;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.util.UUID;

/** คลังกลาง หรือคลังหน้างานของโครงการ (projectId) */
@Entity
@Table(name = "warehouses")
@SQLRestriction("deleted_at is null")
public class Warehouse extends BaseEntity {

    public String code;
    public String name;
    public UUID projectId;
    public boolean active = true;
}
