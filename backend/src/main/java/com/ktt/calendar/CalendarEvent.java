package com.ktt.calendar;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.UUID;

/** นัดหมายที่ผู้ใช้บันทึกเอง (ประชุม ดูไซต์ ตรวจงาน ส่งของ ส่งมอบงาน) */
@Entity
@Table(name = "calendar_events")
@SQLRestriction("deleted_at is null")
public class CalendarEvent extends BaseEntity {

    public String title;
    public String kind = "other";
    public Instant startsAt;
    public Instant endsAt;
    public boolean allDay;
    public String location;
    public UUID projectId;
    public boolean isPrivate;
    public String notes;
}
