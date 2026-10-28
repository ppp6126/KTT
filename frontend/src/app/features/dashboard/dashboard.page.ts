import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe, money } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { LEAD_STATUS_LABEL } from '../leads/leads.api';
import { ProgressBar } from '../projects/progress-bar';
import { Dashboard, DashboardApi } from './dashboard.api';

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** สีชุดข้อมูลตามลำดับ palette ที่ตรวจแล้ว: วางบิล (1) ต้นทุน (2) รับเงิน (3) */
const BILLED = '#2a78d6';
const COST = '#eb6834';
const RECEIVED = '#1baf7a';

function short(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? (a / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'k' : String(Math.round(a));
  return (v < 0 ? '−' : '') + s;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MoneyPipe, ThDatePipe, ProgressBar],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>แดชบอร์ดผู้บริหาร</h1>
          <p>ข้อมูล ณ {{ d()?.asOf | thDate }} · ยอดวางบิลและต้นทุนเป็นยอดก่อน VAT ยอดรับเงินรวม VAT</p>
        </div>
        <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon> โหลดใหม่</button>
      </div>

      @if (d(); as d) {
        <div class="kpis big">
          <div class="kpi"><span class="label">วางบิลเดือนนี้</span><strong>{{ d.kpis.billedMtd | money }}</strong><span class="sub">ปีนี้ {{ d.kpis.billedYtd | money }}</span></div>
          <div class="kpi"><span class="label">รับเงินเดือนนี้</span><strong>{{ d.kpis.receivedMtd | money }}</strong><span class="sub">ปีนี้ {{ d.kpis.receivedYtd | money }}</span></div>
          <div class="kpi"><span class="label">ต้นทุนโครงการเดือนนี้</span><strong>{{ d.kpis.costMtd | money }}</strong><span class="sub">ปีนี้ {{ d.kpis.costYtd | money }}</span></div>
          <div class="kpi">
            <span class="label">กำไรขั้นต้นปีนี้</span>
            <strong [class.bad]="(d.kpis.grossMarginYtdPct ?? 0) < 0">{{ d.kpis.grossMarginYtdPct === null ? '–' : d.kpis.grossMarginYtdPct + '%' }}</strong>
            <span class="sub">จากยอดวางบิลเทียบต้นทุนที่เกิดขึ้น</span>
          </div>
          <div class="kpi"><span class="label">งานในมือ (ยังไม่วางบิล)</span><strong>{{ d.kpis.backlog | money }}</strong></div>
        </div>
        <div class="kpis">
          <a class="kpi link" routerLink="/finance/receivables"><span class="label">ลูกหนี้คงค้าง</span><strong>{{ d.kpis.arOutstanding | money }}</strong><span class="sub" [class.bad]="d.kpis.arOverdue">เกินกำหนด {{ d.kpis.arOverdue | money }}</span></a>
          <a class="kpi link" routerLink="/ap"><span class="label">เจ้าหนี้คงค้าง</span><strong>{{ d.kpis.apOutstanding | money }}</strong><span class="sub" [class.bad]="d.kpis.apOverdue">เกินกำหนด {{ d.kpis.apOverdue | money }}</span></a>
          @if (d.kpis.cashNext4Weeks !== null) {
            <a class="kpi link" routerLink="/reports/cash-flow"><span class="label">เงินสดสุทธิ 4 สัปดาห์ข้างหน้า</span><strong [class.bad]="d.kpis.cashNext4Weeks < 0">{{ d.kpis.cashNext4Weeks | money }}</strong><span class="sub">ประมาณการเข้า − ออก</span></a>
          }
          <a class="kpi link" routerLink="/service/satisfaction">
            <span class="label">ความพึงพอใจลูกค้า (12 เดือน)</span>
            <strong>{{ d.satisfaction.overall === null ? '–' : d.satisfaction.overall + ' / 5' }}</strong>
            <span class="sub">{{ d.satisfaction.count }} ครั้ง{{ d.satisfaction.recommendPct !== null ? ' · แนะนำต่อ ' + d.satisfaction.recommendPct + '%' : '' }}</span>
          </a>
        </div>

        <div class="cols">
          <section class="panel">
            <div class="sec-head">
              <h2>วางบิล ต้นทุน และรับเงิน 12 เดือน</h2>
              <span class="grow"></span>
              <span class="legend">
                <span><i [style.background]="BILLED"></i>วางบิล</span>
                <span><i [style.background]="COST"></i>ต้นทุน</span>
                <span><i class="line" [style.background]="RECEIVED"></i>รับเงิน</span>
              </span>
            </div>
            <div class="chart" role="img" [attr.aria-label]="chartLabel()">
              <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="svg">
                @for (t of ticks(); track t) {
                  <line [attr.x1]="PADL" [attr.x2]="W" [attr.y1]="y(t)" [attr.y2]="y(t)" class="gridline" />
                  <text [attr.x]="PADL - 6" [attr.y]="y(t) + 4" class="axis" text-anchor="end">{{ short(t) }}</text>
                }
                @for (b of bars(); track b.month; let i = $index) {
                  <g (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)">
                    <rect [attr.x]="b.x" y="0" [attr.width]="b.slot" [attr.height]="H - PADB" fill="transparent" />
                    <path [attr.d]="b.billed" [attr.fill]="BILLED" />
                    <path [attr.d]="b.cost" [attr.fill]="COST" />
                    <text [attr.x]="b.x + b.slot / 2" [attr.y]="H - PADB + 16" class="axis" text-anchor="middle">{{ b.label }}</text>
                  </g>
                }
                <path [attr.d]="recPath()" class="rec" [attr.stroke]="RECEIVED" />
                @for (b of bars(); track b.month) {
                  <circle [attr.cx]="b.x + b.slot / 2" [attr.cy]="y(b.v.received)" r="4" [attr.fill]="RECEIVED" class="dot" />
                }
              </svg>
              @if (hover() !== null) {
                @let b = bars()[hover()!];
                <div class="tip" [style.left.%]="((b.x + b.slot / 2) / W) * 100">
                  <b>{{ b.label }}</b>
                  <div><i [style.background]="BILLED"></i>วางบิล <span>{{ b.v.billed | money }}</span></div>
                  <div><i [style.background]="COST"></i>ต้นทุน <span>{{ b.v.cost | money }}</span></div>
                  <div><i [style.background]="RECEIVED"></i>รับเงิน <span>{{ b.v.received | money }}</span></div>
                </div>
              }
            </div>
          </section>

          <section class="panel">
            <div class="sec-head"><h2>ต้องดำเนินการ</h2></div>
            <ul class="alerts">
              @for (a of alerts(); track a.label) {
                <li [class.zero]="!a.count">
                  <a [routerLink]="a.link">
                    <mat-icon [class]="a.tone">{{ a.icon }}</mat-icon>
                    <span class="lbl">{{ a.label }}</span>
                    <b>{{ a.count }}</b>
                  </a>
                </li>
              }
            </ul>
          </section>
        </div>

        <div class="cols">
          <section class="panel">
            <div class="sec-head"><h2>โครงการที่กำลังทำ</h2><span class="muted small">เรียงโครงการที่ต้องจับตาขึ้นก่อน</span></div>
            <div class="scroll">
              <table class="grid">
                <thead><tr><th>โครงการ</th><th>ผลงานจริง / แผน</th><th class="num">ต่าง</th><th class="num">ใช้งบ</th><th class="num">กำไรคาด</th><th>สถานะ</th></tr></thead>
                <tbody>
                  @for (p of d.projects; track p.id) {
                    <tr>
                      <td><a [routerLink]="['/projects', p.id]" class="no">{{ p.code }}</a> {{ p.name }}<div class="small muted">{{ p.managerName }}</div></td>
                      <td class="prog"><app-progress-bar [actual]="p.progressPct" [planned]="p.plannedPct" /></td>
                      <td class="num" [class.bad]="p.behind">{{ p.variancePct > 0 ? '+' : '' }}{{ p.variancePct.toFixed(1) }}</td>
                      <td class="num" [class.bad]="p.overBudget">{{ p.budgetUsedPct === null ? '–' : p.budgetUsedPct + '%' }}</td>
                      <td class="num" [class.bad]="(p.marginPct ?? 0) < 0">{{ p.marginPct === null ? '–' : p.marginPct + '%' }}</td>
                      <td>
                        @if (p.behind) {
                          <span class="chip danger"><mat-icon inline>schedule</mat-icon> ล่าช้า</span>
                        }
                        @if (p.overBudget) {
                          <span class="chip warn"><mat-icon inline>trending_up</mat-icon> เกินงบ</span>
                        }
                        @if (!p.behind && !p.overBudget) {
                          <span class="chip ok"><mat-icon inline>check</mat-icon> ปกติ</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="empty muted">ไม่มีโครงการที่กำลังดำเนินการ</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel panel-pad">
            <h2>งานขาย</h2>
            <div class="funnel" role="list">
              @for (s of d.pipeline.leads; track s.status) {
                <div class="f-row" role="listitem">
                  <span class="lbl">{{ leadLabel[s.status] ?? s.status }}</span>
                  <span class="track"><span class="fill" [style.width.%]="(s.count / maxLead()) * 100"></span></span>
                  <span class="val">{{ s.count }}</span>
                </div>
              }
            </div>
            <dl class="facts2">
              <div><dt>ใบเสนอราคารอลูกค้าตอบ</dt><dd>{{ d.pipeline.quotesOpen }} ใบ · {{ d.pipeline.quotesOpenValue | money }}</dd></div>
              <div><dt>อัตราปิดการขาย 12 เดือน</dt><dd>{{ d.pipeline.winRatePct === null ? '–' : d.pipeline.winRatePct + '%' }} ({{ d.pipeline.quotesWon }}/{{ d.pipeline.quotesDecided }})</dd></div>
            </dl>
            <a mat-button routerLink="/leads">ไปที่ลีด <mat-icon iconPositionEnd>arrow_forward</mat-icon></a>
          </section>
        </div>
      }
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .kpis.big .kpi strong { font-size: 1.35rem; }
    .kpi .sub { color: var(--ktt-steel); font-size: 0.78rem; }
    .kpi.link { text-decoration: none; color: inherit; }
    .kpi.link:hover { border-color: var(--ktt-ink-2); }
    .cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
    .cols .panel { margin: 0; }
    h2 { margin: 0 0 8px; }
    .legend { display: flex; gap: 12px; font-size: 0.82rem; color: var(--ktt-steel); flex-wrap: wrap; }
    .legend i, .tip i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
    .legend i.line { height: 3px; width: 14px; vertical-align: 2px; }
    .chart { position: relative; padding: 4px 16px 12px; }
    .svg { width: 100%; height: auto; display: block; overflow: visible; }
    .gridline { stroke: #e6e8e7; stroke-width: 1; }
    .axis { font-size: 11px; fill: var(--ktt-steel); }
    .rec { fill: none; stroke-width: 2; stroke-linejoin: round; }
    .dot { stroke: #fff; stroke-width: 2; }
    .tip { position: absolute; top: 4px; transform: translateX(-50%); background: #fff; border: 1px solid var(--ktt-line); border-radius: 6px; padding: 8px 10px; font-size: 0.8rem; box-shadow: 0 4px 12px rgb(0 0 0 / 8%); pointer-events: none; min-width: 180px; z-index: 2; }
    .tip div { display: flex; align-items: center; }
    .tip span { margin-left: auto; padding-left: 12px; font-variant-numeric: tabular-nums; }
    .alerts { list-style: none; margin: 0; padding: 0 8px 8px; }
    .alerts a { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 6px; color: inherit; text-decoration: none; }
    .alerts a:hover { background: #f3f6f8; }
    .alerts .lbl { flex: 1; }
    .alerts b { font-variant-numeric: tabular-nums; font-size: 1.05rem; }
    .alerts li.zero { opacity: 0.55; }
    .alerts mat-icon.danger { color: var(--ktt-danger); }
    .alerts mat-icon.warn { color: #9a4b05; }
    .alerts mat-icon.info { color: var(--ktt-ink-2); }
    td.prog { min-width: 200px; }
    .chip mat-icon { font-size: 14px; width: 14px; height: 14px; vertical-align: -2px; }
    .funnel { margin: 6px 0 12px; }
    .f-row { display: grid; grid-template-columns: 110px 1fr 36px; gap: 8px; align-items: center; padding: 5px 0; }
    .track { height: 12px; background: #eef0ef; border-radius: 4px; overflow: hidden; }
    .fill { display: block; height: 100%; background: #2a78d6; border-radius: 0 4px 4px 0; min-width: 2px; }
    .val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .facts2 { margin: 0 0 8px; }
    .facts2 > div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-top: 1px solid #eceeed; }
    .facts2 dt { color: var(--ktt-steel); }
    .facts2 dd { margin: 0; text-align: right; }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(DashboardApi);
  private readonly notify = inject(Notify);
  readonly d = signal<Dashboard | null>(null);
  readonly hover = signal<number | null>(null);
  readonly leadLabel = LEAD_STATUS_LABEL;
  readonly BILLED = BILLED;
  readonly COST = COST;
  readonly RECEIVED = RECEIVED;
  readonly short = short;
  readonly W = 760;
  readonly H = 250;
  readonly PADL = 52;
  readonly PADB = 24;

  private readonly max = computed(() => {
    const m = this.d()?.months ?? [];
    const v = Math.max(1, ...m.map((x) => Math.max(x.billed, x.cost, x.received)));
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / p) * p;
  });
  readonly ticks = computed(() => [0, this.max() / 2, this.max()]);
  readonly bars = computed(() => {
    const m = this.d()?.months ?? [];
    const slot = (this.W - this.PADL) / Math.max(1, m.length);
    const bw = Math.min(16, (slot - 8) / 2);
    return m.map((v, i) => {
      const x = this.PADL + slot * i;
      const cx = x + slot / 2;
      const [yy, mm] = v.month.split('-').map(Number);
      return { month: v.month, label: `${TH_MONTH[mm - 1]} ${String(yy + 543).slice(2)}`, x, slot, v, billed: this.bar(cx - bw - 1, bw, v.billed), cost: this.bar(cx + 1, bw, v.cost) };
    });
  });
  readonly recPath = computed(() =>
    this.bars()
      .map((b, i) => `${i ? 'L' : 'M'}${b.x + b.slot / 2},${this.y(b.v.received)}`)
      .join(' '),
  );
  readonly chartLabel = computed(() =>
    this.bars()
      .map((b) => `${b.label}: วางบิล ${money(b.v.billed)} ต้นทุน ${money(b.v.cost)} รับเงิน ${money(b.v.received)}`)
      .join('; '),
  );
  readonly maxLead = computed(() => Math.max(1, ...(this.d()?.pipeline.leads ?? []).map((s) => s.count)));
  readonly alerts = computed(() => {
    const a = this.d()?.alerts;
    if (!a) return [];
    return [
      { label: 'เอกสารรออนุมัติ', count: a.approvalsPending, icon: 'approval', tone: 'info', link: '/approvals' },
      { label: 'งวดงานพร้อมวางบิล', count: a.milestonesReady, icon: 'request_quote', tone: 'info', link: '/contracts' },
      { label: 'ลูกหนี้เกินกำหนด (ใบ)', count: a.overdueReceivables, icon: 'error', tone: 'danger', link: '/finance/receivables' },
      { label: 'เจ้าหนี้เกินกำหนด (ใบ)', count: a.overduePayables, icon: 'warning', tone: 'warn', link: '/ap' },
      { label: 'ใบอนุญาตหมดอายุแล้ว', count: a.permitsExpired, icon: 'gpp_bad', tone: 'danger', link: '/permits' },
      { label: 'ใบอนุญาตใกล้หมดอายุ', count: a.permitsSoon, icon: 'schedule', tone: 'warn', link: '/permits' },
      { label: 'งานแจ้งซ่อมค้าง', count: a.ticketsOpen, icon: 'home_repair_service', tone: a.ticketsUrgent ? 'danger' : 'info', link: '/service/tickets' },
      { label: 'วัสดุต่ำกว่าจุดสั่งซื้อ', count: a.lowStock, icon: 'inventory_2', tone: 'warn', link: '/stock' },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get().subscribe({ next: (d) => this.d.set(d), error: (e) => this.notify.error(e) });
  }

  y(v: number): number {
    return this.H - this.PADB - (v / this.max()) * (this.H - this.PADB - 8);
  }

  private bar(x: number, w: number, v: number): string {
    if (v <= 0) return '';
    const y0 = this.y(0);
    const y1 = this.y(v);
    const r = Math.min(4, (y0 - y1) / 2, w / 2);
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
}
