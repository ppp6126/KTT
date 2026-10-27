package com.ktt.auth;

import com.ktt.audit.AuditService;
import com.ktt.auth.AuthDtos.MfaSetupResponse;
import com.ktt.common.ApiException;
import com.ktt.common.Tokens;
import com.ktt.settings.AppSettings;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** ตั้งค่า/เปิด/ปิด 2FA (TOTP) และ recovery codes */
@ApplicationScoped
public class MfaService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int RECOVERY_CODE_COUNT = 10;

    @Inject
    TotpService totp;

    @Inject
    DataCrypto crypto;

    @Inject
    PasswordHasher hasher;

    @Inject
    SessionService sessions;

    @Inject
    AuditService audit;

    @Inject
    AppSettings settings;

    @ConfigProperty(name = "ktt.app.name")
    String appName;

    /** ขั้นที่ 1: สร้าง secret ใหม่ (ยังไม่เปิดใช้จนกว่าจะยืนยันรหัสใน enable) */
    @Transactional
    public MfaSetupResponse setup(UUID userId) {
        User user = requireUser(userId);
        if (user.mfaEnabled) {
            throw ApiException.conflict("mfa_already_enabled", "เปิดใช้การยืนยันตัวตน 2 ขั้นตอนอยู่แล้ว");
        }
        String secret = totp.newSecret();
        user.totpSecret = crypto.encrypt(secret);
        user.totpLastStep = 0;
        return new MfaSetupResponse(secret, totp.otpauthUri(appName, user.email, secret));
    }

    /** ขั้นที่ 2: ยืนยันรหัสจากแอปแล้วเปิดใช้ คืน recovery codes (แสดงครั้งเดียว) */
    @Transactional
    public List<String> enable(UUID userId, UUID currentSessionId, String code) {
        User user = requireUser(userId);
        if (user.mfaEnabled) {
            throw ApiException.conflict("mfa_already_enabled", "เปิดใช้การยืนยันตัวตน 2 ขั้นตอนอยู่แล้ว");
        }
        if (user.totpSecret == null) {
            throw ApiException.badRequest("mfa_not_setup", "กรุณาเริ่มตั้งค่าใหม่อีกครั้ง");
        }
        long step = totp.verify(crypto.decrypt(user.totpSecret), code, user.totpLastStep);
        if (step < 0) {
            throw ApiException.badRequest("invalid_mfa_code", "รหัสไม่ถูกต้อง ตรวจสอบเวลาในโทรศัพท์แล้วลองใหม่");
        }
        user.totpLastStep = step;
        user.mfaEnabled = true;
        List<String> codes = replaceRecoveryCodes(user);
        // เปิด 2FA แล้วให้อุปกรณ์อื่นที่ login อยู่ต้อง login ใหม่
        sessions.revokeAll(user.id, SessionService.REVOKE_BY_USER, currentSessionId);
        audit.log("user", user.id, AuditService.ACTION_MFA_ENABLED, null, null);
        return codes;
    }

    @Transactional
    public void disable(UUID userId, String password, String code) {
        User user = requireUser(userId);
        if (!user.mfaEnabled) {
            return;
        }
        if (settings.mfaRequiredRoles().contains(user.role.code)) {
            throw ApiException.forbidden("mfa_required_by_role", "บทบาทของคุณต้องใช้การยืนยันตัวตน 2 ขั้นตอน ปิดไม่ได้");
        }
        if (!hasher.verify(password, user.passwordHash)) {
            throw ApiException.badRequest("wrong_password", "รหัสผ่านไม่ถูกต้อง");
        }
        if (!verifyCodeOrRecovery(user, code)) {
            throw ApiException.badRequest("invalid_mfa_code", "รหัสไม่ถูกต้อง");
        }
        clear(user);
        audit.log("user", user.id, AuditService.ACTION_MFA_DISABLED, null, null);
    }

    @Transactional
    public List<String> regenerateRecoveryCodes(UUID userId, String code) {
        User user = requireUser(userId);
        if (!user.mfaEnabled) {
            throw ApiException.badRequest("mfa_not_enabled", "ยังไม่ได้เปิดใช้การยืนยันตัวตน 2 ขั้นตอน");
        }
        long step = totp.verify(crypto.decrypt(user.totpSecret), code, user.totpLastStep);
        if (step < 0) {
            throw ApiException.badRequest("invalid_mfa_code", "รหัสไม่ถูกต้อง");
        }
        user.totpLastStep = step;
        List<String> codes = replaceRecoveryCodes(user);
        audit.log("user", user.id, AuditService.ACTION_UPDATE, null, Map.of("recoveryCodes", "regenerated"));
        return codes;
    }

    /** ปิด 2FA และลบข้อมูลทั้งหมด (ใช้ทั้งผู้ใช้ปิดเอง และผู้ดูแลรีเซ็ตให้) */
    @Transactional(Transactional.TxType.MANDATORY)
    public void clear(User user) {
        user.mfaEnabled = false;
        user.totpSecret = null;
        user.totpLastStep = 0;
        MfaRecoveryCode.deleteAllFor(user.id);
    }

    /**
     * ตรวจรหัส 6 หลักจากแอป หรือ recovery code (ใช้ได้ครั้งเดียว).
     * ต้องเรียกใน transaction เพราะจะบันทึก time-step / สถานะ recovery code ที่ใช้แล้ว
     */
    @Transactional(Transactional.TxType.MANDATORY)
    public boolean verifyCodeOrRecovery(User user, String code) {
        if (code == null || user.totpSecret == null) {
            return false;
        }
        String trimmed = code.replace(" ", "").trim();
        if (trimmed.matches("\\d{6}")) {
            long step = totp.verify(crypto.decrypt(user.totpSecret), trimmed, user.totpLastStep);
            if (step >= 0) {
                user.totpLastStep = step;
                return true;
            }
            return false;
        }
        String normalized = normalizeRecovery(trimmed);
        if (normalized.length() != 10) {
            return false;
        }
        MfaRecoveryCode rc = MfaRecoveryCode.findUnused(user.id, Tokens.sha256Hex(normalized));
        if (rc == null) {
            return false;
        }
        rc.usedAt = java.time.Instant.now();
        return true;
    }

    private List<String> replaceRecoveryCodes(User user) {
        MfaRecoveryCode.deleteAllFor(user.id);
        SecureRandom rnd = Tokens.secureRandom();
        List<String> codes = new ArrayList<>(RECOVERY_CODE_COUNT);
        for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
            StringBuilder sb = new StringBuilder(10);
            for (int j = 0; j < 10; j++) {
                sb.append(CODE_ALPHABET.charAt(rnd.nextInt(CODE_ALPHABET.length())));
            }
            String plain = sb.toString();
            MfaRecoveryCode rc = new MfaRecoveryCode();
            rc.userId = user.id;
            rc.codeHash = Tokens.sha256Hex(plain);
            rc.persist();
            codes.add(plain.substring(0, 5) + "-" + plain.substring(5));
        }
        return codes;
    }

    private static String normalizeRecovery(String code) {
        return code.replace("-", "").toUpperCase(Locale.ROOT);
    }

    private static User requireUser(UUID userId) {
        User user = User.findById(userId);
        if (user == null) {
            throw ApiException.unauthorized("unauthorized", "กรุณาเข้าสู่ระบบ");
        }
        return user;
    }
}
