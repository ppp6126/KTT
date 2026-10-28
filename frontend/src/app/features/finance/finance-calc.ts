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

/**
 * VAT ของใบเสร็จรับเงิน/ใบกำกับภาษี (ตรงกับ FinanceCalculator.vatPortion):
 * คิดจากเงินที่ได้รับจริง (เงินรับ + หัก ณ ที่จ่าย) ไม่รวมเงินประกันผลงานที่ลูกค้ากันไว้
 * ครั้งสุดท้ายใช้ VAT ที่เหลือหลังหัก VAT ที่ออกแล้วและ VAT ของเงินประกันที่เลื่อนไว้
 */
export function vatPortion(
  received: number,
  retention: number,
  total: number,
  vat: number,
  priorVat: number,
  priorRetentionVat: number,
  isFinal: boolean,
): number {
  if (!vat || !total) return 0;
  if (isFinal) return Math.max(0, round2(vat - (priorVat || 0) - (priorRetentionVat || 0) - retentionVat(retention, total, vat)));
  return round2(((received || 0) * vat) / total);
}

/** VAT ในเงินประกันผลงานที่ลูกค้ากันไว้ (ออกใบกำกับตอนรับคืน) */
export function retentionVat(retention: number, total: number, vat: number): number {
  if (!vat || !total || !retention) return 0;
  return round2((retention * vat) / total);
}

/** VAT ของใบเสร็จรับคืนเงินประกันผลงาน */
export function retentionReleaseVat(amount: number, pendingBase: number, pendingVat: number): number {
  if (!(pendingBase > 0) || !(pendingVat > 0)) return 0;
  if (amount >= pendingBase) return round2(pendingVat);
  return round2((amount * pendingVat) / pendingBase);
}

/** เงินล่วงหน้าที่หักคืนในใบแจ้งหนี้งวดงาน (งวดสุดท้ายหักส่วนที่เหลือทั้งหมด) */
export function advanceDeduction(base: number, advancePct: number, advanceBilled: number, deducted: number, isFinal: boolean): number {
  if (!(advancePct > 0)) return 0;
  const portion = pct(base, advancePct);
  if (!(advanceBilled > 0)) return portion;
  const remaining = Math.max(0, round2(advanceBilled - (deducted || 0)));
  return isFinal ? remaining : Math.min(portion, remaining);
}
