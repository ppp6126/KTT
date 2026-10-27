import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { MoneyPipe, QtyPipe, money } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { ApApi, ProjectCost, UsageRow } from '../ap/ap.api';

/** สีหมวดต้นทุน เรียงตามลำดับ palette ที่ผ่านการตรวจแล้ว (ห้ามสลับลำดับ) */
export const COST_SERIES = [
  { key: 'material', label: 'วัสดุ', color: '#2a78d6' },
  { key: 'subcontract', label: 'ผู้รับเหมาช่วง', color: '#eb6834' },
  { key: 'labor', label: 'ค่าแรง', color: '#1baf7a' },
  { key: 'other', label: 'อื่น ๆ', color: '#eda100' },
] as const;

type SeriesKey = (typeof COST_SERIES)[number]['key'];

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
}

/** ต้นทุนโครงการ: เทียบงบประมาณ (BOQ) กับต้นทุนจริงและภาระผูกพัน แยกหมวดและรายเดือน */
@Component({
  selector: 'app-project-cost',
  imports: [FormsModule, MatButtonToggleModule, MoneyPipe, QtyPipe],
  template: `
    @if (c(); as c) {
      <div class="kpis">
        <div class="kpi"><span class="label">มูลค่าสัญญา (รวมงานเพิ่ม-ลด)</span><strong>{{ c.revenue | money }}</strong></div>
        <div class="kpi"><span class="label">งบต้นทุน (BOQ)</span><strong>{{ c.budget | money }}</strong></div>
        <div class="kpi"><span class="label">ต้นทุนจริง</span><strong>{{ c.actualCost | money }}</strong><span class="sub">{{ c.budgetUsedPct === null ? '' : 'ใช้งบไป ' + c.budgetUsedPct + '% · ผลงาน ' + c.progressPct + '%' }}</span></div>
        <div class="kpi"><span class="label">ภาระผูกพัน (สั่งแล้วยังไม่รับ)</span><strong>{{ c.committed | money }}</strong></div>
        <div class="kpi"><span class="label">ประมาณการต้นทุนเมื่อจบ</span><strong>{{ c.forecastCost | money }}</strong></div>
        <div class="kpi">
          <span class="label">กำไรขั้นต้นคาดการณ์</span>
          <strong [class.bad]="c.grossProfit < 0">{{ c.grossProfit | money }}</strong>
          <span class="sub">{{ c.marginPct === null ? '' : c.marginPct + '% ของมูลค่าสัญญา' }}</span>
        </div>
      </div>
      @if (c.budgetUsedPct !== null && c.budgetUsedPct > c.progressPct + 10) {
        <p class="notice warn">ใช้งบไปแล้ว {{ c.budgetUsedPct }}% แต่ผลงานเพิ่ง {{ c.progressPct }}% ต้นทุนอาจบานปลาย ตรวจสอบรายการวัสดุที่ใช้เกิน BOQ ด้านล่าง</p>
      }

      <div class="two">
        <section class="panel">
          <div class="sec-head"><h2>ต้นทุนตามหมวด</h2></div>
          <table class="grid compact">
            <thead><tr><th>หมวด</th><th class="num">ต้นทุนจริง</th><th class="num">ผูกพัน</th><th class="num">รวม</th></tr></thead>
            <tbody>
              @for (l of c.lines; track l.category) {
                <tr><td>{{ l.label }}</td><td class="num">{{ l.actual | money }}</td><td class="num">{{ l.committed | money }}</td><td class="num">{{ l.actual + l.committed | money }}</td></tr>
              }
            </tbody>
            <tfoot><tr><td>รวม</td><td class="num">{{ c.actualCost | money }}</td><td class="num">{{ c.committed | money }}</td><td class="num">{{ c.actualCost + c.committed | money }}</td></tr></tfoot>
          </table>
        </section>

        <section class="panel">
          <div class="sec-head"><h2>ต้นทุนรายเดือน</h2></div>
          @if (bars().length) {
            <div class="legend" aria-hidden="true">
              @for (s of series; track s.key) {
                <span><i [style.background]="s.color"></i>{{ s.label }}</span>
              }
            </div>
            <div class="chart" role="img" [attr.aria-label]="chartLabel()">
              <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="svg">
                @for (t of ticks(); track t.v) {
                  <line [attr.x1]="PADL" [attr.x2]="W" [attr.y1]="t.y" [attr.y2]="t.y" class="gridline" />
                  <text [attr.x]="PADL - 6" [attr.y]="t.y + 4" class="axis" text-anchor="end">{{ t.label }}</text>
                }
                @for (b of bars(); track b.month; let i = $index) {
                  <g (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)">
                    <rect [attr.x]="b.x - 4" y="0" [attr.width]="b.w + 8" [attr.height]="H - PADB" fill="transparent" />
                    @for (s of b.segs; track s.key) {
                      <path [attr.d]="s.d" [attr.fill]="s.color" />
                    }
                    <text [attr.x]="b.x + b.w / 2" [attr.y]="H - PADB + 16" class="axis" text-anchor="middle">{{ b.label }}</text>
                  </g>
                }
              </svg>
              @if (hover() !== null) {
                @let b = bars()[hover()!];
                <div class="tip" [style.left.%]="((b.x + b.w / 2) / W) * 100">
                  <b>{{ b.label }}</b>
                  @for (s of series; track s.key) {
                    <div><i [style.background]="s.color"></i>{{ s.label }} <span>{{ b.values[s.key] | money }}</span></div>
                  }
                  <div class="tot">รวม <span>{{ b.total | money }}</span></div>
                </div>
              }
            </div>
          } @else {
            <p class="empty muted">ยังไม่มีต้นทุน</p>
          }
        </section>
      </div>

      <section class="panel">
        <div class="sec-head">
          <h2>วัสดุ: BOQ เทียบกับที่ใช้จริง</h2>
          <span class="grow"></span>
          <mat-button-toggle-group [ngModel]="usageFilter()" (ngModelChange)="usageFilter.set($event)" hideSingleSelectionIndicator aria-label="กรอง">
            <mat-button-toggle value="all">ทั้งหมด</mat-button-toggle>
            <mat-button-toggle value="over">ใช้เกิน BOQ</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <div class="scroll">
          <table class="grid">
            <thead><tr><th>รหัส</th><th>วัสดุ</th><th class="num">ตาม BOQ</th><th class="num">ใช้จริง</th><th class="num">ส่วนต่าง</th><th class="num">ใช้ไป</th><th class="num">ต้นทุน BOQ</th><th class="num">ต้นทุนจริง</th></tr></thead>
            <tbody>
              @for (u of shownUsage(); track u.materialId) {
                <tr>
                  <td class="small">{{ u.code }}</td>
                  <td>{{ u.name }}</td>
                  <td class="num">{{ u.boqQty | qty }} {{ u.unit }}</td>
                  <td class="num">{{ u.usedQty | qty }}</td>
                  <td class="num" [class.bad]="u.variance < 0">{{ u.variance | qty }}</td>
                  <td class="num" [class.bad]="(u.usedPct ?? 0) > 100">{{ u.usedPct === null ? 'นอก BOQ' : u.usedPct + '%' }}</td>
                  <td class="num">{{ u.boqCost | money }}</td>
                  <td class="num">{{ u.usedCost | money }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty muted">ไม่มีรายการ</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .kpi .sub { color: var(--ktt-steel); font-size: 0.78rem; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 960px) { .two { grid-template-columns: 1fr; } }
    .two .panel { margin: 0; }
    .grid.compact { min-width: 0; }
    .legend { display: flex; gap: 14px; flex-wrap: wrap; padding: 0 16px; font-size: 0.82rem; color: var(--ktt-steel); }
    .legend i, .tip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
    .chart { position: relative; padding: 8px 16px 12px; }
    .svg { width: 100%; height: auto; display: block; overflow: visible; }
    .gridline { stroke: #e6e8e7; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .axis { font-size: 11px; fill: var(--ktt-steel); }
    .tip { position: absolute; top: 4px; transform: translateX(-50%); background: #fff; border: 1px solid var(--ktt-line); border-radius: 6px; padding: 8px 10px; font-size: 0.8rem; box-shadow: 0 4px 12px rgb(0 0 0 / 8%); pointer-events: none; min-width: 180px; z-index: 2; }
    .tip div { display: flex; align-items: center; }
    .tip span { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
    .tip .tot { border-top: 1px solid var(--ktt-line); margin-top: 4px; padding-top: 4px; font-weight: 600; }
  `,
})
export class ProjectCostView implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly c = signal<ProjectCost | null>(null);
  readonly usage = signal<UsageRow[]>([]);
  readonly hover = signal<number | null>(null);
  readonly series = COST_SERIES;
  readonly usageFilter = signal<'all' | 'over'>('all');

  readonly W = 600;
  readonly H = 220;
  readonly PADL = 52;
  readonly PADB = 24;

  private readonly maxTotal = computed(() => {
    const m = this.c()?.months ?? [];
    return Math.max(1, ...m.map((x) => x.material + x.subcontract + x.labor + x.other));
  });

  readonly ticks = computed(() => {
    const max = this.niceMax();
    return [0, 0.5, 1].map((f) => ({ v: f, y: this.y(max * f), label: this.short(max * f) }));
  });

  private readonly niceMax = computed(() => {
    const m = this.maxTotal();
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / p) * p;
  });

  readonly bars = computed(() => {
    const months = this.c()?.months ?? [];
    if (!months.length) return [];
    const max = this.niceMax();
    const slot = (this.W - this.PADL) / months.length;
    const w = Math.min(36, slot * 0.6);
    return months.map((mo, i) => {
      const x = this.PADL + slot * i + (slot - w) / 2;
      const values = { material: mo.material, subcontract: mo.subcontract, labor: mo.labor, other: mo.other } as Record<SeriesKey, number>;
      let acc = 0;
      const nonZero = COST_SERIES.filter((s) => values[s.key] > 0);
      const segs = nonZero.map((s, k) => {
        const y0 = this.y(acc);
        acc += values[s.key];
        // ช่องว่าง 2px ระหว่างชั้น และมุมโค้งเฉพาะปลายบนสุด
        const y1 = this.y(acc);
        const gap = k > 0 ? 2 : 0;
        const top = k === nonZero.length - 1;
        return { key: s.key, color: s.color, d: this.rect(x, y1, w, Math.max(0, y0 - y1 - gap), top) };
      });
      return { month: mo.month, label: monthLabel(mo.month), x, w, segs, values, total: acc };
    });
  });

  readonly chartLabel = computed(() => this.bars().map((b) => `${b.label} ${money(b.total)} บาท`).join(', '));

  readonly shownUsage = computed(() => {
    return this.usageFilter() === 'over' ? this.usage().filter((u) => u.usedPct === null || u.usedPct > 100) : this.usage();
  });

  ngOnInit(): void {
    this.api.projectCost(this.projectId()).subscribe({ next: (c) => this.c.set(c), error: (e) => this.notify.error(e) });
    this.api.usage(this.projectId()).subscribe({ next: (u) => this.usage.set(u), error: () => this.usage.set([]) });
  }

  private y(v: number): number {
    return this.H - this.PADB - (v / this.niceMax()) * (this.H - this.PADB - 8);
  }

  private short(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M';
    if (v >= 1000) return (v / 1000).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + 'k';
    return String(Math.round(v));
  }

  private rect(x: number, y: number, w: number, h: number, roundTop: boolean): string {
    if (h <= 0) return '';
    const r = roundTop ? Math.min(4, h, w / 2) : 0;
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
}
