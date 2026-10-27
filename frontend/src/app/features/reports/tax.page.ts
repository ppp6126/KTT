import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TaxIdPipe, ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { CompanyHeaderStore } from '../print/company-header';
import { saveBlob } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { ApApi, VatReport, WhtReport } from '../ap/ap.api';

type Kind = 'sales' | 'purchase' | 'pnd3' | 'pnd53';

const TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${TH_MONTH_FULL[m - 1]} ${y + 543}`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** รายงานภาษีซื้อ ภาษีขาย และ ภ.ง.ด.3/53 รายเดือน สำหรับยื่นเอง (ไม่เชื่อมโปรแกรมบัญชี) */
@Component({
  selector: 'app-tax-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MoneyPipe, ThDatePipe, TaxIdPipe],
  template: `
    <div class="page wide">
      <div class="page-head no-print">
        <div>
          <h1>รายงานภาษี</h1>
          <p>รายงานภาษีขาย ภาษีซื้อ และหนังสือรับรองหัก ณ ที่จ่ายรายเดือน พิมพ์หรือส่งออก CSV เพื่อยื่นแบบ</p>
        </div>
        <div class="actions">
          <button mat-stroked-button (click)="csv()"><mat-icon>download</mat-icon> CSV</button>
          <button mat-flat-button class="btn-primary" (click)="print()"><mat-icon>print</mat-icon> พิมพ์</button>
        </div>
      </div>

      <div class="panel no-print">
        <div class="filters">
          <mat-button-toggle-group [ngModel]="kind()" (ngModelChange)="kind.set($event); load()" aria-label="รายงาน" hideSingleSelectionIndicator>
            <mat-button-toggle value="sales">ภาษีขาย</mat-button-toggle>
            <mat-button-toggle value="purchase">ภาษีซื้อ</mat-button-toggle>
            <mat-button-toggle value="pnd3">ภ.ง.ด.3</mat-button-toggle>
            <mat-button-toggle value="pnd53">ภ.ง.ด.53</mat-button-toggle>
          </mat-button-toggle-group>
          <button mat-icon-button (click)="shift(-1)" aria-label="เดือนก่อน"><mat-icon>chevron_left</mat-icon></button>
          <label class="month">
            <span class="sr-only">เดือนภาษี</span>
            <input type="month" [ngModel]="period()" (ngModelChange)="period.set($event); load()" [max]="thisMonth" />
          </label>
          <button mat-icon-button (click)="shift(1)" [disabled]="period() >= thisMonth" aria-label="เดือนถัดไป"><mat-icon>chevron_right</mat-icon></button>
          <b>{{ periodText() }}</b>
        </div>
      </div>

      <section class="panel sheet">
        <div class="head">
          <h2>{{ title() }}</h2>
          <div>เดือนภาษี {{ periodText() }}</div>
          <div>ชื่อผู้ประกอบการ {{ company()?.nameTh }} &nbsp; เลขประจำตัวผู้เสียภาษี {{ company()?.taxId | taxId }} &nbsp; {{ !company()?.branchNo || company()?.branchNo === '00000' ? 'สำนักงานใหญ่' : 'สาขา ' + company()?.branchNo }}</div>
        </div>
        <div class="scroll">
          @if (vat(); as r) {
            <table class="grid">
              <thead>
                <tr>
                  <th class="num">ลำดับ</th><th>วันที่</th><th>เลขที่ใบกำกับภาษี</th><th>{{ r.kind === 'sales' ? 'ชื่อผู้ซื้อ' : 'ชื่อผู้ขาย' }}</th><th>เลขผู้เสียภาษี</th><th>สาขา</th>
                  <th class="num">มูลค่าสินค้า/บริการ</th><th class="num">ภาษีมูลค่าเพิ่ม</th>
                </tr>
              </thead>
              <tbody>
                @for (row of r.rows; track $index; let i = $index) {
                  <tr [class.void]="row.note">
                    <td class="num">{{ i + 1 }}</td>
                    <td class="small">{{ row.date | thDate }}</td>
                    <td class="no">
                      @if (r.kind === 'purchase') {
                        <a class="no-print-link" [routerLink]="['/ap/bills', row.refId]">{{ row.docNo }}</a>
                      } @else {
                        <a class="no-print-link" [routerLink]="['/finance/docs', row.refId]">{{ row.docNo }}</a>
                      }
                    </td>
                    <td>{{ row.partyName }}{{ row.note ? ' (' + row.note + ')' : '' }}</td>
                    <td class="small">{{ row.partyTaxId | taxId }}</td>
                    <td class="small">{{ row.partyBranch || 'สนญ.' }}</td>
                    <td class="num">{{ row.base | money }}</td>
                    <td class="num">{{ row.vat | money }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty muted">ไม่มีรายการในเดือนนี้</td></tr>
                }
              </tbody>
              <tfoot><tr><td colspan="6">รวม</td><td class="num">{{ r.totalBase | money }}</td><td class="num">{{ r.totalVat | money }}</td></tr></tfoot>
            </table>
          }
          @if (wht(); as r) {
            <table class="grid">
              <thead>
                <tr><th class="num">ลำดับ</th><th>เลขผู้เสียภาษี</th><th>ชื่อและที่อยู่ผู้มีเงินได้</th><th>วันที่จ่าย</th><th>ประเภทเงินได้</th><th class="num">อัตรา</th><th class="num">จำนวนเงินที่จ่าย</th><th class="num">ภาษีที่หัก</th><th>50 ทวิ</th></tr>
              </thead>
              <tbody>
                @for (row of r.rows; track row.certificateId; let i = $index) {
                  <tr>
                    <td class="num">{{ i + 1 }}</td>
                    <td class="small">{{ row.payeeTaxId | taxId }}</td>
                    <td>{{ row.payeeName }}<div class="small muted">{{ row.payeeAddress }}</div></td>
                    <td class="small">{{ row.payDate | thDate }}</td>
                    <td class="small">{{ row.incomeType }}</td>
                    <td class="num">{{ row.rate }}%</td>
                    <td class="num">{{ row.amount | money }}</td>
                    <td class="num">{{ row.wht | money }}</td>
                    <td class="small"><a class="no-print-link" [routerLink]="['/print/wht', row.certificateId]" target="_blank">{{ row.certNo }}</a></td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="empty muted">ไม่มีรายการในเดือนนี้</td></tr>
                }
              </tbody>
              <tfoot><tr><td colspan="6">รวม {{ r.rows.length }} ราย</td><td class="num">{{ r.totalAmount | money }}</td><td class="num">{{ r.totalWht | money }}</td><td></td></tr></tfoot>
            </table>
          }
        </div>
        @if (kind() === 'sales' || kind() === 'purchase') {
          <p class="small muted note">
            {{ kind() === 'sales' ? 'ภาษีขายนับจากใบกำกับภาษีที่ออกในเดือน (ใบเสร็จรับเงิน/ใบกำกับภาษีเมื่อรับชำระ และใบแจ้งหนี้/ใบกำกับภาษี) หักด้วยใบลดหนี้' : 'ภาษีซื้อนับจากใบตั้งหนี้ที่เป็นใบกำกับภาษีและเลือกยื่นในเดือนนี้' }}
          </p>
        }
      </section>
    </div>
  `,
  providers: [CompanyHeaderStore],
  styleUrl: '../../shared/doc.scss',
  styles: `
    .month input { height: 36px; font: inherit; border: 1px solid var(--ktt-line); border-radius: 4px; padding: 0 8px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .sheet { margin-top: 14px; }
    .head { padding: 16px; text-align: center; }
    .head h2 { margin: 0 0 4px; }
    .note { padding: 8px 16px 16px; margin: 0; }
    tr.void td { color: var(--ktt-danger); }
    @media print {
      .no-print { display: none !important; }
      .no-print-link { color: inherit; text-decoration: none; }
      .sheet { border: 0; box-shadow: none; }
      .grid { min-width: 0; font-size: 11px; }
      .grid th, .grid td { padding: 4px 6px; }
    }
  `,
})
export class TaxPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly store = inject(CompanyHeaderStore);
  readonly company = computed(() => this.store.header()?.company ?? null);
  readonly thisMonth = todayIso().slice(0, 7);
  readonly kind = signal<Kind>('sales');
  readonly period = signal(this.thisMonth);
  readonly vat = signal<VatReport | null>(null);
  readonly wht = signal<WhtReport | null>(null);
  readonly periodText = computed(() => periodLabel(this.period()));
  readonly title = computed(
    () => ({ sales: 'รายงานภาษีขาย', purchase: 'รายงานภาษีซื้อ', pnd3: 'ใบแนบ ภ.ง.ด.3 (บุคคลธรรมดา)', pnd53: 'ใบแนบ ภ.ง.ด.53 (นิติบุคคล)' })[this.kind()],
  );

  ngOnInit(): void {
    this.store.load();
    this.load();
  }

  shift(n: number): void {
    const [y, m] = this.period().split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    this.period.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    this.load();
  }

  load(): void {
    const k = this.kind();
    const p = this.period();
    if (!p) return;
    if (k === 'sales' || k === 'purchase') {
      this.wht.set(null);
      this.api.vat(k, p).subscribe({ next: (r) => this.vat.set(r), error: (e) => this.notify.error(e) });
    } else {
      this.vat.set(null);
      this.api.wht(k, p).subscribe({ next: (r) => this.wht.set(r), error: (e) => this.notify.error(e) });
    }
  }

  print(): void {
    window.print();
  }

  csv(): void {
    const lines: unknown[][] = [];
    const v = this.vat();
    const w = this.wht();
    if (v) {
      lines.push(['ลำดับ', 'วันที่', 'เลขที่ใบกำกับภาษี', 'ชื่อ', 'เลขผู้เสียภาษี', 'สาขา', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', 'หมายเหตุ']);
      v.rows.forEach((r, i) => lines.push([i + 1, r.date, r.docNo, r.partyName, r.partyTaxId, r.partyBranch ?? '00000', r.base.toFixed(2), r.vat.toFixed(2), r.note]));
      lines.push(['', '', '', 'รวม', '', '', v.totalBase.toFixed(2), v.totalVat.toFixed(2), '']);
    } else if (w) {
      lines.push(['ลำดับ', 'เลขผู้เสียภาษี', 'ชื่อ', 'ที่อยู่', 'วันที่จ่าย', 'ประเภทเงินได้', 'อัตรา', 'จำนวนเงิน', 'ภาษีที่หัก', 'เลขที่ 50 ทวิ']);
      w.rows.forEach((r, i) => lines.push([i + 1, r.payeeTaxId, r.payeeName, r.payeeAddress, r.payDate, r.incomeType, r.rate, r.amount.toFixed(2), r.wht.toFixed(2), r.certNo]));
      lines.push(['', '', 'รวม', '', '', '', '', w.totalAmount.toFixed(2), w.totalWht.toFixed(2), '']);
    } else {
      return;
    }
    const text = '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
    saveBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${this.kind()}-${this.period()}.csv`);
  }
}
