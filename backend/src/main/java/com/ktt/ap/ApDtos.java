package com.ktt.ap;

import jakarta.validation.Valid;
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

public final class ApDtos {

    private ApDtos() {
    }

    public record ItemInput(@NotBlank(message = "กรุณากรอกรายการให้ครบ") @Size(max = 500) String description,
                            @NotNull BigDecimal quantity, @Size(max = 30) String unit, @NotNull BigDecimal unitPrice) {
    }

    public record BillRequest(
            @NotNull UUID supplierId,
            @Size(max = 100) String supplierInvoiceNo,
            boolean taxInvoice,
            @NotNull LocalDate billDate,
            LocalDate dueDate,
            @Pattern(regexp = "^$|\\d{4}-\\d{2}", message = "เดือนภาษีต้องเป็นรูปแบบ ปปปป-ดด") String taxPeriod,
            UUID projectId,
            UUID poId,
            @NotBlank @Pattern(regexp = "material|subcontract|labor|equipment|overhead|other") String category,
            boolean vatEnabled,
            @NotNull BigDecimal whtPct,
            @NotNull @DecimalMin("0") BigDecimal retentionAmount,
            @Size(max = 5000) String notes,
            @NotNull @Size(min = 1, max = 300, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid ItemInput> items) {
    }

    public record BillRow(UUID id, String docNo, String supplierName, String supplierInvoiceNo, LocalDate billDate,
                          LocalDate dueDate, String projectCode, String category, String status, BigDecimal totalAmount,
                          BigDecimal netPayable, BigDecimal outstanding, boolean overdue) {
    }

    public record ItemDto(UUID id, int sortOrder, String description, BigDecimal quantity, String unit, BigDecimal unitPrice,
                          BigDecimal amount) {
    }

    public record PaymentLink(UUID pvId, String pvNo, LocalDate payDate, String status, BigDecimal amount, BigDecimal whtAmount) {
    }

    public record BillDto(UUID id, String docNo, UUID supplierId, String supplierName, String supplierTaxId,
                          String supplierBranchNo, String supplierInvoiceNo, boolean taxInvoice, LocalDate billDate,
                          LocalDate dueDate, String taxPeriod, UUID projectId, String projectCode, String projectName,
                          UUID poId, String poNo, UUID subcontractClaimId, String category, BigDecimal subtotal,
                          boolean vatEnabled, BigDecimal vatPct, BigDecimal vatAmount, BigDecimal totalAmount,
                          BigDecimal retentionAmount, BigDecimal whtPct, BigDecimal whtAmount, BigDecimal netPayable,
                          BigDecimal paidAmount, BigDecimal outstanding, String status, String notes, String createdByName,
                          List<ItemDto> items, List<PaymentLink> payments, boolean canEdit, boolean canApprove,
                          boolean canVoid, Instant createdAt) {
    }

    public record PvLineInput(@NotNull UUID billId, @NotNull @DecimalMin(value = "0.01", message = "ยอดจ่ายต้องมากกว่า 0") BigDecimal amount) {
    }

    public record PvRequest(
            @NotNull UUID supplierId,
            @NotNull LocalDate payDate,
            @NotBlank @Pattern(regexp = "cash|transfer|cheque|other") String method,
            @Size(max = 255) String bankRef,
            @Size(max = 2000) String notes,
            @NotNull @Size(min = 1, max = 100, message = "เลือกบิลอย่างน้อย 1 ใบ") List<@Valid PvLineInput> lines) {
    }

    public record PvLineDto(UUID billId, String billNo, String supplierInvoiceNo, LocalDate billDate, String category,
                            BigDecimal billTotal, BigDecimal amount, BigDecimal whtAmount) {
    }

    public record CertDto(UUID id, String bookNo, int runNo, String form, String payeeName, String payeeTaxId,
                          String payeeAddress, LocalDate payDate, String incomeType, BigDecimal amount, BigDecimal whtRate,
                          BigDecimal whtAmount, String status, UUID pvId, String pvNo) {
    }

    public record PvRow(UUID id, String docNo, String supplierName, LocalDate payDate, String method, String status,
                        BigDecimal grossAmount, BigDecimal whtAmount, BigDecimal netPaid) {
    }

    public record PvDto(UUID id, String docNo, UUID supplierId, String supplierName, String supplierTaxId,
                        String supplierBank, LocalDate payDate, String method, String bankRef, BigDecimal grossAmount,
                        BigDecimal whtAmount, BigDecimal netPaid, String status, String notes, String createdByName,
                        String approvedByName, Instant approvedAt, List<PvLineDto> lines, List<CertDto> certificates,
                        boolean canApprove, boolean canPay, boolean canVoid, Instant createdAt) {
    }

    public record ReasonRequest(@Size(max = 2000) String reason) {
    }
}
