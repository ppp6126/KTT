package com.ktt.finance;

import com.ktt.common.Money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * สูตรเอกสารการเงินฝั่งขาย (frontend มีสูตรเดียวกันใน finance-calc.ts)
 * <pre>
 * รวมเงิน (subtotal)            = Σ จำนวน × ราคาต่อหน่วย (ปัดรายบรรทัด)
 * หลังส่วนลด                    = subtotal − ส่วนลด
 * ฐานภาษี (taxable)            = หลังส่วนลด − หักคืนเงินล่วงหน้า
 * VAT                          = taxable × vat%
 * รวมทั้งสิ้น (total)            = taxable + VAT
 * เงินประกันผลงาน (retention)    = taxable × retention%
 * ภาษีหัก ณ ที่จ่าย (wht)         = taxable × wht%   (ลูกค้าหักตามมูลค่าก่อน VAT)
 * ยอดชำระสุทธิ (net)             = total − retention − wht
 * </pre>
 */
public final class FinanceCalculator {

    private FinanceCalculator() {
    }

    public record Line(BigDecimal quantity, BigDecimal unitPrice) {
    }

    public record Input(List<Line> lines, BigDecimal discountAmount, BigDecimal advanceDeduct, boolean vatEnabled,
                        BigDecimal vatPct, BigDecimal retentionPct, BigDecimal whtPct) {
    }

    public record Result(List<BigDecimal> lineAmounts, BigDecimal subtotal, BigDecimal discountAmount,
                         BigDecimal advanceDeduct, BigDecimal taxable, BigDecimal vatAmount, BigDecimal total,
                         BigDecimal retentionAmount, BigDecimal whtAmount, BigDecimal net) {
    }

    public static Result compute(Input in) {
        List<BigDecimal> amounts = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (Line l : in.lines()) {
            BigDecimal a = Money.round2(Money.z(l.quantity()).multiply(Money.z(l.unitPrice())));
            amounts.add(a);
            subtotal = subtotal.add(a);
        }
        subtotal = Money.round2(subtotal);
        BigDecimal discount = Money.round2(in.discountAmount());
        BigDecimal advance = Money.round2(in.advanceDeduct());
        BigDecimal taxable = subtotal.subtract(discount).subtract(advance);
        BigDecimal vat = in.vatEnabled() ? Money.pct(taxable, in.vatPct()) : BigDecimal.ZERO.setScale(2);
        BigDecimal total = taxable.add(vat);
        BigDecimal retention = Money.pct(taxable, in.retentionPct());
        BigDecimal wht = Money.pct(taxable, in.whtPct());
        return new Result(amounts, subtotal, discount, advance, taxable, vat, total, retention, wht,
                total.subtract(retention).subtract(wht));
    }

    /**
     * แบ่ง VAT ตามสัดส่วนเงินที่รับชำระ (งานบริการเกิดภาษีขายเมื่อได้รับชำระ)
     * @param settled   ยอดที่ตัดชำระครั้งนี้ (เงินรับ + ภาษีหัก ณ ที่จ่าย + เงินประกันที่ลูกค้ากัน)
     * @param total     ยอดรวมภาษีของใบแจ้งหนี้
     * @param vat       VAT ของใบแจ้งหนี้
     * @param priorVat  VAT ที่ออกใบกำกับไปแล้วในการรับชำระครั้งก่อน
     * @param isFinal   ครั้งนี้ตัดยอดครบ → ใช้ VAT ที่เหลือทั้งหมด (กันเศษสตางค์สะสม)
     */
    public static BigDecimal vatPortion(BigDecimal settled, BigDecimal total, BigDecimal vat, BigDecimal priorVat, boolean isFinal) {
        if (Money.isZero(vat) || Money.isZero(total)) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (isFinal) {
            return Money.round2(vat.subtract(Money.z(priorVat)));
        }
        return settled.multiply(vat).divide(total, 2, RoundingMode.HALF_UP);
    }

    public record CreditResult(BigDecimal difference, BigDecimal vatAmount, BigDecimal total) {
    }

    /** ใบลดหนี้: ผลต่าง = มูลค่าเดิม − มูลค่าที่ถูกต้อง, VAT คิดจากผลต่าง */
    public static CreditResult credit(BigDecimal original, BigDecimal correct, boolean vatEnabled, BigDecimal vatPct) {
        BigDecimal diff = Money.round2(Money.z(original).subtract(Money.z(correct)));
        BigDecimal vat = vatEnabled ? Money.pct(diff, vatPct) : BigDecimal.ZERO.setScale(2);
        return new CreditResult(diff, vat, diff.add(vat));
    }
}
