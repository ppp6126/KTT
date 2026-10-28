package com.ktt.aftercare;

import com.ktt.common.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** งานแจ้งซ่อม (ทั้งในและนอกระยะรับประกัน) */
@Entity
@Table(name = "service_tickets")
@SQLRestriction("deleted_at is null")
public class ServiceTicket extends BaseEntity {

    public String docNo;
    public UUID projectId;
    public UUID customerId;
    public String title;
    public String description;
    public String category = "other";
    public String priority = "normal";
    public String channel = "phone";
    public String reporterName;
    public String reporterPhone;
    public String siteAddress;
    public Instant reportedAt;
    public boolean inWarranty;
    public String status = "open";
    public UUID assigneeId;
    public Instant appointmentAt;
    public Instant resolvedAt;
    public Instant closedAt;
    public String resolution;
    public BigDecimal laborCost = BigDecimal.ZERO;
    public BigDecimal materialCost = BigDecimal.ZERO;
    public BigDecimal chargeAmount = BigDecimal.ZERO;
}
