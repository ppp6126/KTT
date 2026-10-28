package com.ktt.quotation;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class QuotationCalculatorTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    /** รายการจากใบเสนอราคาตัวอย่าง INV 6908-001 */
    private static List<QuotationCalculator.Line> sampleLines() {
        return List.of(
                new QuotationCalculator.Line("item", d("6"), d("15200")),
                new QuotationCalculator.Line("item", d("52"), d("2300")),
                new QuotationCalculator.Line("item", d("1"), d("104000")),
                new QuotationCalculator.Line("item", d("1"), d("85000")),
                new QuotationCalculator.Line("heading", null, null),
                new QuotationCalculator.Line("item", d("1"), d("190000")),
                new QuotationCalculator.Line("item", d("1"), d("177402")));
    }

    @Test
    void sampleWithRoundingDown100MatchesCompanyDocument() {
        var r = QuotationCalculator.compute(new QuotationCalculator.Input(sampleLines(), d("0"), d("11"), true, d("7"),
                "down_100", d("0")));
        assertEquals(d("767202.00"), r.subtotal());
        assertEquals(d("84392.22"), r.overheadAmount());
        assertEquals(d("59605.00"), r.vatAmount());
        assertEquals(d("911100.00"), r.total());
        assertEquals(d("-99.22"), r.roundingAmount());
    }

    @Test
    void sampleWithoutRounding() {
        var r = QuotationCalculator.compute(new QuotationCalculator.Input(sampleLines(), d("0"), d("11"), true, d("7"),
                "none", d("0")));
        assertEquals(d("851594.22"), r.beforeVat());
        assertEquals(d("59611.60"), r.vatAmount());
        assertEquals(d("911205.82"), r.total());
        assertEquals(d("0.00"), r.roundingAmount());
    }

    @Test
    void discountAndWithholding() {
        var r = QuotationCalculator.compute(new QuotationCalculator.Input(
                List.of(new QuotationCalculator.Line("item", d("10"), d("1000"))), d("5"), d("0"), true, d("7"), "none", d("3")));
        assertEquals(d("500.00"), r.discountAmount());
        assertEquals(d("9500.00"), r.beforeVat());
        assertEquals(d("665.00"), r.vatAmount());
        assertEquals(d("10165.00"), r.total());
        assertEquals(d("285.00"), r.whtAmount());
        assertEquals(d("9880.00"), r.payable());
    }

    @Test
    void noVat() {
        var r = QuotationCalculator.compute(new QuotationCalculator.Input(
                List.of(new QuotationCalculator.Line("item", d("1.5"), d("333.33"))), d("0"), d("0"), false, d("7"), "none", d("0")));
        assertEquals(d("500.00"), r.subtotal());
        assertEquals(d("0"), r.vatAmount());
        assertEquals(d("500.00"), r.total());
    }
}
