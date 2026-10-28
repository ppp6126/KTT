package com.ktt.quotation;

import com.ktt.common.Money;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * คำนวณยอดใบเสนอราคาตามแบบฟอร์มบริษัท:
 * <pre>
 * รวมเงิน (subtotal)              = Σ จำนวน × ราคาต่อหน่วย
 * − ส่วนลด x%                      = subtotal × x%
 * + ค่าดำเนินการ y%                = (subtotal − ส่วนลด) × y%
 *   ฐานภาษี                         = subtotal − ส่วนลด + ค่าดำเนินการ   (ถ้าปัดเศษ จะปัดฐานภาษีลงก่อน)
 * + ภาษีมูลค่าเพิ่ม 7%             = ฐานภาษี × 7%
 *   ยอดสุทธิ                        = ฐานภาษี + VAT                       (ถ้าปัดเศษ จะปัดลงอีกครั้ง)
 *   หัก ณ ที่จ่าย z% (แสดงข้อมูล)   = ฐานภาษีก่อนปัด × z%
 * </pre>
 * โหมดปัดเศษ down_100 ให้ผลตรงกับตัวอย่างเอกสารของบริษัท (767,202 + 11% + VAT → 911,100)
 */
public final class QuotationCalculator {

    public static final String ROUND_NONE = "none";

    private QuotationCalculator() {
    }

    public record Line(String type, BigDecimal quantity, BigDecimal unitPrice) {
    }

    public record Input(List<Line> lines, BigDecimal discountPct, BigDecimal overheadPct, boolean vatEnabled,
                        BigDecimal vatPct, String roundingMode, BigDecimal whtPct) {
    }

    public record Result(
            List<BigDecimal> lineAmounts,
            BigDecimal subtotal,
            BigDecimal discountAmount,
            BigDecimal overheadAmount,
            BigDecimal beforeVat,
            BigDecimal vatAmount,
            BigDecimal roundingAmount,
            BigDecimal total,
            BigDecimal whtAmount,
            BigDecimal payable) {
    }

    public static BigDecimal lineAmount(BigDecimal qty, BigDecimal unitPrice) {
        return Money.round2(Money.z(qty).multiply(Money.z(unitPrice)));
    }

    public static Result compute(Input in) {
        List<BigDecimal> amounts = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (Line l : in.lines()) {
            BigDecimal a = "item".equals(l.type()) ? lineAmount(l.quantity(), l.unitPrice()) : BigDecimal.ZERO;
            amounts.add(a);
            subtotal = subtotal.add(a);
        }
        subtotal = Money.round2(subtotal);
        BigDecimal discount = Money.pct(subtotal, in.discountPct());
        BigDecimal afterDiscount = subtotal.subtract(discount);
        BigDecimal overhead = Money.pct(afterDiscount, in.overheadPct());
        BigDecimal beforeVat = afterDiscount.add(overhead);

        BigDecimal unit = roundingUnit(in.roundingMode());
        BigDecimal vatBase = unit == null ? beforeVat : Money.floorTo(beforeVat, unit);
        BigDecimal vat = in.vatEnabled() ? Money.pct(vatBase, in.vatPct()) : BigDecimal.ZERO;
        BigDecimal total = vatBase.add(vat);
        if (unit != null) {
            total = Money.floorTo(total, unit);
        }
        BigDecimal rounding = total.subtract(beforeVat.add(vat));
        BigDecimal wht = Money.pct(beforeVat, in.whtPct());
        return new Result(amounts, subtotal, discount, overhead, beforeVat, vat, Money.round2(rounding),
                Money.round2(total), wht, Money.round2(total.subtract(wht)));
    }

    static BigDecimal roundingUnit(String mode) {
        if (mode == null) {
            return null;
        }
        return switch (mode) {
            case "down_1" -> BigDecimal.ONE;
            case "down_10" -> BigDecimal.TEN;
            case "down_100" -> Money.HUNDRED;
            default -> null;
        };
    }
}
