import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { Subject, debounceTime } from 'rxjs';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, TaxIdPipe, todayIso } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { PurchaseApi, SUPPLIER_KIND, Supplier, SupplierRow, SupplierSave } from './purchase.api';

@Component({
  selector: 'app-supplier-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatTabsModule, ThDatePipe, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ s ? s.code + ' ' + s.name : 'เพิ่มผู้ขาย / ผู้รับเหมาช่วง' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false">
        <mat-tab label="ข้อมูล">
          <div class="grid pad">
            <mat-form-field>
              <mat-label>รหัส (เว้นว่างให้ระบบออก)</mat-label>
              <input matInput [(ngModel)]="m.code" maxlength="30" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field class="span2">
              <mat-label>ชื่อ</mat-label>
              <input matInput [(ngModel)]="m.name" required [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ประเภท</mat-label>
              <mat-select [(ngModel)]="m.kind" [disabled]="!canEdit">
                @for (k of kinds; track k[0]) {
                  <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>ภาษีหัก ณ ที่จ่ายยื่นแบบ</mat-label>
              <mat-select [(ngModel)]="m.personType" [disabled]="!canEdit">
                <mat-option value="company">นิติบุคคล (ภ.ง.ด.53)</mat-option>
                <mat-option value="person">บุคคลธรรมดา (ภ.ง.ด.3)</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>หมวดสินค้า/งาน</mat-label>
              <input matInput [(ngModel)]="m.category" placeholder="เช่น เหล็ก, คอนกรีต, งานไฟฟ้า" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เลขผู้เสียภาษี</mat-label>
              <input matInput [(ngModel)]="m.taxId" maxlength="13" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>สาขา</mat-label>
              <input matInput [(ngModel)]="m.branchNo" maxlength="5" placeholder="00000" [disabled]="!canEdit" />
            </mat-form-field>
            <div class="chk"><mat-checkbox [(ngModel)]="m.vatRegistered" [disabled]="!canEdit">จด VAT</mat-checkbox></div>
            <mat-form-field class="span3">
              <mat-label>ที่อยู่</mat-label>
              <textarea matInput rows="2" [(ngModel)]="m.address" [disabled]="!canEdit"></textarea>
            </mat-form-field>
            <mat-form-field>
              <mat-label>ผู้ติดต่อ</mat-label>
              <input matInput [(ngModel)]="m.contactName" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>โทรศัพท์</mat-label>
              <input matInput [(ngModel)]="m.phone" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>อีเมล</mat-label>
              <input matInput type="email" [(ngModel)]="m.email" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เครดิต (วัน)</mat-label>
              <input matInput type="number" min="0" [(ngModel)]="m.creditDays" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ธนาคาร</mat-label>
              <input matInput [(ngModel)]="m.bankName" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เลขที่บัญชี</mat-label>
              <input matInput [(ngModel)]="m.bankAccount" [disabled]="!canEdit" />
            </mat-form-field>
            <mat-form-field class="span3">
              <mat-label>หมายเหตุ</mat-label>
              <textarea matInput rows="2" [(ngModel)]="m.notes" [disabled]="!canEdit"></textarea>
            </mat-form-field>
            <div class="chk"><mat-checkbox [(ngModel)]="m.active" [disabled]="!canEdit">ใช้งานอยู่</mat-checkbox></div>
          </div>
        </mat-tab>
        @if (s) {
          <mat-tab [label]="'ประเมิน (' + s.evaluations.length + ')'">
            <div class="pad">
              @if (canEvaluate) {
                <div class="eval-form">
                  @for (c of criteria; track c[0]) {
                    <label>
                      {{ c[1] }}
                      <select [(ngModel)]="ev[c[0]]" [attr.aria-label]="c[1]">
                        @for (n of [5, 4, 3, 2, 1]; track n) {
                          <option [ngValue]="n">{{ n }}</option>
                        }
                      </select>
                    </label>
                  }
                  <input class="cmt" [(ngModel)]="ev.comment" placeholder="ความเห็น" aria-label="ความเห็น" />
                  <button mat-stroked-button (click)="evaluate()">บันทึกการประเมิน</button>
                </div>
              }
              <table class="ev">
                <thead><tr><th>วันที่</th><th>โครงการ</th><th>คุณภาพ</th><th>ตรงเวลา</th><th>ราคา</th><th>บริการ</th><th>เฉลี่ย</th><th>ความเห็น</th></tr></thead>
                <tbody>
                  @for (e of s.evaluations; track e.id) {
                    <tr>
                      <td>{{ e.evalDate | thDate }}</td><td>{{ e.projectCode || '–' }}</td><td>{{ e.quality }}</td><td>{{ e.delivery }}</td>
                      <td>{{ e.price }}</td><td>{{ e.service }}</td><td><b>{{ e.average }}</b></td><td>{{ e.comment }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="muted">ยังไม่มีการประเมิน</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-tab>
          <mat-tab label="เอกสาร">
            <div class="pad">
              <app-attachment-panel ownerType="supplier" [ownerId]="s.id" [canWrite]="canEdit" defaultCategory="certificate" />
            </div>
          </mat-tab>
        }
      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (s && canEdit) {
        <button mat-button (click)="remove()">ลบ</button>
      }
      <span style="flex: 1"></span>
      <button mat-button mat-dialog-close>ปิด</button>
      @if (canEdit) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.name.trim()">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(760px, 90vw); }
    .pad { padding: 14px 2px 4px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 12px; }
    .span2 { grid-column: span 2; }
    .span3 { grid-column: 1 / -1; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
    .chk { display: flex; align-items: center; min-height: 56px; }
    .err { color: var(--ktt-danger); }
    .eval-form { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .eval-form label { display: flex; gap: 4px; align-items: center; font-size: 0.9rem; }
    .eval-form select, .cmt { height: 32px; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .cmt { flex: 1; min-width: 160px; }
    .ev { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .ev th, .ev td { padding: 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .ev th { color: var(--ktt-steel); font-weight: 500; }
  `,
})
export class SupplierDialog {
  private readonly api = inject(PurchaseApi);
  private readonly ref = inject(MatDialogRef<SupplierDialog, Supplier | 'deleted'>);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  s = inject<Supplier | null>(MAT_DIALOG_DATA);
  readonly canEdit = this.auth.can(Perm.PURCHASE_WRITE) || this.auth.can(Perm.AP_WRITE) || this.auth.can(Perm.SUBCONTRACT_WRITE);
  readonly canEvaluate = this.auth.can(Perm.PURCHASE_WRITE) || this.auth.can(Perm.PROJECT_WRITE);
  readonly kinds = Object.entries(SUPPLIER_KIND);
  readonly criteria: [('quality' | 'delivery' | 'price' | 'service'), string][] = [['quality', 'คุณภาพ'], ['delivery', 'ตรงเวลา'], ['price', 'ราคา'], ['service', 'บริการ']];
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  ev = { quality: 4, delivery: 4, price: 4, service: 4, comment: '' };
  m: SupplierSave = {
    code: this.s?.code ?? '',
    name: this.s?.name ?? '',
    kind: this.s?.kind ?? 'supplier',
    personType: this.s?.personType ?? 'company',
    taxId: this.s?.taxId ?? '',
    branchNo: this.s?.branchNo ?? '',
    address: this.s?.address ?? '',
    phone: this.s?.phone ?? '',
    email: this.s?.email ?? '',
    contactName: this.s?.contactName ?? '',
    category: this.s?.category ?? '',
    creditDays: this.s?.creditDays ?? 30,
    vatRegistered: this.s?.vatRegistered ?? true,
    bankName: this.s?.bankName ?? '',
    bankAccount: this.s?.bankAccount ?? '',
    notes: this.s?.notes ?? '',
    active: this.s?.active ?? true,
  };

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    const body = { ...this.m, code: this.m.code?.trim() || null, creditDays: Number(this.m.creditDays) || 0 };
    this.api.saveSupplier(this.s?.id ?? null, body).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  evaluate(): void {
    this.api.evaluate(this.s!.id, { projectId: null, evalDate: todayIso(), ...this.ev, comment: this.ev.comment || null }).subscribe({
      next: (r) => (this.s = r),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบผู้ขาย', message: `ลบ ${this.s!.name}`, confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteSupplier(this.s!.id).subscribe({ next: () => this.ref.close('deleted'), error: (e) => this.error.set(errorMessage(e)) });
    });
  }
}

@Component({
  selector: 'app-suppliers-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatPaginatorModule, MoneyPipe, TaxIdPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ผู้ขายและผู้รับเหมาช่วง</h1>
          <p>ทะเบียนผู้ขายวัสดุ ผู้รับเหมาช่วง เครดิต การประเมิน และยอดค้างจ่าย</p>
        </div>
        @if (canEdit) {
          <button mat-flat-button class="btn-primary" (click)="open(null)"><mat-icon>add</mat-icon> เพิ่มผู้ขาย</button>
        }
      </div>
      <div class="panel">
        <div class="filters">
          <mat-form-field class="search" subscriptSizing="dynamic">
            <mat-label>ค้นหาชื่อ รหัส เลขผู้เสียภาษี เบอร์โทร</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>ประเภท</mat-label>
            <mat-select [(ngModel)]="kind" (selectionChange)="page = 0; load()">
              <mat-option value="">ทั้งหมด</mat-option>
              <mat-option value="supplier">ผู้ขายวัสดุ</mat-option>
              <mat-option value="subcontractor">ผู้รับเหมาช่วง</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th>หมวด</th><th>เลขผู้เสียภาษี</th><th>ติดต่อ</th><th class="num">เครดิต</th><th class="num">คะแนน</th><th class="num">ค้างจ่าย</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="openId(r.id)" tabindex="0" (keydown.enter)="openId(r.id)" [class.muted]="!r.active">
                  <td class="no">{{ r.code }}</td>
                  <td>{{ r.name }} @if (!r.active) { <span class="chip">ปิดใช้งาน</span> }</td>
                  <td class="small">{{ kinds[r.kind] }}{{ r.personType === 'person' ? ' (บุคคล)' : '' }}</td>
                  <td class="small">{{ r.category || '–' }}</td>
                  <td class="small">{{ r.taxId | taxId }}</td>
                  <td class="small">{{ r.contactName || '' }} {{ r.phone || '' }}</td>
                  <td class="num">{{ r.creditDays }} วัน</td>
                  <td class="num">{{ r.rating ?? '–' }}</td>
                  <td class="num">{{ r.openPayable ? (r.openPayable | money) : '–' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="empty muted">ยังไม่มีผู้ขาย</td></tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page" [pageSize]="size" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
})
export class SuppliersPage implements OnInit {
  private readonly api = inject(PurchaseApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  readonly canEdit = this.auth.can(Perm.PURCHASE_WRITE) || this.auth.can(Perm.AP_WRITE) || this.auth.can(Perm.SUBCONTRACT_WRITE);
  readonly kinds = SUPPLIER_KIND;
  readonly rows = signal<SupplierRow[]>([]);
  readonly total = signal(0);
  readonly search$ = new Subject<void>();
  q = '';
  kind = '';
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
    this.api.suppliers({ q: this.q.trim(), kind: this.kind, page: this.page, size: this.size }).subscribe({
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

  openId(id: string): void {
    this.api.supplier(id).subscribe({ next: (s) => this.open(s), error: (e) => this.notify.error(e) });
  }

  open(s: Supplier | null): void {
    this.dialog
      .open(SupplierDialog, { data: s, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }
}
