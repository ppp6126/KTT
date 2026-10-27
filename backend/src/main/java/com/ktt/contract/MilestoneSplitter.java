package com.ktt.contract;

import com.ktt.common.Money;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * แบ่งมูลค่าสัญญาเป็นเงินงวดตาม % ปัด 2 ตำแหน่ง ถ้า % รวมได้ 100 พอดี งวดสุดท้ายรับเศษที่เหลือ
 * เพื่อให้ผลรวมเงินงวดเท่ามูลค่าสัญญาทุกสตางค์
 */
public final class MilestoneSplitter {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private MilestoneSplitter() {
    }

    public static List<BigDecimal> split(BigDecimal total, List<BigDecimal> pcts) {
        List<BigDecimal> out = new ArrayList<>();
        BigDecimal sumPct = BigDecimal.ZERO;
        BigDecimal allocated = BigDecimal.ZERO;
        for (BigDecimal p : pcts) {
            BigDecimal a = Money.pct(total, p);
            out.add(a);
            sumPct = sumPct.add(Money.z(p));
            allocated = allocated.add(a);
        }
        if (!out.isEmpty() && sumPct.compareTo(HUNDRED) == 0) {
            int last = out.size() - 1;
            out.set(last, out.get(last).add(Money.round2(total).subtract(allocated)));
        }
        return out;
    }
}
