package com.ktt.quotation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class QuotationDtos {

    private QuotationDtos() {
    }

    // ---------------------------------------------------------------- requests

    /** mode: manual = เริ่มจากรายการว่าง, summary = สรุปตามหมวดของ BOQ, detailed = ทุกรายการของ BOQ */
    public record CreateRequest(
            @NotNull(message = "กรุณาเลือกลูกค้า") UUID customerId,
            UUID leadId,
            UUID boqId,
            @Pattern(regexp = "manual|summary|detailed") String mode,
            @Size(max = 255) String title) {
    }

    public record ItemInput(
            @NotBlank @Pattern(regexp = "item|heading|note") String itemType,
            @NotBlank(message = "กรุณากรอกรายการให้ครบทุกแถว") @Size(max = 1000) String description,
            @DecimalMin(value = "0", message = "จำนวนต้องไม่ติดลบ") BigDecimal quantity,
            @Size(max = 30) String unit,
            @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal unitPrice,
            BigDecimal unitCost) {
    }

    public record UpdateRequest(
            @Size(max = 255) String title,
            @NotBlank(message = "กรุณากรอกชื่อลูกค้า") @Size(max = 255) String customerName,
            @Size(max = 2000) String customerAddress,
            @Pattern(regexp = "^$|\\d{13}", message = "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก") String customerTaxId,
            @Pattern(regexp = "^$|\\d{5}") String customerBranchNo,
            @Size(max = 30) String customerPhone,
            @NotNull(message = "กรุณาระบุวันที่") LocalDate issueDate,
            @NotNull(message = "กรุณาระบุวันหมดอายุ") LocalDate validUntil,
            @Size(max = 100) String referenceNo,
            @Size(max = 255) String paymentCondition,
            @Pattern(regexp = "summary|detailed") String displayMode,
            @NotNull @DecimalMin(value = "0", message = "ส่วนลดต้องอยู่ระหว่าง 0–15%")
            @DecimalMax(value = "15", message = "ส่วนลดต้องอยู่ระหว่าง 0–15%") BigDecimal discountPct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal overheadPct,
            boolean vatEnabled,
            @NotNull @DecimalMin("0") @DecimalMax("20") BigDecimal vatPct,
            @NotBlank @Pattern(regexp = "none|down_1|down_10|down_100") String roundingMode,
            @NotNull BigDecimal whtPct,
            @Min(0) @Max(3650) Integer durationDays,
            @Size(max = 5000) String warrantyTerms,
            @Size(max = 10000) String scopeIn,
            @Size(max = 10000) String scopeOut,
            @Size(max = 5000) String notes,
            @NotNull @Size(max = 500, message = "ใบเสนอราคาหนึ่งใบมีได้ไม่เกิน 500 แถว") List<@Valid ItemInput> items) {
    }

    public record ReasonRequest(@Size(max = 2000) String reason) {
    }

    public record DecisionRequest(@Size(max = 2000) String comment) {
    }

    // ---------------------------------------------------------------- responses

    public record ItemDto(UUID id, int sortOrder, String itemType, String description, BigDecimal quantity, String unit,
                          BigDecimal unitPrice, BigDecimal amount, BigDecimal unitCost) {
    }

    public record ApprovalInfo(UUID id, String status, String reason, String requestedByName, String decidedByName,
                               String comment, Instant createdAt, Instant decidedAt) {
    }

    public record QuotationRow(
            UUID id,
            String docNo,
            int revision,
            String displayNo,
            String status,
            String title,
            UUID customerId,
            String customerName,
            UUID leadId,
            LocalDate issueDate,
            LocalDate validUntil,
            BigDecimal discountPct,
            BigDecimal totalAmount,
            BigDecimal marginPct,
            String createdByName,
            Instant updatedAt) {
    }

    public record QuotationDto(
            UUID id,
            String docNo,
            int revision,
            String displayNo,
            String status,
            String title,
            UUID customerId,
            UUID leadId,
            String leadTitle,
            UUID boqId,
            String customerName,
            String customerAddress,
            String customerTaxId,
            String customerBranchNo,
            String customerPhone,
            LocalDate issueDate,
            LocalDate validUntil,
            String referenceNo,
            String paymentCondition,
            String displayMode,
            BigDecimal subtotal,
            BigDecimal discountPct,
            BigDecimal discountAmount,
            BigDecimal overheadPct,
            BigDecimal overheadAmount,
            boolean vatEnabled,
            BigDecimal vatPct,
            BigDecimal vatAmount,
            String roundingMode,
            BigDecimal roundingAmount,
            BigDecimal whtPct,
            BigDecimal whtAmount,
            BigDecimal totalAmount,
            BigDecimal costTotal,
            BigDecimal marginPct,
            Integer durationDays,
            String warrantyTerms,
            String scopeIn,
            String scopeOut,
            String notes,
            String lostReason,
            Instant sentAt,
            Instant decidedAt,
            String createdByName,
            Instant createdAt,
            Instant updatedAt,
            List<ItemDto> items,
            ApprovalInfo approval,
            boolean needsApproval,
            int approvalThresholdPct,
            boolean editable,
            boolean latestRevision) {
    }

    public record RevisionRow(UUID id, int revision, String status, BigDecimal totalAmount, Instant createdAt, Instant sentAt) {
    }

    public record PendingApproval(UUID approvalId, UUID quotationId, String displayNo, String customerName, String title,
                                  BigDecimal discountPct, BigDecimal totalAmount, BigDecimal marginPct,
                                  String requestedByName, Instant createdAt) {
    }
}
