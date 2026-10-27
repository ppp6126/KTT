import { round2 } from '../../core/util/money';

export interface QLine {
  itemType: string;
  quantity: number | null;
  unitPrice: number | null;
}

export interface QInput {
  lines: QLine[];
  discountPct: number;
  overheadPct: number;
  vatEnabled: boolean;
  vatPct: number;
  roundingMode: string;
  whtPct: number;
}

export interface QResult {
  amounts: number[];
  subtotal: number;
  discount: number;
  overhead: number;
  beforeVat: number;
  vat: number;
  rounding: number;
  total: number;
  wht: number;
  payable: number;
}

const UNIT: Record<string, number> = { down_1: 1, down_10: 10, down_100: 100 };

function floorTo(v: number, unit: number): number {
  return Math.floor(round2(v) / unit + 1e-9) * unit;
}

/** เหมือน QuotationCalculator ฝั่ง backend ทุกขั้น (ใช้แสดงยอดทันทีขณะแก้ไข) */
export function calcQuotation(i: QInput): QResult {
  const amounts = i.lines.map((l) => (l.itemType === 'item' ? round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)) : 0));
  const subtotal = round2(amounts.reduce((a, b) => a + b, 0));
  const discount = round2((subtotal * (Number(i.discountPct) || 0)) / 100);
  const afterDiscount = round2(subtotal - discount);
  const overhead = round2((afterDiscount * (Number(i.overheadPct) || 0)) / 100);
  const beforeVat = round2(afterDiscount + overhead);
  const unit = UNIT[i.roundingMode];
  const vatBase = unit ? floorTo(beforeVat, unit) : beforeVat;
  const vat = i.vatEnabled ? round2((vatBase * (Number(i.vatPct) || 0)) / 100) : 0;
  let total = round2(vatBase + vat);
  if (unit) total = floorTo(total, unit);
  const rounding = round2(total - (beforeVat + vat));
  const wht = round2((beforeVat * (Number(i.whtPct) || 0)) / 100);
  return { amounts, subtotal, discount, overhead, beforeVat, vat, rounding, total, wht, payable: round2(total - wht) };
}
