package com.ktt.permit;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** สถานะวันหมดอายุและจังหวะการแจ้งเตือน (คำนวณล้วน ทดสอบได้) */
public final class ExpiryRules {

    private ExpiryRules() {
    }

    /** ok / soon (อยู่ในช่วงแจ้งเตือน) / expired / none (ไม่มีวันหมดอายุ) */
    public static String state(LocalDate expiry, int notifyDays, LocalDate today) {
        if (expiry == null) {
            return "none";
        }
        long left = ChronoUnit.DAYS.between(today, expiry);
        if (left < 0) {
            return "expired";
        }
        return left <= notifyDays ? "soon" : "ok";
    }

    public static Long daysLeft(LocalDate expiry, LocalDate today) {
        return expiry == null ? null : ChronoUnit.DAYS.between(today, expiry);
    }

    /**
     * ส่งแจ้งเตือนวันนี้หรือไม่: แจ้งครั้งแรกเมื่อเข้าช่วง notifyDays แล้วแจ้งซ้ำที่เหลือ 7 วัน 1 วัน วันหมดอายุ
     * และทุก 7 วันหลังหมดอายุ (จนกว่าจะต่ออายุหรือยกเลิก) ไม่แจ้งซ้ำในวันเดียวกัน
     */
    public static boolean shouldNotify(LocalDate expiry, int notifyDays, LocalDate lastNotified, LocalDate today) {
        if (expiry == null || (lastNotified != null && !lastNotified.isBefore(today))) {
            return false;
        }
        long left = ChronoUnit.DAYS.between(today, expiry);
        if (left > notifyDays) {
            return false;
        }
        if (lastNotified == null || ChronoUnit.DAYS.between(lastNotified, expiry) > notifyDays) {
            return true; // ยังไม่เคยแจ้งในรอบนี้
        }
        if (left == 7 || left == 1 || left == 0) {
            return true;
        }
        return left < 0 && ChronoUnit.DAYS.between(lastNotified, today) >= 7;
    }
}
