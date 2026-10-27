import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { CONTRACT_STATUS, ContractRow, ContractsApi } from './contracts.api';

@Component({
  selector: 'app-contract-list-page',
  imports: [FormsModule, RouterLink, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>สัญญา</h1>
          <p>สร้างสัญญาจากใบเสนอราคาที่ลูกค้าอนุมัติ (ปุ่ม "สร้างโครงการและสัญญา" ในหน้าใบเสนอราคา) มูลค่าแสดงแบบก่อน VAT</p>
        </div>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาเลขที่ ผู้ว่าจ้าง หรือชื่องาน</mat-label>
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
              <tr><th>เลขที่</th><th>โครงการ / ผู้ว่าจ้าง</th><th>วันที่</th><th>สิ้นสุด</th><th>สถานะ</th><th class="num">มูลค่าปรับปรุง</th><th class="num">วางบิล</th><th class="num">รับแล้ว</th></tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="router.navigate(['/contracts', r.id])" tabindex="0" (keydown.enter)="router.navigate(['/contracts', r.id])">
                  <td class="no"><a [routerLink]="['/contracts', r.id]" (click)="$event.stopPropagation()">{{ r.docNo }}</a></td>
                  <td>
                    <div>{{ r.projectCode }} {{ r.projectName }}</div>
                    <div class="muted small">{{ r.customerName }}</div>
                  </td>
                  <td class="small">{{ r.contractDate | thDate }}</td>
                  <td class="small">{{ r.endDate | thDate }}</td>
                  <td><span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span></td>
                  <td class="num">{{ r.revisedAmount | money }}</td>
                  <td class="num">{{ r.billed | money }}</td>
                  <td class="num">{{ r.received | money }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty muted">ยังไม่มีสัญญา</td></tr>
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
    .grid { width: 100%; min-width: 900px; border-collapse: collapse; }
    .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .grid th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; }
    .grid .num { text-align: right; }
    .grid tr.clickable { cursor: pointer; }
    .grid tr.clickable:hover td { background: #f3f6f8; }
    .no { white-space: nowrap; font-weight: 600; }
    .small { font-size: 0.85rem; }
    .empty { text-align: center; padding: 32px; }
  `,
})
export class ContractListPage implements OnInit {
  private readonly api = inject(ContractsApi);
  private readonly notify = inject(Notify);
  readonly router = inject(Router);
  readonly st = CONTRACT_STATUS;
  readonly statuses = Object.entries(CONTRACT_STATUS);
  readonly rows = signal<ContractRow[]>([]);
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
}
