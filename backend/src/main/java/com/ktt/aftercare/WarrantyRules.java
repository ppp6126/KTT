package com.ktt.aftercare;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;

/** กติการับประกันและสรุปคะแนนความพึงพอใจ (คำนวณล้วน ทดสอบได้) */
public final class WarrantyRules {

    private WarrantyRules() {
    }

    /**
     * วันสิ้นสุดรับประกัน: ใช้ค่าที่กำหนดเองก่อน ไม่งั้น วันส่งมอบ + จำนวนเดือนในสัญญา (หรือค่าตั้งต้นของบริษัท) − 1 วัน
     * ยังไม่ส่งมอบ = null (ยังไม่เริ่มนับ)
     */
    public static LocalDate warrantyEnd(LocalDate override, LocalDate handover, Integer contractMonths, int defaultMonths) {
        if (override != null) {
            return override;
        }
        if (handover == null) {
            return null;
        }
        int months = contractMonths != null ? contractMonths : defaultMonths;
        if (months <= 0) {
            return null;
        }
        return handover.plusMonths(months).minusDays(1);
    }

    public static boolean inWarranty(LocalDate reported, LocalDate end) {
        return end != null && reported != null && !reported.isAfter(end);
    }

    /** active / expiring (เหลือ ≤ 30 วัน) / expired / not_started */
    public static String state(LocalDate end, LocalDate today) {
        if (end == null) {
            return "not_started";
        }
        long left = ChronoUnit.DAYS.between(today, end);
        if (left < 0) {
            return "expired";
        }
        return left <= 30 ? "expiring" : "active";
    }

    /** ค่าเฉลี่ยคะแนน (ข้ามค่า null) ทศนิยม 2 ตำแหน่ง; ไม่มีข้อมูล = null */
    public static BigDecimal average(List<Integer> scores) {
        List<Integer> s = scores.stream().filter(Objects::nonNull).toList();
        if (s.isEmpty()) {
            return null;
        }
        int sum = s.stream().mapToInt(Integer::intValue).sum();
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(s.size()), 2, RoundingMode.HALF_UP);
    }

    /** % ที่ตอบว่าจะแนะนำต่อ จากผู้ที่ตอบคำถามนี้ */
    public static BigDecimal recommendPct(List<Boolean> answers) {
        List<Boolean> a = answers.stream().filter(Objects::nonNull).toList();
        if (a.isEmpty()) {
            return null;
        }
        long yes = a.stream().filter(Boolean::booleanValue).count();
        return BigDecimal.valueOf(yes * 100).divide(BigDecimal.valueOf(a.size()), 1, RoundingMode.HALF_UP);
    }
}
