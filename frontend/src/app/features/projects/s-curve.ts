import { Component, computed, input, signal } from '@angular/core';
import { thDate, thDateShort } from '../../core/util/format';
import { CurvePoint } from './projects.api';

interface Pt {
  x: number;
  y: number;
  v: number;
  date: string;
}

/**
 * S-Curve ความคืบหน้าสะสม: แผน (เส้นประสีน้ำเงิน) เทียบ จริง (เส้นทึบสีส้ม)
 * แกน Y เดียว 0–100% ; ชี้เมาส์เพื่อดูค่ารายวัน ; มีตารางข้อมูลให้ screen reader
 */
@Component({
  selector: 'app-s-curve',
  template: `
    <figure class="fig">
      <div class="legend" aria-hidden="true">
        <span><i class="sw plan"></i>แผน</span>
        <span><i class="sw act"></i>จริง</span>
      </div>
      @if (geo(); as g) {
        <div class="box">
          <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img"
               [attr.aria-label]="'S-Curve แผนสะสม ' + g.lastPlan + '% จริงสะสม ' + g.lastAct + '%'"
               (mousemove)="hover($event)" (mouseleave)="hoverIdx.set(null)">
            @for (t of [0, 25, 50, 75, 100]; track t) {
              <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y(t)" [attr.y2]="y(t)" />
              <text class="tick" [attr.x]="L - 6" [attr.y]="y(t) + 4" text-anchor="end">{{ t }}%</text>
            }
            @for (t of g.xTicks; track t.x) {
              <text class="tick" [attr.x]="t.x" [attr.y]="H - 6" text-anchor="middle">{{ t.label }}</text>
            }
            @if (g.todayX !== null) {
              <line class="today" [attr.x1]="g.todayX" [attr.x2]="g.todayX" [attr.y1]="T" [attr.y2]="H - B" />
              <text class="tick" [attr.x]="g.todayX + 4" [attr.y]="T + 10">วันนี้</text>
            }
            <path class="plan" [attr.d]="g.planPath" />
            <path class="act" [attr.d]="g.actPath" />
            @if (g.actLast; as p) {
              <circle class="act-dot" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
            }
            @if (hoverIdx() !== null && g.hover[hoverIdx()!]; as h) {
              <line class="cross" [attr.x1]="h.x" [attr.x2]="h.x" [attr.y1]="T" [attr.y2]="H - B" />
            }
          </svg>
          @if (hoverIdx() !== null && g.hover[hoverIdx()!]; as h) {
            <div class="tip" [style.left.%]="(h.x / W) * 100">
              <div class="d">{{ h.label }}</div>
              <div><i class="sw plan"></i>แผน {{ h.plan ?? '–' }}{{ h.plan !== null ? '%' : '' }}</div>
              <div><i class="sw act"></i>จริง {{ h.act ?? '–' }}{{ h.act !== null ? '%' : '' }}</div>
            </div>
          }
        </div>
      } @else {
        <p class="muted empty">ยังไม่มีข้อมูลแผนงาน ใส่วันเริ่ม–สิ้นสุดของงานในแท็บ "แผนงาน" เพื่อแสดงกราฟ</p>
      }
      <table class="sr-only">
        <caption>S-Curve ความคืบหน้าสะสม</caption>
        <thead><tr><th>วันที่</th><th>แผน %</th><th>จริง %</th></tr></thead>
        <tbody>
          @for (p of points(); track p.date) {
            <tr><td>{{ p.date }}</td><td>{{ p.plannedPct ?? '' }}</td><td>{{ p.actualPct ?? '' }}</td></tr>
          }
        </tbody>
      </table>
    </figure>
  `,
  styles: `
    .fig { margin: 0; }
    .legend { display: flex; gap: 16px; font-size: 0.85rem; color: var(--ktt-steel); margin-bottom: 6px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .sw { display: inline-block; width: 16px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: 4px; }
    .sw.plan { border-color: #2a78d6; border-top-style: dashed; }
    .sw.act { border-color: #eb6834; }
    .box { position: relative; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    .grid { stroke: #e6e9e8; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .tick { font-size: 11px; fill: var(--ktt-steel); }
    .plan { fill: none; stroke: #2a78d6; stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
    .act { fill: none; stroke: #eb6834; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
    .act-dot { fill: #eb6834; stroke: var(--ktt-paper); stroke-width: 2; }
    .today { stroke: var(--ktt-ink); stroke-width: 1; stroke-dasharray: 2 3; vector-effect: non-scaling-stroke; }
    .cross { stroke: var(--ktt-steel); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .tip {
      position: absolute; top: 4px; transform: translateX(-50%); pointer-events: none;
      background: var(--ktt-paper); border: 1px solid var(--ktt-line); border-radius: 6px;
      padding: 6px 10px; font-size: 0.82rem; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .tip .d { color: var(--ktt-steel); margin-bottom: 2px; }
    .empty { padding: 24px 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class SCurve {
  readonly points = input<CurvePoint[]>([]);
  readonly today = input<string | null>(null);
  readonly hoverIdx = signal<number | null>(null);

  readonly W = 640;
  readonly H = 240;
  readonly L = 40;
  readonly R = 12;
  readonly T = 10;
  readonly B = 24;

  y(v: number): number {
    return this.T + (1 - v / 100) * (this.H - this.T - this.B);
  }

  readonly geo = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return null;
    const t0 = new Date(`${pts[0].date}T00:00:00`).getTime();
    const t1 = new Date(`${pts[pts.length - 1].date}T00:00:00`).getTime();
    const span = Math.max(1, t1 - t0);
    const x = (d: string) => this.L + ((new Date(`${d}T00:00:00`).getTime() - t0) / span) * (this.W - this.L - this.R);
    const plan: Pt[] = [];
    const act: Pt[] = [];
    for (const p of pts) {
      if (p.plannedPct !== null) plan.push({ x: x(p.date), y: this.y(p.plannedPct), v: p.plannedPct, date: p.date });
      if (p.actualPct !== null) act.push({ x: x(p.date), y: this.y(p.actualPct), v: p.actualPct, date: p.date });
    }
    const path = (a: Pt[]) => a.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const ticks = 5;
    const xTicks = Array.from({ length: ticks }, (_, i) => {
      const t = t0 + (span * i) / (ticks - 1);
      const d = new Date(t);
      return { x: this.L + (i / (ticks - 1)) * (this.W - this.L - this.R), label: thDateShort(d) };
    });
    const today = this.today();
    const tt = today ? new Date(`${today}T00:00:00`).getTime() : null;
    const todayX = tt !== null && tt >= t0 && tt <= t1 ? x(today!) : null;
    // ค่าที่ใช้แสดงตอนชี้: เติมค่าล่าสุดที่ทราบของแต่ละเส้น
    let lastP: number | null = null;
    let lastA: number | null = null;
    const hover = pts.map((p) => {
      if (p.plannedPct !== null) lastP = p.plannedPct;
      if (p.actualPct !== null) lastA = p.actualPct;
      return { x: x(p.date), label: thDate(p.date), plan: lastP, act: p.actualPct ?? (today && p.date <= today ? lastA : null) };
    });
    return {
      planPath: path(plan),
      actPath: path(act),
      actLast: act.length ? act[act.length - 1] : null,
      lastPlan: plan.length ? plan[plan.length - 1].v : 0,
      lastAct: act.length ? act[act.length - 1].v : 0,
      xTicks,
      todayX,
      hover,
    };
  });

  hover(e: MouseEvent): void {
    const g = this.geo();
    if (!g) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * this.W;
    let best = 0;
    let bd = Infinity;
    g.hover.forEach((h, i) => {
      const d = Math.abs(h.x - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.hoverIdx.set(best);
  }
}
