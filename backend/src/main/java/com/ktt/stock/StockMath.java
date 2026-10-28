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

    /**
     * ต้นทุนต่อหน่วยสำหรับรายการจ่ายออก/ยกเลิกรับเข้า: ต้นทุนเฉลี่ยปัจจุบัน
     * ถ้าออกหมดคลังใช้มูลค่าคงเหลือทั้งหมด (ไม่ให้มีเศษค้าง) ; ไม่ติดลบเสมอ
     */
    public static BigDecimal outCost(Position p, BigDecimal qty) {
        BigDecimal cost = p.avgCost();
        if (qty.signum() > 0 && p.qty().compareTo(qty) == 0) {
            cost = p.value().divide(qty, 4, RoundingMode.HALF_UP);
        }
        return cost.signum() < 0 ? BigDecimal.ZERO.setScale(4) : cost;
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
