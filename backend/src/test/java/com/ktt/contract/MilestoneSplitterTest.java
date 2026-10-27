package com.ktt.contract;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MilestoneSplitterTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void lastMilestoneAbsorbsRounding() {
        var a = MilestoneSplitter.split(d("851500.00"), List.of(d("33.333"), d("33.333"), d("33.334")));
        assertEquals(d("283830.50"), a.get(0));
        assertEquals(d("851500.00"), a.get(0).add(a.get(1)).add(a.get(2)));
    }

    @Test
    void partialPercentKeepsPlainRounding() {
        var a = MilestoneSplitter.split(d("1000"), List.of(d("30"), d("30")));
        assertEquals(d("300.00"), a.get(1));
    }
}
