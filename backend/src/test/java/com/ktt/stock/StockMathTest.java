package com.ktt.stock;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class StockMathTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void movingAverageAcrossReceiptsAndIssues() {
        var p = new StockMath.Position(BigDecimal.ZERO, BigDecimal.ZERO);
        p = StockMath.receive(p, d("100"), d("26"));      // 2,600
        p = StockMath.receive(p, d("50"), d("29"));       // +1,450 → 150 @ 27
        assertEquals(d("27.0000"), p.avgCost());
        p = StockMath.issue(p, d("60"));
        assertEquals(0, d("90").compareTo(p.qty()));
        assertEquals(d("27.0000"), p.avgCost());
        p = StockMath.issue(p, d("90"));
        assertEquals(0, BigDecimal.ZERO.compareTo(p.value()));
    }

    /** ยกเลิกใบรับหลังมีการเบิกไปบางส่วน: ตัดด้วยต้นทุนเฉลี่ยปัจจุบัน มูลค่าคงเหลือไม่ติดลบ */
    @Test
    void reverseReceiptAtMovingAverageKeepsValueConsistent() {
        var p = new StockMath.Position(BigDecimal.ZERO, BigDecimal.ZERO);
        p = StockMath.receive(p, d("10"), d("100"));      // GR-A 1,000
        p = StockMath.receive(p, d("10"), d("10"));       // GR-B 100 → 20 @ 55
        p = StockMath.issue(p, d("10"));                  // 10 @ 55 = 550
        // ยกเลิก GR-A (10 ชิ้น) = ออกหมดคลัง → ใช้มูลค่าคงเหลือทั้งหมด ไม่ใช่ราคา 100
        BigDecimal cost = StockMath.outCost(p, d("10"));
        assertEquals(d("55.0000"), cost);
        var after = new StockMath.Position(p.qty().subtract(d("10")), p.value().subtract(d("10").multiply(cost)));
        assertEquals(0, BigDecimal.ZERO.compareTo(after.qty()));
        assertEquals(0, BigDecimal.ZERO.compareTo(after.value()));
    }

    @Test
    void partialReverseUsesAverageAndKeepsAverage() {
        var p = new StockMath.Position(d("150"), d("4050"));   // 150 @ 27
        BigDecimal cost = StockMath.outCost(p, d("50"));
        assertEquals(d("27.0000"), cost);
        var after = new StockMath.Position(p.qty().subtract(d("50")), p.value().subtract(d("50").multiply(cost)));
        assertEquals(d("27.0000"), after.avgCost());
    }

    @Test
    void lastUnitsTakeRemainingValue() {
        var p = new StockMath.Position(d("3"), d("10"));       // avg 3.3333
        assertEquals(d("3.3333"), StockMath.outCost(p, d("1")));
        assertEquals(d("3.3333"), StockMath.outCost(p, d("3")));
    }

    @Test
    void outCostNeverNegative() {
        var p = new StockMath.Position(d("5"), d("-20"));      // ข้อมูลเก่าที่มูลค่าติดลบ
        assertEquals(0, BigDecimal.ZERO.compareTo(StockMath.outCost(p, d("2"))));
        assertEquals(0, BigDecimal.ZERO.compareTo(StockMath.outCost(p, d("5"))));
    }
}
