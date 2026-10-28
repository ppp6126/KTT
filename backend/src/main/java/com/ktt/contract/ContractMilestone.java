package com.ktt.contract;

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

/** งวดงาน: pending → ready (ส่งมอบงานแล้ว พร้อมวางบิล) → billed (ออกใบแจ้งหนี้) → paid */
@Entity
@Table(name = "contract_milestones")
public class ContractMilestone extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public UUID contractId;
    public int seq;
    public String name;
    public String criteria;
    public BigDecimal pct = BigDecimal.ZERO;
    public BigDecimal amount = BigDecimal.ZERO;
    public LocalDate dueDate;
    public String status = "pending";
    public UUID changeOrderId;
    public LocalDate completedAt;

    public static List<ContractMilestone> listFor(UUID contractId) {
        return list("contractId = ?1 order by seq", contractId);
    }
}
