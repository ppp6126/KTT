package com.ktt.boq;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class BoqDtos {

    private BoqDtos() {
    }

    // ---------------------------------------------------------------- requests

    public record CreateBoqRequest(
            @NotNull(message = "กรุณาเลือกลีด") UUID leadId,
            @NotBlank(message = "กรุณากรอกชื่อ BOQ") @Size(max = 255) String name,
            @Size(max = 100) String optionLabel,
            UUID templateId,
            UUID copyFromId) {
    }

    public record BoqHeaderRequest(
            @NotBlank(message = "กรุณากรอกชื่อ BOQ") @Size(max = 255) String name,
            @Size(max = 100) String optionLabel,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal overheadPct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal profitPct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal contingencyPct,
            @NotNull @DecimalMin("0") BigDecimal discountAmount,
            @NotNull @DecimalMin("0") @DecimalMax("20") BigDecimal vatPct,
            @NotNull BigDecimal whtPct,
            @NotBlank @Pattern(regexp = "none|manual|table") String factorFMode,
            @DecimalMin("0.5") @DecimalMax("3") BigDecimal factorFValue,
            UUID factorFTableId,
            @Size(max = 255) String projectName,
            @Size(max = 500) String projectLocation,
            @Size(max = 255) String ownerAgency,
            @Size(max = 5000) String notes) {
    }

    /**
     * แถวที่ส่งมาจากหน้าแก้ไข: key = id เดิม หรือ key ชั่วคราวของแถวใหม่, parentKey = key ของแถวแม่
     * ต้นทุนต่อหน่วยเป็น snapshot ที่หน้าเว็บดึงจากฐานราคา (แก้ไขเองได้)
     */
    public record ItemInput(
            @NotBlank String key,
            String parentKey,
            @NotBlank(message = "กรุณากรอกรายละเอียดทุกแถว") @Size(max = 500) String description,
            @Size(max = 30) String unit,
            @DecimalMin(value = "0", message = "ปริมาณต้องไม่ติดลบ") BigDecimal quantity,
            UUID materialId,
            UUID laborId,
            UUID equipmentId,
            @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal unitMaterialCost,
            @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal unitLabor,
            @DecimalMin(value = "0", message = "ราคาต้องไม่ติดลบ") BigDecimal unitEquipment,
            @Size(max = 255) String note) {
    }

    public record ItemsRequest(@NotNull @Size(max = 3000, message = "BOQ หนึ่งชุดมีได้ไม่เกิน 3,000 แถว") List<@Valid ItemInput> items) {
    }

    public record CopyRequest(@NotBlank @Size(max = 255) String name, @Size(max = 100) String optionLabel, UUID leadId) {
    }

    public record SaveAsTemplateRequest(@NotBlank(message = "กรุณากรอกชื่อแม่แบบ") @Size(max = 255) String name,
                                        @Size(max = 20) String jobType, @Size(max = 2000) String description) {
    }

    // ---------------------------------------------------------------- responses
    // ฟิลด์ต้นทุน (unit*, materialAmount, laborAmount, lineCost, subtotalCost, marginPct) เป็น null ถ้าไม่มีสิทธิ์ cost.view

    public record ItemDto(
            UUID id,
            UUID parentId,
            int level,
            int sortOrder,
            String number,
            String description,
            String unit,
            BigDecimal quantity,
            UUID materialId,
            UUID laborId,
            UUID equipmentId,
            BigDecimal unitMaterialCost,
            BigDecimal unitLabor,
            BigDecimal unitEquipment,
            BigDecimal materialAmount,
            BigDecimal laborAmount,
            BigDecimal equipmentAmount,
            BigDecimal lineCost,
            BigDecimal unitSell,
            BigDecimal lineSell,
            boolean leaf,
            String note) {
    }

    public record BoqSummary(
            UUID id,
            UUID leadId,
            String name,
            String optionLabel,
            BigDecimal subtotalCost,
            BigDecimal subtotalSell,
            BigDecimal grandTotal,
            BigDecimal marginPct,
            long itemCount,
            Instant updatedAt) {
    }

    public record BoqDto(
            UUID id,
            UUID leadId,
            String leadTitle,
            UUID customerId,
            String customerName,
            String name,
            String optionLabel,
            BigDecimal overheadPct,
            BigDecimal profitPct,
            BigDecimal contingencyPct,
            BigDecimal discountAmount,
            BigDecimal vatPct,
            BigDecimal whtPct,
            BigDecimal subtotalCost,
            BigDecimal subtotalSell,
            BigDecimal vatAmount,
            BigDecimal grandTotal,
            BigDecimal marginPct,
            String factorFMode,
            BigDecimal factorFValue,
            UUID factorFTableId,
            String projectName,
            String projectLocation,
            String ownerAgency,
            String notes,
            boolean canViewCost,
            List<ItemDto> items,
            Instant updatedAt) {
    }

    // ---------------------------------------------------------------- แบบฟอร์มราชการ

    /** ปร.4: ค่าวัสดุ (รวมค่าเครื่องจักร) และค่าแรงงาน แยกราคาต่อหน่วยกับจำนวนเงิน */
    public record Gov4Row(
            String number,
            int level,
            boolean leaf,
            String description,
            BigDecimal quantity,
            String unit,
            BigDecimal materialUnit,
            BigDecimal materialAmount,
            BigDecimal laborUnit,
            BigDecimal laborAmount,
            BigDecimal total,
            String note) {
    }

    /** ปร.5: สรุปต่อหมวด ค่างานต้นทุน × Factor F = ค่าก่อสร้าง */
    public record Gov5Row(String number, String description, BigDecimal cost, BigDecimal factorF, BigDecimal price) {
    }

    public record GovForm(
            String projectName,
            String projectLocation,
            String ownerAgency,
            String customerName,
            String boqName,
            List<Gov4Row> form4,
            BigDecimal totalMaterial,
            BigDecimal totalLabor,
            BigDecimal totalCost,
            List<Gov5Row> form5,
            String factorFMode,
            String factorFTableName,
            BigDecimal factorF,
            BigDecimal totalPrice,
            BigDecimal totalPriceRounded) {
    }

    // ---------------------------------------------------------------- templates & factor F

    public record TemplateSummary(UUID id, String name, String jobType, String description, long itemCount, Instant updatedAt) {
    }

    public record TemplateItemDto(UUID id, UUID parentId, int level, int sortOrder, String description, String unit,
                                  BigDecimal quantity, UUID materialId, UUID laborId, UUID equipmentId, String note) {
    }

    public record TemplateDto(UUID id, String name, String jobType, String description, List<TemplateItemDto> items) {
    }

    public record TemplateRequest(
            @NotBlank(message = "กรุณากรอกชื่อแม่แบบ") @Size(max = 255) String name,
            @Size(max = 20) String jobType,
            @Size(max = 2000) String description,
            @NotNull List<@Valid ItemInput> items) {
    }

    public record FactorRowDto(BigDecimal cost, BigDecimal factor) {
    }

    public record FactorTableDto(UUID id, String name, String workType, BigDecimal advancePct, BigDecimal retentionPct,
                                 BigDecimal interestPct, BigDecimal vatPct, String note, List<FactorRowDto> rows) {
    }

    public record FactorTableRequest(
            @NotBlank(message = "กรุณากรอกชื่อตาราง") @Size(max = 255) String name,
            @Size(max = 50) String workType,
            BigDecimal advancePct,
            BigDecimal retentionPct,
            BigDecimal interestPct,
            BigDecimal vatPct,
            @Size(max = 2000) String note,
            @NotNull @Size(min = 1, message = "ต้องมีอย่างน้อย 1 แถว") List<@Valid FactorRowInput> rows) {
    }

    public record FactorRowInput(@NotNull @DecimalMin("0") BigDecimal cost,
                                 @NotNull @DecimalMin("0.5") @DecimalMax("3") BigDecimal factor) {
    }
}
