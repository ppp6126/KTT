package com.ktt.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** เงินใช้ BigDecimal เสมอ ปัดเศษ 2 ตำแหน่งแบบ HALF_UP (ปัดครึ่งขึ้น) */
public final class Money {

    public static final BigDecimal HUNDRED = new BigDecimal("100");

    private Money() {
    }

    public static BigDecimal z(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    public static BigDecimal round2(BigDecimal v) {
        return z(v).setScale(2, RoundingMode.HALF_UP);
    }

    /** v × pct / 100 ปัด 2 ตำแหน่ง */
    public static BigDecimal pct(BigDecimal v, BigDecimal pct) {
        return round2(z(v).multiply(z(pct)).divide(HUNDRED, 10, RoundingMode.HALF_UP));
    }

    /** ปัดลงตามหน่วย เช่น unit=100 → 851,594.22 กลายเป็น 851,500.00 */
    public static BigDecimal floorTo(BigDecimal v, BigDecimal unit) {
        if (unit == null || unit.signum() <= 0) {
            return round2(v);
        }
        return z(v).divide(unit, 0, RoundingMode.FLOOR).multiply(unit).setScale(2, RoundingMode.UNNECESSARY);
    }

    public static boolean isZero(BigDecimal v) {
        return v == null || v.signum() == 0;
    }
}
