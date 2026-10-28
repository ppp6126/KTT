package com.ktt.lead;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** ประวัติการติดต่อ: โทร / ดูไซต์ / บันทึก / ประชุม / เปลี่ยนสถานะ */
@Entity
@Table(name = "lead_activities")
@SQLRestriction("deleted_at is null")
public class LeadActivity extends BaseEntity {

    public UUID leadId;
    public String type;
    public String note;
    public Instant occurredAt;

    public static List<LeadActivity> listFor(UUID leadId) {
        return list("leadId = ?1 order by occurredAt desc, createdAt desc", leadId);
    }
}
