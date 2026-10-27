import { describe, expect, it } from 'vitest';
import { computeFinance } from './finance-calc';

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
});
