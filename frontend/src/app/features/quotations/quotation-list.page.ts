import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { CanDirective } from '../../shared/can.directive';
import { Notify } from '../../shared/notify.service';
import { NewQuotationDialog } from './new-quotation-dialog';
import { QUOTATION_STATUS, QuotationRow, QuotationsApi } from './quotations.api';

@Component({
  selector: 'app-quotation-list-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, ThDatePipe, MoneyPipe, CanDirective],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>ใบเสนอราคา</h1>
          <p>ฉบับล่าสุดของแต่ละเลขที่ ฉบับที่ถูกแทนด้วย Revision ใหม่ดูได้ในหน้ารายละเอียด</p>
        </div>
        <button *appCan="Perm.QUOTATION_WRITE" mat-flat-button class="btn-primary" (click)="create()"><mat-icon>add</mat-icon> สร้างใบเสนอราคา</button>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาเลขที่ ลูกค้า หรือชื่องาน</mat-label>
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
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>เลขที่</th><th>ลูกค้า / งาน</th><th>วันที่</th><th>หมดอายุ</th><th>สถานะ</th>
                <th class="num">ยอดสุทธิ</th>
                @if (auth.can(Perm.COST_VIEW)) {
                  <th class="num">Margin</th>
                }
                <th>ผู้ออก</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
                  <td class="no"><a [routerLink]="['/quotations', r.id]" (click)="$event.stopPropagation()">{{ r.displayNo }}</a></td>
                  <td>
                    <div>{{ r.customerName }}</div>
                    <div class="muted small">{{ r.title }}</div>
                  </td>
                  <td>{{ r.issueDate | thDate }}</td>
                  <td>{{ r.validUntil | thDate }}</td>
                  <td>
                    <span class="chip" [class]="status_[r.status].tone">{{ status_[r.status].label }}</span>
                    @if (r.discountPct > 0) {
                      <div class="muted small">ส่วนลด {{ r.discountPct }}%</div>
                    }
                  </td>
                  <td class="num">{{ r.totalAmount | money }}</td>
                  @if (auth.can(Perm.COST_VIEW)) {
                    <td class="num">{{ r.marginPct === null ? '–' : r.marginPct + '%' }}</td>
                  }
                  <td>{{ r.createdByName }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty muted">ยังไม่มีใบเสนอราคา</td></tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>
  `,
  styles: `
    .filters { display: flex; gap: 12px; flex-wrap: wrap; padding: 16px; }
    .filters mat-form-field { width: 200px; }
    .filters .search { flex: 1; min-width: 240px; }
    .grid { width: 100%; min-width: 860px; border-collapse: collapse; }
    .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .grid th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; }
    .grid .num { text-align: right; }
    .grid tr.clickable { cursor: pointer; }
    .grid tr.clickable:hover td { background: #f3f6f8; }
    .no { white-space: nowrap; font-weight: 600; }
    .small { font-size: 0.82rem; }
    .empty { text-align: center; padding: 32px; }
  `,
})
export class QuotationListPage implements OnInit {
  private readonly api = inject(QuotationsApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;
  readonly status_ = QUOTATION_STATUS;
  readonly statuses = Object.entries(QUOTATION_STATUS).filter(([k]) => k !== 'superseded');
  readonly rows = signal<QuotationRow[]>([]);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  q = '';
  status = '';
  page = 0;
  size = 20;

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page = 0;
      this.load();
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.list({ q: this.q.trim(), status: this.status, page: this.page, size: this.size }).subscribe({
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

  open(r: QuotationRow): void {
    this.router.navigate(['/quotations', r.id]);
  }

  create(): void {
    this.dialog.open(NewQuotationDialog, { data: {} });
  }
}
