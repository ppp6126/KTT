package com.ktt.permit;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/** ใบอนุญาต ใบรับรอง กรมธรรม์ และเอกสารอื่นที่มีวันหมดอายุ (ของบริษัทหรือของโครงการ) */
@Entity
@Table(name = "permits")
@SQLRestriction("deleted_at is null")
public class Permit extends BaseEntity {

    public static final Set<String> KINDS = Set.of("company_license", "building_permit", "insurance", "vehicle", "equipment", "certificate", "other");

    public String kind = "other";
    public String name;
    public String number;
    public String issuer;
    public UUID projectId;
    public LocalDate issueDate;
    public LocalDate expiryDate;
    public int notifyDays = 30;
    public UUID ownerId;
    public String status = "active";
    public UUID renewedFromId;
    public LocalDate lastNotifiedOn;
    public String notes;
}
