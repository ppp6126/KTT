import { EditRow, blockRange, calcBoq, emptyRow } from './boq-calc';

function row(key: string, parentKey: string | null, q = 0, mat = 0, lab = 0, eqp = 0): EditRow {
  return { ...emptyRow(parentKey), key, quantity: q, unitMaterialCost: mat, unitLabor: lab, unitEquipment: eqp };
}

describe('calcBoq', () => {
  // ตัวอย่างเดียวกับ BoqCalculatorTest ฝั่ง backend
  const rows = [
    row('1', null),
    row('1.1', '1'),
    row('1.1.1', '1.1', 10, 100, 50, 0),
    row('1.1.2', '1.1', 2, 1000, 0, 250),
    row('2', null, 1, 0, 5000, 0),
  ];

  it('ผลรวมตรงกับ backend', () => {
    const t = calcBoq(rows, 20, 0, 7);
    expect(t.rows.get('1.1.1')!.cost).toBe(1500);
    expect(t.rows.get('1.1.1')!.sell).toBe(1800);
    expect(t.rows.get('1')!.cost).toBe(4000);
    expect(t.rows.get('1')!.material).toBe(3000);
    expect(t.rows.get('1.1.2')!.number).toBe('1.1.2');
    expect(t.rows.get('1')!.leaf).toBe(false);
    expect(t.cost).toBe(9000);
    expect(t.sell).toBe(10800);
    expect(t.margin).toBe(16.67);
    expect(t.grand).toBe(11556);
  });

  it('blockRange ครอบลูกหลาน', () => {
    expect(blockRange(rows, 0)).toEqual([0, 3]);
    expect(blockRange(rows, 1)).toEqual([1, 3]);
    expect(blockRange(rows, 4)).toEqual([4, 4]);
  });
});
