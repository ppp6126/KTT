package com.ktt.security;


import org.eclipse.microprofile.jwt.JsonWebToken;

public final class TokenClaims {

    /** อ่าน claim แบบ string (บางเวอร์ชันคืน JsonString ที่ toString มีเครื่องหมายคำพูด) */
    public static String string(JsonWebToken jwt, String name) {
        Object v = jwt.getClaim(name);
        if (v == null) {
            return null;
        }
        if (v instanceof jakarta.json.JsonString js) {
            return js.getString();
        }
        return v.toString();
    }

    private TokenClaims() {
    }

    /** id ของ user_sessions ใช้ตรวจว่า session ยังไม่ถูกยกเลิก */
    public static final String SESSION_ID = "sid";
    public static final String NAME = "name";
    public static final String ROLE = "role";
    /** ถ้ามี token ใช้ได้เฉพาะ /api/auth/** (ต้องเปลี่ยนรหัสผ่าน หรือต้องตั้ง 2FA ก่อน) */
    public static final String RESTRICTION = "rst";

    public static final String RESTRICT_PASSWORD_CHANGE = "password_change";
    public static final String RESTRICT_MFA_SETUP = "mfa_setup";
}
