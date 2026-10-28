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
     * แบ่ง VAT ตามสัดส่วนเงินที่รับชำระ (งานบริการเกิดภาษีขายเมื่อได้รับชำระ) ไม่มีเงินประกันผลงาน
     * @see #vatPortion(BigDecimal, BigDecimal, BigDecimal, BigDecimal, BigDecimal, BigDecimal, boolean)
     */
    public static BigDecimal vatPortion(BigDecimal settled, BigDecimal total, BigDecimal vat, BigDecimal priorVat, boolean isFinal) {
        return vatPortion(settled, BigDecimal.ZERO, total, vat, priorVat, BigDecimal.ZERO, isFinal);
    }

    /**
     * VAT ของใบเสร็จรับเงิน/ใบกำกับภาษี: งานบริการเกิดภาษีขายเมื่อได้รับชำระ
     * เงินประกันผลงานที่ลูกค้ากันไว้ยังไม่ได้รับ → VAT ส่วนนั้นเลื่อนไปออกตอนรับคืนเงินประกัน
     * @param received          เงินที่ได้รับครั้งนี้ (เงินรับ + ภาษีหัก ณ ที่จ่าย) ไม่รวมเงินประกัน
     * @param retention         เงินประกันที่ลูกค้ากันไว้ครั้งนี้
     * @param total             ยอดรวมภาษีของใบแจ้งหนี้
     * @param vat               VAT ของใบแจ้งหนี้
     * @param priorVat          VAT ที่ออกใบกำกับ/ลดหนี้ไปแล้วของใบแจ้งหนี้นี้
     * @param priorRetentionVat VAT ของเงินประกันที่เลื่อนไว้ในการรับชำระครั้งก่อน
     * @param isFinal           ครั้งนี้ตัดยอดครบ → ใช้ VAT ที่เหลือทั้งหมด (กันเศษสตางค์สะสม)
     */
    public static BigDecimal vatPortion(BigDecimal received, BigDecimal retention, BigDecimal total, BigDecimal vat,
                                        BigDecimal priorVat, BigDecimal priorRetentionVat, boolean isFinal) {
        if (Money.isZero(vat) || Money.isZero(total)) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (isFinal) {
            BigDecimal rest = vat.subtract(Money.z(priorVat)).subtract(Money.z(priorRetentionVat))
                    .subtract(retentionVat(retention, total, vat));
            return Money.round2(rest).max(BigDecimal.ZERO.setScale(2));
        }
        return Money.z(received).multiply(vat).divide(total, 2, RoundingMode.HALF_UP);
    }

    /** VAT ในเงินประกันผลงานที่ลูกค้ากันไว้ (เลื่อนไปออกใบกำกับตอนรับคืน) */
    public static BigDecimal retentionVat(BigDecimal retention, BigDecimal total, BigDecimal vat) {
        if (Money.isZero(vat) || Money.isZero(total) || Money.isZero(retention)) {
            return BigDecimal.ZERO.setScale(2);
        }
        return retention.multiply(vat).divide(total, 2, RoundingMode.HALF_UP);
    }

    /**
     * VAT ของใบเสร็จรับคืนเงินประกันผลงาน
     * @param amount      ยอดที่รับคืนครั้งนี้
     * @param pendingBase เงินประกันที่ยังเลื่อน VAT ไว้และยังไม่รับคืน
     * @param pendingVat  VAT ที่ยังเลื่อนไว้
     */
    public static BigDecimal retentionReleaseVat(BigDecimal amount, BigDecimal pendingBase, BigDecimal pendingVat) {
        if (Money.z(pendingBase).signum() <= 0 || Money.z(pendingVat).signum() <= 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (amount.compareTo(pendingBase) >= 0) {
            return Money.round2(pendingVat);
        }
        return amount.multiply(pendingVat).divide(pendingBase, 2, RoundingMode.HALF_UP);
    }

    /**
     * เงินล่วงหน้าที่หักคืนในใบแจ้งหนี้งวดงาน
     * @param base          มูลค่างวดตามสัญญาในใบนี้ (ไม่รวมงวด VO)
     * @param advancePct    % เงินล่วงหน้า
     * @param advanceBilled เงินล่วงหน้าที่เรียกเก็บแล้ว (0 = ยังไม่เรียกเก็บ → หักตามสัดส่วน)
     * @param deducted      หักคืนไปแล้วในใบแจ้งหนี้อื่น
     * @param isFinal       ใบนี้วางบิลงวดตามสัญญาที่เหลือทั้งหมด → หักส่วนที่เหลือทั้งหมด
     */
    public static BigDecimal advanceDeduction(BigDecimal base, BigDecimal advancePct, BigDecimal advanceBilled,
                                              BigDecimal deducted, boolean isFinal) {
        if (Money.z(advancePct).signum() <= 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        BigDecimal portion = Money.pct(base, advancePct);
        if (Money.z(advanceBilled).signum() <= 0) {
            return portion;
        }
        BigDecimal remaining = Money.round2(advanceBilled.subtract(Money.z(deducted))).max(BigDecimal.ZERO.setScale(2));
        return isFinal ? remaining : portion.min(remaining);
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
