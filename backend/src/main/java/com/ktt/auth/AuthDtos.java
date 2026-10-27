package com.ktt.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Request/Response ของ /api/auth */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(
            @NotBlank(message = "กรุณากรอกอีเมล") @Email(message = "รูปแบบอีเมลไม่ถูกต้อง") @Size(max = 255) String email,
            @NotBlank(message = "กรุณากรอกรหัสผ่าน") @Size(max = 128) String password) {
    }

    public record MfaVerifyRequest(
            @NotBlank String mfaToken,
            @NotBlank(message = "กรุณากรอกรหัส") @Size(max = 20) String code) {
    }

    public record RoleRef(UUID id, String code, String name) {
    }

    public record Me(
            UUID id,
            String email,
            String name,
            String phone,
            RoleRef role,
            Set<String> permissions,
            boolean mfaEnabled,
            long recoveryCodesLeft,
            boolean mustChangePassword,
            String restriction,
            Instant lastLoginAt) {
    }

    /**
     * ผลการ login: ถ้า mfaRequired=true จะมีแค่ mfaToken (ต้องเรียก /mfa/verify ต่อ)
     * ไม่เช่นนั้นจะมี accessToken + user (refresh token อยู่ใน HttpOnly cookie)
     */
    public record LoginResponse(
            boolean mfaRequired,
            String mfaToken,
            String accessToken,
            Long expiresIn,
            Me user) {

        public static LoginResponse mfa(String mfaToken) {
            return new LoginResponse(true, mfaToken, null, null, null);
        }

        public static LoginResponse tokens(String accessToken, long expiresIn, Me user) {
            return new LoginResponse(false, null, accessToken, expiresIn, user);
        }
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "กรุณากรอกรหัสผ่านปัจจุบัน") @Size(max = 128) String currentPassword,
            @NotBlank(message = "กรุณากรอกรหัสผ่านใหม่") @Size(max = 128) String newPassword) {
    }

    public record ForgotPasswordRequest(
            @NotBlank(message = "กรุณากรอกอีเมล") @Email(message = "รูปแบบอีเมลไม่ถูกต้อง") String email) {
    }

    public record ResetPasswordRequest(
            @NotBlank String token,
            @NotBlank(message = "กรุณากรอกรหัสผ่านใหม่") @Size(max = 128) String newPassword) {
    }

    public record MfaSetupResponse(String secret, String otpauthUri) {
    }

    public record MfaCodeRequest(@NotBlank(message = "กรุณากรอกรหัส 6 หลัก") @Size(max = 20) String code) {
    }

    public record MfaDisableRequest(
            @NotBlank(message = "กรุณากรอกรหัสผ่าน") @Size(max = 128) String password,
            @NotBlank(message = "กรุณากรอกรหัส 6 หลัก") @Size(max = 20) String code) {
    }

    public record RecoveryCodesResponse(List<String> codes) {
    }

    public record SessionInfo(
            UUID id,
            String ip,
            String userAgent,
            Instant createdAt,
            Instant lastUsedAt,
            Instant expiresAt,
            boolean current) {
    }
}
