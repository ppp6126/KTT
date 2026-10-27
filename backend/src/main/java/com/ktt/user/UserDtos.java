package com.ktt.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {
    }

    public record UserRow(
            UUID id,
            String email,
            String name,
            String phone,
            UUID roleId,
            String roleCode,
            String roleName,
            boolean active,
            boolean mfaEnabled,
            boolean locked,
            boolean mustChangePassword,
            Instant lastLoginAt,
            Instant createdAt) {
    }

    public record CreateUserRequest(
            @NotBlank(message = "กรุณากรอกอีเมล") @Email(message = "รูปแบบอีเมลไม่ถูกต้อง") @Size(max = 255) String email,
            @NotBlank(message = "กรุณากรอกชื่อ") @Size(max = 150) String name,
            @Size(max = 30) String phone,
            @NotNull(message = "กรุณาเลือกบทบาท") UUID roleId,
            /** ถ้าว่าง ระบบจะสุ่มรหัสผ่านชั่วคราวให้ */
            @Size(max = 128) String temporaryPassword) {
    }

    public record UpdateUserRequest(
            @NotBlank(message = "กรุณากรอกชื่อ") @Size(max = 150) String name,
            @Size(max = 30) String phone,
            @NotNull(message = "กรุณาเลือกบทบาท") UUID roleId,
            boolean active) {
    }

    public record ResetPasswordRequest(@Size(max = 128) String temporaryPassword) {
    }

    /** รหัสผ่านชั่วคราวแสดงให้ผู้ดูแลเห็นครั้งเดียว */
    public record TemporaryPassword(String temporaryPassword) {
    }

    public record CreatedUser(UserRow user, String temporaryPassword) {
    }

    public record PermissionDto(String code, String module, String action, String description) {
    }

    public record RoleDto(
            UUID id,
            String code,
            String name,
            String description,
            boolean system,
            Set<String> permissions,
            long userCount) {
    }

    public record RoleRequest(
            @NotBlank(message = "กรุณากรอกรหัสบทบาท") @Size(max = 50) String code,
            @NotBlank(message = "กรุณากรอกชื่อบทบาท") @Size(max = 100) String name,
            @Size(max = 500) String description,
            @NotNull List<String> permissions) {
    }
}
