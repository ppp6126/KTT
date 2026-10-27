package com.ktt.auth;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * ทดสอบ flow การยืนยันตัวตนตั้งแต่ต้นจนจบกับ PostgreSQL จริง (Dev Services ต้องมี Docker).
 * ไม่รันใน `mvn test` ปกติ (ชื่อลงท้าย IT) รันเองด้วย: mvn test -Dtest=AuthFlowIT
 */
@QuarkusTest
class AuthFlowIT {

    private static final String EMAIL = "admin@ktt.local";
    private static final String BOOT_PASSWORD = "Admin@12345";
    private static final String NEW_PASSWORD = "Ktt-Owner-2026";

    @Test
    void fullAuthFlow() {
        // 1) รหัสผิด
        given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", "wrong-password-1"))
                .post("/api/auth/login").then().statusCode(401).body("code", equalTo("invalid_credentials"));

        // 2) login ครั้งแรก: ได้ token แบบจำกัด (ต้องเปลี่ยนรหัสผ่าน)
        Response login = given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", BOOT_PASSWORD))
                .post("/api/auth/login");
        login.then().statusCode(200).body("user.restriction", equalTo("password_change"));
        String token = login.path("accessToken");
        assertNotNull(login.getCookie("ktt_rt"));

        // 3) token จำกัดเรียก API ธุรกิจไม่ได้
        given().auth().oauth2(token).get("/api/customers").then().statusCode(403);

        // 4) เปลี่ยนรหัสผ่าน -> owner ต้องตั้ง 2FA ต่อ
        Response changed = given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("currentPassword", BOOT_PASSWORD, "newPassword", NEW_PASSWORD))
                .post("/api/auth/password/change");
        changed.then().statusCode(200).body("user.restriction", equalTo("mfa_setup"));
        token = changed.path("accessToken");
        given().auth().oauth2(token).get("/api/customers").then().statusCode(403)
                .body("code", equalTo("restricted_mfa_setup"));

        // 5) ตั้งค่า 2FA
        String secret = given().auth().oauth2(token).post("/api/auth/mfa/setup").then().statusCode(200)
                .extract().path("secret");
        TotpService totp = new TotpService();
        String code = totp.generate(Base32.decode(secret), Instant.now().getEpochSecond() / 30);
        Response enabled = given().auth().oauth2(token).contentType(ContentType.JSON).body(Map.of("code", code))
                .post("/api/auth/mfa/enable");
        enabled.then().statusCode(200).body("recoveryCodes.size()", equalTo(10));
        List<String> recovery = enabled.path("recoveryCodes");
        token = enabled.path("auth.accessToken");

        // 6) ใช้งานได้ปกติ
        given().auth().oauth2(token).get("/api/auth/me").then().statusCode(200)
                .body("mfaEnabled", equalTo(true)).body("permissions", hasItem("cost.view"));
        given().auth().oauth2(token).get("/api/customers").then().statusCode(200).body("total", notNullValue());

        // 7) สร้างลูกค้า (เลขผู้เสียภาษีผิด -> 400)
        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("type", "company", "name", "บริษัท ทดสอบ จำกัด", "taxId", "0105558000015"))
                .post("/api/customers").then().statusCode(400).body("code", equalTo("validation"));
        given().auth().oauth2(token).contentType(ContentType.JSON)
                .body(Map.of("type", "company", "name", "บริษัท ทดสอบ จำกัด", "taxId", "0105558000014",
                        "contacts", List.of(Map.of("name", "คุณสมชาย"))))
                .post("/api/customers").then().statusCode(201).body("branchNo", equalTo("00000"))
                .body("contacts.size()", equalTo(1));

        // 8) login ใหม่ด้วย 2FA (ใช้ recovery code)
        Response step1 = given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", NEW_PASSWORD))
                .post("/api/auth/login");
        step1.then().statusCode(200).body("mfaRequired", equalTo(true));
        Response step2 = given().contentType(ContentType.JSON)
                .body(Map.of("mfaToken", step1.path("mfaToken"), "code", recovery.get(0)))
                .post("/api/auth/mfa/verify");
        step2.then().statusCode(200).body("accessToken", notNullValue());
        String rt1 = step2.getCookie("ktt_rt");

        // recovery code ใช้ซ้ำไม่ได้
        Response again = given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", NEW_PASSWORD))
                .post("/api/auth/login");
        given().contentType(ContentType.JSON).body(Map.of("mfaToken", again.path("mfaToken"), "code", recovery.get(0)))
                .post("/api/auth/mfa/verify").then().statusCode(401).body("code", equalTo("invalid_mfa_code"));

        // 9) refresh หมุน token
        Response r1 = given().cookie("ktt_rt", rt1).post("/api/auth/refresh");
        r1.then().statusCode(200);
        String rt2 = r1.getCookie("ktt_rt");
        assertNotEquals(rt1, rt2);

        // 10) ใช้ token เก่าซ้ำ (%test ตั้ง grace = 0) -> ตัด session ทั้งหมดของอุปกรณ์นั้น
        given().cookie("ktt_rt", rt1).post("/api/auth/refresh").then().statusCode(401);
        given().cookie("ktt_rt", rt2).post("/api/auth/refresh").then().statusCode(401);

        // 11) logout แล้ว access token ใช้ไม่ได้ทันที
        Response fresh = given().contentType(ContentType.JSON).body(Map.of("email", EMAIL, "password", NEW_PASSWORD))
                .post("/api/auth/login");
        String code2 = new TotpService().generate(Base32.decode(secret), Instant.now().getEpochSecond() / 30 + 1);
        Response done = given().contentType(ContentType.JSON).body(Map.of("mfaToken", fresh.path("mfaToken"), "code", code2))
                .post("/api/auth/mfa/verify");
        assertEquals(200, done.statusCode());
        String access = done.path("accessToken");
        given().auth().oauth2(access).get("/api/auth/me").then().statusCode(200);
        given().cookie("ktt_rt", done.getCookie("ktt_rt")).post("/api/auth/logout").then().statusCode(204);
        given().auth().oauth2(access).get("/api/auth/me").then().statusCode(401);
    }
}
