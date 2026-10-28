package com.ktt.project;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** งานในแผนงาน (Gantt) ซ้อนเป็นหมวดได้ งานแม่คิดความคืบหน้าจากงานลูกถ่วงน้ำหนัก */
@Entity
@Table(name = "project_tasks")
public class ProjectTask extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID projectId;
    public UUID parentId;
    public int sortOrder;
    public String name;
    public LocalDate plannedStart;
    public LocalDate plannedEnd;
    public LocalDate actualStart;
    public LocalDate actualEnd;
    public BigDecimal weight = BigDecimal.ONE;
    public BigDecimal progressPct = BigDecimal.ZERO;
    public UUID predecessorId;
    public UUID assigneeId;
    public boolean isMilestone;

    public static List<ProjectTask> listFor(UUID projectId) {
        return list("projectId = ?1 order by sortOrder", projectId);
    }
}
