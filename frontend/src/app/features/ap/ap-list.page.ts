import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { PurchaseApi } from '../purchase/purchase.api';
import { ApApi, BILL_STATUS, BillRow, COST_CATEGORY, PV_STATUS, Pv, PvRow } from './ap.api';

export const PAY_METHOD: Record<string, string> = { transfer: 'โอนเงิน', cheque: 'เช็ค', cash: 'เงินสด' };

// ======================================================================= สร้างใบสำคัญจ่าย

@Component({
  selector: 'app-pv-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MoneyPipe, ThDatePipe],
  template: `
    <h2 mat-dialog-title>ทำจ่ายเจ้าหนี้</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field class="span">
          <mat-label>ผู้ขาย / ผู้รับเหมาช่วง</mat-label>
          <mat-select [(ngModel)]="supplierId" (selectionChange)="loadBills()">
            @for (s of suppliers(); track s.id) {
              <mat-option [value]="s.id">{{ s.code }} {{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่จ่าย</mat-label>
          <input matInput type="date" [(ngModel)]="payDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วิธีจ่าย</mat-label>
          <mat-select [(ngModel)]="method">
            @for (m of methods; track m[0]) {
              <mat-option [value]="m[0]">{{ m[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (supplierId) {
        <table class="t">
          <thead><tr><th></th><th>ใบตั้งหนี้</th><th>วันที่</th><th>ครบกำหนด</th><th class="num">คงค้าง</th><th class="num">จ่ายครั้งนี้</th></tr></thead>
          <tbody>
            @for (b of bills(); track b.id) {
              <tr>
                <td><mat-checkbox [(ngModel)]="sel[b.id]" (change)="amt[b.id] = sel[b.id] ? round(b.outstanding!) : 0; touch()" [aria-label]="b.docNo" /></td>
                <td>{{ b.docNo }} <span class="muted small">{{ b.supplierInvoiceNo }}</span></td>
                <td class="small">{{ b.billDate | thDate }}</td>
                <td class="small" [class.bad]="b.overdue">{{ b.dueDate | thDate }}</td>
                <td class="num">{{ b.outstanding | money }}</td>
                <td class="num"><input type="number" min="0" [max]="b.outstanding!" [(ngModel)]="amt[b.id]" (ngModelChange)="sel[b.id] = amt[b.id] > 0; touch()" [disabled]="!sel[b.id]" aria-label="ยอดจ่าย" /></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">ไม่มีใบตั้งหนี้ที่อนุมัติแล้วรอจ่าย</td></tr>
            }
          </tbody>
          <tfoot><tr><td colspan="5">ยอดจ่ายรวม (ก่อนหัก ณ ที่จ่าย)</td><td class="num">{{ total() | money }}</td></tr></tfoot>
        </table>
        <p class="muted small">ภาษีหัก ณ ที่จ่ายคำนวณตามอัตราในใบตั้งหนี้แต่ละใบ และออกหนังสือรับรอง 50 ทวิ ให้เมื่อบันทึกจ่าย</p>
      }
      <mat-form-field class="full"><mat-label>หมายเหตุ</mat-label><input matInput [(ngModel)]="notes" /></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !(total() > 0)">สร้างใบสำคัญจ่าย</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(720px, 92vw); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    .span { grid-column: 1 / -1; }
    .full { width: 100%; margin-top: 12px; }
    .err { color: var(--ktt-danger); }
    .bad { color: var(--ktt-danger); }
    .small { font-size: 0.85rem; }
    .t { width: 100%; border-collapse: collapse; }
    .t th, .t td { padding: 4px 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .t th { color: var(--ktt-steel); font-weight: 500; }
    .t tfoot td { font-weight: 600; padding: 8px 6px; }
    .t input { width: 120px; height: 30px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class PvDialog implements OnInit {
  private readonly api = inject(ApApi);
  private readonly ref = inject(MatDialogRef<PvDialog, Pv>);
  readonly data = inject<{ supplierId?: string; billId?: string } | null>(MAT_DIALOG_DATA);
  readonly suppliers = toSignal(inject(PurchaseApi).supplierOptions(), { initialValue: [] });
  readonly methods = Object.entries(PAY_METHOD);
  readonly bills = signal<BillRow[]>([]);
  readonly version = signal(0);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  supplierId = this.data?.supplierId ?? '';
  payDate = todayIso();
  method = 'transfer';
  notes = '';
  sel: Record<string, boolean> = {};
  amt: Record<string, number> = {};

  readonly total = computed(() => {
    this.version();
    return round2(this.bills().reduce((s, b) => s + (this.sel[b.id] ? Number(this.amt[b.id]) || 0 : 0), 0));
  });

  ngOnInit(): void {
    if (this.supplierId) this.loadBills();
  }

  round(n: number): number {
    return round2(n);
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  loadBills(): void {
    this.sel = {};
    this.amt = {};
    this.api.bills({ supplierId: this.supplierId, open: true, page: 0, size: 200 }).subscribe((r) => {
      const open = r.items.filter((b) => b.status === 'approved' || b.status === 'partial');
      for (const b of open) {
        const pick = !this.data?.billId || this.data.billId === b.id;
        this.sel[b.id] = pick;
        this.amt[b.id] = pick ? round2(b.outstanding ?? 0) : 0;
      }
      this.bills.set(open);
      this.touch();
    });
  }

  save(): void {
    const lines = this.bills()
      .filter((b) => this.sel[b.id] && Number(this.amt[b.id]) > 0)
      .map((b) => ({ billId: b.id, amount: Number(this.amt[b.id]) }));
    this.busy.set(true);
    this.api.createVoucher({ supplierId: this.supplierId, payDate: this.payDate, method: this.method, bankRef: null, notes: this.notes || null, lines }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= หน้ารวมเจ้าหนี้

@Component({
  selector: 'app-ap-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatPaginatorModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>เจ้าหนี้</h1>
          <p>ตั้งหนี้จากใบสั่งซื้อ งวดผู้รับเหมาช่วง หรือค่าใช้จ่ายอื่น → อนุมัติ → ทำจ่ายพร้อมออก 50 ทวิ</p>
        </div>
        @if (canWrite) {
          <div class="actions">
            <a mat-stroked-button routerLink="/ap/bills/new"><mat-icon>add</mat-icon> ตั้งหนี้</a>
            <button mat-flat-button class="btn-primary" (click)="pay()"><mat-icon>payments</mat-icon> ทำจ่าย</button>
          </div>
        }
      </div>
      <div class="kpis">
        <div class="kpi"><span class="label">ค้างจ่ายทั้งหมด</span><strong>{{ outstanding() | money }}</strong></div>
        <div class="kpi"><span class="label">เกินกำหนด</span><strong class="bad">{{ overdue() | money }}</strong></div>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [(ngModel)]="view" (change)="page = 0; status = ''; load()" aria-label="เอกสาร" hideSingleSelectionIndicator>
            <mat-button-toggle value="bill">ใบตั้งหนี้</mat-button-toggle>
            <mat-button-toggle value="pv">ใบสำคัญจ่าย</mat-button-toggle>
          </mat-button-toggle-group>
          @if (view === 'bill') {
            <mat-form-field class="search" subscriptSizing="dynamic">
              <mat-label>ค้นหาเลขที่ เลขใบกำกับ หรือผู้ขาย</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
            </mat-form-field>
          }
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="status" (selectionChange)="page = 0; load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @for (s of (view === 'bill' ? billStatuses : pvStatuses); track s[0]) {
                <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (view === 'bill') {
            <mat-checkbox [(ngModel)]="openOnly" (change)="page = 0; load()">เฉพาะค้างจ่าย</mat-checkbox>
          }
        </div>
        <div class="table-scroll">
          @if (view === 'bill') {
            <table class="grid">
              <thead><tr><th>เลขที่</th><th>ผู้ขาย</th><th>ใบกำกับ</th><th>ประเภท</th><th>โครงการ</th><th>วันที่</th><th>ครบกำหนด</th><th class="num">ยอดรวม</th><th class="num">คงค้าง</th><th>สถานะ</th></tr></thead>
              <tbody>
                @for (b of bills(); track b.id) {
                  <tr class="clickable" (click)="router.navigate(['/ap/bills', b.id])" tabindex="0" (keydown.enter)="router.navigate(['/ap/bills', b.id])">
                    <td class="no">{{ b.docNo }}</td>
                    <td>{{ b.supplierName }}</td>
                    <td class="small">{{ b.supplierInvoiceNo || '–' }}</td>
                    <td class="small">{{ cat[b.category] }}</td>
                    <td class="small">{{ b.projectCode || '–' }}</td>
                    <td class="small">{{ b.billDate | thDate }}</td>
                    <td class="small" [class.bad]="b.overdue">{{ b.dueDate | thDate }}</td>
                    <td class="num">{{ b.totalAmount | money }}</td>
                    <td class="num">{{ b.outstanding === null ? '–' : (b.outstanding | money) }}</td>
                    <td><span class="chip" [class]="bst[b.status].tone">{{ bst[b.status].label }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="10" class="empty muted">ไม่มีใบตั้งหนี้</td></tr>
                }
              </tbody>
            </table>
          } @else {
            <table class="grid">
              <thead><tr><th>เลขที่</th><th>ผู้รับเงิน</th><th>วันที่จ่าย</th><th>วิธีจ่าย</th><th class="num">ยอดจ่าย</th><th class="num">หัก ณ ที่จ่าย</th><th class="num">จ่ายสุทธิ</th><th>สถานะ</th></tr></thead>
              <tbody>
                @for (p of pvs(); track p.id) {
                  <tr class="clickable" (click)="router.navigate(['/ap/vouchers', p.id])" tabindex="0" (keydown.enter)="router.navigate(['/ap/vouchers', p.id])">
                    <td class="no">{{ p.docNo }}</td>
                    <td>{{ p.supplierName }}</td>
                    <td class="small">{{ p.payDate | thDate }}</td>
                    <td class="small">{{ methodLabel[p.method] }}</td>
                    <td class="num">{{ p.grossAmount | money }}</td>
                    <td class="num">{{ p.whtAmount | money }}</td>
                    <td class="num">{{ p.netPaid | money }}</td>
                    <td><span class="chip" [class]="pst[p.status].tone">{{ pst[p.status].label }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty muted">ยังไม่มีใบสำคัญจ่าย</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
})
export class ApPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  readonly router = inject(Router);
  readonly canWrite = inject(AuthService).can(Perm.AP_WRITE);
  readonly bst = BILL_STATUS;
  readonly pst = PV_STATUS;
  readonly cat = COST_CATEGORY;
  readonly methodLabel = PAY_METHOD;
  readonly billStatuses = Object.entries(BILL_STATUS);
  readonly pvStatuses = Object.entries(PV_STATUS);
  readonly bills = signal<BillRow[]>([]);
  readonly pvs = signal<PvRow[]>([]);
  readonly total = signal(0);
  readonly outstanding = signal(0);
  readonly overdue = signal(0);
  readonly search$ = new Subject<void>();
  view: 'bill' | 'pv' = 'bill';
  q = '';
  status = '';
  openOnly = false;
  page = 0;
  size = 20;

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page = 0;
      this.load();
    });
  }

  ngOnInit(): void {
    if (history.state?.view === 'pv') this.view = 'pv';
    this.load();
    this.loadKpis();
  }

  loadKpis(): void {
    this.api.bills({ open: true, page: 0, size: 200 }).subscribe((r) => {
      const open = r.items.filter((b) => b.outstanding);
      this.outstanding.set(round2(open.reduce((s, b) => s + (b.outstanding ?? 0), 0)));
      this.overdue.set(round2(open.filter((b) => b.overdue).reduce((s, b) => s + (b.outstanding ?? 0), 0)));
    });
  }

  load(): void {
    if (this.view === 'bill') {
      this.api.bills({ q: this.q.trim(), status: this.status, open: this.openOnly, page: this.page, size: this.size }).subscribe({
        next: (r) => (this.bills.set(r.items), this.total.set(r.total)),
        error: (e) => this.notify.error(e),
      });
    } else {
      this.api.vouchers({ status: this.status, page: this.page, size: this.size }).subscribe({
        next: (r) => (this.pvs.set(r.items), this.total.set(r.total)),
        error: (e) => this.notify.error(e),
      });
    }
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  pay(): void {
    this.dialog
      .open(PvDialog, { maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.router.navigate(['/ap/vouchers', r.id]));
  }
}
