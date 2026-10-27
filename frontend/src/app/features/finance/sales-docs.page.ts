import { Component, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { BillingNoteDialog } from './finance-dialogs';
import { DOC_STATUS, DOC_TYPE, FinanceApi, SalesDocRow } from './finance.api';

const VIEWS: Record<string, { label: string; type: string }> = {
  invoices: { label: 'ใบแจ้งหนี้', type: 'invoices' },
  billing_note: { label: 'ใบวางบิล', type: 'billing_note' },
  receipts: { label: 'ใบเสร็จ', type: 'receipts' },
  credit_note: { label: 'ใบลดหนี้', type: 'credit_note' },
  all: { label: 'ทั้งหมด', type: '' },
};

@Component({
  selector: 'app-sales-docs-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatPaginatorModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>เอกสารการเงิน</h1>
          <p>ใบแจ้งหนี้ ใบวางบิล ใบเสร็จ ใบกำกับภาษี และใบลดหนี้ เลขที่ออกเมื่อกด "ออกเอกสาร" เรียงต่อเนื่องตามเดือน</p>
        </div>
        @if (auth.can(Perm.FINANCE_WRITE)) {
          <div class="actions">
            <button mat-stroked-button (click)="billingNote()"><mat-icon>summarize</mat-icon> ทำใบวางบิล</button>
            <a mat-flat-button class="btn-primary" routerLink="/finance/docs/new"><mat-icon>add</mat-icon> ใบแจ้งหนี้</a>
          </div>
        }
      </div>
      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [(ngModel)]="view" (change)="page = 0; load()" aria-label="ประเภทเอกสาร" hideSingleSelectionIndicator>
            @for (v of views; track v[0]) {
              <mat-button-toggle [value]="v[0]">{{ v[1].label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาเลขที่ หรือลูกค้า</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="status" (selectionChange)="page = 0; load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @for (s of statuses; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (view === 'invoices') {
            <mat-checkbox [(ngModel)]="openOnly" (change)="page = 0; load()">เฉพาะค้างชำระ</mat-checkbox>
          }
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>เอกสาร</th><th>เลขที่</th><th>วันที่</th><th>ครบกำหนด</th><th>ลูกค้า</th><th>โครงการ</th><th>สถานะ</th>
                <th class="num">ยอดรวม</th><th class="num">ยอดสุทธิ</th><th class="num">ค้างชำระ</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
                  <td class="small">{{ dt[r.docType].short }}</td>
                  <td class="no"><a [routerLink]="['/finance/docs', r.id]" (click)="$event.stopPropagation()">{{ r.docNo }}</a></td>
                  <td class="small">{{ r.docDate | thDate }}</td>
                  <td class="small" [class.late]="r.overdue">{{ r.dueDate | thDate }}</td>
                  <td>{{ r.customerName }}</td>
                  <td class="small">{{ r.projectCode || '–' }}</td>
                  <td><span class="chip" [class]="ds[r.status].tone">{{ ds[r.status].label }}</span></td>
                  <td class="num">{{ r.totalAmount | money }}</td>
                  <td class="num">{{ r.netAmount | money }}</td>
                  <td class="num" [class.late]="r.overdue">{{ r.outstanding === null ? '' : (r.outstanding | money) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty muted">ไม่มีเอกสาร</td></tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>
  `,
  styles: `
    .wide { max-width: 1320px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; padding: 16px; align-items: center; }
    .filters mat-form-field { width: 180px; }
    .filters .search { flex: 1; min-width: 220px; }
    .grid { width: 100%; min-width: 1040px; border-collapse: collapse; }
    .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .grid th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; white-space: nowrap; }
    .grid .num { text-align: right; }
    .grid tr.clickable { cursor: pointer; }
    .grid tr.clickable:hover td { background: #f3f6f8; }
    .no { white-space: nowrap; font-weight: 600; }
    .small { font-size: 0.85rem; }
    .late { color: var(--ktt-danger); }
    .empty { text-align: center; padding: 32px; }
  `,
})
export class SalesDocsPage implements OnInit {
  private readonly api = inject(FinanceApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;
  readonly views = Object.entries(VIEWS);
  readonly dt = DOC_TYPE;
  readonly ds = DOC_STATUS;
  readonly statuses = Object.entries(DOC_STATUS);
  readonly rows = signal<SalesDocRow[]>([]);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  /** ?view= */
  readonly initialView = input<string>('', { alias: 'view' });
  view = 'invoices';
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
    if (this.initialView() && VIEWS[this.initialView()]) this.view = this.initialView();
    this.load();
  }

  load(): void {
    this.api
      .list({ type: VIEWS[this.view].type, status: this.status, q: this.q.trim(), open: this.view === 'invoices' && this.openOnly, page: this.page, size: this.size })
      .subscribe({
        next: (r) => {
          this.rows.set(r.items);
          this.total.set(r.total);
        },
        error: (e) => this.notify.error(e),
      });
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  open(r: SalesDocRow): void {
    this.router.navigate(['/finance/docs', r.id]);
  }

  billingNote(): void {
    this.dialog
      .open(BillingNoteDialog, { data: null, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((d) => d && this.router.navigate(['/finance/docs', d.id]));
  }
}
