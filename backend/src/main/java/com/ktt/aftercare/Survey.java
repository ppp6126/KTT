package com.ktt.aftercare;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.util.UUID;

/** ผลสอบถามความพึงพอใจลูกค้า (หลังบ้านบันทึกจากการโทรหรือเยี่ยม) */
@Entity
@Table(name = "satisfaction_surveys")
@SQLRestriction("deleted_at is null")
public class Survey extends BaseEntity {

    public UUID customerId;
    public UUID projectId;
    public UUID ticketId;
    public LocalDate surveyDate;
    public String method = "phone";
    public String respondent;
    public Integer quality;
    public Integer timeliness;
    public Integer communication;
    public Integer cleanliness;
    public int overall;
    public Boolean recommend;
    public String comment;
}
