package com.ktt.contract;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ContractDtos {

    private ContractDtos() {
    }

    // ---------------------------------------------------------------- requests

    public record MilestoneInput(
            UUID id,
            @NotBlank(message = "กรุณากรอกชื่องวดให้ครบ") @Size(max = 255) String name,
            @Size(max = 2000) String criteria,
            @NotNull @DecimalMin(value = "0", message = "% งวดต้องไม่ติดลบ") @DecimalMax("100") BigDecimal pct,
            LocalDate dueDate) {
    }

    /** แปลงใบเสนอราคาที่ลูกค้าตอบรับเป็นโครงการ + สัญญา ในคลิกเดียว */
    public record FromQuotationRequest(
            @NotNull UUID quotationId,
            @Size(max = 255) String projectName,
            @Size(max = 2000) String siteAddress,
            LocalDate contractDate,
            LocalDate startDate,
            LocalDate endDate,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal advancePct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal retentionPct,
            @NotNull BigDecimal whtPct,
            @Size(max = 60) List<@Valid MilestoneInput> milestones) {
    }

    public record CreateRequest(
            @NotNull UUID projectId,
            @Size(max = 255) String title,
            @NotNull @DecimalMin("0") BigDecimal amount,
            boolean vatEnabled) {
    }

    public record UpdateRequest(
            @NotBlank(message = "กรุณากรอกชื่อสัญญา") @Size(max = 255) String title,
            @NotBlank(message = "กรุณากรอกชื่อผู้ว่าจ้าง") @Size(max = 255) String customerName,
            @Size(max = 2000) String customerAddress,
            @jakarta.validation.constraints.Pattern(regexp = "^$|\\d{13}", message = "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก") String customerTaxId,
            @jakarta.validation.constraints.Pattern(regexp = "^$|\\d{5}") String customerBranchNo,
            @NotNull(message = "กรุณาระบุวันที่ทำสัญญา") LocalDate contractDate,
            LocalDate startDate,
            LocalDate endDate,
            @NotNull @DecimalMin(value = "0", message = "มูลค่าสัญญาต้องไม่ติดลบ") BigDecimal amount,
            boolean vatEnabled,
            @NotNull @DecimalMin("0") @DecimalMax("20") BigDecimal vatPct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal advancePct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal retentionPct,
            @NotNull BigDecimal whtPct,
            @DecimalMin("0") BigDecimal penaltyPerDay,
            @Min(0) @Max(240) Integer warrantyMonths,
            @Size(max = 20000) String terms,
            @Size(max = 5000) String notes,
            LocalDate signedAt) {
    }

    public record SaveMilestonesRequest(@NotNull @Size(max = 60) List<@Valid MilestoneInput> milestones) {
    }

    public record StatusRequest(@NotBlank String status, @Size(max = 2000) String reason) {
    }

    public record RetentionRequest(@NotNull @DecimalMin(value = "0.01", message = "จำนวนเงินต้องมากกว่า 0") BigDecimal amount) {
    }

    public record VoItemInput(
            @NotBlank(message = "กรุณากรอกรายการให้ครบ") @Size(max = 1000) String description,
            @NotNull @DecimalMin(value = "0", message = "จำนวนต้องไม่ติดลบ") BigDecimal quantity,
            @Size(max = 30) String unit,
            @NotNull BigDecimal unitPrice,
            BigDecimal unitCost,
            /** id รายการเดิม (ถ้ามี) ใช้คงต้นทุนเดิมเมื่อผู้แก้ไม่มีสิทธิ์ดูต้นทุน */
            UUID id) {
    }

    public record VoRequest(
            @NotBlank(message = "กรุณากรอกหัวข้องานเพิ่ม-ลด") @Size(max = 255) String title,
            @Size(max = 5000) String reason,
            boolean requestedByCustomer,
            @NotNull LocalDate issueDate,
            @Min(-3650) @Max(3650) int daysExtension,
            LocalDate customerApprovedAt,
            @NotNull @Size(min = 1, max = 300, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid VoItemInput> items) {
    }

    public record VoDecisionRequest(@Size(max = 2000) String comment, boolean createMilestone) {
    }

    // ---------------------------------------------------------------- responses

    public record MilestoneDto(UUID id, int seq, String name, String criteria, BigDecimal pct, BigDecimal amount,
                               LocalDate dueDate, String status, UUID changeOrderId, LocalDate completedAt,
                               UUID invoiceId, String invoiceNo, boolean editable) {
    }

    public record VoRow(UUID id, String docNo, String title, String status, LocalDate issueDate, BigDecimal amount,
                        int daysExtension, Instant decidedAt) {
    }

    public record Financials(BigDecimal amount, BigDecimal voApproved, BigDecimal revisedAmount, BigDecimal vatAmount,
                             BigDecimal revisedTotal, BigDecimal billed, BigDecimal received, BigDecimal outstanding,
                             BigDecimal advanceBilled, BigDecimal advanceDeducted, BigDecimal retentionHeld,
                             BigDecimal retentionReleased, BigDecimal milestonePctTotal) {
    }

    public record ContractDto(
            UUID id,
            String docNo,
            UUID projectId,
            String projectCode,
            String projectName,
            UUID quotationId,
            String quotationNo,
            UUID customerId,
            String customerName,
            String customerAddress,
            String customerTaxId,
            String customerBranchNo,
            String title,
            LocalDate contractDate,
            LocalDate startDate,
            LocalDate endDate,
            BigDecimal amount,
            boolean vatEnabled,
            BigDecimal vatPct,
            BigDecimal advancePct,
            BigDecimal retentionPct,
            BigDecimal whtPct,
            BigDecimal penaltyPerDay,
            Integer warrantyMonths,
            String status,
            String terms,
            String notes,
            LocalDate signedAt,
            List<MilestoneDto> milestones,
            List<VoRow> changeOrders,
            Financials financials,
            boolean canEdit,
            boolean canApprove,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record ContractRow(UUID id, String docNo, UUID projectId, String projectCode, String projectName,
                              String customerName, String status, LocalDate contractDate, LocalDate endDate,
                              BigDecimal revisedAmount, BigDecimal billed, BigDecimal received) {
    }

    public record VoItemDto(UUID id, int sortOrder, String description, BigDecimal quantity, String unit,
                            BigDecimal unitPrice, BigDecimal unitCost, BigDecimal amount) {
    }

    public record VoDto(UUID id, String docNo, UUID contractId, String contractNo, UUID projectId, String projectName,
                        String customerName, String title, String reason, boolean requestedByCustomer,
                        BigDecimal amount, BigDecimal vatAmount, BigDecimal total, BigDecimal costAmount,
                        int daysExtension, String status, LocalDate issueDate, LocalDate customerApprovedAt,
                        String decidedByName, Instant decidedAt, String decisionComment, String createdByName,
                        List<VoItemDto> items, boolean editable, boolean canApprove, Instant createdAt) {
    }
}
