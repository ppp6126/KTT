package com.ktt.purchase;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
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
import java.util.Map;
import java.util.UUID;

public final class PurchaseDtos {

    private PurchaseDtos() {
    }

    // ================================================================= suppliers

    public record SupplierRequest(
            @Size(max = 30) String code,
            @NotBlank(message = "กรุณากรอกชื่อผู้ขาย") @Size(max = 255) String name,
            @NotBlank @Pattern(regexp = "supplier|subcontractor|both") String kind,
            @NotBlank @Pattern(regexp = "person|company") String personType,
            @Pattern(regexp = "^$|\\d{13}", message = "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก") String taxId,
            @Pattern(regexp = "^$|\\d{5}", message = "สาขาต้องเป็นตัวเลข 5 หลัก") String branchNo,
            @Size(max = 2000) String address,
            @Size(max = 30) String phone,
            @Email @Size(max = 255) String email,
            @Size(max = 150) String contactName,
            @Size(max = 100) String category,
            @Min(0) @Max(365) int creditDays,
            boolean vatRegistered,
            @Size(max = 100) String bankName,
            @Size(max = 50) String bankAccount,
            @Size(max = 5000) String notes,
            boolean active) {
    }

    public record SupplierRow(UUID id, String code, String name, String kind, String personType, String taxId, String phone,
                              String contactName, String category, int creditDays, boolean active, BigDecimal rating,
                              BigDecimal openPayable) {
    }

    public record SupplierDto(UUID id, String code, String name, String kind, String personType, String taxId, String branchNo,
                              String address, String phone, String email, String contactName, String category, int creditDays,
                              boolean vatRegistered, String bankName, String bankAccount, String notes, boolean active,
                              BigDecimal rating, List<EvaluationDto> evaluations, Instant createdAt) {
    }

    public record SupplierOption(UUID id, String code, String name, String kind, int creditDays, boolean vatRegistered) {
    }

    public record EvaluationRequest(UUID projectId, @NotNull LocalDate evalDate,
                                    @Min(1) @Max(5) int quality, @Min(1) @Max(5) int delivery,
                                    @Min(1) @Max(5) int price, @Min(1) @Max(5) int service,
                                    @Size(max = 2000) String comment) {
    }

    public record EvaluationDto(UUID id, UUID projectId, String projectCode, LocalDate evalDate, int quality, int delivery,
                                int price, int service, BigDecimal average, String comment, String createdByName) {
    }

    // ================================================================= PR

    public record PrItemInput(
            UUID id,
            UUID materialId,
            @NotBlank(message = "กรุณากรอกรายการให้ครบ") @Size(max = 500) String description,
            @NotNull @DecimalMin(value = "0.001", message = "จำนวนต้องมากกว่า 0") BigDecimal quantity,
            @Size(max = 30) String unit,
            @DecimalMin("0") BigDecimal estUnitPrice,
            @Size(max = 500) String note) {
    }

    public record PrRequest(
            UUID projectId,
            UUID warehouseId,
            @NotNull LocalDate requestDate,
            LocalDate requiredDate,
            @Size(max = 5000) String notes,
            @NotNull @Size(min = 1, max = 200, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid PrItemInput> items) {
    }

    public record DecisionRequest(@Size(max = 2000) String comment) {
    }

    public record PrRow(UUID id, String docNo, String projectCode, String projectName, LocalDate requestDate,
                        LocalDate requiredDate, String status, int itemCount, BigDecimal estTotal, String createdByName,
                        String poNo) {
    }

    public record PrItemDto(UUID id, int sortOrder, UUID materialId, String materialCode, String description,
                            BigDecimal quantity, String unit, BigDecimal estUnitPrice, String note) {
    }

    public record QuoteRequest(
            @NotNull UUID supplierId,
            @Size(max = 100) String quoteRef,
            LocalDate quoteDate,
            @Min(0) @Max(365) Integer deliveryDays,
            @Min(0) @Max(365) Integer creditDays,
            boolean vatIncluded,
            @NotNull Map<UUID, BigDecimal> prices,
            @Size(max = 2000) String notes) {
    }

    public record QuoteDto(UUID id, UUID supplierId, String supplierName, String quoteRef, LocalDate quoteDate,
                           Integer deliveryDays, Integer creditDays, boolean vatIncluded, Map<String, BigDecimal> prices,
                           BigDecimal total, BigDecimal totalExVat, boolean selected, String notes, BigDecimal supplierRating) {
    }

    public record PrDto(UUID id, String docNo, UUID projectId, String projectCode, String projectName, UUID warehouseId,
                        LocalDate requestDate, LocalDate requiredDate, String status, String notes, String createdByName,
                        String decidedByName, Instant decidedAt, String decisionComment, List<PrItemDto> items,
                        List<QuoteDto> quotes, UUID poId, String poNo, boolean canEdit, boolean canApprove,
                        boolean canQuote, Instant createdAt) {
    }

    // ================================================================= PO

    public record PoItemInput(
            UUID id,
            UUID materialId,
            UUID prItemId,
            @NotBlank(message = "กรุณากรอกรายการให้ครบ") @Size(max = 500) String description,
            @NotNull @DecimalMin(value = "0.001", message = "จำนวนต้องมากกว่า 0") BigDecimal quantity,
            @Size(max = 30) String unit,
            @NotNull @DecimalMin("0") BigDecimal unitPrice) {
    }

    public record PoRequest(
            @NotNull UUID supplierId,
            UUID projectId,
            UUID warehouseId,
            @NotNull LocalDate orderDate,
            LocalDate deliveryDate,
            @Size(max = 2000) String deliveryAddress,
            @NotNull @DecimalMin("0") BigDecimal discountAmount,
            boolean vatEnabled,
            @Min(0) @Max(365) int creditDays,
            @Size(max = 255) String paymentTerms,
            @Size(max = 5000) String notes,
            @NotNull @Size(min = 1, max = 300, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid PoItemInput> items) {
    }

    public record PoRow(UUID id, String docNo, String supplierName, String projectCode, LocalDate orderDate,
                        LocalDate deliveryDate, String status, BigDecimal totalAmount, BigDecimal receivedPct,
                        String createdByName) {
    }

    public record PoItemDto(UUID id, int sortOrder, UUID materialId, String materialCode, UUID prItemId, String description,
                            BigDecimal quantity, String unit, BigDecimal unitPrice, BigDecimal amount, BigDecimal receivedQty,
                            BigDecimal remainingQty) {
    }

    public record GrRow(UUID id, String docNo, LocalDate receiveDate, String deliveryNoteNo, String status,
                        String warehouseName, BigDecimal value, String createdByName, List<GrLine> lines) {
    }

    public record GrLine(String description, BigDecimal quantity, String unit, BigDecimal unitCost) {
    }

    public record PoDto(UUID id, String docNo, UUID supplierId, String supplierName, String supplierAddress,
                        String supplierTaxId, String supplierBranchNo, String supplierPhone, UUID projectId,
                        String projectCode, String projectName, UUID prId, String prNo, UUID warehouseId,
                        String warehouseName, LocalDate orderDate, LocalDate deliveryDate, String deliveryAddress,
                        String status, BigDecimal subtotal, BigDecimal discountAmount, boolean vatEnabled, BigDecimal vatPct,
                        BigDecimal vatAmount, BigDecimal totalAmount, int creditDays, String paymentTerms, String notes,
                        String createdByName, String approvedByName, Instant approvedAt, List<PoItemDto> items,
                        List<GrRow> receipts, BigDecimal billedAmount, boolean canEdit, boolean canApprove,
                        boolean canReceive, boolean needsApproval, Instant createdAt) {
    }

    public record ReceiveLine(@NotNull UUID poItemId, @NotNull @DecimalMin(value = "0.001", message = "จำนวนรับต้องมากกว่า 0") BigDecimal quantity) {
    }

    public record ReceiveRequest(
            @NotNull LocalDate receiveDate,
            @Size(max = 100) String deliveryNoteNo,
            @Size(max = 2000) String notes,
            @NotNull @Size(min = 1, max = 300) List<@Valid ReceiveLine> lines) {
    }
}
