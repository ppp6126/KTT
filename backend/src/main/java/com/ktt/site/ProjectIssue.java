package com.ktt.site;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** ปัญหา (issue) และความเสี่ยง (risk) ของโครงการ */
@Entity
@Table(name = "project_issues")
@SQLRestriction("deleted_at is null")
public class ProjectIssue extends BaseEntity {

    public UUID projectId;
    public String kind = "issue";
    public String title;
    public String description;
    public String severity = "medium";
    public String likelihood;
    public String status = "open";
    public UUID ownerId;
    public LocalDate dueDate;
    public String resolution;
    public Instant closedAt;
}
