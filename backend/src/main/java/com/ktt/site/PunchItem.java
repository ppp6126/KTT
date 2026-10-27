package com.ktt.site;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** รายการแก้ไขก่อนส่งมอบ (Punch list): open → fixed → verified */
@Entity
@Table(name = "punch_items")
@SQLRestriction("deleted_at is null")
public class PunchItem extends BaseEntity {

    public UUID projectId;
    public int itemNo;
    public String location;
    public String description;
    public String responsible;
    public LocalDate dueDate;
    public String status = "open";
    public Instant fixedAt;
    public Instant verifiedAt;
    public UUID verifiedBy;
}
