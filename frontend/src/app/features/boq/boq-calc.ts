import { round2 } from '../../core/util/money';

/** แถวที่แก้ไขในหน้าเว็บ (key = id เดิม หรือ key ชั่วคราวของแถวใหม่) */
export interface EditRow {
  key: string;
  parentKey: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  materialId: string | null;
  laborId: string | null;
  equipmentId: string | null;
  unitMaterialCost: number;
  unitLabor: number;
  unitEquipment: number;
  note: string | null;
  /** ราคาขายจาก server สำหรับผู้ที่ไม่เห็นต้นทุน (อ่านอย่างเดียว) */
  serverSell?: number;
  serverUnitSell?: number | null;
}

export interface RowCalc {
  level: number;
  number: string;
  leaf: boolean;
  material: number;
  labor: number;
  equipment: number;
  cost: number;
  sell: number;
}

export interface BoqTotals {
  rows: Map<string, RowCalc>;
  cost: number;
  sell: number;
  discount: number;
  vat: number;
  grand: number;
  margin: number;
}

let seq = 0;
export function newKey(): string {
  seq += 1;
  return `new-${Date.now().toString(36)}-${seq}`;
}

/** เหมือน BoqCalculator ฝั่ง backend: ใบ = จำนวน × (วัสดุ + แรง + เครื่องจักร), แม่ = ผลรวมลูก */
export function calcBoq(rows: EditRow[], markupPct: number, discount: number, vatPct: number): BoqTotals {
  const factor = 1 + markupPct / 100;
  const parents = new Set(rows.filter((r) => r.parentKey).map((r) => r.parentKey as string));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out = new Map<string, RowCalc>();
  const childCount = new Map<string | null, number>();

  // ลำดับเลขและชั้น (rows เรียงแบบ DFS อยู่แล้ว)
  for (const r of rows) {
    const n = (childCount.get(r.parentKey) ?? 0) + 1;
    childCount.set(r.parentKey, n);
    const parent = r.parentKey ? out.get(r.parentKey) : undefined;
    out.set(r.key, {
      level: parent ? parent.level + 1 : 1,
      number: parent ? `${parent.number}.${n}` : String(n),
      leaf: !parents.has(r.key),
      material: 0,
      labor: 0,
      equipment: 0,
      cost: 0,
      sell: 0,
    });
  }

  let cost = 0;
  let sell = 0;
  for (const r of rows) {
    if (parents.has(r.key)) continue;
    const q = Number(r.quantity) || 0;
    const mat = round2(q * (Number(r.unitMaterialCost) || 0));
    const lab = round2(q * (Number(r.unitLabor) || 0));
    const eqp = round2(q * (Number(r.unitEquipment) || 0));
    const c = mat + lab + eqp;
    const s = r.serverSell !== undefined ? r.serverSell : round2(c * factor);
    cost += c;
    sell += s;
    let k: string | null = r.key;
    const seen = new Set<string>();
    while (k && !seen.has(k)) {
      seen.add(k);
      const t = out.get(k)!;
      t.material += mat;
      t.labor += lab;
      t.equipment += eqp;
      t.cost += c;
      t.sell += s;
      k = byKey.get(k)?.parentKey ?? null;
    }
  }
  cost = round2(cost);
  sell = round2(sell);
  const net = sell - (Number(discount) || 0);
  const vat = round2((net * (Number(vatPct) || 0)) / 100);
  const margin = net === 0 ? 0 : Math.round(((net - cost) / net) * 10000) / 100;
  return { rows: out, cost, sell, discount: Number(discount) || 0, vat, grand: round2(net + vat), margin };
}

/** ช่วง index ของแถวและลูกหลานทั้งหมด (rows เรียงแบบ DFS) */
export function blockRange(rows: EditRow[], index: number): [number, number] {
  const keys = new Set([rows[index].key]);
  let end = index;
  for (let i = index + 1; i < rows.length; i++) {
    if (rows[i].parentKey && keys.has(rows[i].parentKey!)) {
      keys.add(rows[i].key);
      end = i;
    } else {
      break;
    }
  }
  return [index, end];
}

export function emptyRow(parentKey: string | null): EditRow {
  return {
    key: newKey(),
    parentKey,
    description: '',
    unit: null,
    quantity: 0,
    materialId: null,
    laborId: null,
    equipmentId: null,
    unitMaterialCost: 0,
    unitLabor: 0,
    unitEquipment: 0,
    note: null,
  };
}
