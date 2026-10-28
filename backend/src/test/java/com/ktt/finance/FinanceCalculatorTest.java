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

    @Test
    void vatOnRetentionIsDeferredUntilReleased() {
        // ใบแจ้งหนี้ 288,900 (VAT 18,900) ลูกค้ากันเงินประกัน 13,500 หัก ณ ที่จ่าย 8,100 จ่ายเงิน 267,300
        BigDecimal retVat = FinanceCalculator.retentionVat(d("13500"), d("288900.00"), d("18900.00"));
        BigDecimal vat = FinanceCalculator.vatPortion(d("275400.00"), d("13500"), d("288900.00"), d("18900.00"), d("0"), d("0"), true);
        assertEquals(d("883.18"), retVat);
        assertEquals(d("18016.82"), vat);
        assertEquals(d("6542.06"), FinanceCalculator.vatPortion(d("100000"), d("0"), d("107000.00"), d("7000.00"), d("0"), d("0"), false));
        // รับคืนครบ → VAT ที่เลื่อนไว้ทั้งหมด, รับคืนครึ่งหนึ่ง → ตามสัดส่วน
        assertEquals(d("883.18"), FinanceCalculator.retentionReleaseVat(d("13500.00"), d("13500.00"), retVat));
        assertEquals(d("441.59"), FinanceCalculator.retentionReleaseVat(d("6750.00"), d("13500.00"), retVat));
        assertEquals(d("0.00"), FinanceCalculator.retentionReleaseVat(d("6750.00"), d("0"), d("0")));
    }

    @Test
    void partialPaymentsWithRetentionSumToInvoiceVat() {
        // 2 งวดรับชำระ ครั้งละครึ่ง แต่ละครั้งลูกค้ากันเงินประกัน 6,750
        BigDecimal total = d("288900.00");
        BigDecimal vat = d("18900.00");
        BigDecimal p1 = FinanceCalculator.vatPortion(d("137700.00"), d("6750.00"), total, vat, d("0"), d("0"), false);
        BigDecimal r1 = FinanceCalculator.retentionVat(d("6750.00"), total, vat);
        BigDecimal p2 = FinanceCalculator.vatPortion(d("137700.00"), d("6750.00"), total, vat, p1, r1, true);
        BigDecimal r2 = FinanceCalculator.retentionVat(d("6750.00"), total, vat);
        assertEquals(vat, p1.add(p2).add(r1).add(r2));
    }

    @Test
    void finalMilestoneDeductsRemainingAdvance() {
        assertEquals(d("30000.00"), FinanceCalculator.advanceDeduction(d("300000"), d("10"), d("100000.00"), d("0"), false));
        // 3 งวด 333,333.33 → 2 งวดแรกหัก 33,333.33 รวม 66,666.66 งวดสุดท้ายหักที่เหลือ 33,333.34
        assertEquals(d("33333.34"), FinanceCalculator.advanceDeduction(d("333333.34"), d("10"), d("100000.00"), d("66666.66"), true));
        // ไม่หักเกินยอดที่เหลือ
        assertEquals(d("30000.00"), FinanceCalculator.advanceDeduction(d("500000"), d("10"), d("100000.00"), d("70000.00"), false));
        // ยังไม่เรียกเก็บเงินล่วงหน้า → หักตามสัดส่วนเดิม
        assertEquals(d("30000.00"), FinanceCalculator.advanceDeduction(d("300000"), d("10"), d("0"), d("0"), true));
    }
}
