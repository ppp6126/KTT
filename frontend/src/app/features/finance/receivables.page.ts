import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { FinanceApi, Receivables } from './finance.api';

/** ลูกหนี้คงค้างแยกตามอายุหนี้ (นับจากวันครบกำหนด) และเงินประกันผลงานที่ลูกค้ากันไว้ */
@Component({
  selector: 'app-receivables-page',
  imports: [RouterLink, MoneyPipe, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ลูกหนี้คงค้าง</h1>
          <p>ณ วันที่ {{ data()?.asOf | thDate }} อายุหนี้นับจากวันครบกำหนดชำระ ยอดรวมภาษีที่ยังไม่ได้ตัดชำระ</p>
        </div>
      </div>
      @if (data(); as d) {
        <section class="tiles">
          <div class="tile"><span class="label">ค้างรับทั้งหมด</span><strong>{{ d.totals.total | money }}</strong></div>
          <div class="tile"><span class="label">ยังไม่ถึงกำหนด</span><strong>{{ d.totals.current | money }}</strong></div>
          <div class="tile"><span class="label">เกินกำหนด</span><strong class="bad">{{ d.totals.total - d.totals.current | money }}</strong></div>
          <div class="tile"><span class="label">เงินประกันผลงานที่ลูกค้ากันไว้</span><strong>{{ d.totals.retentionHeld | money }}</strong></div>
        </section>
        <div class="panel table-scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>ลูกค้า</th><th class="num">ยังไม่ถึงกำหนด</th><th class="num">1–30 วัน</th><th class="num">31–60 วัน</th><th class="num">61–90 วัน</th><th class="num">เกิน 90 วัน</th><th class="num">รวมค้างรับ</th><th class="num">เงินประกัน</th>
              </tr>
            </thead>
            <tbody>
              @for (r of d.rows; track r.customerId) {
                <tr>
                  <td>
                    <a routerLink="/finance/docs" [queryParams]="{ view: 'invoices' }">{{ r.customerName }}</a>
                  </td>
                  <td class="num">{{ z(r.current) }}</td>
                  <td class="num">{{ z(r.d1to30) }}</td>
                  <td class="num" [class.warn]="r.d31to60 > 0">{{ z(r.d31to60) }}</td>
                  <td class="num" [class.bad]="r.d61to90 > 0">{{ z(r.d61to90) }}</td>
                  <td class="num" [class.bad]="r.over90 > 0">{{ z(r.over90) }}</td>
                  <td class="num strong">{{ r.total | money }}</td>
                  <td class="num muted">{{ z(r.retentionHeld) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty muted">ไม่มีลูกหนี้คงค้าง</td></tr>
              }
            </tbody>
            @if (d.rows.length) {
              <tfoot>
                <tr>
                  <td>รวม</td>
                  <td class="num">{{ d.totals.current | money }}</td>
                  <td class="num">{{ d.totals.d1to30 | money }}</td>
                  <td class="num">{{ d.totals.d31to60 | money }}</td>
                  <td class="num">{{ d.totals.d61to90 | money }}</td>
                  <td class="num">{{ d.totals.over90 | money }}</td>
                  <td class="num">{{ d.totals.total | money }}</td>
                  <td class="num">{{ d.totals.retentionHeld | money }}</td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .wide { max-width: 1240px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .tile { background: var(--ktt-paper); border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-m); padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
    .tile strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
    .label { color: var(--ktt-steel); font-size: 0.85rem; }
    .grid { width: 100%; min-width: 900px; border-collapse: collapse; }
    .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .grid th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; white-space: nowrap; }
    .grid .num { text-align: right; }
    tfoot td { font-weight: 600; background: #f6f7f6; }
    .strong { font-weight: 600; }
    .bad { color: var(--ktt-danger); }
    .warn { color: #9a4b05; }
    .empty { text-align: center; padding: 32px; }
  `,
})
export class ReceivablesPage implements OnInit {
  private readonly api = inject(FinanceApi);
  private readonly notify = inject(Notify);
  readonly data = signal<Receivables | null>(null);

  ngOnInit(): void {
    this.api.receivables().subscribe({ next: (r) => this.data.set(r), error: (e) => this.notify.error(e) });
  }

  z(v: number): string {
    return v ? v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–';
  }
}
