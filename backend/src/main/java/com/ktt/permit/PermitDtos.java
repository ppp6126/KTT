package com.ktt.permit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class PermitDtos {

    private PermitDtos() {
    }

    public record SaveRequest(
            @NotBlank @Pattern(regexp = "company_license|building_permit|insurance|vehicle|equipment|certificate|other") String kind,
            @NotBlank(message = "กรุณากรอกชื่อเอกสาร") @Size(max = 255) String name,
            @Size(max = 100) String number,
            @Size(max = 255) String issuer,
            UUID projectId,
            LocalDate issueDate,
            LocalDate expiryDate,
            @Min(0) @Max(365) int notifyDays,
            UUID ownerId,
            @Size(max = 5000) String notes) {
    }

    public record RenewRequest(@Size(max = 100) String number, LocalDate issueDate, LocalDate expiryDate, @Size(max = 5000) String notes) {
    }

    public record StatusRequest(@NotBlank @Pattern(regexp = "active|renewing|cancelled") String status) {
    }

    public record PermitDto(UUID id, String kind, String name, String number, String issuer, UUID projectId, String projectCode,
                            String projectName, LocalDate issueDate, LocalDate expiryDate, int notifyDays, Long daysLeft,
                            String state, UUID ownerId, String ownerName, String status, UUID renewedFromId, String notes,
                            int attachmentCount, Instant updatedAt) {
    }
}
