package com.ktt.boq;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

/** แม่แบบถอดแบบ เช่น "งานฐานราก" "งานผนังก่ออิฐ" ใช้ซ้ำได้ (FR-05) */
@Entity
@Table(name = "boq_templates")
@SQLRestriction("deleted_at is null")
public class BoqTemplate extends BaseEntity {

    public String name;
    public String jobType;
    public String description;
}
