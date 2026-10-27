package com.ktt.lead;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class LeadDtos {

    private LeadDtos() {
    }

    public record LeadRequest(
            @NotNull(message = "กรุณาเลือกลูกค้า") UUID customerId,
            @NotBlank(message = "กรุณากรอกชื่องาน") @Size(max = 255) String title,
            @NotBlank @Pattern(regexp = "new_house|extension|renovation|interior|mep|landscape|structure|roof|repair|subcontract",
                    message = "ประเภทงานไม่ถูกต้อง") String jobType,
            @Size(max = 2000) String siteAddress,
            @DecimalMin(value = "0", message = "งบประมาณต้องไม่ติดลบ") BigDecimal budgetEst,
            UUID ownerId,
            Instant nextFollowupAt) {
    }

    public record StatusRequest(
            @NotBlank @Pattern(regexp = "new|site_visit|estimating|quoted|negotiating|won|lost") String status,
            @Size(max = 2000) String lostReason) {
    }

    public record ActivityRequest(
            @NotBlank @Pattern(regexp = "call|visit|note|meeting", message = "ประเภทกิจกรรมไม่ถูกต้อง") String type,
            @NotBlank(message = "กรุณากรอกรายละเอียด") @Size(max = 5000) String note,
            Instant occurredAt) {
    }

    public record LeadRow(
            UUID id,
            String title,
            String jobType,
            String status,
            UUID customerId,
            String customerName,
            String customerPhone,
            UUID ownerId,
            String ownerName,
            BigDecimal budgetEst,
            Instant nextFollowupAt,
            String siteAddress,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record ActivityDto(UUID id, String type, String note, Instant occurredAt, UUID createdBy, String createdByName) {
    }

    public record LeadDetail(LeadRow lead, String lostReason, List<ActivityDto> activities, long attachmentCount) {
    }

    /** สรุปสำหรับ dashboard / รายงาน */
    public record PipelineSummary(String status, long count, BigDecimal budget) {
    }
}
