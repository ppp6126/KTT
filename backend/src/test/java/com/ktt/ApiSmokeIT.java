package com.ktt;

import com.ktt.auth.TestTotp;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * ทดสอบทั้งระบบกับ PostgreSQL จริง (Dev Services ต้องมี Docker): เรียกทุก endpoint หลักของ Phase 1–4
 * เพื่อจับ HQL/SQL ที่ผิดตอนรันจริง และเดิน flow สำคัญ (จัดซื้อ→ตั้งหนี้, ใบอนุญาต, แจ้งซ่อม, ปฏิทิน, แดชบอร์ด, สำรองข้อมูล)
 * รันแยก JVM: mvn test -Dtest=ApiSmokeIT (ใช้ฐานข้อมูลใหม่ของตัวเอง ไม่ชนกับ AuthFlowIT)
 */
@QuarkusTest
class ApiSmokeIT {

    private static final ZoneId BKK = ZoneId.of("Asia/Bangkok");

    private String token;

    private String login() {
        Response login = given().contentType(ContentType.JSON).body(Map.of("email", "admin@ktt.local", "password", "Admin@12345"))
                .post("/api/auth/login");
        login.then().statusCode(200);
        String t = login.path("accessToken");
        Response changed = given().auth().oauth2(t).contentType(ContentType.JSON)
                .body(Map.of("currentPassword", "Admin@12345", "newPassword", "Ktt-Smoke-2026!"))
                .post("/api/auth/password/change");
        changed.then().statusCode(200);
        t = changed.path("accessToken");
        String secret = given().auth().oauth2(t).post("/api/auth/mfa/setup").then().statusCode(200).extract().path("secret");
        String code = TestTotp.code(secret);
        Response enabled = given().auth().oauth2(t).contentType(ContentType.JSON).body(Map.of("code", code)).post("/api/auth/mfa/enable");
        enabled.then().statusCode(200);
        return enabled.path("auth.accessToken");
    }

    private Response get(String url) {
        return given().auth().oauth2(token).get(url);
    }

    private Response post(String url, Object body) {
        return given().auth().oauth2(token).contentType(ContentType.JSON).body(body).post(url);
    }

    private Response put(String url, Object body) {
        return given().auth().oauth2(token).contentType(ContentType.JSON).body(body).put(url);
    }

    /** ไม่มี 5xx และ (ถ้าระบุ) ได้สถานะที่คาด */
    private void smoke(List<String> urls, List<String> failures) {
        for (String u : urls) {
            Response r = get(u);
            if (r.statusCode() >= 500 || r.statusCode() == 404 && !u.contains("logo")) {
                failures.add(r.statusCode() + " GET " + u + " -> " + r.asString().substring(0, Math.min(300, r.asString().length())));
            }
        }
    }

    private static Map<String, Object> m(Object... kv) {
        Map<String, Object> out = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            if (kv[i + 1] != null) {
                out.put((String) kv[i], kv[i + 1]);
            }
        }
        return out;
    }

    @Test
    void wholeSystem() throws Exception {
        io.restassured.RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
        token = login();
        LocalDate today = LocalDate.now(BKK);
        String period = today.toString().substring(0, 7);
        List<String> failures = new ArrayList<>();

        // ---------------------------------------------------------------- ทุกรายการ (ไม่มีข้อมูล)
        smoke(List.of(
                "/api/auth/me", "/api/auth/sessions", "/api/users", "/api/roles", "/api/permissions", "/api/audit-logs",
                "/api/notifications", "/api/notifications/count", "/api/settings/company", "/api/settings/quotation",
                "/api/customers", "/api/leads", "/api/leads/board", "/api/leads/summary",
                "/api/pricing/categories", "/api/pricing/materials", "/api/pricing/labor", "/api/pricing/equipment", "/api/pricing/pick?q=a",
                "/api/boqs", "/api/boq-templates", "/api/factor-f-tables", "/api/quotations", "/api/approvals",
                "/api/projects", "/api/qc-templates", "/api/contracts", "/api/change-orders/pending",
                "/api/finance/docs", "/api/finance/receivables",
                "/api/suppliers", "/api/suppliers/options", "/api/purchase-requests", "/api/purchase-orders",
                "/api/stock/warehouses", "/api/stock/on-hand", "/api/stock/docs", "/api/subcontracts",
                "/api/labor/workers", "/api/labor/wage-payments", "/api/labor/wage-preview?from=" + today.minusDays(7) + "&to=" + today,
                "/api/ap/bills", "/api/ap/vouchers",
                "/api/reports/project-cost", "/api/reports/vat-sales?period=" + period, "/api/reports/vat-purchase?period=" + period,
                "/api/reports/wht?period=" + period + "&form=pnd3", "/api/reports/wht?period=" + period + "&form=pnd53",
                "/api/reports/cash-flow?weeks=12",
                "/api/dashboard", "/api/calendar?from=" + today.minusDays(3) + "&to=" + today.plusDays(40),
                "/api/permits", "/api/permits?filter=soon", "/api/permits?filter=history",
                "/api/service/tickets", "/api/service/tickets?status=active", "/api/service/tickets/stats", "/api/service/warranties",
                "/api/service/surveys", "/api/service/surveys/summary", "/api/backups", "/api/backups/settings"), failures);

        // ---------------------------------------------------------------- ลูกค้า + โครงการ
        String customerId = post("/api/customers", m("type", "person", "name", "คุณทดสอบ ระบบ", "phone", "0810000000"))
                .then().statusCode(201).extract().path("id");
        String projectId = post("/api/projects", m("name", "บ้านทดสอบ", "customerId", customerId, "status", "active",
                "plannedStart", today.minusDays(10).toString(), "plannedEnd", today.plusDays(60).toString(), "budgetCost", 100000))
                .then().statusCode(201).extract().path("id");
        smoke(List.of("/api/projects/" + projectId, "/api/projects/" + projectId + "/schedule",
                "/api/reports/project-cost/" + projectId, "/api/reports/material-usage/" + projectId,
                "/api/labor/timesheets?projectId=" + projectId + "&from=" + today.minusDays(6) + "&to=" + today,
                "/api/stock/docs?projectId=" + projectId, "/api/subcontracts?projectId=" + projectId,
                "/api/finance/docs?projectId=" + projectId, "/api/service/tickets?projectId=" + projectId), failures);

        // ---------------------------------------------------------------- จัดซื้อ → รับของส่งตรงหน้างาน → ตั้งหนี้
        String supplierId = post("/api/suppliers", m("name", "หจก. วัสดุทดสอบ", "kind", "supplier", "personType", "company",
                "taxId", "0105558000014", "creditDays", 30, "vatRegistered", true, "active", true))
                .then().statusCode(201).extract().path("id");
        Response po = post("/api/purchase-orders", m("supplierId", supplierId, "projectId", projectId, "orderDate", today.toString(),
                "discountAmount", 0, "vatEnabled", true, "creditDays", 30,
                "items", List.of(m("description", "ปูนซีเมนต์ 50 กก.", "quantity", 10, "unit", "ถุง", "unitPrice", 150))));
        po.then().statusCode(201);
        String poId = po.path("id");
        post("/api/purchase-orders/" + poId + "/submit", Map.of()).then().statusCode(200).body("status", equalTo("approved"));
        String poItemId = get("/api/purchase-orders/" + poId).path("items[0].id");
        post("/api/purchase-orders/" + poId + "/receipts", m("receiveDate", today.toString(), "lines", List.of(m("poItemId", poItemId, "quantity", 10))))
                .then().statusCode(200).body("status", equalTo("received"));
        Response bill = post("/api/ap/bills/from-po/" + poId, Map.of());
        bill.then().statusCode(201).body("subtotal", equalTo(1500.0f));
        String billId = bill.path("id");
        post("/api/ap/bills/" + billId + "/approve", Map.of()).then().statusCode(200).body("status", equalTo("approved"));
        Response cost = get("/api/reports/project-cost/" + projectId);
        cost.then().statusCode(200);
        assertEquals(1500.0f, ((Number) cost.path("actualCost")).floatValue(), 0.01, "ต้นทุนวัสดุส่งตรงต้องนับครั้งเดียว (ไม่นับซ้ำจากใบตั้งหนี้)");
        Response pv = post("/api/ap/vouchers", m("supplierId", supplierId, "payDate", today.toString(), "method", "transfer",
                "lines", List.of(m("billId", billId, "amount", 1605))));
        pv.then().statusCode(201);
        // owner ได้รับยกเว้นกฎห้ามอนุมัติของตัวเอง (บริษัทเล็กเจ้าของทำเองได้)
        post("/api/ap/vouchers/" + pv.path("id") + "/approve", Map.of()).then().statusCode(200).body("status", equalTo("approved"));
        post("/api/ap/vouchers/" + pv.path("id") + "/pay", m("paidDate", today.toString())).then().statusCode(200).body("status", equalTo("paid"));
        get("/api/ap/bills/" + billId).then().statusCode(200).body("status", equalTo("paid"));

        // ---------------------------------------------------------------- ใบอนุญาต
        Response permit = post("/api/permits", m("kind", "building_permit", "name", "ใบอนุญาตก่อสร้าง อ.1", "projectId", projectId,
                "issueDate", today.minusDays(355).toString(), "expiryDate", today.plusDays(10).toString(), "notifyDays", 30));
        permit.then().statusCode(201).body("state", equalTo("soon")).body("daysLeft", equalTo(10));
        String permitId = permit.path("id");
        assertTrue(get("/api/permits?filter=soon").asString().contains(permitId));
        post("/api/permits/" + permitId + "/renew", m("expiryDate", today.plusDays(375).toString()))
                .then().statusCode(200).body("state", equalTo("ok"));
        assertTrue(get("/api/permits?filter=history").asString().contains(permitId));

        // ---------------------------------------------------------------- แจ้งซ่อม + รับประกัน + ความพึงพอใจ
        Response t1 = post("/api/service/tickets", m("projectId", projectId, "title", "ก๊อกน้ำรั่ว", "category", "plumbing",
                "priority", "urgent", "channel", "phone"));
        t1.then().statusCode(201).body("inWarranty", equalTo(false)).body("docNo", notNullValue());
        String t1Id = t1.path("id");
        String appointment = today.plusDays(1).atTime(9, 0).atZone(BKK).toInstant().toString();
        post("/api/service/tickets/" + t1Id + "/schedule", m("appointmentAt", appointment)).then().statusCode(200).body("status", equalTo("scheduled"));
        post("/api/service/tickets/" + t1Id + "/resolve", m("resolution", "เปลี่ยนวาล์ว", "laborCost", 300, "materialCost", 120, "chargeAmount", 500))
                .then().statusCode(200).body("status", equalTo("resolved")).body("chargeAmount", equalTo(500.0f));
        post("/api/service/tickets/" + t1Id + "/action", m("action", "close")).then().statusCode(200).body("status", equalTo("closed"));
        post("/api/service/surveys", m("ticketId", t1Id, "surveyDate", today.toString(), "method", "phone", "overall", 2, "quality", 3))
                .then().statusCode(201).body("customerName", equalTo("คุณทดสอบ ระบบ"));
        get("/api/service/surveys/summary").then().statusCode(200).body("count", equalTo(1));
        put("/api/service/warranties/" + projectId, m("warrantyUntil", today.plusDays(30).toString())).then().statusCode(204);
        post("/api/service/tickets", m("projectId", projectId, "title", "ผนังร้าว", "category", "structure", "priority", "normal", "channel", "line"))
                .then().statusCode(201).body("inWarranty", equalTo(true));
        assertTrue(get("/api/service/warranties").asString().contains(projectId));

        // ---------------------------------------------------------------- ปฏิทิน + แดชบอร์ด
        String startsAt = today.atTime(14, 0).atZone(BKK).toInstant().toString();
        post("/api/calendar/events", m("title", "ประชุมทดสอบ", "kind", "meeting", "startsAt", startsAt, "allDay", false))
                .then().statusCode(201);
        String cal = get("/api/calendar?from=" + today.minusDays(1) + "&to=" + today.plusDays(40)).then().statusCode(200).extract().asString();
        assertTrue(cal.contains("ประชุมทดสอบ"), "ปฏิทินต้องมีนัดหมาย");
        assertTrue(cal.contains("\"source\":\"service\""), "ปฏิทินต้องมีนัดซ่อม");
        assertTrue(cal.contains("\"source\":\"purchase\"") || cal.contains("\"source\":\"finance\""), "ปฏิทินต้องมีรายการการเงิน/จัดซื้อ");
        get("/api/dashboard").then().statusCode(200).body("kpis", notNullValue()).body("months.size()", equalTo(12))
                .body("alerts.ticketsOpen", equalTo(1));

        // ---------------------------------------------------------------- สำรองข้อมูล
        Response run = post("/api/backups", Map.of());
        run.then().statusCode(200);
        assertEquals("ok", run.path("status"), "backup failed: " + run.path("error"));
        String runId = run.path("id");
        byte[] zip = given().auth().oauth2(token).get("/api/backups/" + runId + "/file").then().statusCode(200).extract().asByteArray();
        boolean users = false;
        boolean manifest = false;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = in.getNextEntry()) != null) {
                String content = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
                if (e.getName().equals("tables/users.csv")) {
                    users = true;
                    assertFalse(content.contains("password_hash"), "ห้ามส่งออกรหัสผ่าน");
                    assertFalse(content.contains("totp_secret"), "ห้ามส่งออก TOTP secret");
                }
                if (e.getName().equals("manifest.json")) {
                    manifest = true;
                }
                assertFalse(e.getName().contains("user_sessions"), "ห้ามส่งออก session");
            }
        }
        assertTrue(users && manifest, "ZIP ต้องมี tables/users.csv และ manifest.json");

        if (!failures.isEmpty()) {
            fail("endpoint ที่ล้มเหลว:\n" + String.join("\n", failures));
        }
    }
}
