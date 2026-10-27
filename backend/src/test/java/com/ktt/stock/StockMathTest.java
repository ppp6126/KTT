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
}
