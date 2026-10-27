/**
 * สูตรความคืบหน้าแผน/จริง (ต้องตรงกับ com.ktt.project.ScheduleCalculator ฝั่ง backend)
 * - ใช้เฉพาะงานย่อยสุด (leaf) ถ่วงด้วย weight
 * - แผน ณ วันที่ d = สัดส่วนวันที่ผ่านไปในช่วงเริ่ม–สิ้นสุด (นับรวมวันแรกและวันสุดท้าย)
 */
export interface CalcTask {
  key: string;
  parentKey: string | null;
  weight: number;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface Rollup {
  weight: number;
  actualPct: number;
  plannedPct: number;
}

const DAY = 86400000;

function toTime(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function plannedFraction(t: CalcTask, dateIso: string): number {
  if (!t.plannedStart || !t.plannedEnd) return 0;
  const d = toTime(dateIso);
  const s = toTime(t.plannedStart);
  const e = toTime(t.plannedEnd);
  if (d < s) return 0;
  if (d >= e) return 1;
  return ((d - s) / DAY + 1) / ((e - s) / DAY + 1);
}

export function leaves(tasks: CalcTask[]): CalcTask[] {
  const parents = new Set(tasks.map((t) => t.parentKey).filter((k): k is string => !!k));
  return tasks.filter((t) => !parents.has(t.key));
}

function weighted(ls: CalcTask[], value: (t: CalcTask) => number): number {
  let sw = 0;
  let sv = 0;
  for (const t of ls) {
    const w = Math.max(0, t.weight || 0);
    sw += w;
    sv += w * value(t);
  }
  return sw === 0 ? 0 : r2(sv / sw);
}

const clampPct = (p: number) => Math.min(100, Math.max(0, p || 0));

export function actual(tasks: CalcTask[]): number {
  return weighted(leaves(tasks), (t) => clampPct(t.progress));
}

export function planned(tasks: CalcTask[], dateIso: string): number {
  return weighted(leaves(tasks), (t) => plannedFraction(t, dateIso) * 100);
}

export function rollup(tasks: CalcTask[], dateIso: string): Map<string, Rollup> {
  const kids = new Map<string | null, CalcTask[]>();
  for (const t of tasks) {
    const list = kids.get(t.parentKey) ?? [];
    list.push(t);
    kids.set(t.parentKey, list);
  }
  const under = (t: CalcTask, seen = new Set<string>()): CalcTask[] => {
    if (seen.has(t.key)) return [];
    seen.add(t.key);
    const ks = kids.get(t.key);
    if (!ks?.length) return [t];
    return ks.flatMap((k) => under(k, seen));
  };
  const out = new Map<string, Rollup>();
  for (const t of tasks) {
    const ls = under(t);
    out.set(t.key, {
      weight: ls.reduce((s, x) => s + Math.max(0, x.weight || 0), 0),
      actualPct: weighted(ls, (x) => clampPct(x.progress)),
      plannedPct: weighted(ls, (x) => plannedFraction(x, dateIso) * 100),
    });
  }
  return out;
}
