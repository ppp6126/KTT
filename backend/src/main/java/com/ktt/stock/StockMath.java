package com.ktt.stock;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** ต้นทุนถัวเฉลี่ยเคลื่อนที่ (moving average) */
public final class StockMath {

    private StockMath() {
    }

    public record Position(BigDecimal qty, BigDecimal value) {
        public BigDecimal avgCost() {
            if (qty.signum() <= 0) {
                return BigDecimal.ZERO.setScale(4);
            }
            return value.divide(qty, 4, RoundingMode.HALF_UP);
        }
    }

    /** รับเข้า: มูลค่าเพิ่มตามราคาซื้อ */
    public static Position receive(Position p, BigDecimal qty, BigDecimal unitCost) {
        return new Position(p.qty().add(qty), p.value().add(qty.multiply(unitCost)));
    }

    /** จ่ายออกด้วยต้นทุนเฉลี่ยปัจจุบัน; ถ้าจ่ายหมดให้มูลค่าเหลือ 0 (กันเศษค้าง) */
    public static Position issue(Position p, BigDecimal qty) {
        BigDecimal left = p.qty().subtract(qty);
        if (left.signum() == 0) {
            return new Position(BigDecimal.ZERO, BigDecimal.ZERO);
        }
        return new Position(left, p.value().subtract(qty.multiply(p.avgCost())));
    }
}
