package com.ktt.ap;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApCalculatorTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void subcontractClaimWithRetentionAndWht() {
        // งวดผู้รับเหมาช่วง 100,000 VAT 7% หัก 3% กันประกัน 5,000
        var r = ApCalculator.compute(List.of(new ApCalculator.Line(d("1"), d("100000"))), d("7"), d("3"), d("5000"));
        assertEquals(d("107000.00"), r.total());
        assertEquals(d("3000.00"), r.wht());
        assertEquals(d("99000.00"), r.net());
    }

    @Test
    void partialPaymentsSplitWhtExactly() {
        // ตัดหนี้ 102,000 สองครั้ง: 51,000 + 51,000 ; WHT รวม 3,000
        BigDecimal w1 = ApCalculator.whtPortion(d("51000"), d("102000"), d("3000.00"), d("0"), false);
        BigDecimal w2 = ApCalculator.whtPortion(d("51000"), d("102000"), d("3000.00"), w1, true);
        assertEquals(d("1500.00"), w1);
        assertEquals(d("3000.00"), w1.add(w2));
        assertEquals(d("50000.00"), ApCalculator.incomeFromWht(w1, d("3")));
    }
}
