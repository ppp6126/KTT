import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { ThDatePipe, addDaysIso, thDateShort } from '../../core/util/format';
import { MoneyPipe, money } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { ApApi, CashFlow, CashWeek } from '../ap/ap.api';

const IN = '#2a78d6';
const OUT = '#eb6834';

/** ประมาณการกระแสเงินสดรายสัปดาห์ จากลูกหนี้ที่ครบกำหนด งวดที่จะวางบิล และเจ้าหนี้ที่ครบกำหนดจ่าย */
@Component({
  selector: 'app-cashflow-page',
  imports: [FormsModule, MatButtonToggleModule, MatIconModule, MoneyPipe, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>กระแสเงินสด</h1>
          <p>ประมาณการเงินเข้า-ออกรายสัปดาห์ จากลูกหนี้ งวดงานตามสัญญาที่ยังไม่วางบิล เจ้าหนี้ และค่าแรงที่รอจ่าย</p>
        </div>
        <mat-button-toggle-group [ngModel]="weeks()" (ngModelChange)="weeks.set($event); load()" hideSingleSelectionIndicator aria-label="ช่วงเวลา">
          <mat-button-toggle [value]="8">8 สัปดาห์</mat-button-toggle>
          <mat-button-toggle [value]="12">12 สัปดาห์</mat-button-toggle>
          <mat-button-toggle [value]="26">26 สัปดาห์</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (cf(); as c) {
        <div class="kpis">
          <div class="kpi"><span class="label">ลูกหนี้เกินกำหนด (รวมในสัปดาห์แรก)</span><strong>{{ c.overdueIn | money }}</strong></div>
          <div class="kpi"><span class="label">เจ้าหนี้เกินกำหนด (รวมในสัปดาห์แรก)</span><strong class="bad">{{ c.overdueOut | money }}</strong></div>
          <div class="kpi"><span class="label">เงินเข้ารวม</span><strong>{{ totals().in | money }}</strong></div>
          <div class="kpi"><span class="label">เงินออกรวม</span><strong>{{ totals().out | money }}</strong></div>
          <div class="kpi"><span class="label">สุทธิสะสมปลายช่วง</span><strong [class.bad]="totals().net < 0">{{ totals().net | money }}</strong></div>
        </div>

        <section class="panel">
          <div class="sec-head">
            <h2>เงินเข้า-ออกรายสัปดาห์</h2>
            <span class="grow"></span>
            <span class="legend"><span><i [style.background]="IN"></i>เงินเข้า</span><span><i [style.background]="OUT"></i>เงินออก</span><span><i class="line"></i>สุทธิสะสม</span></span>
          </div>
          <div class="chart" role="img" [attr.aria-label]="ariaLabel()">
            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="svg">
              @for (t of ticks(); track t.v) {
                <line [attr.x1]="PADL" [attr.x2]="W" [attr.y1]="y(t.v)" [attr.y2]="y(t.v)" [class.zero]="t.v === 0" class="gridline" />
                <text [attr.x]="PADL - 6" [attr.y]="y(t.v) + 4" class="axis" text-anchor="end">{{ t.label }}</text>
              }
              @for (b of bars(); track b.week; let i = $index) {
                <g (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)">
                  <rect [attr.x]="b.x" y="0" [attr.width]="b.slot" [attr.height]="H - PADB" fill="transparent" />
                  <path [attr.d]="b.inPath" [attr.fill]="IN" />
                  <path [attr.d]="b.outPath" [attr.fill]="OUT" />
                  @if (i % labelEvery() === 0) {
                    <text [attr.x]="b.x + b.slot / 2" [attr.y]="H - PADB + 16" class="axis" text-anchor="middle">{{ b.label }}</text>
                  }
                </g>
              }
              <path [attr.d]="cumPath()" class="cum" />
              @for (b of bars(); track b.week) {
                <circle [attr.cx]="b.x + b.slot / 2" [attr.cy]="y(b.cum)" r="4" class="dot" />
              }
            </svg>
            @if (hover() !== null) {
              @let b = bars()[hover()!];
              <div class="tip" [style.left.%]="((b.x + b.slot / 2) / W) * 100">
                <b>สัปดาห์ {{ b.label }}</b>
                <div><i [style.background]="IN"></i>เงินเข้า <span>{{ b.in | money }}</span></div>
                <div><i [style.background]="OUT"></i>เงินออก <span>{{ b.out | money }}</span></div>
                <div class="tot">สุทธิสะสม <span>{{ b.cum | money }}</span></div>
              </div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="scroll">
            <table class="grid">
              <thead><tr><th>สัปดาห์เริ่ม</th><th class="num">เงินเข้า</th><th class="num">เงินออก</th><th class="num">สุทธิ</th><th class="num">สะสม</th><th></th></tr></thead>
              <tbody>
                @for (w of c.rows; track w.weekStart) {
                  <tr class="clickable" (click)="toggle(w)" tabindex="0" (keydown.enter)="toggle(w)">
                    <td>{{ w.weekStart | thDate }} – {{ end(w) | thDate }}</td>
                    <td class="num">{{ w.inflow | money }}</td>
                    <td class="num">{{ w.outflow | money }}</td>
                    <td class="num" [class.bad]="w.net < 0">{{ w.net | money }}</td>
                    <td class="num" [class.bad]="w.cumulative < 0">{{ w.cumulative | money }}</td>
                    <td><mat-icon>{{ open() === w.weekStart ? 'expand_less' : 'expand_more' }}</mat-icon></td>
                  </tr>
                  @if (open() === w.weekStart) {
                    <tr class="sub">
                      <td colspan="6">
                        @for (it of w.items; track $index) {
                          <div class="item">
                            <span class="dir" [class.out]="it.direction === 'out'">{{ it.direction === 'in' ? 'เข้า' : 'ออก' }}</span>
                            <span>{{ it.label }}</span>
                            <span class="muted small">{{ it.date ? (it.date | thDate) : '' }}</span>
                            <b>{{ it.amount | money }}</b>
                          </div>
                        } @empty {
                          <span class="muted">ไม่มีรายการ</span>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </section>
        <p class="muted small">เงินสดตั้งต้นนับเป็นศูนย์ ระบบไม่ได้เชื่อมบัญชีธนาคาร ใช้ดูทิศทางว่าสัปดาห์ไหนเงินออกมากกว่าเข้า</p>
      }
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .legend { display: flex; gap: 14px; font-size: 0.82rem; color: var(--ktt-steel); }
    .legend i, .tip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
    .legend i.line { height: 2px; width: 14px; background: var(--ktt-ink); vertical-align: 3px; }
    .chart { position: relative; padding: 4px 16px 12px; }
    .svg { width: 100%; height: auto; display: block; overflow: visible; }
    .gridline { stroke: #e6e8e7; stroke-width: 1; }
    .gridline.zero { stroke: #b9bfbd; }
    .axis { font-size: 11px; fill: var(--ktt-steel); }
    .cum { fill: none; stroke: var(--ktt-ink); stroke-width: 2; stroke-linejoin: round; }
    .dot { fill: var(--ktt-ink); stroke: #fff; stroke-width: 2; }
    .tip { position: absolute; top: 4px; transform: translateX(-50%); background: #fff; border: 1px solid var(--ktt-line); border-radius: 6px; padding: 8px 10px; font-size: 0.8rem; box-shadow: 0 4px 12px rgb(0 0 0 / 8%); pointer-events: none; min-width: 190px; z-index: 2; }
    .tip div { display: flex; align-items: center; }
    .tip span { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
    .tip .tot { border-top: 1px solid var(--ktt-line); margin-top: 4px; padding-top: 4px; font-weight: 600; }
    tr.sub td { background: #fafaf8; }
    .item { display: grid; grid-template-columns: 44px 1fr 110px 130px; gap: 8px; padding: 3px 0; align-items: center; }
    .item b { text-align: right; font-variant-numeric: tabular-nums; }
    .dir { font-size: 0.75rem; padding: 1px 6px; border-radius: 10px; background: #e1ecf9; color: #1c5cab; text-align: center; }
    .dir.out { background: #fce6dc; color: #a2401a; }
  `,
})
export class CashflowPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  readonly IN = IN;
  readonly OUT = OUT;
  readonly W = 760;
  readonly H = 240;
  readonly PADL = 56;
  readonly PADB = 24;
  readonly weeks = signal(12);
  readonly cf = signal<CashFlow | null>(null);
  readonly open = signal<string | null>(null);
  readonly hover = signal<number | null>(null);

  readonly totals = computed(() => {
    const r = this.cf()?.rows ?? [];
    return { in: r.reduce((s, w) => s + w.inflow, 0), out: r.reduce((s, w) => s + w.outflow, 0), net: r.length ? r[r.length - 1].cumulative : 0 };
  });

  private readonly domain = computed(() => {
    const r = this.cf()?.rows ?? [];
    const hi = Math.max(1, ...r.map((w) => Math.max(w.inflow, w.outflow, w.cumulative)));
    const lo = Math.min(0, ...r.map((w) => w.cumulative));
    return { hi: this.nice(hi), lo: lo < 0 ? -this.nice(-lo) : 0 };
  });

  readonly ticks = computed(() => {
    const { hi, lo } = this.domain();
    const t = [lo, 0, hi / 2, hi].filter((v, i, a) => a.indexOf(v) === i);
    return t.map((v) => ({ v, label: this.short(v) }));
  });

  readonly labelEvery = computed(() => Math.ceil((this.cf()?.rows.length ?? 1) / 13));

  readonly bars = computed(() => {
    const r = this.cf()?.rows ?? [];
    const slot = (this.W - this.PADL) / Math.max(1, r.length);
    const bw = Math.min(18, (slot - 6) / 2);
    return r.map((w, i) => {
      const x = this.PADL + slot * i;
      const cx = x + slot / 2;
      return {
        week: w.weekStart,
        label: thDateShort(w.weekStart).replace(/ \d+$/, ''),
        x,
        slot,
        in: w.inflow,
        out: w.outflow,
        cum: w.cumulative,
        inPath: this.bar(cx - bw - 1, bw, w.inflow),
        outPath: this.bar(cx + 1, bw, w.outflow),
      };
    });
  });

  readonly cumPath = computed(() =>
    this.bars()
      .map((b, i) => `${i ? 'L' : 'M'}${b.x + b.slot / 2},${this.y(b.cum)}`)
      .join(' '),
  );

  readonly ariaLabel = computed(() =>
    this.bars()
      .map((b) => `${b.label}: เข้า ${money(b.in)} ออก ${money(b.out)}`)
      .join('; '),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.cashFlow(this.weeks()).subscribe({ next: (c) => this.cf.set(c), error: (e) => this.notify.error(e) });
  }

  toggle(w: CashWeek): void {
    this.open.set(this.open() === w.weekStart ? null : w.weekStart);
  }

  end(w: CashWeek): string {
    return addDaysIso(w.weekStart, 6);
  }

  y(v: number): number {
    const { hi, lo } = this.domain();
    return this.H - this.PADB - ((v - lo) / (hi - lo || 1)) * (this.H - this.PADB - 8);
  }

  private bar(x: number, w: number, v: number): string {
    if (v <= 0) return '';
    const y0 = this.y(0);
    const y1 = this.y(v);
    const r = Math.min(4, (y0 - y1) / 2, w / 2);
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }

  private nice(v: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / p) * p;
  }

  private short(v: number): string {
    const a = Math.abs(v);
    const s = a >= 1_000_000 ? (a / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'k' : String(Math.round(a));
    return v < 0 ? '−' + s : s;
  }
}
