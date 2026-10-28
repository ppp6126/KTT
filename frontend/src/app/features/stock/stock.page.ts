import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
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
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe, QtyPipe } from '../../core/util/money';
import { MaterialInput } from '../../shared/material-input';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { LedgerRow, OnHand, STOCK_KIND, StockApi, StockDoc, StockDocSave, Warehouse } from './stock.api';

// ======================================================================= สมุดคุมสินค้า

@Component({
  selector: 'app-ledger-dialog',
  imports: [MatDialogModule, MatButtonModule, MoneyPipe, QtyPipe, ThDatePipe],
  template: `
    <h2 mat-dialog-title>{{ d.code }} {{ d.name }} ({{ d.warehouseName }})</h2>
    <mat-dialog-content>
      <table class="t">
        <thead><tr><th>วันที่</th><th>รายการ</th><th>เอกสาร</th><th>โครงการ</th><th class="num">เข้า/ออก</th><th class="num">ต้นทุน/หน่วย</th><th class="num">คงเหลือ</th><th class="num">มูลค่าคงเหลือ</th></tr></thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr>
              <td>{{ r.date | thDate }}</td>
              <td>{{ kind[r.kind] }}{{ r.note ? ' – ' + r.note : '' }}</td>
              <td>{{ r.refNo }}</td>
              <td>{{ r.projectCode || '' }}</td>
              <td class="num" [class.out]="r.qty < 0">{{ r.qty > 0 ? '+' : '' }}{{ r.qty | qty }}</td>
              <td class="num">{{ r.unitCost | money }}</td>
              <td class="num">{{ r.balance | qty }}</td>
              <td class="num">{{ r.balanceValue | money }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8">ไม่มีการเคลื่อนไหว</td></tr>
          }
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>ปิด</button></mat-dialog-actions>
  `,
  styles: `
    .t { width: min(900px, 86vw); border-collapse: collapse; font-size: 0.9rem; }
    .t th, .t td { padding: 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .t th { color: var(--ktt-steel); font-weight: 500; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .out { color: var(--ktt-danger); }
  `,
})
export class LedgerDialog implements OnInit {
  private readonly api = inject(StockApi);
  readonly d = inject<OnHand>(MAT_DIALOG_DATA);
  readonly rows = signal<LedgerRow[]>([]);
  readonly kind = STOCK_KIND;

  ngOnInit(): void {
    this.api.ledger(this.d.materialId, this.d.warehouseId).subscribe((r) => this.rows.set(r));
  }
}

// ======================================================================= เอกสารคลัง

@Component({
  selector: 'app-stock-doc-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MaterialInput],
  template: `
    <h2 mat-dialog-title>{{ titles[m.kind] }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field>
          <mat-label>ประเภท</mat-label>
          <mat-select [(ngModel)]="m.kind">
            @for (k of kinds; track k) {
              <mat-option [value]="k">{{ titles[k] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่</mat-label>
          <input matInput type="date" [(ngModel)]="m.docDate" [max]="today" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ m.kind === 'return' ? 'รับคืนเข้าคลัง' : 'จากคลัง' }}</mat-label>
          <mat-select [(ngModel)]="m.warehouseId">
            @for (w of warehouses(); track w.id) {
              <mat-option [value]="w.id">{{ w.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (m.kind === 'transfer') {
          <mat-form-field>
            <mat-label>ไปคลัง</mat-label>
            <mat-select [(ngModel)]="m.toWarehouseId">
              @for (w of warehouses(); track w.id) {
                <mat-option [value]="w.id">{{ w.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @if (m.kind === 'issue' || m.kind === 'return') {
          <mat-form-field>
            <mat-label>โครงการ</mat-label>
            <mat-select [(ngModel)]="m.projectId">
              @for (p of projects(); track p.id) {
                <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>
      <table class="t">
        <thead><tr><th>วัสดุ</th><th class="num">จำนวน{{ m.kind === 'adjust' ? ' (+/−)' : '' }}</th>@if (m.kind === 'adjust') {<th class="num">ต้นทุน/หน่วย</th>}<th>หมายเหตุ</th><th></th></tr></thead>
        <tbody>
          @for (l of lines; track $index; let i = $index) {
            <tr>
              <td><app-material-input [(description)]="l.name" [code]="l.code" (picked)="l.materialId = $event.id; l.code = $event.code; l.unit = $event.unit" /></td>
              <td><input type="number" step="any" [(ngModel)]="l.qty" aria-label="จำนวน" /> <span class="muted">{{ l.unit }}</span></td>
              @if (m.kind === 'adjust') {
                <td><input type="number" min="0" step="any" [(ngModel)]="l.unitCost" placeholder="ถัวเฉลี่ย" aria-label="ต้นทุน" /></td>
              }
              <td><input [(ngModel)]="l.note" aria-label="หมายเหตุ" /></td>
              <td><button mat-icon-button (click)="lines.splice(i, 1)" aria-label="ลบ"><mat-icon>close</mat-icon></button></td>
            </tr>
          }
        </tbody>
      </table>
      <button mat-button (click)="add()"><mat-icon>add</mat-icon> เพิ่มรายการ</button>
      <mat-form-field class="full">
        <mat-label>หมายเหตุ</mat-label>
        <input matInput [(ngModel)]="m.notes" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy()">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(760px, 92vw); }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 12px; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .full { width: 100%; margin-top: 8px; }
    .err { color: var(--ktt-danger); }
    .t { width: 100%; border-collapse: collapse; }
    .t th, .t td { padding: 4px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .t th { color: var(--ktt-steel); font-weight: 500; }
    .t input { height: 32px; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; width: 100%; box-sizing: border-box; }
    .t input[type='number'] { width: 100px; text-align: right; }
    .num { text-align: right; }
  `,
})
export class StockDocDialog {
  private readonly api = inject(StockApi);
  private readonly options = inject(Options);
  private readonly ref = inject(MatDialogRef<StockDocDialog, StockDoc>);
  readonly data = inject<{ kind: StockDocSave['kind']; projectId?: string; warehouseId?: string } | null>(MAT_DIALOG_DATA);
  readonly projects = toSignal(this.options.projects(), { initialValue: [] });
  readonly warehouses = toSignal(this.options.warehouses(), { initialValue: [] });
  readonly kinds: StockDocSave['kind'][] = ['issue', 'transfer', 'return', 'adjust'];
  readonly titles: Record<string, string> = { issue: 'เบิกวัสดุไปใช้ในโครงการ', transfer: 'โอนย้ายระหว่างคลัง', return: 'รับคืนวัสดุจากโครงการ', adjust: 'ปรับยอดหลังตรวจนับ' };
  readonly today = todayIso();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m: StockDocSave = {
    kind: this.data?.kind ?? 'issue',
    docDate: todayIso(),
    warehouseId: this.data?.warehouseId ?? '',
    toWarehouseId: null,
    projectId: this.data?.projectId ?? null,
    notes: null,
    lines: [],
  };
  lines: { materialId: string | null; code: string | null; name: string; unit: string; qty: number | null; unitCost: number | null; note: string }[] = [];

  constructor() {
    this.add();
  }

  add(): void {
    this.lines.push({ materialId: null, code: null, name: '', unit: '', qty: null, unitCost: null, note: '' });
  }

  save(): void {
    const lines = this.lines.filter((l) => l.materialId && Number(l.qty));
    if (!this.m.warehouseId || !lines.length) {
      this.error.set('กรุณาเลือกคลังและวัสดุ (จากรายการค้นหา) พร้อมจำนวน');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .post({
        ...this.m,
        notes: this.m.notes || null,
        lines: lines.map((l) => ({ materialId: l.materialId!, qty: Number(l.qty), unitCost: l.unitCost === null || (l.unitCost as unknown) === '' ? null : Number(l.unitCost), note: l.note || null })),
      })
      .subscribe({
        next: (d) => this.ref.close(d),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

// ======================================================================= หน้าคลัง

@Component({
  selector: 'app-stock-page',
  imports: [FormsModule, MatTabsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MoneyPipe, QtyPipe, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>คลังวัสดุ</h1>
          <p>ยอดคงเหลือและต้นทุนถัวเฉลี่ยต่อคลัง เบิกใช้ตัดเป็นต้นทุนโครงการทันที</p>
        </div>
        @if (canWrite) {
          <div class="actions">
            <button mat-stroked-button (click)="newDoc('transfer')"><mat-icon>swap_horiz</mat-icon> โอนย้าย</button>
            <button mat-stroked-button (click)="newDoc('adjust')"><mat-icon>tune</mat-icon> ปรับยอด</button>
            <button mat-flat-button class="btn-primary" (click)="newDoc('issue')"><mat-icon>output</mat-icon> เบิกวัสดุ</button>
          </div>
        }
      </div>

      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false">
        <mat-tab label="คงเหลือ">
          <div class="panel tab">
            <div class="filters">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>คลัง</mat-label>
                <mat-select [(ngModel)]="wh" (selectionChange)="loadOnHand()">
                  <mat-option value="">ทุกคลัง</mat-option>
                  @for (w of warehouses(); track w.id) {
                    <mat-option [value]="w.id">{{ w.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field class="search" subscriptSizing="dynamic">
                <mat-label>ค้นหาวัสดุ</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="q" (keyup.enter)="loadOnHand()" (blur)="loadOnHand()" />
              </mat-form-field>
              <mat-checkbox [(ngModel)]="lowOnly" (change)="loadOnHand()">เฉพาะต่ำกว่าจุดสั่งซื้อ</mat-checkbox>
              <span class="grow"></span>
              <span class="small">มูลค่ารวม <b>{{ stockValue() | money }}</b> บาท</span>
            </div>
            <div class="table-scroll">
              <table class="grid">
                <thead><tr><th>รหัส</th><th>วัสดุ</th><th>คลัง</th><th class="num">คงเหลือ</th><th class="num">จุดสั่งซื้อ</th><th class="num">ต้นทุนเฉลี่ย</th><th class="num">มูลค่า</th><th>เคลื่อนไหวล่าสุด</th><th></th></tr></thead>
                <tbody>
                  @for (r of onHand(); track r.materialId + r.warehouseId) {
                    <tr class="clickable" (click)="ledger(r)" tabindex="0" (keydown.enter)="ledger(r)">
                      <td class="small">{{ r.code }}</td>
                      <td>{{ r.name }}</td>
                      <td class="small">{{ r.warehouseName }}</td>
                      <td class="num" [class.bad]="r.low">{{ r.qty | qty }} {{ r.unit }}</td>
                      <td class="num">{{ r.minQty ? (r.minQty | qty) : '–' }}</td>
                      <td class="num">{{ r.avgCost === null ? '–' : (r.avgCost | money) }}</td>
                      <td class="num">{{ r.value === null ? '–' : (r.value | money) }}</td>
                      <td class="small">{{ r.lastMovement | thDate }}</td>
                      <td>
                        @if (canWrite) {
                          <button mat-icon-button (click)="$event.stopPropagation(); setMin(r)" aria-label="ตั้งจุดสั่งซื้อ"><mat-icon>notifications</mat-icon></button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="9" class="empty muted">ไม่มีวัสดุคงเหลือ</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
        <mat-tab label="เอกสารคลัง">
          <div class="panel tab table-scroll">
            <table class="grid">
              <thead><tr><th>เลขที่</th><th>วันที่</th><th>ประเภท</th><th>คลัง</th><th>โครงการ</th><th>รายการ</th><th class="num">มูลค่า</th><th>ผู้บันทึก</th></tr></thead>
              <tbody>
                @for (d of docs(); track d.id) {
                  <tr>
                    <td class="no">{{ d.docNo }}</td>
                    <td class="small">{{ d.docDate | thDate }}</td>
                    <td class="small">{{ kind[d.kind] }}</td>
                    <td class="small">{{ d.warehouseName }}{{ d.toWarehouseName ? ' → ' + d.toWarehouseName : '' }}</td>
                    <td class="small">{{ d.projectCode || '–' }}</td>
                    <td class="small">
                      @for (l of d.lines; track $index) {
                        <div>{{ l.name }} {{ l.qty | qty }} {{ l.unit }}</div>
                      }
                    </td>
                    <td class="num">{{ d.value | money }}</td>
                    <td class="small">{{ d.createdByName }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty muted">ยังไม่มีเอกสาร</td></tr>
                }
              </tbody>
            </table>
          </div>
        </mat-tab>
        <mat-tab label="คลัง">
          <div class="panel tab">
            @if (canWrite) {
              <div class="filters"><button mat-stroked-button (click)="editWh(null)"><mat-icon>add</mat-icon> เพิ่มคลัง</button></div>
            }
            <table class="grid">
              <thead><tr><th>รหัส</th><th>ชื่อ</th><th>โครงการ</th><th class="num">มูลค่าคงเหลือ</th><th>สถานะ</th></tr></thead>
              <tbody>
                @for (w of whList(); track w.id) {
                  <tr class="clickable" (click)="canWrite && editWh(w)">
                    <td class="no">{{ w.code }}</td>
                    <td>{{ w.name }}</td>
                    <td class="small">{{ w.projectCode ? w.projectCode + ' ' + w.projectName : 'คลังกลาง' }}</td>
                    <td class="num">{{ w.stockValue | money }}</td>
                    <td class="small">{{ w.active ? 'ใช้งาน' : 'ปิด' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `.tab { margin-top: 14px; }`,
})
export class StockPage implements OnInit {
  private readonly api = inject(StockApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  readonly canWrite = this.auth.can(Perm.STOCK_WRITE);
  readonly low = input<string>();
  readonly whList = signal<Warehouse[]>([]);
  readonly warehouses = computed(() => this.whList().filter((w) => w.active));
  readonly onHand = signal<OnHand[]>([]);
  readonly docs = signal<StockDoc[]>([]);
  readonly stockValue = computed(() => this.onHand().reduce((s, r) => s + (r.value ?? 0), 0));
  readonly kind = STOCK_KIND;
  wh = '';
  q = '';
  lowOnly = false;

  ngOnInit(): void {
    this.lowOnly = this.low() === 'true';
    this.loadWarehouses();
    this.loadOnHand();
    this.loadDocs();
  }

  loadWarehouses(): void {
    this.api.warehouses().subscribe((w) => this.whList.set(w));
  }

  loadOnHand(): void {
    this.api.onHand({ warehouseId: this.wh || undefined, q: this.q.trim() || undefined, low: this.lowOnly }).subscribe({
      next: (r) => this.onHand.set(r),
      error: (e) => this.notify.error(e),
    });
  }

  loadDocs(): void {
    this.api.docs().subscribe((d) => this.docs.set(d));
  }

  ledger(r: OnHand): void {
    this.dialog.open(LedgerDialog, { data: r, maxWidth: '96vw' });
  }

  newDoc(kind: StockDocSave['kind']): void {
    this.dialog
      .open(StockDocDialog, { data: { kind, warehouseId: this.wh || this.warehouses()[0]?.id }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((d) => {
        if (!d) return;
        this.notify.ok(`บันทึก ${d.docNo} แล้ว`);
        this.loadOnHand();
        this.loadDocs();
        this.loadWarehouses();
      });
  }

  setMin(r: OnHand): void {
    prompt(this.dialog, { title: `จุดสั่งซื้อ ${r.name}`, message: r.warehouseName, label: `จำนวนขั้นต่ำ (${r.unit})`, value: String(r.minQty || ''), confirmText: 'บันทึก' }).subscribe((v) => {
      if (v === undefined) return;
      this.api.minQty(r.materialId, r.warehouseId, Number(v) || 0).subscribe({ next: () => this.loadOnHand(), error: (e) => this.notify.error(e) });
    });
  }

  editWh(w: Warehouse | null): void {
    this.dialog
      .open(WarehouseDialog, { data: w })
      .afterClosed()
      .subscribe((r) => r && this.loadWarehouses());
  }
}

@Component({
  selector: 'app-warehouse-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ w ? 'แก้ไขคลัง' : 'เพิ่มคลัง' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
      <mat-form-field class="full"><mat-label>รหัส</mat-label><input matInput [(ngModel)]="m.code" maxlength="30" /></mat-form-field>
      <mat-form-field class="full"><mat-label>ชื่อ</mat-label><input matInput [(ngModel)]="m.name" /></mat-form-field>
      <mat-form-field class="full">
        <mat-label>คลังหน้างานของโครงการ</mat-label>
        <mat-select [(ngModel)]="m.projectId">
          <mat-option [value]="null">– คลังกลาง –</mat-option>
          @for (p of projects(); track p.id) {
            <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-checkbox [(ngModel)]="m.active">ใช้งานอยู่</mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="!m.code || !m.name">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `.content { width: min(420px, 86vw); } .full { width: 100%; } .err { color: var(--ktt-danger); }`,
})
export class WarehouseDialog {
  private readonly api = inject(StockApi);
  private readonly ref = inject(MatDialogRef<WarehouseDialog, Warehouse>);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly w = inject<Warehouse | null>(MAT_DIALOG_DATA);
  readonly error = signal<string | null>(null);
  m = { code: this.w?.code ?? '', name: this.w?.name ?? '', projectId: this.w?.projectId ?? (null as string | null), active: this.w?.active ?? true };

  save(): void {
    this.api.saveWarehouse(this.w?.id ?? null, this.m).subscribe({ next: (r) => this.ref.close(r), error: (e) => this.error.set(errorMessage(e)) });
  }
}
