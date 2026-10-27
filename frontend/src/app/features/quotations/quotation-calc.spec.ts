import { calcQuotation } from './quotation-calc';

const sample = [
  { itemType: 'item', quantity: 6, unitPrice: 15200 },
  { itemType: 'item', quantity: 52, unitPrice: 2300 },
  { itemType: 'item', quantity: 1, unitPrice: 104000 },
  { itemType: 'item', quantity: 1, unitPrice: 85000 },
  { itemType: 'heading', quantity: null, unitPrice: null },
  { itemType: 'item', quantity: 1, unitPrice: 190000 },
  { itemType: 'item', quantity: 1, unitPrice: 177402 },
];

describe('calcQuotation (ตรงกับ QuotationCalculatorTest ฝั่ง backend)', () => {
  it('ตัวอย่างบริษัท ปัดลงหลักร้อย → 911,100', () => {
    const r = calcQuotation({ lines: sample, discountPct: 0, overheadPct: 11, vatEnabled: true, vatPct: 7, roundingMode: 'down_100', whtPct: 0 });
    expect(r.subtotal).toBe(767202);
    expect(r.overhead).toBe(84392.22);
    expect(r.vat).toBe(59605);
    expect(r.total).toBe(911100);
    expect(r.rounding).toBe(-99.22);
  });

  it('ไม่ปัดเศษ → 911,205.82', () => {
    const r = calcQuotation({ lines: sample, discountPct: 0, overheadPct: 11, vatEnabled: true, vatPct: 7, roundingMode: 'none', whtPct: 0 });
    expect(r.vat).toBe(59611.6);
    expect(r.total).toBe(911205.82);
  });

  it('ส่วนลดและหัก ณ ที่จ่าย', () => {
    const r = calcQuotation({
      lines: [{ itemType: 'item', quantity: 10, unitPrice: 1000 }],
      discountPct: 5,
      overheadPct: 0,
      vatEnabled: true,
      vatPct: 7,
      roundingMode: 'none',
      whtPct: 3,
    });
    expect(r.discount).toBe(500);
    expect(r.vat).toBe(665);
    expect(r.total).toBe(10165);
    expect(r.wht).toBe(285);
    expect(r.payable).toBe(9880);
  });
});
