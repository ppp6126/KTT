package com.ktt.project;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * คำนวณความคืบหน้าโครงการจากแผนงาน
 * <ul>
 *   <li>ใช้เฉพาะงานย่อยสุด (leaf) ถ่วงด้วย weight: ความคืบหน้า = Σ(weight × progress) / Σ weight</li>
 *   <li>แผน ณ วันที่ d ของงาน = สัดส่วนวันที่ผ่านไปในช่วง planned_start..planned_end (นับรวมวันแรกและวันสุดท้าย)</li>
 *   <li>งานแม่ = ค่าเฉลี่ยถ่วงน้ำหนักของ leaf ใต้ตัวเอง ใช้แสดง "ความคืบหน้าตามหมวดงาน"</li>
 * </ul>
 * ฝั่ง frontend มีสูตรเดียวกันใน schedule-calc.ts
 */
public final class ScheduleCalculator {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private ScheduleCalculator() {
    }

    public record Task(UUID id, UUID parentId, BigDecimal weight, BigDecimal progress, LocalDate plannedStart,
                       LocalDate plannedEnd) {
    }

    public record Rollup(UUID id, BigDecimal weight, BigDecimal actualPct, BigDecimal plannedPct) {
    }

    public record CurvePoint(LocalDate date, BigDecimal plannedPct) {
    }

    /** ความคืบหน้าจริงรวมทั้งโครงการ */
    public static BigDecimal actual(List<Task> tasks) {
        return weighted(leaves(tasks), t -> pctOf(t.progress()));
    }

    /** ความคืบหน้าตามแผน ณ วันที่ */
    public static BigDecimal planned(List<Task> tasks, LocalDate date) {
        return weighted(leaves(tasks), t -> plannedFraction(t, date).multiply(HUNDRED));
    }

    /** ค่ารวมของแต่ละงาน (ทั้ง leaf และงานแม่) ณ วันที่ */
    public static Map<UUID, Rollup> rollup(List<Task> tasks, LocalDate date) {
        Map<UUID, List<Task>> children = new HashMap<>();
        for (Task t : tasks) {
            children.computeIfAbsent(t.parentId(), k -> new ArrayList<>()).add(t);
        }
        Map<UUID, Rollup> out = new LinkedHashMap<>();
        for (Task t : tasks) {
            List<Task> ls = leavesUnder(t, children);
            BigDecimal w = ls.stream().map(x -> nz(x.weight())).reduce(BigDecimal.ZERO, BigDecimal::add);
            out.put(t.id(), new Rollup(t.id(), w, weighted(ls, x -> pctOf(x.progress())),
                    weighted(ls, x -> plannedFraction(x, date).multiply(HUNDRED))));
        }
        return out;
    }

    /** เส้นแผน S-Curve จุดละ stepDays วัน (จุดสุดท้ายคือวันจบแผนเสมอ) */
    public static List<CurvePoint> plannedCurve(List<Task> tasks, int stepDays) {
        List<Task> ls = leaves(tasks);
        LocalDate start = ls.stream().map(Task::plannedStart).filter(d -> d != null).min(LocalDate::compareTo).orElse(null);
        LocalDate end = ls.stream().map(Task::plannedEnd).filter(d -> d != null).max(LocalDate::compareTo).orElse(null);
        List<CurvePoint> out = new ArrayList<>();
        if (start == null || end == null) {
            return out;
        }
        int step = Math.max(1, stepDays);
        LocalDate d = start.minusDays(1);
        out.add(new CurvePoint(d, BigDecimal.ZERO.setScale(2)));
        d = start;
        while (d.isBefore(end)) {
            out.add(new CurvePoint(d, planned(tasks, d)));
            d = d.plusDays(step);
        }
        out.add(new CurvePoint(end, planned(tasks, end)));
        return out;
    }

    static BigDecimal plannedFraction(Task t, LocalDate date) {
        if (t.plannedStart() == null || t.plannedEnd() == null) {
            return BigDecimal.ZERO;
        }
        if (date.isBefore(t.plannedStart())) {
            return BigDecimal.ZERO;
        }
        if (!date.isBefore(t.plannedEnd())) {
            return BigDecimal.ONE;
        }
        long total = ChronoUnit.DAYS.between(t.plannedStart(), t.plannedEnd()) + 1;
        long done = ChronoUnit.DAYS.between(t.plannedStart(), date) + 1;
        return BigDecimal.valueOf(done).divide(BigDecimal.valueOf(total), 10, RoundingMode.HALF_UP);
    }

    static List<Task> leaves(List<Task> tasks) {
        java.util.Set<UUID> parents = new java.util.HashSet<>();
        for (Task t : tasks) {
            if (t.parentId() != null) {
                parents.add(t.parentId());
            }
        }
        return tasks.stream().filter(t -> !parents.contains(t.id())).toList();
    }

    private static List<Task> leavesUnder(Task t, Map<UUID, List<Task>> children) {
        List<Task> kids = children.get(t.id());
        if (kids == null || kids.isEmpty()) {
            return List.of(t);
        }
        List<Task> out = new ArrayList<>();
        for (Task k : kids) {
            out.addAll(leavesUnder(k, children));
        }
        return out;
    }

    private static BigDecimal weighted(List<Task> ls, java.util.function.Function<Task, BigDecimal> value) {
        BigDecimal sw = BigDecimal.ZERO;
        BigDecimal sv = BigDecimal.ZERO;
        for (Task t : ls) {
            BigDecimal w = nz(t.weight());
            sw = sw.add(w);
            sv = sv.add(w.multiply(value.apply(t)));
        }
        if (sw.signum() == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return sv.divide(sw, 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal pctOf(BigDecimal p) {
        BigDecimal v = nz(p);
        return v.max(BigDecimal.ZERO).min(HUNDRED);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
