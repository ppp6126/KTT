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
import { ProgressBar } from './progress-bar';
import { ProjectDialog } from './project-dialog';
import { PROJECT_STATUS, ProjectRow, ProjectsApi } from './projects.api';

@Component({
  selector: 'app-project-list-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, ThDatePipe, MoneyPipe, CanDirective, ProgressBar],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>โครงการ</h1>
          <p>ความคืบหน้าจริงเทียบแผน ณ วันนี้ คำนวณจากแผนงานถ่วงน้ำหนัก</p>
        </div>
        <button *appCan="Perm.PROJECT_WRITE" mat-flat-button class="btn-primary" (click)="create()"><mat-icon>add</mat-icon> สร้างโครงการ</button>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหารหัส ชื่อโครงการ หรือลูกค้า</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="status" (selectionChange)="page = 0; load()">
              <mat-option value="open">กำลังดำเนินการ</mat-option>
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
                <th>รหัส</th><th>โครงการ / ลูกค้า</th><th>สถานะ</th><th>ระยะเวลาตามแผน</th>
                <th class="prog">ความคืบหน้า (จริง / แผน)</th>
                @if (auth.can(Perm.CONTRACT_READ)) {
                  <th class="num">มูลค่าสัญญา</th>
                }
                <th>PM</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
                  <td class="no"><a [routerLink]="['/projects', r.id]" (click)="$event.stopPropagation()">{{ r.code }}</a></td>
                  <td>
                    <div class="name">{{ r.name }}</div>
                    <div class="muted small">{{ r.customerName }}</div>
                  </td>
                  <td><span class="chip" [class]="status_[r.status].tone">{{ status_[r.status].label }}</span></td>
                  <td class="small">{{ r.plannedStart | thDate }} – {{ r.plannedEnd | thDate }}</td>
                  <td class="prog"><app-progress-bar [actual]="r.progressPct" [planned]="r.plannedPct" /></td>
                  @if (auth.can(Perm.CONTRACT_READ)) {
                    <td class="num">{{ r.contractAmount === null ? '–' : (r.contractAmount | money) }}</td>
                  }
                  <td>{{ r.managerName || '–' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty muted">ยังไม่มีโครงการ สร้างจากใบเสนอราคาที่ลูกค้าอนุมัติ หรือกด "สร้างโครงการ"</td></tr>
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
    .grid th, .grid td { padding: 10px 12px; border-bottom: 1px solid var(--ktt-line); text-align: left; vertical-align: middle; }
    .grid th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; }
    .grid .num { text-align: right; }
    .grid tr.clickable { cursor: pointer; }
    .grid tr.clickable:hover td { background: #f3f6f8; }
    .prog { width: 220px; }
    .no { white-space: nowrap; font-weight: 600; }
    .name { font-weight: 500; }
    .small { font-size: 0.85rem; }
    .empty { text-align: center; padding: 32px; }
  `,
})
export class ProjectListPage implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;
  readonly status_ = PROJECT_STATUS;
  readonly statuses = Object.entries(PROJECT_STATUS);
  readonly rows = signal<ProjectRow[]>([]);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  q = '';
  status = 'open';
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

  open(r: ProjectRow): void {
    this.router.navigate(['/projects', r.id]);
  }

  create(): void {
    this.dialog
      .open(ProjectDialog, { data: null })
      .afterClosed()
      .subscribe((p) => p && this.router.navigate(['/projects', p.id]));
  }
}
