package com.ktt.auth;

import com.ktt.common.ApiException;

import java.util.Locale;
import java.util.Set;

/** นโยบายรหัสผ่าน: อย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข ไม่ซ้ำอีเมล ไม่ใช่รหัสยอดนิยม */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 10;
    public static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = Set.of(
            "password123", "password1234", "1234567890", "qwertyuiop", "admin12345",
            "abcd123456", "p@ssw0rd123", "12345678910", "password@123", "iloveyou123");

    private PasswordPolicy() {
    }

    public static void check(String password, String email) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw ApiException.badRequest("weak_password", "รหัสผ่านต้องยาวอย่างน้อย " + MIN_LENGTH + " ตัวอักษร");
        }
        if (password.length() > MAX_LENGTH) {
            throw ApiException.badRequest("weak_password", "รหัสผ่านยาวเกินไป");
        }
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        if (!hasLetter || !hasDigit) {
            throw ApiException.badRequest("weak_password", "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข");
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower)) {
            throw ApiException.badRequest("weak_password", "รหัสผ่านนี้คาดเดาง่ายเกินไป");
        }
        if (email != null) {
            String local = email.toLowerCase(Locale.ROOT).split("@")[0];
            if (local.length() >= 4 && lower.contains(local)) {
                throw ApiException.badRequest("weak_password", "รหัสผ่านต้องไม่มีชื่ออีเมลอยู่ในนั้น");
            }
        }
    }
}
