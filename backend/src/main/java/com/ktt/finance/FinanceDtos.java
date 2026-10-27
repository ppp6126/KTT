package com.ktt.finance;

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

public final class FinanceDtos {

    private FinanceDtos() {
    }

    // ---------------------------------------------------------------- requests

    public record ItemInput(
            @NotBlank(message = "กรุณากรอกรายการให้ครบ") @Size(max = 1000) String description,
            @NotNull @DecimalMin(value = "0", message = "จำนวนต้องไม่ติดลบ") BigDecimal quantity,
            @Size(max = 30) String unit,
            @NotNull BigDecimal unitPrice,
            UUID milestoneId) {
    }

    /** สร้าง/แก้ใบแจ้งหนี้ (ฉบับร่าง) */
    public record InvoiceRequest(
            @NotBlank @Pattern(regexp = "invoice|invoice_tax") String docType,
            UUID customerId,
            UUID contractId,
            UUID projectId,
            @Pattern(regexp = "normal|advance|milestone") String kind,
            @NotNull LocalDate docDate,
            LocalDate dueDate,
            @Size(max = 255) String customerName,
            @Size(max = 2000) String customerAddress,
            @Pattern(regexp = "^$|\\d{13}", message = "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก") String customerTaxId,
            @Pattern(regexp = "^$|\\d{5}") String customerBranchNo,
            @NotNull @DecimalMin("0") BigDecimal discountAmount,
            @NotNull @DecimalMin("0") BigDecimal advanceDeduct,
            boolean vatEnabled,
            @NotNull @DecimalMin("0") @DecimalMax("20") BigDecimal vatPct,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal retentionPct,
            @NotNull BigDecimal whtPct,
            @Size(max = 5000) String notes,
            @NotNull @Size(min = 1, max = 300, message = "ต้องมีอย่างน้อย 1 รายการ") List<@Valid ItemInput> items) {
    }

    /** สร้างใบแจ้งหนี้จากงวดงานของสัญญา (หรือเงินล่วงหน้า ถ้า advance = true) */
    public record FromContractRequest(
            @NotNull UUID contractId,
            @NotBlank @Pattern(regexp = "invoice|invoice_tax") String docType,
            boolean advance,
            @Size(max = 60) List<UUID> milestoneIds) {
    }

    public record PaymentRequest(
            @NotNull(message = "กรุณาระบุวันที่รับชำระ") LocalDate paidDate,
            @NotBlank @Pattern(regexp = "cash|transfer|cheque|other") String method,
            @Size(max = 255) String reference,
            @NotNull @DecimalMin(value = "0", message = "จำนวนเงินต้องไม่ติดลบ") BigDecimal cashAmount,
            @NotNull @DecimalMin("0") BigDecimal whtAmount,
            @NotNull @DecimalMin("0") BigDecimal retentionAmount,
            @Size(max = 2000) String notes) {
    }

    public record BillingNoteRequest(
            @NotNull UUID customerId,
            @NotNull LocalDate docDate,
            LocalDate dueDate,
            @Size(max = 2000) String notes,
            @NotNull @Size(min = 1, max = 100, message = "เลือกใบแจ้งหนี้อย่างน้อย 1 ใบ") List<UUID> invoiceIds) {
    }

    public record CreditNoteRequest(
            @NotNull UUID refDocId,
            @NotNull LocalDate docDate,
            @NotNull @DecimalMin(value = "0", message = "มูลค่าที่ถูกต้องต้องไม่ติดลบ") BigDecimal correctAmount,
            @NotBlank(message = "กรุณาระบุเหตุผลการลดหนี้") @Size(max = 2000) String reason,
            @Size(max = 2000) String notes) {
    }

    public record VoidRequest(@NotBlank(message = "กรุณาระบุเหตุผลการยกเลิก") @Size(max = 2000) String reason) {
    }

    // ---------------------------------------------------------------- responses

    public record ItemDto(UUID id, int sortOrder, String description, BigDecimal quantity, String unit, BigDecimal unitPrice,
                          BigDecimal amount, UUID milestoneId) {
    }

    public record DocLink(UUID id, String docType, String docNo, LocalDate docDate, String status, BigDecimal totalAmount,
                          BigDecimal netAmount, BigDecimal outstanding) {
    }

    public record SalesDocRow(UUID id, String docType, String docNo, LocalDate docDate, LocalDate dueDate, String status,
                              String customerName, String projectCode, String kind, BigDecimal totalAmount,
                              BigDecimal netAmount, BigDecimal settledAmount, BigDecimal outstanding, boolean overdue) {
    }

    public record SalesDocDto(
            UUID id,
            String docType,
            String title,
            String docNo,
            LocalDate docDate,
            LocalDate dueDate,
            String status,
            UUID customerId,
            String customerName,
            String customerAddress,
            String customerTaxId,
            String customerBranchNo,
            UUID projectId,
            String projectCode,
            String projectName,
            UUID contractId,
            String contractNo,
            String kind,
            BigDecimal subtotal,
            BigDecimal discountAmount,
            BigDecimal advanceDeduct,
            BigDecimal taxableAmount,
            boolean vatEnabled,
            BigDecimal vatPct,
            BigDecimal vatAmount,
            BigDecimal totalAmount,
            BigDecimal retentionPct,
            BigDecimal retentionAmount,
            BigDecimal whtPct,
            BigDecimal whtAmount,
            BigDecimal netAmount,
            BigDecimal settledAmount,
            BigDecimal outstanding,
            BigDecimal originalAmount,
            BigDecimal correctAmount,
            String reason,
            String paymentMethod,
            String paymentRef,
            LocalDate paidDate,
            String notes,
            Instant issuedAt,
            Instant voidedAt,
            String createdByName,
            List<ItemDto> items,
            DocLink refDoc,
            List<DocLink> related,
            List<DocLink> billingLines,
            boolean canEdit,
            boolean canIssue,
            boolean canPay,
            boolean canVoid,
            boolean canCredit) {
    }

    public record AgingRow(UUID customerId, String customerName, BigDecimal current, BigDecimal d1to30, BigDecimal d31to60,
                           BigDecimal d61to90, BigDecimal over90, BigDecimal total, BigDecimal retentionHeld) {
    }

    public record Receivables(LocalDate asOf, List<AgingRow> rows, AgingRow totals) {
    }
}
