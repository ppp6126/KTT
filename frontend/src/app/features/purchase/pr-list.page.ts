import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { Notify } from '../../shared/notify.service';
import { PO_STATUS, PR_STATUS, PoRow, PrRow, PurchaseApi } from './purchase.api';

/** หน้ารวมจัดซื้อ: ใบขอซื้อ และใบสั่งซื้อ */
@Component({
  selector: 'app-purchase-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>จัดซื้อ</h1>
          <p>ใบขอซื้อ (PR) → เปรียบเทียบราคา → ใบสั่งซื้อ (PO) → รับของเข้าคลังหรือส่งตรงหน้างาน</p>
        </div>
        <div class="actions">
          @if (canRequest) {
            <a mat-stroked-button routerLink="/purchase/requests/new"><mat-icon>add</mat-icon> ใบขอซื้อ</a>
          }
          @if (canWrite) {
            <a mat-flat-button class="btn-primary" routerLink="/purchase/orders/new"><mat-icon>add</mat-icon> ใบสั่งซื้อ</a>
          }
        </div>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [(ngModel)]="view" (change)="page = 0; status = ''; load()" aria-label="เอกสาร" hideSingleSelectionIndicator>
            <mat-button-toggle value="pr">ใบขอซื้อ</mat-button-toggle>
            @if (canReadPo) {
              <mat-button-toggle value="po">ใบสั่งซื้อ</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาเลขที่ {{ view === 'po' ? 'หรือผู้ขาย' : 'หรือรายการ' }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="status" (selectionChange)="page = 0; load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @if (view === 'po') {
                <mat-option value="open">รอรับของ</mat-option>
              }
              @for (s of (view === 'pr' ? prStatuses : poStatuses); track s[0]) {
                <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="table-scroll">
          @if (view === 'pr') {
            <table class="grid">
              <thead><tr><th>เลขที่</th><th>โครงการ</th><th>วันที่ขอ</th><th>ต้องการใช้</th><th class="num">รายการ</th><th class="num">ประมาณการ</th><th>สถานะ</th><th>PO</th><th>ผู้ขอ</th></tr></thead>
              <tbody>
                @for (r of prs(); track r.id) {
                  <tr class="clickable" (click)="router.navigate(['/purchase/requests', r.id])" tabindex="0" (keydown.enter)="router.navigate(['/purchase/requests', r.id])">
                    <td class="no">{{ r.docNo }}</td>
                    <td>{{ r.projectCode ? r.projectCode + ' ' + r.projectName : 'สต็อกคลัง' }}</td>
                    <td class="small">{{ r.requestDate | thDate }}</td>
                    <td class="small">{{ r.requiredDate | thDate }}</td>
                    <td class="num">{{ r.itemCount }}</td>
                    <td class="num">{{ r.estTotal ? (r.estTotal | money) : '–' }}</td>
                    <td><span class="chip" [class]="prs_[r.status].tone">{{ prs_[r.status].label }}</span></td>
                    <td class="small">{{ r.poNo || '' }}</td>
                    <td class="small">{{ r.createdByName }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="empty muted">ยังไม่มีใบขอซื้อ</td></tr>
                }
              </tbody>
            </table>
          } @else {
            <table class="grid">
              <thead><tr><th>เลขที่</th><th>ผู้ขาย</th><th>โครงการ</th><th>วันที่สั่ง</th><th>กำหนดส่ง</th><th>สถานะ</th><th class="num">รับแล้ว</th><th class="num">ยอดรวม</th></tr></thead>
              <tbody>
                @for (r of pos(); track r.id) {
                  <tr class="clickable" (click)="router.navigate(['/purchase/orders', r.id])" tabindex="0" (keydown.enter)="router.navigate(['/purchase/orders', r.id])">
                    <td class="no">{{ r.docNo }}</td>
                    <td>{{ r.supplierName }}</td>
                    <td class="small">{{ r.projectCode || 'คลัง' }}</td>
                    <td class="small">{{ r.orderDate | thDate }}</td>
                    <td class="small">{{ r.deliveryDate | thDate }}</td>
                    <td><span class="chip" [class]="pos_[r.status].tone">{{ pos_[r.status].label }}</span></td>
                    <td class="num">{{ r.receivedPct }}%</td>
                    <td class="num">{{ r.totalAmount | money }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty muted">ยังไม่มีใบสั่งซื้อ</td></tr>
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
export class PurchasePage implements OnInit {
  private readonly api = inject(PurchaseApi);
  private readonly notify = inject(Notify);
  readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canRequest = this.auth.can(Perm.PURCHASE_REQUEST) || this.auth.can(Perm.PURCHASE_WRITE);
  readonly canWrite = this.auth.can(Perm.PURCHASE_WRITE);
  readonly canReadPo = this.auth.can(Perm.PURCHASE_READ);
  readonly prs_ = PR_STATUS;
  readonly pos_ = PO_STATUS;
  readonly prStatuses = Object.entries(PR_STATUS);
  readonly poStatuses = Object.entries(PO_STATUS);
  readonly prs = signal<PrRow[]>([]);
  readonly pos = signal<PoRow[]>([]);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  view: 'pr' | 'po' = 'pr';
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
    if (this.canReadPo && history.state?.view === 'po') this.view = 'po';
    this.load();
  }

  load(): void {
    const f = { q: this.q.trim(), status: this.status, page: this.page, size: this.size };
    if (this.view === 'pr') {
      this.api.prs(f).subscribe({ next: (r) => (this.prs.set(r.items), this.total.set(r.total)), error: (e) => this.notify.error(e) });
    } else {
      this.api.pos(f).subscribe({ next: (r) => (this.pos.set(r.items), this.total.set(r.total)), error: (e) => this.notify.error(e) });
    }
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }
}
