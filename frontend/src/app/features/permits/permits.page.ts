import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, addDaysIso, todayIso } from '../../core/util/format';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Lookups } from '../../shared/lookups';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { PERMIT_KIND, PERMIT_STATE, Permit, PermitSave, PermitsApi } from './permits.api';

// ======================================================================= ฟอร์ม

@Component({
  selector: 'app-permit-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ p ? 'แก้ไขเอกสาร' : 'เพิ่มใบอนุญาต / เอกสาร' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid2">
        <mat-form-field>
          <mat-label>ประเภท</mat-label>
          <mat-select [(ngModel)]="m.kind">
            @for (k of kinds; track k[0]) {
              <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ของโครงการ</mat-label>
          <mat-select [(ngModel)]="m.projectId">
            <mat-option [value]="null">– เอกสารของบริษัท –</mat-option>
            @for (pr of projects(); track pr.id) {
              <mat-option [value]="pr.id">{{ pr.code }} {{ pr.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>ชื่อเอกสาร</mat-label>
          <input matInput [(ngModel)]="m.name" required placeholder="เช่น ใบอนุญาตก่อสร้าง อ.1, ประกันภัยงานก่อสร้าง (CAR)" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เลขที่</mat-label>
          <input matInput [(ngModel)]="m.number" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ผู้ออก / หน่วยงาน</mat-label>
          <input matInput [(ngModel)]="m.issuer" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่ออก</mat-label>
          <input matInput type="date" [(ngModel)]="m.issueDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันหมดอายุ</mat-label>
          <input matInput type="date" [(ngModel)]="m.expiryDate" />
          <mat-hint>เว้นว่างถ้าไม่มีวันหมดอายุ</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>แจ้งเตือนล่วงหน้า (วัน)</mat-label>
          <input matInput type="number" min="0" max="365" [(ngModel)]="m.notifyDays" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ผู้รับผิดชอบต่ออายุ</mat-label>
          <mat-select [(ngModel)]="m.ownerId">
            <mat-option [value]="null">– ทุกคนที่ดูแลใบอนุญาต –</mat-option>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" [(ngModel)]="m.notes"></textarea>
        </mat-form-field>
      </div>
      @if (p) {
        <h3>สำเนาเอกสาร</h3>
        <app-attachment-panel ownerType="permit" [ownerId]="p.id" [canWrite]="true" defaultCategory="permit" />
      } @else {
        <p class="muted small">แนบสำเนาเอกสารได้หลังบันทึก</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ปิด</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.name">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(640px, 90vw); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; row-gap: 4px; }
    .span { grid-column: 1 / -1; }
    @media (max-width: 600px) { .grid2 { grid-template-columns: 1fr; } }
    .err { color: var(--ktt-danger); }
    h3 { margin: 12px 0 6px; font-size: 1rem; }
  `,
})
export class PermitDialog {
  private readonly api = inject(PermitsApi);
  private readonly ref = inject(MatDialogRef<PermitDialog, Permit>);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly users = toSignal(inject(Lookups).users(), { initialValue: [] });
  readonly p = inject<Permit | null>(MAT_DIALOG_DATA);
  readonly kinds = Object.entries(PERMIT_KIND);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m: PermitSave = {
    kind: this.p?.kind ?? 'building_permit',
    name: this.p?.name ?? '',
    number: this.p?.number ?? null,
    issuer: this.p?.issuer ?? null,
    projectId: this.p?.projectId ?? null,
    issueDate: this.p?.issueDate ?? null,
    expiryDate: this.p?.expiryDate ?? null,
    notifyDays: this.p?.notifyDays ?? 30,
    ownerId: this.p?.ownerId ?? null,
    notes: this.p?.notes ?? null,
  };

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .save(this.p?.id ?? null, { ...this.m, issueDate: this.m.issueDate || null, expiryDate: this.m.expiryDate || null, notifyDays: Number(this.m.notifyDays) || 0 })
      .subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

@Component({
  selector: 'app-renew-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, ThDatePipe],
  template: `
    <h2 mat-dialog-title>ต่ออายุ {{ p.name }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <p class="muted">ฉบับเดิมหมดอายุ {{ p.expiryDate | thDate }} ระบบเก็บฉบับเดิมไว้เป็นประวัติ แล้วสร้างฉบับใหม่ (แนบสำเนาฉบับใหม่ได้หลังบันทึก)</p>
      <mat-form-field class="full"><mat-label>เลขที่ฉบับใหม่</mat-label><input matInput [(ngModel)]="number" [placeholder]="p.number ?? ''" /></mat-form-field>
      <div class="two">
        <mat-form-field><mat-label>วันที่ออก</mat-label><input matInput type="date" [(ngModel)]="issueDate" /></mat-form-field>
        <mat-form-field><mat-label>หมดอายุใหม่</mat-label><input matInput type="date" [(ngModel)]="expiryDate" required /></mat-form-field>
      </div>
      <mat-form-field class="full"><mat-label>หมายเหตุ</mat-label><input matInput [(ngModel)]="notes" /></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !expiryDate">ต่ออายุ</button>
    </mat-dialog-actions>
  `,
  styles: `.content { width: min(460px, 88vw); } .full { width: 100%; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .err { color: var(--ktt-danger); }`,
})
export class RenewDialog {
  private readonly api = inject(PermitsApi);
  private readonly ref = inject(MatDialogRef<RenewDialog, Permit>);
  readonly p = inject<Permit>(MAT_DIALOG_DATA);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  number = '';
  issueDate = todayIso();
  expiryDate = this.p.expiryDate ? addDaysIso(this.p.expiryDate, 365) : '';
  notes = '';

  save(): void {
    this.busy.set(true);
    this.api.renew(this.p.id, { number: this.number || null, issueDate: this.issueDate || null, expiryDate: this.expiryDate, notes: this.notes || null }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= หน้า

@Component({
  selector: 'app-permits-page',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ใบอนุญาตและเอกสารที่มีวันหมดอายุ</h1>
          <p>ใบอนุญาตก่อสร้าง ใบอนุญาตบริษัท ประกันภัย ภาษีรถ ใบตรวจเครื่องจักร ระบบแจ้งเตือนทุกเช้า 08:00 ก่อนหมดอายุ</p>
        </div>
        @if (canWrite) {
          <button mat-flat-button class="btn-primary" (click)="edit(null)"><mat-icon>add</mat-icon> เพิ่มเอกสาร</button>
        }
      </div>

      <div class="kpis">
        <button class="kpi link" (click)="setFilter('expired')"><span class="label">หมดอายุแล้ว</span><strong class="bad">{{ counts().expired }}</strong></button>
        <button class="kpi link" (click)="setFilter('soon')"><span class="label">ใกล้หมดอายุ</span><strong class="warn-text">{{ counts().soon }}</strong></button>
        <button class="kpi link" (click)="setFilter('all')"><span class="label">ใช้งานอยู่ทั้งหมด</span><strong>{{ counts().all }}</strong></button>
      </div>

      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [ngModel]="filter()" (ngModelChange)="setFilter($event)" hideSingleSelectionIndicator aria-label="กรอง">
            <mat-button-toggle value="all">ใช้งานอยู่</mat-button-toggle>
            <mat-button-toggle value="soon">ใกล้หมดอายุ</mat-button-toggle>
            <mat-button-toggle value="expired">หมดอายุ</mat-button-toggle>
            <mat-button-toggle value="history">ประวัติ</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>ประเภท</mat-label>
            <mat-select [(ngModel)]="kind" (selectionChange)="load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @for (k of kinds; track k[0]) {
                <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาชื่อ เลขที่ หรือผู้ออก</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (keyup.enter)="load()" (blur)="load()" />
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead><tr><th>เอกสาร</th><th>ประเภท</th><th>ของ</th><th>เลขที่</th><th>หมดอายุ</th><th class="num">เหลือ</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>สำเนา</th><th></th></tr></thead>
            <tbody>
              @for (p of rows(); track p.id) {
                <tr>
                  <td><b>{{ p.name }}</b><div class="small muted">{{ p.issuer }}</div></td>
                  <td class="small">{{ kindLabel[p.kind] }}</td>
                  <td class="small">{{ p.projectCode || 'บริษัท' }}</td>
                  <td class="small">{{ p.number || '–' }}</td>
                  <td class="small">{{ p.expiryDate ? (p.expiryDate | thDate) : '–' }}</td>
                  <td class="num" [class.bad]="(p.daysLeft ?? 1) < 0" [class.warn-text]="p.state === 'soon'">
                    {{ p.daysLeft === null ? '–' : p.daysLeft < 0 ? 'เกิน ' + -p.daysLeft + ' วัน' : p.daysLeft + ' วัน' }}
                  </td>
                  <td><span class="chip" [class]="st[p.state].tone">{{ st[p.state].label }}{{ p.status === 'renewing' ? ' (กำลังต่ออายุ)' : '' }}</span></td>
                  <td class="small">{{ p.ownerName || '–' }}</td>
                  <td class="small">{{ p.attachmentCount ? p.attachmentCount + ' ไฟล์' : '–' }}</td>
                  <td class="nowrap">
                    @if (canWrite && (p.status === 'active' || p.status === 'renewing')) {
                      <button mat-button (click)="renew(p)">ต่ออายุ</button>
                      <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
                      <mat-menu #menu="matMenu">
                        <button mat-menu-item (click)="edit(p)"><mat-icon>edit</mat-icon>แก้ไข / แนบสำเนา</button>
                        @if (p.status === 'active') {
                          <button mat-menu-item (click)="setStatus(p, 'renewing')"><mat-icon>pending</mat-icon>อยู่ระหว่างยื่นต่ออายุ</button>
                        } @else {
                          <button mat-menu-item (click)="setStatus(p, 'active')"><mat-icon>undo</mat-icon>ยกเลิกสถานะยื่นต่ออายุ</button>
                        }
                        <button mat-menu-item (click)="setStatus(p, 'cancelled')"><mat-icon>block</mat-icon>เลิกใช้ (ไม่ต่ออายุ)</button>
                        <button mat-menu-item (click)="remove(p)"><mat-icon>delete</mat-icon>ลบ (บันทึกผิด)</button>
                      </mat-menu>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty muted">ไม่มีเอกสาร</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .kpi.link { cursor: pointer; text-align: left; font: inherit; }
    .kpi.link:hover { border-color: var(--ktt-ink-2); }
    .nowrap { white-space: nowrap; }
  `,
})
export class PermitsPage implements OnInit {
  private readonly api = inject(PermitsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly canWrite = inject(AuthService).can(Perm.PERMIT_WRITE);
  readonly kinds = Object.entries(PERMIT_KIND);
  readonly kindLabel = PERMIT_KIND;
  readonly st = PERMIT_STATE;
  readonly filter = signal('all');
  readonly rows = signal<Permit[]>([]);
  private readonly active = signal<Permit[]>([]);
  readonly counts = computed(() => {
    const a = this.active();
    return { all: a.length, soon: a.filter((p) => p.state === 'soon').length, expired: a.filter((p) => p.state === 'expired').length };
  });
  kind = '';
  q = '';

  ngOnInit(): void {
    this.load();
  }

  setFilter(f: string): void {
    this.filter.set(f);
    this.load();
  }

  load(): void {
    this.api.list({ filter: this.filter(), kind: this.kind || undefined, q: this.q.trim() || undefined }).subscribe({
      next: (r) => this.rows.set(r),
      error: (e) => this.notify.error(e),
    });
    this.api.list({}).subscribe((r) => this.active.set(r));
  }

  edit(p: Permit | null): void {
    this.dialog
      .open(PermitDialog, { data: p, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }

  renew(p: Permit): void {
    this.dialog
      .open(RenewDialog, { data: p })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.notify.ok('ต่ออายุแล้ว แนบสำเนาฉบับใหม่ได้ที่เมนูแก้ไข');
        this.load();
      });
  }

  setStatus(p: Permit, status: 'active' | 'renewing' | 'cancelled'): void {
    const go = () => this.api.status(p.id, status).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
    if (status !== 'cancelled') {
      go();
      return;
    }
    confirmAction(this.dialog, { title: 'เลิกใช้เอกสาร', message: `${p.name} จะไม่แจ้งเตือนอีก และย้ายไปอยู่ในประวัติ`, confirmText: 'เลิกใช้', danger: true }).subscribe((ok) => ok && go());
  }

  remove(p: Permit): void {
    confirmAction(this.dialog, { title: 'ลบเอกสาร', message: `ลบ ${p.name}? ใช้กรณีบันทึกผิดเท่านั้น`, confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.remove(p.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }),
    );
  }
}
