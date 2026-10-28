package com.ktt.ap;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) เล่มที่ = ปี พ.ศ. เลขที่เรียงในปี */
@Entity
@jakarta.persistence.Table(name = "wht_certificates")
public class WhtCertificate extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    public UUID id;

    public String bookNo;
    public int runNo;
    public UUID pvId;
    public String form;
    public String payeeName;
    public String payeeTaxId;
    public String payeeAddress;
    public LocalDate payDate;
    public String incomeType;
    public BigDecimal amount;
    public BigDecimal whtRate;
    public BigDecimal whtAmount;
    public String status = "issued";
    public Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
