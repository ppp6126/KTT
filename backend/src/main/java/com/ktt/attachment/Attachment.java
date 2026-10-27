package com.ktt.attachment;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.util.List;
import java.util.UUID;

/** ไฟล์แนบที่ผูกกับข้อมูลใดก็ได้ (ownerType + ownerId) เช่น lead, customer, project, daily_report */
@Entity
@Table(name = "attachments")
@SQLRestriction("deleted_at is null")
public class Attachment extends BaseEntity {

    public String ownerType;
    public UUID ownerId;
    public String fileName;
    public String fileKey;
    public String mime;
    public String category;
    public long sizeBytes;

    public static List<Attachment> listFor(String ownerType, UUID ownerId) {
        return list("ownerType = ?1 and ownerId = ?2 order by createdAt desc", ownerType, ownerId);
    }

    public static long countFor(String ownerType, UUID ownerId) {
        return count("ownerType = ?1 and ownerId = ?2", ownerType, ownerId);
    }
}
