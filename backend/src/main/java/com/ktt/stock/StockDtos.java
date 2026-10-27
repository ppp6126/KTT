package com.ktt.stock;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class StockDtos {

    private StockDtos() {
    }

    public record WarehouseRequest(@NotBlank @Size(max = 30) @Pattern(regexp = "[A-Za-z0-9_-]+", message = "รหัสคลังใช้ตัวอักษรอังกฤษ ตัวเลข - _") String code,
                                   @NotBlank(message = "กรุณากรอกชื่อคลัง") @Size(max = 150) String name,
                                   UUID projectId, boolean active) {
    }

    public record WarehouseDto(UUID id, String code, String name, UUID projectId, String projectCode, String projectName,
                               boolean active, BigDecimal stockValue) {
    }

    public record LineInput(@NotNull UUID materialId, @NotNull BigDecimal qty, BigDecimal unitCost, @Size(max = 500) String note) {
    }

    public record StockDocRequest(
            @NotBlank @Pattern(regexp = "issue|transfer|adjust|return") String kind,
            @NotNull LocalDate docDate,
            @NotNull UUID warehouseId,
            UUID toWarehouseId,
            UUID projectId,
            @Size(max = 2000) String notes,
            @NotNull @Size(min = 1, max = 200, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid LineInput> lines) {
    }

    public record MinQtyRequest(@NotNull UUID materialId, @NotNull UUID warehouseId, @NotNull @DecimalMin("0") BigDecimal minQty) {
    }

    public record OnHandRow(UUID materialId, String code, String name, String unit, UUID warehouseId, String warehouseCode,
                            String warehouseName, BigDecimal qty, BigDecimal avgCost, BigDecimal value, BigDecimal minQty,
                            boolean low, LocalDate lastMovement) {
    }

    public record LedgerRow(LocalDate date, String kind, BigDecimal qty, BigDecimal unitCost, String refType, UUID refId,
                            String refNo, String projectCode, String note, BigDecimal balance, BigDecimal balanceValue) {
    }

    public record DocLine(UUID materialId, String code, String name, String unit, BigDecimal qty, BigDecimal unitCost, String note) {
    }

    public record StockDocDto(UUID id, String docNo, String kind, LocalDate docDate, String warehouseName,
                              String toWarehouseName, String projectCode, String notes, String createdByName,
                              BigDecimal value, List<DocLine> lines) {
    }
}
