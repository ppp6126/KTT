import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, addDaysIso, todayIso } from '../../core/util/format';
import { MoneyPipe, QtyPipe, round2 } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { MaterialInput } from '../../shared/material-input';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { ApApi } from '../ap/ap.api';
import { PO_STATUS, Po, PoItem, PoSave, PurchaseApi } from './purchase.api';

// ======================================================================= รับของ

@Component({
  selector: 'app-receive-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, QtyPipe],
  template: `
    <h2 mat-dialog-title>รับของตาม {{ po.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <p class="muted">{{ po.warehouseName ? 'รับเข้าคลัง ' + po.warehouseName : 'ส่งตรงหน้างาน ' + (po.projectCode ?? '') + ' (ตัดเป็นต้นทุนโครงการทันที)' }}</p>
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่รับ</mat-label>
          <input matInput type="date" [(ngModel)]="date" [max]="today" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เลขที่ใบส่งของ</mat-label>
          <input matInput [(ngModel)]="deliveryNo" />
        </mat-form-field>
      </div>
      <table class="t">
        <thead><tr><th>รายการ</th><th class="num">สั่ง</th><th class="num">รับแล้ว</th><th class="num">รับครั้งนี้</th></tr></thead>
        <tbody>
          @for (it of lines; track it.id) {
            <tr>
              <td>{{ it.description }}</td>
              <td class="num">{{ it.quantity | qty }} {{ it.unit }}</td>
              <td class="num">{{ it.receivedQty | qty }}</td>
              <td class="num"><input type="number" min="0" [max]="it.remainingQty!" step="any" [(ngModel)]="qty[it.id!]" [attr.aria-label]="'รับ ' + it.description" /></td>
            </tr>
          }
        </tbody>
      </table>
      <mat-form-field class="full">
        <mat-label>หมายเหตุ (เช่น ของชำรุด ขาดส่ง)</mat-label>
        <input matInput [(ngModel)]="notes" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy()">บันทึกรับของ</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(640px, 90vw); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    .full { width: 100%; margin-top: 12px; }
    .err { color: var(--ktt-danger); }
    .t { width: 100%; border-collapse: collapse; }
    .t th, .t td { padding: 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .t th { color: var(--ktt-steel); font-weight: 500; }
    .t input { width: 100px; height: 32px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  `,
})
export class ReceiveDialog {
  private readonly api = inject(PurchaseApi);
  private readonly ref = inject(MatDialogRef<ReceiveDialog, Po>);
  readonly po = inject<Po>(MAT_DIALOG_DATA);
  readonly lines = this.po.items.filter((i) => (i.remainingQty ?? 0) > 0);
  readonly qty: Record<string, number> = Object.fromEntries(this.lines.map((i) => [i.id!, i.remainingQty!]));
  readonly today = todayIso();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  date = todayIso();
  deliveryNo = '';
  notes = '';

  save(): void {
    const lines = this.lines.map((i) => ({ poItemId: i.id!, quantity: Number(this.qty[i.id!]) || 0 })).filter((l) => l.quantity > 0);
    if (!lines.length) {
      this.error.set('กรุณาใส่จำนวนที่รับอย่างน้อย 1 รายการ');
      return;
    }
    this.busy.set(true);
    this.api.receive(this.po.id, { receiveDate: this.date, deliveryNoteNo: this.deliveryNo || null, notes: this.notes || null, lines }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= หน้าใบสั่งซื้อ

@Component({
  selector: 'app-po-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MoneyPipe, QtyPipe, ThDatePipe, MaterialInput, AttachmentPanel],
  template: `
    @if (ready()) {
      <div class="page wide">
        <a routerLink="/purchase" [state]="{ view: 'po' }" class="back"><mat-icon>arrow_back</mat-icon> จัดซื้อ</a>
        <div class="page-head">
          <div>
            <h1>
              {{ po()?.docNo ?? 'ใบสั่งซื้อใหม่' }}
              @if (po(); as p) {
                <span class="chip" [class]="st[p.status].tone">{{ st[p.status].label }}</span>
              }
            </h1>
            @if (po(); as p) {
              <p>
                {{ p.supplierName }}
                @if (p.prId) {
                  , จาก <a [routerLink]="['/purchase/requests', p.prId]">{{ p.prNo }}</a>
                }
                @if (p.approvedByName) {
                  , อนุมัติโดย {{ p.approvedByName }}
                }
              </p>
            }
          </div>
          <div class="actions">
            @if (po(); as p) {
              <a mat-stroked-button [routerLink]="['/print/po', p.id]" target="_blank"><mat-icon>print</mat-icon> พิมพ์</a>
              @if (p.canReceive) {
                <button mat-flat-button class="btn-primary" (click)="receive()"><mat-icon>inventory</mat-icon> รับของ</button>
              }
              @if (p.canApprove) {
                <button mat-stroked-button (click)="decide(false)">ไม่อนุมัติ</button>
                <button mat-flat-button class="btn-primary" (click)="decide(true)"><mat-icon>check</mat-icon> อนุมัติ</button>
              }
              @if (p.canEdit) {
                <button mat-flat-button class="btn-primary" (click)="submit()" [disabled]="dirty()">
                  <mat-icon>send</mat-icon> {{ p.needsApproval ? 'ส่งขออนุมัติ' : 'ยืนยันสั่งซื้อ' }}
                </button>
              }
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                @if (canBill && ['partial', 'received', 'closed'].includes(p.status)) {
                  <button mat-menu-item (click)="bill()"><mat-icon>receipt</mat-icon>ตั้งหนี้จากใบสั่งซื้อนี้</button>
                }
                @if (p.status === 'partial') {
                  <button mat-menu-item (click)="act('close')"><mat-icon>task_alt</mat-icon>ปิดใบสั่งซื้อ (ไม่รับเพิ่ม)</button>
                }
                @if (['draft', 'pending_approval', 'approved'].includes(p.status) && canWrite) {
                  <button mat-menu-item (click)="act('cancel')"><mat-icon>block</mat-icon>ยกเลิกใบสั่งซื้อ</button>
                }
                @if (p.status === 'draft' && canWrite) {
                  <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบฉบับร่าง</button>
                }
              </mat-menu>
            }
          </div>
        </div>

        <section class="panel panel-pad">
          <div class="form-grid">
            <mat-form-field class="span-2">
              <mat-label>ผู้ขาย</mat-label>
              <mat-select [(ngModel)]="m.supplierId" (selectionChange)="onSupplier(); touch()" [disabled]="!editable()" required>
                @for (s of suppliers(); track s.id) {
                  <mat-option [value]="s.id">{{ s.code }} {{ s.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>โครงการ</mat-label>
              <mat-select [(ngModel)]="m.projectId" (selectionChange)="touch()" [disabled]="!editable()">
                <mat-option [value]="null">–</mat-option>
                @for (p of projects(); track p.id) {
                  <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>รับเข้าคลัง</mat-label>
              <mat-select [(ngModel)]="m.warehouseId" (selectionChange)="touch()" [disabled]="!editable()">
                <mat-option [value]="null">– ส่งตรงหน้างาน –</mat-option>
                @for (w of warehouses(); track w.id) {
                  <mat-option [value]="w.id">{{ w.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>วันที่สั่ง</mat-label>
              <input matInput type="date" [(ngModel)]="m.orderDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>กำหนดส่ง</mat-label>
              <input matInput type="date" [(ngModel)]="m.deliveryDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เครดิต (วัน)</mat-label>
              <input matInput type="number" min="0" [(ngModel)]="m.creditDays" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เงื่อนไขการชำระ</mat-label>
              <input matInput [(ngModel)]="m.paymentTerms" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field class="span-all">
              <mat-label>สถานที่ส่งของ (เว้นว่างใช้ที่อยู่ไซต์งาน)</mat-label>
              <input matInput [(ngModel)]="m.deliveryAddress" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
          </div>
        </section>

        <section class="panel">
          <div class="scroll">
            <table class="items">
              <thead>
                <tr>
                  <th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคา/หน่วย</th><th class="c-money num">จำนวนเงิน</th>
                  @if (po() && po()!.status !== 'draft') {
                    <th class="c-qty num">รับแล้ว</th>
                  }
                  <th class="c-act"></th>
                </tr>
              </thead>
              <tbody>
                @for (it of m.items; track $index; let i = $index) {
                  <tr>
                    <td class="c-no">{{ i + 1 }}</td>
                    <td>
                      <app-material-input [(description)]="it.description" [code]="it.materialCode ?? null" [disabled]="!editable()"
                        (picked)="it.materialId = $event.id; it.materialCode = $event.code; it.unit = $event.unit; it.unitPrice = $event.costPrice ?? it.unitPrice; touch()" (typed)="touch()" />
                    </td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.quantity" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="จำนวน" /></td>
                    <td><input [(ngModel)]="it.unit" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="หน่วย" /></td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.unitPrice" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="ราคาต่อหน่วย" /></td>
                    <td class="num">{{ line(it) | money }}</td>
                    @if (po() && po()!.status !== 'draft') {
                      <td class="num">{{ it.receivedQty | qty }}</td>
                    }
                    <td class="c-act">
                      @if (editable()) {
                        <button mat-icon-button (click)="m.items.splice(i, 1); touch()" aria-label="ลบแถว"><mat-icon>close</mat-icon></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="sec-head">
            @if (editable()) {
              <button mat-button (click)="addItem()"><mat-icon>add</mat-icon> เพิ่มรายการ</button>
            }
          </div>
          <div class="bottom">
            <div class="left">
              <mat-form-field class="full">
                <mat-label>หมายเหตุบนใบสั่งซื้อ</mat-label>
                <textarea matInput rows="2" [(ngModel)]="m.notes" (ngModelChange)="touch()" [disabled]="!editable()"></textarea>
              </mat-form-field>
            </div>
            <div class="totals">
              <dl>
                <div><dt>รวมเงิน</dt><dd>{{ calc().subtotal | money }}</dd></div>
                <div>
                  <dt>ส่วนลด</dt>
                  <dd>
                    @if (editable()) {
                      <input class="disc" type="number" min="0" [(ngModel)]="m.discountAmount" (ngModelChange)="touch()" aria-label="ส่วนลด" />
                    } @else {
                      {{ m.discountAmount | money }}
                    }
                  </dd>
                </div>
                <div>
                  <dt><mat-checkbox [(ngModel)]="m.vatEnabled" (ngModelChange)="touch()" [disabled]="!editable()">VAT 7%</mat-checkbox></dt>
                  <dd>{{ calc().vat | money }}</dd>
                </div>
                <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>{{ calc().total | money }}</dd></div>
                @if (po(); as p) {
                  @if (p.billedAmount) {
                    <div><dt>ตั้งหนี้แล้ว (ก่อน VAT)</dt><dd>{{ p.billedAmount | money }}</dd></div>
                  }
                }
              </dl>
            </div>
          </div>
          @if (editable()) {
            <div class="sec-head"><span class="grow"></span><button mat-flat-button (click)="save()" [disabled]="busy() || !dirty()">บันทึกร่าง</button></div>
          }
        </section>

        @if (po(); as p) {
          @if (p.receipts.length) {
            <section class="panel">
              <div class="sec-head"><h2>ใบรับสินค้า</h2></div>
              <div class="scroll">
                <table class="grid">
                  <thead><tr><th>เลขที่</th><th>วันที่รับ</th><th>รับที่</th><th>ใบส่งของ</th><th>รายการ</th><th class="num">มูลค่า</th><th>สถานะ</th><th></th></tr></thead>
                  <tbody>
                    @for (g of p.receipts; track g.id) {
                      <tr [class.muted]="g.status === 'void'">
                        <td class="no">{{ g.docNo }}</td>
                        <td class="small">{{ g.receiveDate | thDate }}</td>
                        <td class="small">{{ g.warehouseName }}</td>
                        <td class="small">{{ g.deliveryNoteNo || '–' }}</td>
                        <td class="small">
                          @for (l of g.lines; track $index) {
                            <div>{{ l.description }} {{ l.quantity | qty }} {{ l.unit }}</div>
                          }
                        </td>
                        <td class="num">{{ g.value | money }}</td>
                        <td>{{ g.status === 'void' ? 'ยกเลิก' : 'บันทึกแล้ว' }}</td>
                        <td>
                          @if (g.status !== 'void' && (canWrite || canStock)) {
                            <button mat-button (click)="voidGr(g.id)">ยกเลิก</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
          <section class="panel panel-pad">
            <h2>ไฟล์แนบ</h2>
            <app-attachment-panel ownerType="purchase_order" [ownerId]="p.id" [canWrite]="canWrite" defaultCategory="other" />
          </section>
        }
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .bottom { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; padding: 0 16px; }
    @media (max-width: 900px) { .bottom { grid-template-columns: 1fr; } }
    .full { width: 100%; }
    .disc { width: 120px; height: 30px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .totals { padding: 0; }
    .totals dl { width: 100%; }
  `,
})
export class PoPage implements OnInit {
  private readonly api = inject(PurchaseApi);
  private readonly ap = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly options = inject(Options);
  private readonly auth = inject(AuthService);
  readonly canWrite = this.auth.can(Perm.PURCHASE_WRITE);
  readonly canStock = this.auth.can(Perm.STOCK_WRITE);
  readonly canBill = this.auth.can(Perm.AP_WRITE);
  readonly projects = toSignal(this.options.projects(), { initialValue: [] });
  readonly warehouses = toSignal(this.options.warehouses(), { initialValue: [] });
  readonly suppliers = toSignal(this.api.supplierOptions('supplier'), { initialValue: [] });

  readonly id = input<string>();
  readonly po = signal<Po | null>(null);
  readonly ready = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly st = PO_STATUS;

  m: PoSave & { items: (PoItem & { materialCode?: string | null })[] } = {
    supplierId: '',
    projectId: null,
    warehouseId: null,
    orderDate: todayIso(),
    deliveryDate: addDaysIso(todayIso(), 3),
    deliveryAddress: null,
    discountAmount: 0,
    vatEnabled: true,
    creditDays: 30,
    paymentTerms: null,
    notes: null,
    items: [],
  };

  readonly editable = computed(() => (this.po() ? this.po()!.canEdit : this.canWrite));
  readonly calc = computed(() => {
    this.version();
    const subtotal = round2(this.m.items.reduce((s, i) => s + this.line(i), 0));
    const base = round2(subtotal - (Number(this.m.discountAmount) || 0));
    const vat = this.m.vatEnabled ? round2(base * 0.07) : 0;
    return { subtotal, vat, total: round2(base + vat) };
  });

  ngOnInit(): void {
    if (this.id() && this.id() !== 'new') {
      this.load();
    } else {
      this.addItem();
      this.ready.set(true);
    }
  }

  private load(): void {
    this.api.po(this.id()!).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
  }

  private apply(p: Po): void {
    this.po.set(p);
    this.m = {
      supplierId: p.supplierId,
      projectId: p.projectId,
      warehouseId: p.warehouseId,
      orderDate: p.orderDate,
      deliveryDate: p.deliveryDate,
      deliveryAddress: p.deliveryAddress,
      discountAmount: p.discountAmount,
      vatEnabled: p.vatEnabled,
      creditDays: p.creditDays,
      paymentTerms: p.paymentTerms,
      notes: p.notes,
      items: p.items.map((i) => ({ ...i })),
    };
    this.dirty.set(false);
    this.version.update((v) => v + 1);
    this.ready.set(true);
  }

  line(it: PoItem): number {
    return round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  onSupplier(): void {
    const s = this.suppliers().find((x) => x.id === this.m.supplierId);
    if (s) {
      this.m.creditDays = s.creditDays;
      this.m.vatEnabled = s.vatRegistered;
    }
  }

  addItem(): void {
    this.m.items.push({ id: null, materialId: null, materialCode: null, prItemId: null, description: '', quantity: 1, unit: '', unitPrice: 0 });
    this.touch();
  }

  save(): void {
    const items = this.m.items.filter((i) => i.description.trim());
    if (!this.m.supplierId || !items.length) {
      this.notify.error(null, 'กรุณาเลือกผู้ขายและกรอกอย่างน้อย 1 รายการ');
      return;
    }
    const body: PoSave = {
      ...this.m,
      deliveryDate: this.m.deliveryDate || null,
      deliveryAddress: this.m.deliveryAddress || null,
      discountAmount: Number(this.m.discountAmount) || 0,
      creditDays: Number(this.m.creditDays) || 0,
      paymentTerms: this.m.paymentTerms || null,
      notes: this.m.notes || null,
      items: items.map((i) => ({
        materialId: i.materialId,
        prItemId: i.prItemId,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || null,
        unitPrice: Number(i.unitPrice) || 0,
      })),
    };
    this.busy.set(true);
    const p = this.po();
    this.api.savePo(p?.id ?? null, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!p) this.router.navigate(['/purchase/orders', r.id], { replaceUrl: true });
        this.apply(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  submit(): void {
    this.api.poAction(this.po()!.id, 'submit').subscribe({
      next: (p) => {
        this.apply(p);
        this.notify.ok(p.status === 'approved' ? 'ยืนยันสั่งซื้อแล้ว' : 'ส่งขออนุมัติแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  decide(approve: boolean): void {
    prompt(this.dialog, { title: approve ? 'อนุมัติใบสั่งซื้อ' : 'ไม่อนุมัติ (ส่งกลับแก้ไข)', label: 'ความเห็น', confirmText: approve ? 'อนุมัติ' : 'ส่งกลับ', required: !approve, multiline: true }).subscribe((c) => {
      if (c === undefined) return;
      this.api.poAction(this.po()!.id, approve ? 'approve' : 'reject', c).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
    });
  }

  act(action: 'cancel' | 'close'): void {
    confirmAction(this.dialog, {
      title: action === 'cancel' ? 'ยกเลิกใบสั่งซื้อ' : 'ปิดใบสั่งซื้อ',
      message: action === 'cancel' ? 'แจ้งผู้ขายด้วยว่ายกเลิกคำสั่งซื้อ' : 'รายการที่ยังไม่ได้รับจะไม่รับเพิ่มอีก',
      confirmText: action === 'cancel' ? 'ยกเลิกใบสั่งซื้อ' : 'ปิดใบสั่งซื้อ',
      danger: action === 'cancel',
    }).subscribe((ok) => ok && this.api.poAction(this.po()!.id, action).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) }));
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบฉบับร่าง', message: this.po()!.docNo, confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.deletePo(this.po()!.id).subscribe({ next: () => this.router.navigate(['/purchase']), error: (e) => this.notify.error(e) }),
    );
  }

  receive(): void {
    this.dialog
      .open(ReceiveDialog, { data: this.po(), maxWidth: '96vw' })
      .afterClosed()
      .subscribe((p) => {
        if (p) {
          this.apply(p);
          this.notify.ok('บันทึกรับของแล้ว');
        }
      });
  }

  voidGr(id: string): void {
    confirmAction(this.dialog, { title: 'ยกเลิกใบรับสินค้า', message: 'สต็อกจะถูกหักคืน (ต้องยังไม่ถูกเบิกออก)', confirmText: 'ยกเลิกใบรับ', danger: true }).subscribe(
      (ok) => ok && this.api.voidReceipt(id).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) }),
    );
  }

  bill(): void {
    this.ap.billFromPo(this.po()!.id).subscribe({ next: (b) => this.router.navigate(['/ap/bills', b.id]), error: (e) => this.notify.error(e) });
  }
}
