package com.ktt.permit;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExpiryRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

    @Test
    void stateByDaysLeft() {
        assertEquals("none", ExpiryRules.state(null, 30, TODAY));
        assertEquals("ok", ExpiryRules.state(TODAY.plusDays(31), 30, TODAY));
        assertEquals("soon", ExpiryRules.state(TODAY.plusDays(30), 30, TODAY));
        assertEquals("soon", ExpiryRules.state(TODAY, 30, TODAY));
        assertEquals("expired", ExpiryRules.state(TODAY.minusDays(1), 30, TODAY));
    }

    @Test
    void firstNoticeWhenEnteringWindow() {
        assertFalse(ExpiryRules.shouldNotify(TODAY.plusDays(31), 30, null, TODAY));
        assertTrue(ExpiryRules.shouldNotify(TODAY.plusDays(30), 30, null, TODAY));
        // แจ้งรอบก่อน (ปีที่แล้ว) ไม่นับ
        assertTrue(ExpiryRules.shouldNotify(TODAY.plusDays(20), 30, TODAY.minusDays(365), TODAY));
    }

    @Test
    void remindersAtSevenOneAndZeroDays() {
        LocalDate first = TODAY.minusDays(10);
        assertTrue(ExpiryRules.shouldNotify(TODAY.plusDays(7), 30, first, TODAY));
        assertFalse(ExpiryRules.shouldNotify(TODAY.plusDays(6), 30, first, TODAY));
        assertTrue(ExpiryRules.shouldNotify(TODAY.plusDays(1), 30, first, TODAY));
        assertTrue(ExpiryRules.shouldNotify(TODAY, 30, first, TODAY));
        assertFalse(ExpiryRules.shouldNotify(TODAY, 30, TODAY, TODAY));
    }

    @Test
    void weeklyAfterExpiry() {
        assertTrue(ExpiryRules.shouldNotify(TODAY.minusDays(9), 30, TODAY.minusDays(7), TODAY));
        assertFalse(ExpiryRules.shouldNotify(TODAY.minusDays(9), 30, TODAY.minusDays(3), TODAY));
    }
}
