package com.ktt.ap;

import com.ktt.common.Money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * สูตรบิลเจ้าหนี้และการตัดจ่าย
 * <pre>
 * รวมเงิน = Σ บรรทัด ; VAT = รวมเงิน × vat% ; รวมทั้งสิ้น = รวมเงิน + VAT
 * หัก ณ ที่จ่าย = รวมเงิน × wht% (ก่อน VAT) ; เงินประกันผลงาน = จำนวนที่ระบุ
 * ยอดจ่ายสุทธิ = รวมทั้งสิ้น − เงินประกัน − หัก ณ ที่จ่าย
 * </pre>
 */
public final class ApCalculator {

    private ApCalculator() {
    }

    public record Result(List<BigDecimal> lineAmounts, BigDecimal subtotal, BigDecimal vat, BigDecimal total,
                         BigDecimal wht, BigDecimal retention, BigDecimal net) {
    }

    public record Line(BigDecimal quantity, BigDecimal unitPrice) {
    }

    public static Result compute(List<Line> lines, BigDecimal vatPct, BigDecimal whtPct, BigDecimal retention) {
        List<BigDecimal> amounts = lines.stream().map(l -> Money.round2(Money.z(l.quantity()).multiply(Money.z(l.unitPrice())))).toList();
        BigDecimal subtotal = Money.round2(amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal vat = Money.pct(subtotal, vatPct);
        BigDecimal total = subtotal.add(vat);
        BigDecimal wht = Money.pct(subtotal, whtPct);
        BigDecimal ret = Money.round2(retention);
        return new Result(amounts, subtotal, vat, total, wht, ret, total.subtract(ret).subtract(wht));
    }

    /**
     * ภาษีหัก ณ ที่จ่ายของการจ่ายบางส่วน: ตามสัดส่วนยอดตัดหนี้ ; จ่ายครั้งสุดท้ายรับส่วนที่เหลือทั้งหมด
     * @param applied   ยอดตัดหนี้ครั้งนี้ (รวม WHT)
     * @param gross     ยอดตัดหนี้ทั้งหมดของบิล (รวมทั้งสิ้น − เงินประกัน)
     */
    public static BigDecimal whtPortion(BigDecimal applied, BigDecimal gross, BigDecimal billWht, BigDecimal priorWht, boolean isFinal) {
        if (Money.isZero(billWht) || Money.isZero(gross)) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (isFinal) {
            return Money.round2(billWht.subtract(Money.z(priorWht)));
        }
        return applied.multiply(billWht).divide(gross, 2, RoundingMode.HALF_UP);
    }

    /**
     * เงินได้ (ก่อน VAT) ของการจ่ายครั้งนี้ สำหรับ 50 ทวิ: ตามสัดส่วนยอดตัดหนี้ ; จ่ายครั้งสุดท้ายรับส่วนที่เหลือ
     * @param billIncome ฐานภาษีหัก ณ ที่จ่ายของทั้งบิล (รวมเงินก่อน VAT) หรือ 0 ถ้าบิลไม่มีหัก ณ ที่จ่าย
     */
    public static BigDecimal incomePortion(BigDecimal applied, BigDecimal gross, BigDecimal billIncome, BigDecimal priorIncome, boolean isFinal) {
        return whtPortion(applied, gross, billIncome, priorIncome, isFinal);
    }

    /** เงินได้ย้อนจากภาษีที่หักและอัตรา (ใช้ได้เฉพาะประมาณการ เพราะ WHT ปัดเศษแล้ว ; 50 ทวิใช้ incomePortion) */
    public static BigDecimal incomeFromWht(BigDecimal wht, BigDecimal ratePct) {
        if (Money.isZero(ratePct)) {
            return BigDecimal.ZERO.setScale(2);
        }
        return wht.multiply(Money.HUNDRED).divide(ratePct, 2, RoundingMode.HALF_UP);
    }
}
