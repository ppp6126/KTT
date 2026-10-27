package com.ktt.project;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ScheduleCalculatorTest {

    private static final UUID CAT_A = UUID.randomUUID();
    private static final UUID A1 = UUID.randomUUID();
    private static final UUID A2 = UUID.randomUUID();
    private static final UUID B = UUID.randomUUID();

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    private static final LocalDate D1 = LocalDate.of(2026, 1, 1);

    private static List<ScheduleCalculator.Task> tasks() {
        return List.of(
                // หมวด A (ไม่นับน้ำหนักตัวเอง)
                new ScheduleCalculator.Task(CAT_A, null, d("99"), d("0"), null, null),
                new ScheduleCalculator.Task(A1, CAT_A, d("30"), d("100"), D1, D1.plusDays(9)),       // 10 วัน
                new ScheduleCalculator.Task(A2, CAT_A, d("20"), d("50"), D1.plusDays(10), D1.plusDays(19)),
                new ScheduleCalculator.Task(B, null, d("50"), d("10"), D1.plusDays(10), D1.plusDays(29)));
    }

    @Test
    void actualIsWeightedAverageOfLeaves() {
        // (30×100 + 20×50 + 50×10) / 100 = 45
        assertEquals(d("45.00"), ScheduleCalculator.actual(tasks()));
    }

    @Test
    void plannedIsLinearInsideTaskWindow() {
        // วันที่ 5 ของ A1: A1 = 5/10, อื่นยังไม่เริ่ม → 30×0.5 / 100 = 15
        assertEquals(d("15.00"), ScheduleCalculator.planned(tasks(), D1.plusDays(4)));
        // ก่อนเริ่ม = 0, หลังจบทุกงาน = 100
        assertEquals(d("0.00"), ScheduleCalculator.planned(tasks(), D1.minusDays(1)));
        assertEquals(d("100.00"), ScheduleCalculator.planned(tasks(), D1.plusDays(40)));
    }

    @Test
    void rollupGivesCategoryProgress() {
        var r = ScheduleCalculator.rollup(tasks(), D1.plusDays(14));
        // หมวด A: (30×100 + 20×50) / 50 = 80 ; แผน: A1 เสร็จ (1), A2 วันที่ 5/10 → (30 + 20×0.5)/50 = 80
        assertEquals(d("80.00"), r.get(CAT_A).actualPct());
        assertEquals(d("80.00"), r.get(CAT_A).plannedPct());
        assertEquals(d("50"), r.get(CAT_A).weight());
    }

    @Test
    void curveEndsAtHundred() {
        var c = ScheduleCalculator.plannedCurve(tasks(), 7);
        assertEquals(d("0.00"), c.get(0).plannedPct());
        assertEquals(D1.plusDays(29), c.get(c.size() - 1).date());
        assertEquals(d("100.00"), c.get(c.size() - 1).plannedPct());
    }
}
