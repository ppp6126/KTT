package com.ktt.aftercare;

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

public final class AftercareDtos {

    private AftercareDtos() {
    }

    // ---------------------------------------------------------------- tickets

    public record TicketRequest(
            UUID projectId,
            UUID customerId,
            @NotBlank(message = "กรุณาระบุเรื่องที่แจ้ง") @Size(max = 255) String title,
            @Size(max = 5000) String description,
            @NotBlank @Pattern(regexp = "structure|roof_leak|plumbing|electrical|finishing|door_window|other") String category,
            @NotBlank @Pattern(regexp = "low|normal|high|urgent") String priority,
            @NotBlank @Pattern(regexp = "phone|line|walk_in|site|email|other") String channel,
            @Size(max = 150) String reporterName,
            @Size(max = 30) String reporterPhone,
            @Size(max = 1000) String siteAddress,
            Instant reportedAt) {
    }

    public record ScheduleRequest(UUID assigneeId, Instant appointmentAt, @Size(max = 2000) String note) {
    }

    public record ResolveRequest(@NotBlank(message = "กรุณาบันทึกวิธีแก้ไข") @Size(max = 5000) String resolution,
                                 @NotNull @DecimalMin("0") BigDecimal laborCost,
                                 @NotNull @DecimalMin("0") BigDecimal materialCost,
                                 @NotNull @DecimalMin("0") BigDecimal chargeAmount) {
    }

    public record ActionRequest(@NotBlank @Pattern(regexp = "start|close|reject|reopen|note") String action,
                                @Size(max = 2000) String note) {
    }

    public record TicketRow(UUID id, String docNo, String title, String category, String priority, String status,
                            UUID projectId, String projectCode, String customerName, boolean inWarranty, Instant reportedAt,
                            Instant appointmentAt, String assigneeName, long ageDays) {
    }

    public record TicketLog(Instant at, String status, String note, String byName) {
    }

    public record TicketDto(UUID id, String docNo, UUID projectId, String projectCode, String projectName, UUID customerId,
                            String customerName, String customerPhone, String title, String description, String category,
                            String priority, String channel, String reporterName, String reporterPhone, String siteAddress,
                            Instant reportedAt, boolean inWarranty, LocalDate warrantyEnd, String status, UUID assigneeId,
                            String assigneeName, Instant appointmentAt, Instant resolvedAt, Instant closedAt, String resolution,
                            BigDecimal laborCost, BigDecimal materialCost, BigDecimal chargeAmount, List<TicketLog> logs,
                            List<SurveyDto> surveys, String createdByName, Instant createdAt) {
    }

    public record TicketStats(long open, long scheduled, long inProgress, long urgent, long overdueAppointments,
                              BigDecimal avgResolveDays, BigDecimal warrantyCostYtd) {
    }

    // ---------------------------------------------------------------- warranty

    public record WarrantyRow(UUID projectId, String code, String name, String customerName, LocalDate handoverDate,
                              Integer contractMonths, LocalDate warrantyEnd, boolean overridden, String state, Long daysLeft,
                              long openTickets, long totalTickets, BigDecimal warrantyCost) {
    }

    public record WarrantyOverride(LocalDate warrantyUntil) {
    }

    // ---------------------------------------------------------------- surveys

    public record SurveyRequest(
            UUID customerId,
            UUID projectId,
            UUID ticketId,
            @NotNull LocalDate surveyDate,
            @NotBlank @Pattern(regexp = "phone|visit|paper|line|other") String method,
            @Size(max = 150) String respondent,
            @Min(1) @Max(5) Integer quality,
            @Min(1) @Max(5) Integer timeliness,
            @Min(1) @Max(5) Integer communication,
            @Min(1) @Max(5) Integer cleanliness,
            @NotNull(message = "กรุณาให้คะแนนความพึงพอใจโดยรวม") @Min(1) @Max(5) Integer overall,
            Boolean recommend,
            @Size(max = 5000) String comment) {
    }

    public record SurveyDto(UUID id, UUID customerId, String customerName, UUID projectId, String projectCode, UUID ticketId,
                            String ticketNo, LocalDate surveyDate, String method, String respondent, Integer quality,
                            Integer timeliness, Integer communication, Integer cleanliness, int overall, Boolean recommend,
                            String comment, String createdByName) {
    }

    public record SurveySummary(long count, BigDecimal overall, BigDecimal quality, BigDecimal timeliness,
                                BigDecimal communication, BigDecimal cleanliness, BigDecimal recommendPct,
                                List<ProjectScore> byProject, List<ManagerScore> byManager) {
    }

    public record ProjectScore(UUID projectId, String code, String name, long count, BigDecimal overall) {
    }

    public record ManagerScore(UUID managerId, String name, long count, BigDecimal overall) {
    }
}
