import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { ThDatePipe, addDaysIso, todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { CustomerPicker } from '../../shared/lookups';
import { DOC_TYPE, FinanceApi, PAY_METHOD, SalesDoc, SalesDocRow } from './finance.api';

const STYLES = `
  .content { width: min(560px, 88vw); }
  .full { display: block; width: 100%; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; row-gap: 10px; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
  .err { color: var(--ktt-danger); margin: 0 0 12px; }
  .sum { margin: 4px 0 12px; padding: 10px 12px; background: #f6f7f6; border-radius: 6px; }
  .sum div { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; font-variant-numeric: tabular-nums; }
  .sum .strong { font-weight: 600; border-top: 1px solid var(--ktt-line); margin-top: 4px; padding-top: 6px; }
  .bad { color: var(--ktt-danger); }
  .muted.small { font-size: 0.85rem; }
`;

// ======================================================================= รับชำระ

@Component({
  selector: 'app-payment-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>รับชำระ {{ d.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="sum">
        <div><span>ยอดรวมภาษี</span><span>{{ d.totalAmount | money }}</span></div>
        <div><span>ชำระแล้ว</span><span>{{ d.settledAmount | money }}</span></div>
        <div class="strong"><span>ค้างชำระ</span><span>{{ d.outstanding | money }}</span></div>
      </div>
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่รับเงิน</mat-label>
          <input matInput type="date" [(ngModel)]="m.paidDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ช่องทาง</mat-label>
          <mat-select [(ngModel)]="m.method">
            @for (p of methods; track p[0]) {
              <mat-option [value]="p[0]">{{ p[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>เงินที่ได้รับจริง (บาท)</mat-label>
          <input matInput type="number" min="0" step="0.01" [ngModel]="m.cashAmount" (ngModelChange)="m.cashAmount = $event; v.set(v() + 1)" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ลูกค้าหัก ณ ที่จ่าย (บาท)</mat-label>
          <input matInput type="number" min="0" step="0.01" [ngModel]="m.whtAmount" (ngModelChange)="m.whtAmount = $event; v.set(v() + 1)" />
          <mat-hint>ต้องได้หนังสือรับรอง 50 ทวิ</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>เงินประกันผลงานที่ลูกค้ากันไว้</mat-label>
          <input matInput type="number" min="0" step="0.01" [ngModel]="m.retentionAmount" (ngModelChange)="m.retentionAmount = $event; v.set(v() + 1)" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เลขอ้างอิง / เลขเช็ค</mat-label>
          <input matInput [(ngModel)]="m.reference" />
        </mat-form-field>
      </div>
      <p>
        ตัดยอดครั้งนี้ <strong [class.bad]="settled() > (d.outstanding ?? 0) + 0.001">{{ settled() | money }}</strong> บาท
        @if (Math.abs(settled() - (d.outstanding ?? 0)) < 0.005) {
          (ชำระครบ)
        }
      </p>
      <p class="muted small">ระบบจะออก{{ d.docType === 'invoice' && d.vatAmount > 0 ? 'ใบเสร็จรับเงิน/ใบกำกับภาษี' : 'ใบเสร็จรับเงิน' }}ให้อัตโนมัติ</p>
      <mat-form-field class="full">
        <mat-label>หมายเหตุ</mat-label>
        <input matInput [(ngModel)]="m.notes" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || settled() <= 0">บันทึกรับชำระ</button>
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class PaymentDialog {
  private readonly api = inject(FinanceApi);
  private readonly ref = inject(MatDialogRef<PaymentDialog, SalesDoc>);
  readonly d = inject<SalesDoc>(MAT_DIALOG_DATA);
  readonly methods = Object.entries(PAY_METHOD);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly v = signal(0);
  readonly Math = Math;

  /** ค่าตั้งต้น: รับชำระเต็มยอดค้าง (ถ้ายังไม่เคยรับ ใช้ยอดหัก ณ ที่จ่าย/เงินประกันตามใบแจ้งหนี้) */
  readonly m = (() => {
    const first = this.d.settledAmount === 0;
    const wht = first ? this.d.whtAmount : 0;
    const ret = first ? this.d.retentionAmount : 0;
    return {
      paidDate: todayIso(),
      method: 'transfer',
      reference: '',
      cashAmount: round2((this.d.outstanding ?? 0) - wht - ret),
      whtAmount: wht,
      retentionAmount: ret,
      notes: '',
    };
  })();

  readonly settled = computed(() => {
    this.v();
    return round2((Number(this.m.cashAmount) || 0) + (Number(this.m.whtAmount) || 0) + (Number(this.m.retentionAmount) || 0));
  });

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .pay(this.d.id, {
        paidDate: this.m.paidDate,
        method: this.m.method,
        reference: this.m.reference || null,
        cashAmount: Number(this.m.cashAmount) || 0,
        whtAmount: Number(this.m.whtAmount) || 0,
        retentionAmount: Number(this.m.retentionAmount) || 0,
        notes: this.m.notes || null,
      })
      .subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

// ======================================================================= ใบวางบิล

@Component({
  selector: 'app-billing-note-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCheckboxModule, MatIconModule, MoneyPipe, ThDatePipe, CustomerPicker],
  template: `
    <h2 mat-dialog-title>ทำใบวางบิล</h2>
    <mat-dialog-content class="content wide">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <app-customer-picker label="ลูกค้า *" [required]="true" [customerId]="customerId()" (customerIdChange)="pick($event)" />
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่วางบิล</mat-label>
          <input matInput type="date" [(ngModel)]="docDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>นัดชำระ</mat-label>
          <input matInput type="date" [(ngModel)]="dueDate" />
        </mat-form-field>
      </div>
      @if (customerId()) {
        <table class="inv">
          <thead><tr><th></th><th>เลขที่</th><th>วันที่</th><th>ครบกำหนด</th><th class="num">ค้างชำระ</th></tr></thead>
          <tbody>
            @for (r of invoices(); track r.id) {
              <tr>
                <td><mat-checkbox [checked]="sel().has(r.id)" (change)="toggle(r.id)" [attr.aria-label]="'เลือก ' + r.docNo" /></td>
                <td>{{ dt[r.docType].short }} {{ r.docNo }}</td>
                <td>{{ r.docDate | thDate }}</td>
                <td [class.bad]="r.overdue">{{ r.dueDate | thDate }}</td>
                <td class="num">{{ r.outstanding | money }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="muted">ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ค้างชำระ</td></tr>
            }
          </tbody>
        </table>
        <p class="num"><strong>รวม {{ selectedTotal() | money }} บาท</strong></p>
      }
      <mat-form-field class="full">
        <mat-label>หมายเหตุ</mat-label>
        <input matInput [(ngModel)]="notes" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !sel().size">สร้างใบวางบิล</button>
    </mat-dialog-actions>
  `,
  styles:
    STYLES +
    `
    .wide { width: min(680px, 92vw); }
    .inv { width: 100%; border-collapse: collapse; }
    .inv th, .inv td { padding: 6px 8px; border-bottom: 1px solid var(--ktt-line); text-align: left; font-size: 0.9rem; }
    .inv th { color: var(--ktt-steel); font-weight: 500; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class BillingNoteDialog {
  private readonly api = inject(FinanceApi);
  private readonly ref = inject(MatDialogRef<BillingNoteDialog, SalesDoc>);
  readonly data = inject<{ customerId: string; invoiceIds: string[] } | null>(MAT_DIALOG_DATA);
  readonly dt = DOC_TYPE;
  readonly customerId = signal<string | null>(this.data?.customerId ?? null);
  readonly invoices = signal<SalesDocRow[]>([]);
  readonly sel = signal(new Set<string>(this.data?.invoiceIds ?? []));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedTotal = computed(() =>
    round2(this.invoices().filter((r) => this.sel().has(r.id)).reduce((s, r) => s + (r.outstanding ?? 0), 0)),
  );
  docDate = todayIso();
  dueDate = addDaysIso(todayIso(), 30);
  notes = '';

  constructor() {
    if (this.customerId()) this.loadInvoices();
  }

  pick(id: string | null): void {
    this.customerId.set(id);
    this.sel.set(new Set());
    if (id) this.loadInvoices();
  }

  private loadInvoices(): void {
    this.api.list({ type: 'invoices', customerId: this.customerId()!, open: true, page: 0, size: 100 }).subscribe((r) => this.invoices.set(r.items));
  }

  toggle(id: string): void {
    this.sel.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .billingNote({ customerId: this.customerId()!, docDate: this.docDate, dueDate: this.dueDate || null, notes: this.notes || null, invoiceIds: [...this.sel()] })
      .subscribe({
        next: (d) => this.ref.close(d),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

// ======================================================================= ใบลดหนี้

@Component({
  selector: 'app-credit-note-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>ออกใบลดหนี้อ้างอิง {{ d.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <p class="muted small">ใช้เมื่อมูลค่าตามใบกำกับภาษีเดิมสูงเกินจริง เช่น ลดราคาภายหลัง งานบางส่วนไม่ได้ทำ (ประมวลรัษฎากร มาตรา 86/10)</p>
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่</mat-label>
          <input matInput type="date" [(ngModel)]="m.docDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>มูลค่าที่ถูกต้อง (ก่อน VAT)</mat-label>
          <input matInput type="number" min="0" step="0.01" [ngModel]="m.correctAmount" (ngModelChange)="m.correctAmount = $event; v.set(v() + 1)" />
        </mat-form-field>
      </div>
      <div class="sum">
        <div><span>มูลค่าตามใบกำกับเดิม</span><span>{{ d.taxableAmount | money }}</span></div>
        <div><span>มูลค่าที่ถูกต้อง</span><span>{{ +m.correctAmount || 0 | money }}</span></div>
        <div><span>ผลต่าง</span><span>{{ diff() | money }}</span></div>
        <div><span>ภาษีมูลค่าเพิ่ม {{ d.vatPct }}%</span><span>{{ vat() | money }}</span></div>
        <div class="strong"><span>รวมลดหนี้</span><span>{{ diff() + vat() | money }}</span></div>
      </div>
      <mat-form-field class="full">
        <mat-label>เหตุผลการลดหนี้</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.reason" required></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.reason.trim() || diff() <= 0">สร้างใบลดหนี้</button>
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class CreditNoteDialog {
  private readonly api = inject(FinanceApi);
  private readonly ref = inject(MatDialogRef<CreditNoteDialog, SalesDoc>);
  readonly d = inject<SalesDoc>(MAT_DIALOG_DATA);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly v = signal(0);
  readonly m = { docDate: todayIso(), correctAmount: this.d.taxableAmount as number | string, reason: '' };
  readonly diff = computed(() => {
    this.v();
    return round2(this.d.taxableAmount - (Number(this.m.correctAmount) || 0));
  });
  readonly vat = computed(() => (this.d.vatEnabled ? round2((this.diff() * this.d.vatPct) / 100) : 0));

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .creditNote({ refDocId: this.d.id, docDate: this.m.docDate, correctAmount: Number(this.m.correctAmount) || 0, reason: this.m.reason.trim(), notes: null })
      .subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}
