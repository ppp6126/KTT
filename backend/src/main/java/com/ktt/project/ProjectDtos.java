package com.ktt.project;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ProjectDtos {

    private ProjectDtos() {
    }

    // ---------------------------------------------------------------- requests

    public record SaveRequest(
            @NotBlank(message = "กรุณากรอกชื่อโครงการ") @Size(max = 255) String name,
            @NotNull(message = "กรุณาเลือกลูกค้า") UUID customerId,
            @Size(max = 2000) String siteAddress,
            @Pattern(regexp = "planning|active|on_hold|completed|cancelled") String status,
            LocalDate plannedStart,
            LocalDate plannedEnd,
            LocalDate actualStart,
            LocalDate actualEnd,
            UUID managerId,
            UUID foremanId,
            @DecimalMin("0") BigDecimal budgetCost,
            @Size(max = 5000) String notes,
            @Size(max = 50) List<@Valid MemberInput> members) {
    }

    public record MemberInput(@NotNull UUID userId, @Size(max = 100) String roleLabel) {
    }

    /**
     * งานในแผน: id = งานเดิม (null = งานใหม่), key = รหัสชั่วคราวฝั่ง client ใช้อ้าง parentKey/predecessorKey
     * ลำดับในรายการคือ sort_order
     */
    public record TaskInput(
            UUID id,
            @NotBlank @Size(max = 64) String key,
            @Size(max = 64) String parentKey,
            @Size(max = 64) String predecessorKey,
            @NotBlank(message = "กรุณากรอกชื่องานให้ครบทุกแถว") @Size(max = 255) String name,
            LocalDate plannedStart,
            LocalDate plannedEnd,
            LocalDate actualStart,
            LocalDate actualEnd,
            @NotNull @DecimalMin(value = "0", message = "น้ำหนักงานต้องไม่ติดลบ") BigDecimal weight,
            @NotNull @DecimalMin("0") @DecimalMax(value = "100", message = "ความคืบหน้าต้องอยู่ระหว่าง 0–100%") BigDecimal progressPct,
            UUID assigneeId,
            boolean isMilestone) {
    }

    public record SaveTasksRequest(@NotNull @Size(max = 1000, message = "แผนงานมีได้ไม่เกิน 1,000 งาน") List<@Valid TaskInput> tasks) {
    }

    // ---------------------------------------------------------------- responses

    public record ProjectRow(UUID id, String code, String name, UUID customerId, String customerName, String status,
                             LocalDate plannedStart, LocalDate plannedEnd, BigDecimal progressPct, BigDecimal plannedPct,
                             String managerName, BigDecimal contractAmount, Instant updatedAt) {
    }

    public record Member(UUID userId, String name, String roleLabel) {
    }

    public record ContractSummary(UUID id, String docNo, String status, BigDecimal amount, BigDecimal revisedAmount,
                                  BigDecimal billedAmount, BigDecimal receivedAmount) {
    }

    public record Counters(long openIssues, long openRisks, long openPunch, long dailyReports, long pendingQc,
                           long openSafety, long attachments) {
    }

    public record ProjectDto(
            UUID id,
            String code,
            String name,
            UUID customerId,
            String customerName,
            UUID leadId,
            UUID quotationId,
            String quotationNo,
            String siteAddress,
            String status,
            LocalDate plannedStart,
            LocalDate plannedEnd,
            LocalDate actualStart,
            LocalDate actualEnd,
            UUID managerId,
            String managerName,
            UUID foremanId,
            String foremanName,
            BigDecimal budgetCost,
            BigDecimal progressPct,
            BigDecimal plannedPct,
            String notes,
            List<Member> members,
            ContractSummary contract,
            Counters counters,
            boolean canEdit,
            boolean canReport,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record TaskDto(UUID id, UUID parentId, int sortOrder, int depth, String name, LocalDate plannedStart,
                          LocalDate plannedEnd, LocalDate actualStart, LocalDate actualEnd, BigDecimal weight,
                          BigDecimal progressPct, BigDecimal plannedPct, BigDecimal rollupWeight, UUID predecessorId,
                          UUID assigneeId, String assigneeName, boolean isMilestone, boolean leaf, boolean late) {
    }

    public record CurvePoint(LocalDate date, BigDecimal plannedPct, BigDecimal actualPct) {
    }

    public record CategoryProgress(UUID taskId, String name, BigDecimal weightPct, BigDecimal actualPct, BigDecimal plannedPct) {
    }

    public record ScheduleDto(UUID projectId, LocalDate asOf, BigDecimal actualPct, BigDecimal plannedPct,
                              BigDecimal variancePct, List<TaskDto> tasks, List<CategoryProgress> categories,
                              List<CurvePoint> curve) {
    }
}
