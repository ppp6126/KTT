import { round2 } from '../../core/util/money';

/** สูตรเอกสารการเงินฝั่งขาย (ต้องตรงกับ com.ktt.finance.FinanceCalculator) */
export interface FinanceInput {
  lines: { quantity: number; unitPrice: number }[];
  discountAmount: number;
  advanceDeduct: number;
  vatEnabled: boolean;
  vatPct: number;
  retentionPct: number;
  whtPct: number;
}

export interface FinanceResult {
  lineAmounts: number[];
  subtotal: number;
  discountAmount: number;
  advanceDeduct: number;
  taxable: number;
  vatAmount: number;
  total: number;
  retentionAmount: number;
  whtAmount: number;
  net: number;
}

const pct = (v: number, p: number) => round2((v * p) / 100);

export function computeFinance(i: FinanceInput): FinanceResult {
  const lineAmounts = i.lines.map((l) => round2((l.quantity || 0) * (l.unitPrice || 0)));
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const discountAmount = round2(i.discountAmount || 0);
  const advanceDeduct = round2(i.advanceDeduct || 0);
  const taxable = round2(subtotal - discountAmount - advanceDeduct);
  const vatAmount = i.vatEnabled ? pct(taxable, i.vatPct) : 0;
  const total = round2(taxable + vatAmount);
  const retentionAmount = pct(taxable, i.retentionPct || 0);
  const whtAmount = pct(taxable, i.whtPct || 0);
  return {
    lineAmounts,
    subtotal,
    discountAmount,
    advanceDeduct,
    taxable,
    vatAmount,
    total,
    retentionAmount,
    whtAmount,
    net: round2(total - retentionAmount - whtAmount),
  };
}
