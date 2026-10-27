import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ContractsApi, VoRow } from '../contracts/contracts.api';
import { PendingApproval, QuotationsApi } from '../quotations/quotations.api';

/** US-15 ผู้บริหารอนุมัติใบเสนอราคาที่ส่วนลดเกินเกณฑ์ */
@Component({
  selector: 'app-approvals-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>รออนุมัติ</h1>
          <p>ใบเสนอราคาที่ให้ส่วนลดเกินเกณฑ์ และงานเพิ่ม-ลด (VO) ที่ต้องอนุมัติ</p>
        </div>
      </div>
      <div class="list">
        @for (a of items(); track a.approvalId) {
          <article class="panel card">
            <div class="main">
              <a class="no" [routerLink]="['/quotations', a.quotationId]">{{ a.displayNo }}</a>
              <div>{{ a.customerName }}<span class="muted">{{ a.title ? ', ' + a.title : '' }}</span></div>
              <div class="muted small">ขอโดย {{ a.requestedByName }}, {{ a.createdAt | thDate: true }}</div>
            </div>
            <div class="figures">
              <div><span class="label">ส่วนลด</span><b class="discount">{{ a.discountPct }}%</b></div>
              <div><span class="label">ยอดสุทธิ</span><b>{{ a.totalAmount | money }}</b></div>
              <div>
                <span class="label">Margin</span>
                <b [class.low]="a.marginPct !== null && a.marginPct < 10">{{ a.marginPct === null ? '–' : a.marginPct + '%' }}</b>
              </div>
            </div>
            <div class="actions">
              <button mat-flat-button class="btn-primary" (click)="decide(a, true)">อนุมัติ</button>
              <button mat-stroked-button (click)="decide(a, false)">ไม่อนุมัติ</button>
            </div>
          </article>
        }
        @for (v of vos(); track v.id) {
          <article class="panel card">
            <div class="main">
              <a class="no" [routerLink]="['/change-orders', v.id]">{{ v.docNo }}</a>
              <div>งานเพิ่ม-ลด: {{ v.title }}</div>
              <div class="muted small">วันที่ {{ v.issueDate | thDate }}{{ v.daysExtension ? ', ขยายเวลา ' + v.daysExtension + ' วัน' : '' }}</div>
            </div>
            <div class="figures">
              <div><span class="label">มูลค่า (ก่อน VAT)</span><b [class.low]="v.amount < 0">{{ v.amount | money }}</b></div>
            </div>
            <div class="actions">
              <a mat-stroked-button [routerLink]="['/change-orders', v.id]">เปิดดูและอนุมัติ</a>
            </div>
          </article>
        }
        @if (!items().length && !vos().length) {
          <div class="panel empty-state"><p>ไม่มีรายการรออนุมัติ</p></div>
        }
      </div>
    </div>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 12px; }
    .card { display: grid; grid-template-columns: 1fr auto auto; gap: 24px; align-items: center; padding: 16px 20px; }
    @media (max-width: 760px) { .card { grid-template-columns: 1fr; } }
    .no { font-weight: 600; font-size: 1.05rem; }
    .small { font-size: 0.85rem; }
    .figures { display: flex; gap: 24px; }
    .figures div { display: flex; flex-direction: column; text-align: right; }
    .label { font-size: 0.8rem; color: var(--ktt-steel); }
    .discount { color: #9a4b05; }
    .low { color: var(--ktt-danger); }
    .actions { display: flex; gap: 8px; }
  `,
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(QuotationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly contracts = inject(ContractsApi);
  private readonly auth = inject(AuthService);
  readonly items = signal<PendingApproval[]>([]);
  readonly vos = signal<VoRow[]>([]);

  ngOnInit(): void {
    this.load();
    if (this.auth.can(Perm.CONTRACT_APPROVE)) {
      this.contracts.pendingVo().subscribe({ next: (r) => this.vos.set(r), error: (e) => this.notify.error(e) });
    }
  }

  load(): void {
    if (!this.auth.can(Perm.QUOTATION_APPROVE)) return;
    this.api.pending().subscribe({ next: (r) => this.items.set(r), error: (e) => this.notify.error(e) });
  }

  decide(a: PendingApproval, approve: boolean): void {
    prompt(this.dialog, {
      title: approve ? `อนุมัติ ${a.displayNo}` : `ไม่อนุมัติ ${a.displayNo}`,
      label: approve ? 'ความเห็น (ถ้ามี)' : 'เหตุผล',
      confirmText: approve ? 'อนุมัติ' : 'ไม่อนุมัติ',
      required: !approve,
      multiline: true,
    }).subscribe((comment) => {
      if (comment === undefined) return;
      this.api.decide(a.approvalId, approve, comment || null).subscribe({
        next: () => {
          this.notify.ok(approve ? 'อนุมัติแล้ว' : 'ส่งกลับให้แก้ไขแล้ว');
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
