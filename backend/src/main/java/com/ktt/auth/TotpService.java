package com.ktt.auth;

import com.ktt.common.Tokens;
import jakarta.enterprise.context.ApplicationScoped;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;

/** TOTP (RFC 6238): SHA-1, 6 หลัก, 30 วินาที ใช้กับ Google Authenticator / Microsoft Authenticator ได้ */
@ApplicationScoped
public class TotpService {

    private static final int PERIOD = 30;
    private static final int DIGITS = 6;
    /** ยอมให้นาฬิกาคลาดเคลื่อน ±1 ช่วง (±30 วินาที) */
    private static final int WINDOW = 1;

    public String newSecret() {
        return Base32.encode(Tokens.randomBytes(20));
    }

    public String otpauthUri(String issuer, String account, String secret) {
        String label = enc(issuer) + ":" + enc(account);
        return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + enc(issuer)
                + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + PERIOD;
    }

    /**
     * ตรวจรหัส คืนค่า time-step ที่ตรง (ไว้บันทึกกันใช้ซ้ำ) หรือ -1 ถ้าไม่ถูกต้อง.
     * รหัสที่ step <= lastUsedStep ถือว่าใช้ไปแล้ว
     */
    public long verify(String secret, String code, long lastUsedStep) {
        return verifyAt(secret, code, lastUsedStep, Instant.now().getEpochSecond());
    }

    long verifyAt(String secret, String code, long lastUsedStep, long epochSeconds) {
        if (secret == null || code == null) {
            return -1;
        }
        String normalized = code.replace(" ", "").trim();
        if (!normalized.matches("\\d{" + DIGITS + "}")) {
            return -1;
        }
        byte[] key = Base32.decode(secret);
        long current = epochSeconds / PERIOD;
        long matched = -1;
        for (int i = -WINDOW; i <= WINDOW; i++) {
            long step = current + i;
            // ตรวจทุกช่วงเสมอ (ไม่ return ก่อน) เพื่อให้ใช้เวลาเท่ากัน
            if (Tokens.constantTimeEquals(generate(key, step), normalized) && step > lastUsedStep) {
                matched = step;
            }
        }
        return matched;
    }

    String generate(byte[] key, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);
            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
