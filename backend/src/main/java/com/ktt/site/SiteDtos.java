package com.ktt.site;

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

public final class SiteDtos {

    private SiteDtos() {
    }

    // ---------------------------------------------------------------- daily report

    public record WorkerLine(@NotBlank @Size(max = 100) String trade, @Min(0) @Max(9999) int count) {
    }

    public record TaskProgressInput(@NotNull UUID taskId,
                                    @NotNull @DecimalMin("0") @DecimalMax(value = "100", message = "ความคืบหน้าต้องอยู่ระหว่าง 0–100%") BigDecimal progressPct,
                                    @Size(max = 500) String note) {
    }

    public record DailyReportRequest(
            @NotNull(message = "กรุณาระบุวันที่") LocalDate reportDate,
            @Pattern(regexp = "^$|sunny|cloudy|rain|storm") String weatherAm,
            @Pattern(regexp = "^$|sunny|cloudy|rain|storm") String weatherPm,
            @Size(max = 40) List<@Valid WorkerLine> workers,
            @Size(max = 10000) String workDone,
            @Size(max = 5000) String workPlanned,
            @Size(max = 5000) String problems,
            @Size(max = 5000) String materialsIn,
            @Size(max = 5000) String equipment,
            @Size(max = 2000) String visitors,
            @Size(max = 2000) String safetyNote,
            @Size(max = 500) List<@Valid TaskProgressInput> tasks) {
    }

    public record DailyReportRow(UUID id, LocalDate reportDate, String status, String weatherAm, String weatherPm,
                                 int workersTotal, String summary, long photos, String createdByName, Instant submittedAt) {
    }

    public record TaskProgressDto(UUID taskId, String taskName, BigDecimal previousPct, BigDecimal progressPct, String note) {
    }

    public record DailyReportDto(UUID id, UUID projectId, String projectCode, String projectName, LocalDate reportDate,
                                 String weatherAm, String weatherPm, List<WorkerLine> workers, int workersTotal,
                                 String workDone, String workPlanned, String problems, String materialsIn,
                                 String equipment, String visitors, String safetyNote, String status,
                                 Instant submittedAt, String submittedByName, Instant acknowledgedAt,
                                 String acknowledgedByName, String createdByName, List<TaskProgressDto> tasks,
                                 boolean canEdit, boolean canSubmit, boolean canAcknowledge, Instant createdAt) {
    }

    // ---------------------------------------------------------------- issues / risks

    public record IssueRequest(
            @NotBlank @Pattern(regexp = "issue|risk") String kind,
            @NotBlank(message = "กรุณากรอกหัวข้อ") @Size(max = 255) String title,
            @Size(max = 5000) String description,
            @NotBlank @Pattern(regexp = "low|medium|high|critical") String severity,
            @Pattern(regexp = "^$|low|medium|high") String likelihood,
            @NotBlank @Pattern(regexp = "open|in_progress|resolved|closed") String status,
            UUID ownerId,
            LocalDate dueDate,
            @Size(max = 5000) String resolution) {
    }

    public record IssueDto(UUID id, UUID projectId, String kind, String title, String description, String severity,
                           String likelihood, String status, UUID ownerId, String ownerName, LocalDate dueDate,
                           String resolution, Instant closedAt, boolean overdue, String createdByName, Instant createdAt) {
    }

    // ---------------------------------------------------------------- punch list

    public record PunchRequest(
            @Size(max = 255) String location,
            @NotBlank(message = "กรุณากรอกรายละเอียด") @Size(max = 5000) String description,
            @Size(max = 255) String responsible,
            LocalDate dueDate,
            @NotBlank @Pattern(regexp = "open|fixed|verified") String status) {
    }

    public record PunchDto(UUID id, UUID projectId, int itemNo, String location, String description, String responsible,
                           LocalDate dueDate, String status, Instant fixedAt, Instant verifiedAt, String verifiedByName,
                           long photos, boolean overdue, Instant createdAt) {
    }

    // ---------------------------------------------------------------- QC

    public record QcItem(@NotBlank @Size(max = 500) String text, @Pattern(regexp = "^$|pass|fail|na") String result,
                         @Size(max = 1000) String note) {
    }

    public record QcTemplateRequest(@NotBlank(message = "กรุณากรอกชื่อแม่แบบ") @Size(max = 255) String name,
                                    @Size(max = 100) String category,
                                    @NotNull @Size(min = 1, max = 100) List<@NotBlank @Size(max = 500) String> items) {
    }

    public record QcTemplateDto(UUID id, String name, String category, List<String> items) {
    }

    public record QcRequest(
            UUID taskId,
            @NotBlank(message = "กรุณากรอกหัวข้อการตรวจ") @Size(max = 255) String title,
            @NotNull LocalDate inspectedOn,
            UUID inspectorId,
            @NotNull @Size(max = 100) List<@Valid QcItem> items,
            @Size(max = 5000) String notes) {
    }

    public record QcDto(UUID id, UUID projectId, UUID taskId, String taskName, String title, LocalDate inspectedOn,
                        UUID inspectorId, String inspectorName, String result, List<QcItem> items, String notes,
                        int passCount, int failCount, long photos, Instant createdAt) {
    }

    // ---------------------------------------------------------------- safety

    public record SafetyRequest(
            @NotNull LocalDate logDate,
            @NotBlank @Pattern(regexp = "toolbox|inspection|training|near_miss|incident") String kind,
            @NotBlank(message = "กรุณากรอกหัวข้อ") @Size(max = 255) String title,
            @Size(max = 5000) String detail,
            @Min(0) @Max(9999) Integer peopleCount,
            @Min(0) @Max(999) int injuredCount,
            @NotBlank @Pattern(regexp = "low|medium|high") String severity,
            @Size(max = 5000) String correctiveAction,
            @NotBlank @Pattern(regexp = "open|closed") String status) {
    }

    public record SafetyDto(UUID id, UUID projectId, LocalDate logDate, String kind, String title, String detail,
                            Integer peopleCount, int injuredCount, String severity, String correctiveAction,
                            String status, String createdByName, long photos, Instant createdAt) {
    }

    // ---------------------------------------------------------------- progress report (พิมพ์ให้ลูกค้า)

    public record PhotoRef(UUID id, String fileName, LocalDate date, String caption) {
    }

    public record ProgressReportDto(
            com.ktt.project.ProjectDtos.ProjectDto project,
            com.ktt.project.ProjectDtos.ScheduleDto schedule,
            LocalDate periodFrom,
            LocalDate periodTo,
            List<DailyReportRow> reports,
            String workSummary,
            String nextPlan,
            int manDays,
            int rainDays,
            List<IssueDto> openIssues,
            List<PhotoRef> photos) {
    }
}
