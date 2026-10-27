package com.ktt.customer;

import com.ktt.common.ThaiTaxId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CustomerDtos {

    private CustomerDtos() {
    }

    public record ContactRequest(
            UUID id,
            @NotBlank(message = "กรุณากรอกชื่อผู้ติดต่อ") @Size(max = 150) String name,
            @Size(max = 100) String position,
            @Size(max = 30) String phone,
            @Email(message = "รูปแบบอีเมลไม่ถูกต้อง") @Size(max = 255) String email) {
    }

    public record CustomerRequest(
            @NotBlank @Pattern(regexp = "person|company", message = "ประเภทลูกค้าไม่ถูกต้อง") String type,
            @NotBlank(message = "กรุณากรอกชื่อลูกค้า") @Size(max = 255) String name,
            @ThaiTaxId String taxId,
            @Pattern(regexp = "^$|\\d{5}", message = "เลขสาขาต้องเป็นตัวเลข 5 หลัก (00000 = สำนักงานใหญ่)") String branchNo,
            @Size(max = 30) String phone,
            @Email(message = "รูปแบบอีเมลไม่ถูกต้อง") @Size(max = 255) String email,
            @Size(max = 100) String lineId,
            @Size(max = 2000) String billingAddress,
            @Pattern(regexp = "facebook|referral|google|other", message = "แหล่งที่มาไม่ถูกต้อง") String source,
            @Size(max = 5000) String note,
            boolean pdpaConsent,
            @Valid @Size(max = 50) List<ContactRequest> contacts) {
    }

    public record ContactDto(UUID id, String name, String position, String phone, String email) {
    }

    public record CustomerRow(
            UUID id,
            String type,
            String name,
            String taxId,
            String branchNo,
            String phone,
            String email,
            String source,
            Instant createdAt) {
    }

    public record CustomerDto(
            UUID id,
            String type,
            String name,
            String taxId,
            String branchNo,
            String phone,
            String email,
            String lineId,
            String billingAddress,
            String source,
            String note,
            Instant pdpaConsentAt,
            List<ContactDto> contacts,
            Instant createdAt,
            Instant updatedAt) {
    }
}
