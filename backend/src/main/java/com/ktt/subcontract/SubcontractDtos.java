package com.ktt.subcontract;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class SubcontractDtos {

    private SubcontractDtos() {
    }

    public record SaveRequest(
            @NotNull UUID projectId,
            @NotNull UUID supplierId,
            @NotBlank(message = "กรุณากรอกชื่องานจ้าง") @Size(max = 255) String title,
            @Size(max = 10000) String scope,
            @NotNull @DecimalMin("0") BigDecimal amount,
            boolean vatEnabled,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal retentionPct,
            @NotNull BigDecimal whtPct,
            LocalDate startDate,
            LocalDate endDate,
            @Size(max = 5000) String notes) {
    }

    public record ClaimRequest(
            @NotNull LocalDate claimDate,
            @NotBlank(message = "กรุณากรอกรายละเอียดงวด") @Size(max = 500) String description,
            @DecimalMin("0") @DecimalMax("100") BigDecimal progressPct,
            @NotNull @DecimalMin(value = "0.01", message = "มูลค่างวดต้องมากกว่า 0") BigDecimal amount) {
    }

    public record AmountRequest(@NotNull @DecimalMin(value = "0.01") BigDecimal amount) {
    }

    public record StatusRequest(@NotBlank String status) {
    }

    public record ClaimDto(UUID id, int claimNo, LocalDate claimDate, String description, BigDecimal progressPct,
                           BigDecimal amount, BigDecimal retention, BigDecimal wht, BigDecimal vat, BigDecimal net,
                           String status, UUID apBillId, String apBillNo, String apBillStatus, String approvedByName,
                           Instant approvedAt) {
    }

    public record Row(UUID id, String docNo, UUID projectId, String projectCode, String supplierName, String title,
                      BigDecimal amount, BigDecimal claimed, BigDecimal claimedPct, String status, LocalDate endDate) {
    }

    public record Dto(UUID id, String docNo, UUID projectId, String projectCode, String projectName, UUID supplierId,
                      String supplierName, String supplierTaxId, String title, String scope, BigDecimal amount,
                      boolean vatEnabled, BigDecimal vatPct, BigDecimal retentionPct, BigDecimal whtPct,
                      LocalDate startDate, LocalDate endDate, String status, String notes, BigDecimal claimed,
                      BigDecimal claimedPct, BigDecimal retentionHeld, BigDecimal retentionReleased, BigDecimal paid,
                      List<ClaimDto> claims, boolean canEdit, Instant createdAt) {
    }
}
