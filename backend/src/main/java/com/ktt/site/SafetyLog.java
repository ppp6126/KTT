package com.ktt.site;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.util.UUID;

/** บันทึกความปลอดภัย: Toolbox talk, ตรวจความปลอดภัย, อบรม, เหตุเกือบเกิด, อุบัติเหตุ */
@Entity
@Table(name = "safety_logs")
@SQLRestriction("deleted_at is null")
public class SafetyLog extends BaseEntity {

    public UUID projectId;
    public LocalDate logDate;
    public String kind;
    public String title;
    public String detail;
    public Integer peopleCount;
    public int injuredCount;
    public String severity = "low";
    public String correctiveAction;
    public String status = "open";
}
