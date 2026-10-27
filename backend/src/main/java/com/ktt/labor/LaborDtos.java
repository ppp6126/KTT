package com.ktt.labor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class LaborDtos {

    private LaborDtos() {
    }

    public record WorkerRequest(
            @NotBlank(message = "กรุณากรอกชื่อ") @Size(max = 150) String name,
            @Size(max = 50) String nickname,
            @Size(max = 50) String trade,
            @NotNull @DecimalMin("0") BigDecimal dailyWage,
            @NotNull @DecimalMin("0") BigDecimal otRate,
            @Size(max = 30) String phone,
            @Pattern(regexp = "^$|\\d{13}", message = "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก") String idCard,
            UUID supplierId,
            boolean active) {
    }

    public record WorkerDto(UUID id, String name, String nickname, String trade, BigDecimal dailyWage, BigDecimal otRate,
                            String phone, String idCard, UUID supplierId, String supplierName, boolean active) {
    }

    public record Entry(@NotNull UUID workerId, @NotNull LocalDate workDate,
                        @NotNull @DecimalMin("0") @DecimalMax("1.5") BigDecimal days,
                        @NotNull @DecimalMin("0") @DecimalMax("12") BigDecimal otHours,
                        @Size(max = 255) String note) {
    }

    public record SaveTimesheetRequest(@NotNull UUID projectId, @NotNull @Size(max = 2000) List<@Valid Entry> entries) {
    }

    public record EntryDto(UUID workerId, LocalDate workDate, BigDecimal days, BigDecimal otHours, BigDecimal wage,
                           String note, boolean locked) {
    }

    public record TimesheetDto(UUID projectId, LocalDate from, LocalDate to, List<WorkerDto> workers, List<EntryDto> entries,
                               BigDecimal totalWage, BigDecimal totalDays) {
    }

    public record WageLine(UUID workerId, String workerName, String trade, BigDecimal days, BigDecimal otHours, BigDecimal amount) {
    }

    public record WagePreviewRequest(@NotNull LocalDate from, @NotNull LocalDate to, UUID projectId) {
    }

    public record WagePaymentRequest(@NotNull LocalDate from, @NotNull LocalDate to, UUID projectId, @Size(max = 2000) String notes) {
    }

    public record WagePaymentDto(UUID id, String docNo, LocalDate periodFrom, LocalDate periodTo, UUID projectId,
                                 String projectCode, BigDecimal total, LocalDate paidDate, String status, String notes,
                                 List<WageLine> lines, String createdByName) {
    }

    public record PayRequest(@NotNull LocalDate paidDate) {
    }
}
