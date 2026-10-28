import { describe, expect, it } from 'vitest';
import { advanceDeduction, computeFinance, retentionReleaseVat, retentionVat, vatPortion } from './finance-calc';

describe('finance-calc', () => {
  it('matches backend milestone example', () => {
    const r = computeFinance({
      lines: [{ quantity: 1, unitPrice: 300000 }],
      discountAmount: 0,
      advanceDeduct: 30000,
      vatEnabled: true,
      vatPct: 7,
      retentionPct: 5,
      whtPct: 3,
    });
    expect(r.taxable).toBe(270000);
    expect(r.vatAmount).toBe(18900);
    expect(r.total).toBe(288900);
    expect(r.retentionAmount).toBe(13500);
    expect(r.whtAmount).toBe(8100);
    expect(r.net).toBe(267300);
  });

  it('rounds lines and handles no VAT', () => {
    const r = computeFinance({
      lines: [
        { quantity: 2.5, unitPrice: 1000.555 },
        { quantity: 1, unitPrice: 99.99 },
      ],
      discountAmount: 100,
      advanceDeduct: 0,
      vatEnabled: false,
      vatPct: 7,
      retentionPct: 0,
      whtPct: 0,
    });
    expect(r.lineAmounts[0]).toBe(2501.39);
    expect(r.taxable).toBe(2501.38);
    expect(r.net).toBe(2501.38);
  });

  it('defers VAT on retention until it is released', () => {
    // ใบแจ้งหนี้ 288,900 (VAT 18,900) ลูกค้ากันเงินประกัน 13,500 หัก ณ ที่จ่าย 8,100 จ่ายเงิน 267,300
    const v = vatPortion(267300 + 8100, 13500, 288900, 18900, 0, 0, true);
    const r = retentionVat(13500, 288900, 18900);
    expect(r).toBe(883.18);
    expect(round(v + r)).toBe(18900);
    expect(vatPortion(100000, 0, 107000, 7000, 0, 0, false)).toBe(6542.06);
    expect(retentionReleaseVat(13500, 13500, r)).toBe(r);
    expect(retentionReleaseVat(6750, 13500, 883.18)).toBe(441.59);
  });

  it('final milestone deducts the remaining advance', () => {
    expect(advanceDeduction(300000, 10, 100000, 0, false)).toBe(30000);
    expect(advanceDeduction(333333.33, 10, 100000, 66666.67, true)).toBe(33333.33);
    expect(advanceDeduction(500000, 10, 100000, 70000, false)).toBe(30000);
    expect(advanceDeduction(300000, 10, 0, 0, true)).toBe(30000);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
