package com.ktt.pricing;

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

public final class PricingDtos {

    private PricingDtos() {
    }

    // ---------- requests
    public record CategoryRequest(@NotBlank(message = "กรุณากรอกชื่อหมวด") @Size(max = 150) String name, UUID parentId, int sortOrder) {
    }

    public record MaterialRequest(
            @NotBlank(message = "กรุณากรอกรหัส") @Size(max = 50) String code,
            @NotBlank(message = "กรุณากรอกชื่อวัสดุ") @Size(max = 255) String name,
            @NotBlank(message = "กรุณากรอกหน่วย") @Size(max = 30) String unit,
            UUID categoryId,
            @NotNull @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal costPrice,
            @NotNull @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal sellPrice,
            @Size(max = 255) String supplierName) {
    }

    public record LaborRequest(
            @NotBlank(message = "กรุณากรอกรหัส") @Size(max = 50) String code,
            @NotBlank(message = "กรุณากรอกชื่อ") @Size(max = 255) String name,
            @NotBlank @Pattern(regexp = "mason|steel|electric|plumbing|paint|tile|carpentry|other") String trade,
            @NotBlank(message = "กรุณากรอกหน่วย") @Size(max = 30) String unit,
            @NotNull @DecimalMin(value = "0", message = "ค่าแรงต้องไม่ติดลบ") BigDecimal rate) {
    }

    public record EquipmentRequest(
            @NotBlank(message = "กรุณากรอกรหัส") @Size(max = 50) String code,
            @NotBlank(message = "กรุณากรอกชื่อ") @Size(max = 255) String name,
            @NotBlank(message = "กรุณากรอกหน่วย") @Size(max = 30) String unit,
            @NotNull @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal rate) {
    }

    // ---------- responses (ฟิลด์ต้นทุนเป็น null ถ้าผู้ใช้ไม่มีสิทธิ์ cost.view)
    public record CategoryDto(UUID id, String name, UUID parentId, int sortOrder, long materialCount) {
    }

    public record MaterialDto(UUID id, String code, String name, String unit, UUID categoryId, String categoryName,
                              BigDecimal costPrice, BigDecimal sellPrice, String supplierName, LocalDate priceUpdatedAt) {
    }

    public record LaborDto(UUID id, String code, String name, String trade, String unit, BigDecimal rate, Instant updatedAt) {
    }

    public record EquipmentDto(UUID id, String code, String name, String unit, BigDecimal rate, Instant updatedAt) {
    }

    public record PriceHistoryDto(UUID id, String priceField, BigDecimal oldPrice, BigDecimal newPrice, Instant changedAt,
                                  String changedByName) {
    }

    /** รายการสำหรับเลือกใส่ BOQ */
    public record PickItem(String type, UUID id, String code, String name, String unit, BigDecimal unitCost) {
    }

    public record ImportError(int row, String message) {
    }

    public record ImportResult(boolean saved, int created, int updated, int unchanged, List<ImportError> errors) {
    }
}
