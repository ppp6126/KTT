package com.ktt.finance;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FinanceCalculatorTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void milestoneInvoiceWithAdvanceRetentionAndWht() {
        // งวด 300,000 หักคืนเงินล่วงหน้า 10% = 30,000 → ฐาน 270,000
        var r = FinanceCalculator.compute(new FinanceCalculator.Input(
                List.of(new FinanceCalculator.Line(d("1"), d("300000"))), d("0"), d("30000"), true, d("7"), d("5"), d("3")));
        assertEquals(d("300000.00"), r.subtotal());
        assertEquals(d("270000.00"), r.taxable());
        assertEquals(d("18900.00"), r.vatAmount());
        assertEquals(d("288900.00"), r.total());
        assertEquals(d("13500.00"), r.retentionAmount());
        assertEquals(d("8100.00"), r.whtAmount());
        assertEquals(d("267300.00"), r.net());
    }

    @Test
    void noVatNoDeductions() {
        var r = FinanceCalculator.compute(new FinanceCalculator.Input(
                List.of(new FinanceCalculator.Line(d("2.5"), d("1000.555")), new FinanceCalculator.Line(d("1"), d("99.99"))),
                d("100"), d("0"), false, d("7"), d("0"), d("0")));
        assertEquals(d("2501.39"), r.lineAmounts().get(0));
        assertEquals(d("2601.38"), r.subtotal());
        assertEquals(d("2501.38"), r.taxable());
        assertEquals(d("0.00"), r.vatAmount());
        assertEquals(d("2501.38"), r.net());
    }

    @Test
    void vatPortionIsProportionalAndFinalTakesRemainder() {
        // ใบแจ้งหนี้ 107,000 (VAT 7,000) รับ 3 ครั้ง ครั้งละ 1/3
        BigDecimal p1 = FinanceCalculator.vatPortion(d("35666.67"), d("107000.00"), d("7000.00"), d("0"), false);
        BigDecimal p2 = FinanceCalculator.vatPortion(d("35666.67"), d("107000.00"), d("7000.00"), p1, false);
        BigDecimal p3 = FinanceCalculator.vatPortion(d("35666.66"), d("107000.00"), d("7000.00"), p1.add(p2), true);
        assertEquals(d("2333.33"), p1);
        assertEquals(d("7000.00"), p1.add(p2).add(p3));
    }

    @Test
    void creditNoteVatOnDifference() {
        var r = FinanceCalculator.credit(d("100000"), d("90000"), true, d("7"));
        assertEquals(d("10000.00"), r.difference());
        assertEquals(d("700.00"), r.vatAmount());
        assertEquals(d("10700.00"), r.total());
    }
}
