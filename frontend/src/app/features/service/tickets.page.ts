import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { TicketDialog } from './service-dialogs';
import { ServiceApi, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, TicketRow, TicketStats } from './service.api';

@Component({
  selector: 'app-tickets-page',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule, MatInputModule, MatPaginatorModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>งานแจ้งซ่อม</h1>
          <p>รับแจ้งจากลูกค้า ตรวจระยะรับประกันอัตโนมัติ นัดช่าง บันทึกซ่อมเสร็จพร้อมรูปก่อน/หลัง แล้วโทรสอบถามความพึงพอใจ</p>
        </div>
        @if (canWrite) {
          <button mat-flat-button class="btn-primary" (click)="create()"><mat-icon>add</mat-icon> รับแจ้งซ่อม</button>
        }
      </div>

      @if (stats(); as s) {
        <div class="kpis">
          <div class="kpi"><span class="label">รอดำเนินการ</span><strong>{{ s.open + s.scheduled + s.inProgress }}</strong><span class="sub">รับแจ้ง {{ s.open }} · นัดแล้ว {{ s.scheduled }} · กำลังซ่อม {{ s.inProgress }}</span></div>
          <div class="kpi"><span class="label">งานด่วน</span><strong [class.bad]="s.urgent">{{ s.urgent }}</strong></div>
          <div class="kpi"><span class="label">เลยวันนัดแล้วยังไม่เข้า</span><strong [class.bad]="s.overdueAppointments">{{ s.overdueAppointments }}</strong></div>
          <div class="kpi"><span class="label">เวลาซ่อมเฉลี่ย (6 เดือน)</span><strong>{{ s.avgResolveDays === null ? '–' : s.avgResolveDays + ' วัน' }}</strong></div>
          <div class="kpi"><span class="label">ค่าซ่อมในประกันปีนี้</span><strong>{{ s.warrantyCostYtd | money }}</strong></div>
        </div>
      }

      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [(ngModel)]="status" (change)="page = 0; load()" hideSingleSelectionIndicator aria-label="สถานะ">
            <mat-button-toggle value="active">ยังไม่เสร็จ</mat-button-toggle>
            <mat-button-toggle value="resolved">รอยืนยัน</mat-button-toggle>
            <mat-button-toggle value="closed">ปิดแล้ว</mat-button-toggle>
            <mat-button-toggle value="">ทั้งหมด</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาเลขที่ เรื่อง ลูกค้า หรือผู้แจ้ง</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead><tr><th>เลขที่</th><th>เรื่อง</th><th>ลูกค้า / โครงการ</th><th>แจ้งเมื่อ</th><th class="num">อายุงาน</th><th>ประกัน</th><th>ความเร่งด่วน</th><th>นัด / ช่าง</th><th>สถานะ</th></tr></thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr class="clickable" (click)="open(t)" tabindex="0" (keydown.enter)="open(t)">
                  <td class="no">{{ t.docNo }}</td>
                  <td>{{ t.title }}<div class="small muted">{{ cat[t.category] }}</div></td>
                  <td class="small">{{ t.customerName }}<div class="muted">{{ t.projectCode || 'ไม่ระบุโครงการ' }}</div></td>
                  <td class="small">{{ t.reportedAt | thDate }}</td>
                  <td class="num" [class.bad]="t.ageDays > 7 && active(t.status)">{{ t.ageDays }} วัน</td>
                  <td><span class="chip" [class]="t.inWarranty ? 'ok' : ''">{{ t.inWarranty ? 'ในประกัน' : 'นอกประกัน' }}</span></td>
                  <td><span class="chip" [class]="pri[t.priority].tone">{{ pri[t.priority].label }}</span></td>
                  <td class="small">{{ t.appointmentAt ? (t.appointmentAt | thDate: true) : '–' }}<div class="muted">{{ t.assigneeName }}</div></td>
                  <td><span class="chip" [class]="st[t.status].tone">{{ st[t.status].label }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="empty muted">ไม่มีงานแจ้งซ่อม</td></tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `.kpi .sub { color: var(--ktt-steel); font-size: 0.78rem; }`,
})
export class TicketsPage implements OnInit {
  private readonly api = inject(ServiceApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly canWrite = inject(AuthService).can(Perm.SERVICE_WRITE);
  readonly st = TICKET_STATUS;
  readonly pri = TICKET_PRIORITY;
  readonly cat = TICKET_CATEGORY;
  readonly rows = signal<TicketRow[]>([]);
  readonly stats = signal<TicketStats | null>(null);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  status = 'active';
  q = '';
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
    this.api.stats().subscribe((s) => this.stats.set(s));
  }

  active(s: string): boolean {
    return s === 'open' || s === 'scheduled' || s === 'in_progress';
  }

  load(): void {
    this.api.tickets({ status: this.status, q: this.q.trim(), page: this.page, size: this.size }).subscribe({
      next: (r) => (this.rows.set(r.items), this.total.set(r.total)),
      error: (e) => this.notify.error(e),
    });
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  open(t: TicketRow): void {
    this.router.navigate(['/service/tickets', t.id]);
  }

  create(): void {
    this.dialog
      .open(TicketDialog, { data: null, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((t) => {
        if (!t) return;
        this.notify.ok(`รับแจ้ง ${t.docNo} แล้ว (${t.inWarranty ? 'อยู่ในระยะรับประกัน' : 'นอกระยะรับประกัน'})`);
        this.router.navigate(['/service/tickets', t.id]);
      });
  }
}
