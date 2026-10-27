package com.ktt.boq;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

/**
 * หา Factor F จากตารางของกรมบัญชีกลางที่ผู้ใช้กรอกไว้ ด้วยการเทียบบัญญัติไตรยางศ์ (linear interpolation)
 * ระหว่างช่วงค่างานต้นทุน ตามวิธีในหลักเกณฑ์การคำนวณราคากลาง:
 * <pre>F = F_ล่าง − (F_ล่าง − F_บน) × (ค่างาน − ค่างาน_ล่าง) / (ค่างาน_บน − ค่างาน_ล่าง)</pre>
 * ต่ำกว่าช่วงแรกใช้ค่าแรก สูงกว่าช่วงสุดท้ายใช้ค่าสุดท้าย. ผลปัด 4 ตำแหน่ง
 */
public final class FactorF {

    private FactorF() {
    }

    public record Point(BigDecimal cost, BigDecimal factor) {
    }

    public static BigDecimal interpolate(List<Point> table, BigDecimal cost) {
        if (table == null || table.isEmpty() || cost == null) {
            return null;
        }
        List<Point> rows = table.stream().sorted(Comparator.comparing(Point::cost)).toList();
        if (cost.compareTo(rows.get(0).cost()) <= 0) {
            return scale(rows.get(0).factor());
        }
        Point last = rows.get(rows.size() - 1);
        if (cost.compareTo(last.cost()) >= 0) {
            return scale(last.factor());
        }
        for (int i = 0; i < rows.size() - 1; i++) {
            Point lo = rows.get(i);
            Point hi = rows.get(i + 1);
            if (cost.compareTo(lo.cost()) >= 0 && cost.compareTo(hi.cost()) <= 0) {
                BigDecimal span = hi.cost().subtract(lo.cost());
                if (span.signum() == 0) {
                    return scale(lo.factor());
                }
                BigDecimal ratio = cost.subtract(lo.cost()).divide(span, MathContext.DECIMAL64);
                BigDecimal f = lo.factor().subtract(lo.factor().subtract(hi.factor()).multiply(ratio));
                return scale(f);
            }
        }
        return scale(last.factor());
    }

    private static BigDecimal scale(BigDecimal v) {
        return v.setScale(4, RoundingMode.HALF_UP);
    }
}
