import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, addDaysIso, thDateShort, todayIso } from '../../core/util/format';
import { MoneyPipe, QtyPipe, round2 } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { PurchaseApi } from '../purchase/purchase.api';
import { Entry, SubcontractApi, WageLine, WagePayment, Worker } from '../subcontract/subcontract.api';

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** วันจันทร์ของสัปดาห์ที่มีวันนี้ */
function monday(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const back = (d.getDay() + 6) % 7;
  return addDaysIso(iso, -back);
}

// ======================================================================= แรงงาน

@Component({
  selector: 'app-worker-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ w ? 'แก้ไขแรงงาน' : 'เพิ่มแรงงาน' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field class="span"><mat-label>ชื่อ-นามสกุล</mat-label><input matInput [(ngModel)]="m.name" required /></mat-form-field>
        <mat-form-field><mat-label>ชื่อเล่น</mat-label><input matInput [(ngModel)]="m.nickname" /></mat-form-field>
        <mat-form-field><mat-label>ตำแหน่ง/ช่าง</mat-label><input matInput [(ngModel)]="m.trade" placeholder="ช่างปูน กรรมกร ช่างไฟ" /></mat-form-field>
        <mat-form-field><mat-label>ค่าแรงต่อวัน</mat-label><input matInput type="number" min="0" [(ngModel)]="m.dailyWage" /></mat-form-field>
        <mat-form-field><mat-label>ค่า OT ต่อชั่วโมง</mat-label><input matInput type="number" min="0" [(ngModel)]="m.otRate" /></mat-form-field>
        <mat-form-field><mat-label>โทรศัพท์</mat-label><input matInput [(ngModel)]="m.phone" /></mat-form-field>
        <mat-form-field><mat-label>เลขบัตรประชาชน</mat-label><input matInput [(ngModel)]="m.idCard" maxlength="13" /></mat-form-field>
        <mat-form-field class="span">
          <mat-label>สังกัดผู้รับเหมาช่วง (ถ้ามี)</mat-label>
          <mat-select [(ngModel)]="m.supplierId">
            <mat-option [value]="null">– แรงงานบริษัท –</mat-option>
            @for (s of subs(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-checkbox [(ngModel)]="m.active">ยังทำงานอยู่</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="!m.name">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(520px, 90vw); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    .span { grid-column: 1 / -1; }
    .err { color: var(--ktt-danger); }
  `,
})
export class WorkerDialog {
  private readonly api = inject(SubcontractApi);
  private readonly ref = inject(MatDialogRef<WorkerDialog, Worker>);
  readonly subs = toSignal(inject(PurchaseApi).supplierOptions('subcontractor'), { initialValue: [] });
  readonly w = inject<Worker | null>(MAT_DIALOG_DATA);
  readonly error = signal<string | null>(null);
  m = {
    name: this.w?.name ?? '',
    nickname: this.w?.nickname ?? null,
    trade: this.w?.trade ?? null,
    dailyWage: this.w?.dailyWage ?? 400,
    otRate: this.w?.otRate ?? 75,
    phone: this.w?.phone ?? null,
    idCard: this.w?.idCard ?? null,
    supplierId: this.w?.supplierId ?? null,
    active: this.w?.active ?? true,
  };

  save(): void {
    this.api.saveWorker(this.w?.id ?? null, { ...this.m, dailyWage: Number(this.m.dailyWage) || 0, otRate: Number(this.m.otRate) || 0 }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}

// ======================================================================= สรุปจ่ายค่าแรง

@Component({
  selector: 'app-wage-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MoneyPipe, QtyPipe],
  template: `
    <h2 mat-dialog-title>สรุปค่าแรงเพื่อจ่าย</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field><mat-label>ตั้งแต่</mat-label><input matInput type="date" [(ngModel)]="from" (change)="preview()" /></mat-form-field>
        <mat-form-field><mat-label>ถึง</mat-label><input matInput type="date" [(ngModel)]="to" (change)="preview()" /></mat-form-field>
        <mat-form-field>
          <mat-label>โครงการ</mat-label>
          <mat-select [(ngModel)]="projectId" (selectionChange)="preview()">
            <mat-option [value]="null">ทุกโครงการ</mat-option>
            @for (p of projects(); track p.id) {
              <mat-option [value]="p.id">{{ p.code }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <table class="t">
        <thead><tr><th>แรงงาน</th><th class="num">วัน</th><th class="num">OT ชม.</th><th class="num">ค่าแรง</th></tr></thead>
        <tbody>
          @for (l of lines(); track l.workerId) {
            <tr><td>{{ l.workerName }} <span class="muted">{{ l.trade }}</span></td><td class="num">{{ l.days | qty }}</td><td class="num">{{ l.otHours | qty }}</td><td class="num">{{ l.amount | money }}</td></tr>
          } @empty {
            <tr><td colspan="4" class="muted">ไม่มีวันทำงานที่ยังไม่จ่ายในช่วงนี้</td></tr>
          }
        </tbody>
        <tfoot><tr><td colspan="3">รวม</td><td class="num">{{ total() | money }}</td></tr></tfoot>
      </table>
      <mat-form-field class="full"><mat-label>หมายเหตุ</mat-label><input matInput [(ngModel)]="notes" /></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !lines().length">สร้างใบสรุปค่าแรง</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(620px, 90vw); }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; column-gap: 12px; }
    .full { width: 100%; margin-top: 12px; }
    .err { color: var(--ktt-danger); }
    .t { width: 100%; border-collapse: collapse; }
    .t th, .t td { padding: 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .t th { color: var(--ktt-steel); font-weight: 500; }
    .t tfoot td { font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class WageDialog implements OnInit {
  private readonly api = inject(SubcontractApi);
  private readonly ref = inject(MatDialogRef<WageDialog, WagePayment>);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly lines = signal<WageLine[]>([]);
  readonly total = computed(() => round2(this.lines().reduce((s, l) => s + l.amount, 0)));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  from = addDaysIso(todayIso(), -13);
  to = todayIso();
  projectId: string | null = null;
  notes = '';

  ngOnInit(): void {
    this.preview();
  }

  preview(): void {
    if (!this.from || !this.to) return;
    this.api.wagePreview(this.from, this.to, this.projectId ?? undefined).subscribe({ next: (l) => this.lines.set(l), error: (e) => this.error.set(errorMessage(e)) });
  }

  save(): void {
    this.busy.set(true);
    this.api.createWagePayment({ from: this.from, to: this.to, projectId: this.projectId, notes: this.notes || null }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= หน้าแรงงาน

interface Cell {
  days: number | null;
  ot: number | null;
  locked: boolean;
  dirty: boolean;
}

@Component({
  selector: 'app-labor-page',
  imports: [FormsModule, MatTabsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MoneyPipe, QtyPipe, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ค่าแรง</h1>
          <p>บันทึกวันทำงานรายวันต่อโครงการ คิดค่าแรงเป็นต้นทุนโครงการ แล้วสรุปจ่ายเป็นงวด</p>
        </div>
      </div>
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false">
        <mat-tab label="ลงเวลาทำงาน">
          <div class="panel tab">
            <div class="filters">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>โครงการ</mat-label>
                <mat-select [(ngModel)]="projectId" (selectionChange)="loadSheet()">
                  @for (p of projects(); track p.id) {
                    <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button (click)="shift(-7)" aria-label="สัปดาห์ก่อน"><mat-icon>chevron_left</mat-icon></button>
              <span>{{ from | thDate }} – {{ days[6] | thDate }}</span>
              <button mat-icon-button (click)="shift(7)" [disabled]="days[6] >= today" aria-label="สัปดาห์ถัดไป"><mat-icon>chevron_right</mat-icon></button>
              <span class="grow"></span>
              <span class="small">รวม {{ sheetDays() | qty }} แรง · {{ sheetWage() | money }} บาท</span>
              @if (canWrite) {
                <button mat-flat-button class="btn-primary" (click)="saveSheet()" [disabled]="!dirty() || busy()"><mat-icon>save</mat-icon> บันทึก</button>
              }
            </div>
            @if (projectId) {
              <div class="table-scroll">
                <table class="sheet">
                  <thead>
                    <tr>
                      <th>แรงงาน</th>
                      @for (d of days; track d) {
                        <th class="day" [class.weekend]="isWeekend(d)">{{ dow(d) }}<br /><span class="muted">{{ short(d) }}</span></th>
                      }
                      <th class="num">แรง</th>
                      <th class="num">ค่าแรง</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (w of sheetWorkers(); track w.id) {
                      <tr>
                        <td>
                          <div>{{ w.name }}{{ w.nickname ? ' (' + w.nickname + ')' : '' }}</div>
                          <div class="muted small">{{ w.trade }} · {{ w.dailyWage | money }}/วัน</div>
                        </td>
                        @for (d of days; track d) {
                          @let c = cell(w.id, d);
                          <td class="day" [class.weekend]="isWeekend(d)" [class.locked]="c.locked">
                            <select [(ngModel)]="c.days" (ngModelChange)="mark(c)" [disabled]="!canWrite || c.locked || d > today" [attr.aria-label]="w.name + ' ' + d">
                              <option [ngValue]="null">–</option>
                              <option [ngValue]="0.5">½</option>
                              <option [ngValue]="1">1</option>
                              <option [ngValue]="1.5">1½</option>
                            </select>
                            <input type="number" min="0" max="12" step="0.5" placeholder="OT" [(ngModel)]="c.ot" (ngModelChange)="mark(c)" [disabled]="!canWrite || c.locked || d > today" [attr.aria-label]="'OT ' + w.name + ' ' + d" />
                          </td>
                        }
                        <td class="num">{{ rowDays(w.id) | qty }}</td>
                        <td class="num">{{ rowWage(w) | money }}</td>
                      </tr>
                    } @empty {
                      <tr><td [attr.colspan]="10" class="empty muted">ยังไม่มีแรงงานในระบบ เพิ่มที่แท็บ "แรงงาน"</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="hint muted small">ช่องสีเทาคือวันที่ทำจ่ายค่าแรงไปแล้ว แก้ไขไม่ได้ · ช่องล่างคือชั่วโมง OT</p>
            } @else {
              <p class="empty muted">เลือกโครงการเพื่อลงเวลา</p>
            }
          </div>
        </mat-tab>

        <mat-tab label="สรุปจ่ายค่าแรง">
          <div class="panel tab">
            @if (canWrite) {
              <div class="filters"><button mat-flat-button class="btn-primary" (click)="newWage()"><mat-icon>add</mat-icon> สรุปค่าแรงงวดใหม่</button></div>
            }
            <div class="table-scroll">
              <table class="grid">
                <thead><tr><th>เลขที่</th><th>งวด</th><th>โครงการ</th><th class="num">คน</th><th class="num">ยอดจ่าย</th><th>สถานะ</th><th>วันที่จ่าย</th><th></th></tr></thead>
                <tbody>
                  @for (p of payments(); track p.id) {
                    <tr>
                      <td class="no">{{ p.docNo }}</td>
                      <td class="small">{{ p.periodFrom | thDate }} – {{ p.periodTo | thDate }}</td>
                      <td class="small">{{ p.projectCode || 'ทุกโครงการ' }}</td>
                      <td class="num">{{ p.lines.length }}</td>
                      <td class="num">{{ p.total | money }}</td>
                      <td><span class="chip" [class]="p.status === 'paid' ? 'ok' : p.status === 'void' ? 'danger' : 'warn'">{{ p.status === 'paid' ? 'จ่ายแล้ว' : p.status === 'void' ? 'ยกเลิก' : 'รอจ่าย' }}</span></td>
                      <td class="small">{{ p.paidDate | thDate }}</td>
                      <td class="nowrap">
                        <button mat-button (click)="expanded.set(expanded() === p.id ? null : p.id)">{{ expanded() === p.id ? 'ซ่อน' : 'รายชื่อ' }}</button>
                        @if (canWrite && p.status === 'draft') {
                          <button mat-button (click)="pay(p)">จ่ายแล้ว</button>
                          <button mat-button (click)="voidWage(p)">ยกเลิก</button>
                        }
                      </td>
                    </tr>
                    @if (expanded() === p.id) {
                      <tr class="sub">
                        <td colspan="8">
                          @for (l of p.lines; track l.workerId) {
                            <div class="line"><span>{{ l.workerName }} <span class="muted">{{ l.trade }}</span></span><span>{{ l.days | qty }} วัน{{ l.otHours ? ' + OT ' + l.otHours + ' ชม.' : '' }}</span><b>{{ l.amount | money }}</b></div>
                          }
                        </td>
                      </tr>
                    }
                  } @empty {
                    <tr><td colspan="8" class="empty muted">ยังไม่มีใบสรุปค่าแรง</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="แรงงาน">
          <div class="panel tab">
            <div class="filters">
              <mat-checkbox [(ngModel)]="showInactive">แสดงคนที่ออกแล้ว</mat-checkbox>
              <span class="grow"></span>
              @if (canWrite) {
                <button mat-stroked-button (click)="editWorker(null)"><mat-icon>person_add</mat-icon> เพิ่มแรงงาน</button>
              }
            </div>
            <div class="table-scroll">
              <table class="grid">
                <thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th class="num">ค่าแรง/วัน</th><th class="num">OT/ชม.</th><th>โทร</th><th>สังกัด</th><th>สถานะ</th></tr></thead>
                <tbody>
                  @for (w of shownWorkers(); track w.id) {
                    <tr class="clickable" (click)="canWrite && editWorker(w)">
                      <td>{{ w.name }}{{ w.nickname ? ' (' + w.nickname + ')' : '' }}</td>
                      <td class="small">{{ w.trade }}</td>
                      <td class="num">{{ w.dailyWage | money }}</td>
                      <td class="num">{{ w.otRate | money }}</td>
                      <td class="small">{{ w.phone }}</td>
                      <td class="small">{{ w.supplierName || 'บริษัท' }}</td>
                      <td class="small">{{ w.active ? 'ทำงาน' : 'ออกแล้ว' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .tab { margin-top: 14px; }
    .nowrap { white-space: nowrap; }
    .hint { padding: 8px 16px 14px; margin: 0; }
    .sheet { width: 100%; min-width: 860px; border-collapse: collapse; }
    .sheet th, .sheet td { padding: 6px 8px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .sheet th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; }
    .sheet .day { text-align: center; width: 72px; }
    .sheet .weekend { background: #fafaf8; }
    .sheet .locked { background: #eceeed; }
    .sheet select, .sheet input { width: 58px; height: 26px; font: inherit; font-size: 0.85rem; border: 1px solid var(--ktt-line); border-radius: 4px; background: #fff; box-sizing: border-box; }
    .sheet input { margin-top: 3px; text-align: right; padding: 0 4px; }
    .sheet input::placeholder { color: #a7adb0; }
    tr.sub td { background: #fafaf8; }
    .line { display: grid; grid-template-columns: 1fr 180px 120px; gap: 8px; padding: 2px 0; }
    .line b { text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class LaborPage implements OnInit {
  private readonly api = inject(SubcontractApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly canWrite = inject(AuthService).can(Perm.LABOR_WRITE);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly today = todayIso();
  readonly workers = signal<Worker[]>([]);
  readonly sheetWorkers = signal<Worker[]>([]);
  readonly payments = signal<WagePayment[]>([]);
  readonly expanded = signal<string | null>(null);
  readonly busy = signal(false);
  readonly dirty = signal(false);
  readonly version = signal(0);
  showInactive = false;
  projectId = '';
  from = monday(todayIso());
  days: string[] = [];
  private cells = new Map<string, Cell>();

  readonly shownWorkers = computed(() => this.workers().filter((w) => this.showInactive || w.active));
  readonly sheetDays = computed(() => {
    this.version();
    let s = 0;
    for (const c of this.cells.values()) s += c.days ?? 0;
    return s;
  });
  readonly sheetWage = computed(() => {
    this.version();
    return round2(this.sheetWorkers().reduce((s, w) => s + this.rowWage(w), 0));
  });

  ngOnInit(): void {
    this.setDays();
    this.loadWorkers();
    this.loadPayments();
  }

  private setDays(): void {
    this.days = Array.from({ length: 7 }, (_, i) => addDaysIso(this.from, i));
  }

  dow(d: string): string {
    return DOW[new Date(d + 'T00:00:00').getDay()];
  }

  short(d: string): string {
    return thDateShort(d);
  }

  isWeekend(d: string): boolean {
    const g = new Date(d + 'T00:00:00').getDay();
    return g === 0 || g === 6;
  }

  loadWorkers(): void {
    this.api.workers(false).subscribe((w) => this.workers.set(w));
  }

  loadPayments(): void {
    this.api.wagePayments().subscribe((p) => this.payments.set(p));
  }

  shift(n: number): void {
    if (this.dirty() && !window.confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการเปลี่ยนสัปดาห์หรือไม่?')) return;
    this.from = addDaysIso(this.from, n);
    this.setDays();
    this.loadSheet();
  }

  loadSheet(): void {
    if (!this.projectId) return;
    this.api.timesheet(this.projectId, this.days[0], this.days[6]).subscribe({
      next: (t) => {
        this.cells.clear();
        for (const e of t.entries) this.cells.set(e.workerId + e.workDate, { days: e.days, ot: e.otHours || null, locked: !!e.locked, dirty: false });
        this.sheetWorkers.set(t.workers);
        this.dirty.set(false);
        this.version.update((v) => v + 1);
      },
      error: (e) => this.notify.error(e),
    });
  }

  cell(workerId: string, d: string): Cell {
    const k = workerId + d;
    let c = this.cells.get(k);
    if (!c) {
      c = { days: null, ot: null, locked: false, dirty: false };
      this.cells.set(k, c);
    }
    return c;
  }

  mark(c: Cell): void {
    c.dirty = true;
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  rowDays(workerId: string): number {
    this.version();
    return this.days.reduce((s, d) => s + (this.cells.get(workerId + d)?.days ?? 0), 0);
  }

  rowWage(w: Worker): number {
    let s = 0;
    for (const d of this.days) {
      const c = this.cells.get(w.id + d);
      if (c?.days) s += c.days * w.dailyWage + (Number(c.ot) || 0) * w.otRate;
    }
    return round2(s);
  }

  saveSheet(): void {
    const entries: Entry[] = [];
    for (const w of this.sheetWorkers()) {
      for (const d of this.days) {
        const c = this.cells.get(w.id + d);
        if (c?.dirty) entries.push({ workerId: w.id, workDate: d, days: c.days ?? 0, otHours: Number(c.ot) || 0, note: null });
      }
    }
    if (entries.some((e) => e.otHours > 0 && !e.days)) {
      this.notify.error('บันทึก OT ต้องมีวันทำงานด้วย');
      return;
    }
    this.busy.set(true);
    this.api.saveTimesheet(this.projectId, entries).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.ok('บันทึกเวลาทำงานแล้ว');
        this.loadSheet();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  editWorker(w: Worker | null): void {
    this.dialog
      .open(WorkerDialog, { data: w })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.loadWorkers();
        this.loadSheet();
      });
  }

  newWage(): void {
    this.dialog
      .open(WageDialog, { maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.notify.ok(`สร้าง ${r.docNo} แล้ว`);
        this.loadPayments();
        this.loadSheet();
      });
  }

  pay(p: WagePayment): void {
    prompt(this.dialog, { title: `จ่ายค่าแรง ${p.docNo}`, message: 'ระบุวันที่จ่ายจริง (ปปปป-ดด-วว)', label: 'วันที่จ่าย', value: todayIso(), confirmText: 'บันทึกจ่าย', required: true }).subscribe((v) => {
      if (!v) return;
      this.api.wageAction(p.id, 'pay', v).subscribe({ next: () => this.loadPayments(), error: (e) => this.notify.error(e) });
    });
  }

  voidWage(p: WagePayment): void {
    confirmAction(this.dialog, { title: 'ยกเลิกใบสรุปค่าแรง', message: `ยกเลิก ${p.docNo}? วันทำงานจะกลับมาแก้ไขได้`, confirmText: 'ยกเลิกเอกสาร', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.wageAction(p.id, 'void').subscribe({
        next: () => {
          this.loadPayments();
          this.loadSheet();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
