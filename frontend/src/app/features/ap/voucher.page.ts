import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { PAY_METHOD } from './ap-list.page';
import { ApApi, COST_CATEGORY, PV_STATUS, Pv } from './ap.api';

@Component({
  selector: 'app-voucher-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MoneyPipe, ThDatePipe],
  template: `
    @if (pv(); as p) {
      <div class="page wide">
        <a routerLink="/ap" [state]="{ view: 'pv' }" class="back"><mat-icon>arrow_back</mat-icon> เจ้าหนี้</a>
        <div class="page-head">
          <div>
            <h1>{{ p.docNo }} <span class="chip" [class]="st[p.status].tone">{{ st[p.status].label }}</span></h1>
            <p>
              จ่าย {{ p.supplierName }} · บันทึกโดย {{ p.createdByName }}
              @if (p.approvedByName) {
                · อนุมัติโดย {{ p.approvedByName }} {{ p.approvedAt | thDate: true }}
              }
            </p>
          </div>
          <div class="actions">
            <a mat-stroked-button [routerLink]="['/print/pv', p.id]" target="_blank"><mat-icon>print</mat-icon> พิมพ์ใบสำคัญจ่าย</a>
            @if (p.canApprove) {
              <button mat-flat-button class="btn-primary" (click)="approve()"><mat-icon>check</mat-icon> อนุมัติจ่าย</button>
            }
            @if (p.canPay) {
              <button mat-flat-button class="btn-primary" (click)="pay()"><mat-icon>payments</mat-icon> บันทึกจ่ายแล้ว</button>
            }
            @if (p.canVoid) {
              <button mat-stroked-button (click)="voidPv()"><mat-icon>block</mat-icon> ยกเลิก</button>
            }
          </div>
        </div>

        @if (p.status === 'draft' && !p.canApprove) {
          <p class="notice warn">รอผู้มีสิทธิ์อนุมัติ (ผู้สร้างใบสำคัญจ่ายอนุมัติเองไม่ได้)</p>
        }

        <div class="kpis">
          <div class="kpi"><span class="label">ยอดจ่าย</span><strong>{{ p.grossAmount | money }}</strong></div>
          <div class="kpi"><span class="label">หัก ณ ที่จ่าย</span><strong>{{ p.whtAmount | money }}</strong></div>
          <div class="kpi"><span class="label">จ่ายสุทธิ</span><strong>{{ p.netPaid | money }}</strong></div>
        </div>

        <section class="panel panel-pad">
          <div class="facts">
            <div><span class="label">วันที่จ่าย</span>{{ p.payDate | thDate }}</div>
            <div><span class="label">วิธีจ่าย</span>{{ method[p.method] }}{{ p.bankRef ? ' · ' + p.bankRef : '' }}</div>
            <div><span class="label">เลขผู้เสียภาษี</span>{{ p.supplierTaxId || '–' }}</div>
            <div><span class="label">บัญชีผู้รับ</span>{{ p.supplierBank || '–' }}</div>
            @if (p.notes) {
              <div class="wide-cell"><span class="label">หมายเหตุ</span>{{ p.notes }}</div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="sec-head"><h2>รายการที่จ่าย</h2></div>
          <div class="scroll">
            <table class="grid">
              <thead><tr><th>ใบตั้งหนี้</th><th>ใบกำกับผู้ขาย</th><th>วันที่</th><th>ประเภท</th><th class="num">ยอดใบตั้งหนี้</th><th class="num">จ่ายครั้งนี้</th><th class="num">หัก ณ ที่จ่าย</th></tr></thead>
              <tbody>
                @for (l of p.lines; track l.billId) {
                  <tr class="clickable" [routerLink]="['/ap/bills', l.billId]">
                    <td class="no">{{ l.billNo }}</td>
                    <td class="small">{{ l.supplierInvoiceNo || '–' }}</td>
                    <td class="small">{{ l.billDate | thDate }}</td>
                    <td class="small">{{ cat[l.category] }}</td>
                    <td class="num">{{ l.billTotal | money }}</td>
                    <td class="num">{{ l.amount | money }}</td>
                    <td class="num">{{ l.whtAmount | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (p.certificates.length) {
          <section class="panel">
            <div class="sec-head"><h2>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</h2></div>
            <table class="grid">
              <thead><tr><th>เล่มที่/เลขที่</th><th>แบบ</th><th>ประเภทเงินได้</th><th class="num">เงินได้</th><th class="num">อัตรา</th><th class="num">ภาษีที่หัก</th><th></th></tr></thead>
              <tbody>
                @for (c of p.certificates; track c.id) {
                  <tr [class.muted]="c.status === 'void'">
                    <td class="no">{{ c.bookNo }}/{{ c.runNo }}</td>
                    <td>{{ c.form === 'pnd3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53' }}</td>
                    <td class="small">{{ c.incomeType }}</td>
                    <td class="num">{{ c.amount | money }}</td>
                    <td class="num">{{ c.whtRate }}%</td>
                    <td class="num">{{ c.whtAmount | money }}</td>
                    <td>
                      @if (c.status !== 'void') {
                        <a mat-button [routerLink]="['/print/wht', c.id]" target="_blank"><mat-icon>print</mat-icon> พิมพ์</a>
                      } @else {
                        ยกเลิก
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
})
export class VoucherPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly canWrite = inject(AuthService).can(Perm.AP_WRITE);
  readonly id = input.required<string>();
  readonly pv = signal<Pv | null>(null);
  readonly st = PV_STATUS;
  readonly cat = COST_CATEGORY;
  readonly method = PAY_METHOD;

  ngOnInit(): void {
    this.api.voucher(this.id()).subscribe({
      next: (p) => this.pv.set(p),
      error: (e) => {
        this.notify.error(e);
        this.router.navigateByUrl('/ap');
      },
    });
  }

  private done = { next: (p: Pv) => this.pv.set(p), error: (e: unknown) => this.notify.error(e) };

  approve(): void {
    const p = this.pv()!;
    confirmAction(this.dialog, { title: 'อนุมัติจ่าย', message: `อนุมัติจ่าย ${p.supplierName} สุทธิ ${p.netPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`, confirmText: 'อนุมัติ' }).subscribe(
      (ok) => ok && this.api.voucherAction(p.id, 'approve').subscribe(this.done),
    );
  }

  pay(): void {
    const p = this.pv()!;
    prompt(this.dialog, { title: 'บันทึกจ่ายแล้ว', message: `วันที่จ่ายจะใช้เป็นวันที่ในหนังสือรับรอง 50 ทวิ (${p.payDate})`, label: 'เลขที่อ้างอิงการโอน / เลขที่เช็ค', confirmText: 'บันทึกจ่าย' }).subscribe((v) => {
      if (v === undefined) return;
      this.api.voucherAction(p.id, 'pay', { paidDate: p.payDate > todayIso() ? todayIso() : p.payDate, bankRef: v || null }).subscribe({
        next: (r) => {
          this.pv.set(r);
          this.notify.ok(r.certificates.length ? 'บันทึกจ่ายและออกหนังสือรับรอง 50 ทวิ แล้ว' : 'บันทึกจ่ายแล้ว');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  voidPv(): void {
    prompt(this.dialog, { title: 'ยกเลิกใบสำคัญจ่าย', message: 'หนังสือรับรอง 50 ทวิ ที่ออกไปแล้วจะถูกยกเลิกด้วย', label: 'เหตุผล', confirmText: 'ยกเลิกเอกสาร', required: true }).subscribe((v) => {
      if (!v) return;
      this.api.voucherAction(this.pv()!.id, 'void', { reason: v }).subscribe(this.done);
    });
  }
}
