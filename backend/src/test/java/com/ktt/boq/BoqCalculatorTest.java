package com.ktt.boq;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BoqCalculatorTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void rollsUpTreeAndAppliesMarkup() {
        List<BoqCalculator.Node> nodes = List.of(
                new BoqCalculator.Node("1", null, null, null, null, null),
                new BoqCalculator.Node("1.1", "1", null, null, null, null),
                new BoqCalculator.Node("1.1.1", "1.1", d("10"), d("100"), d("50"), d("0")),
                new BoqCalculator.Node("1.1.2", "1.1", d("2"), d("1000"), d("0"), d("250")),
                new BoqCalculator.Node("2", null, d("1"), d("0"), d("5000"), d("0")));
        var r = BoqCalculator.compute(new BoqCalculator.Input(nodes, d("5"), d("10"), d("5"), d("0"), d("7")));

        assertEquals(d("1500.00"), r.nodes().get("1.1.1").lineCost());
        assertEquals(d("1800.00"), r.nodes().get("1.1.1").lineSell());
        assertEquals(d("2500.00"), r.nodes().get("1.1.2").lineCost());
        assertEquals(d("4000.00"), r.nodes().get("1").lineCost());
        assertEquals(d("3000.00"), r.nodes().get("1").materialAmount());
        assertFalse(r.nodes().get("1").leaf());
        assertTrue(r.nodes().get("2").leaf());
        assertEquals(d("9000.00"), r.subtotalCost());
        assertEquals(d("10800.00"), r.subtotalSell());
        assertEquals(d("16.67"), r.marginPct());
        assertEquals(d("11556.00"), r.grandTotal());
    }

    @Test
    void factorFInterpolation() {
        List<FactorF.Point> table = List.of(
                new FactorF.Point(d("5000000"), d("1.2500")),
                new FactorF.Point(d("10000000"), d("1.2000")));
        assertEquals(d("1.2500"), FactorF.interpolate(table, d("1000000")));
        assertEquals(d("1.2250"), FactorF.interpolate(table, d("7500000")));
        assertEquals(d("1.2000"), FactorF.interpolate(table, d("20000000")));
    }
}
