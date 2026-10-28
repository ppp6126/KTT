package com.ktt.aftercare;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WarrantyRulesTest {

    @Test
    void endFromHandoverAndContractMonths() {
        LocalDate handover = LocalDate.of(2026, 1, 31);
        assertEquals(LocalDate.of(2027, 1, 30), WarrantyRules.warrantyEnd(null, handover, 12, 6));
        assertEquals(LocalDate.of(2026, 7, 30), WarrantyRules.warrantyEnd(null, handover, null, 6));
        assertEquals(LocalDate.of(2028, 1, 1), WarrantyRules.warrantyEnd(LocalDate.of(2028, 1, 1), handover, 12, 6));
        assertNull(WarrantyRules.warrantyEnd(null, null, 12, 12));
        assertNull(WarrantyRules.warrantyEnd(null, handover, 0, 12));
    }

    @Test
    void inWarrantyIncludesLastDay() {
        LocalDate end = LocalDate.of(2027, 1, 30);
        assertTrue(WarrantyRules.inWarranty(end, end));
        assertFalse(WarrantyRules.inWarranty(end.plusDays(1), end));
        assertFalse(WarrantyRules.inWarranty(end, null));
    }

    @Test
    void states() {
        LocalDate today = LocalDate.of(2026, 10, 28);
        assertEquals("not_started", WarrantyRules.state(null, today));
        assertEquals("expiring", WarrantyRules.state(today.plusDays(30), today));
        assertEquals("active", WarrantyRules.state(today.plusDays(31), today));
        assertEquals("expired", WarrantyRules.state(today.minusDays(1), today));
    }

    @Test
    void averagesSkipBlanks() {
        assertEquals(new BigDecimal("4.33"), WarrantyRules.average(Arrays.asList(5, 4, null, 4)));
        assertNull(WarrantyRules.average(Arrays.asList(null, null)));
        assertEquals(new BigDecimal("66.7"), WarrantyRules.recommendPct(Arrays.asList(true, false, null, true)));
    }
}
