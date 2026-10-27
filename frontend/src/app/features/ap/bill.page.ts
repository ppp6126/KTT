import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, addDaysIso, todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { PurchaseApi, SupplierOption } from '../purchase/purchase.api';
import { PvDialog } from './ap-list.page';
import { ApApi, BILL_STATUS, Bill, BillItem, BillSave, COST_CATEGORY, PV_STATUS } from './ap.api';

@Component({
  selector: 'app-bill-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MoneyPipe, ThDatePipe, AttachmentPanel],
  template: `
    @if (ready()) {
      <div class="page wide">
        <a routerLink="/ap" class="back"><mat-icon>arrow_back</mat-icon> เจ้าหนี้</a>
        <div class="page-head">
          <div>
            <h1>
              {{ bill()?.docNo ?? 'ตั้งหนี้ใหม่' }}
              @if (bill(); as b) {
                <span class="chip" [class]="st[b.status].tone">{{ st[b.status].label }}</span>
              }
            </h1>
            @if (bill(); as b) {
              <p>
                {{ b.supplierName }}
                @if (b.poId) {
                  · จาก <a [routerLink]="['/purchase/orders', b.poId]">{{ b.poNo }}</a>
                }
                @if (b.createdByName) {
                  · บันทึกโดย {{ b.createdByName }}
                }
              </p>
            }
          </div>
          <div class="actions">
            @if (bill(); as b) {
              @if (b.canApprove) {
                <button mat-flat-button class="btn-primary" (click)="approve()" [disabled]="dirty()"><mat-icon>check</mat-icon> อนุมัติตั้งหนี้</button>
              }
              @if ((b.status === 'approved' || b.status === 'partial') && canWrite) {
                <button mat-flat-button class="btn-primary" (click)="pay(b)"><mat-icon>payments</mat-icon> ทำจ่าย</button>
              }
              @if (b.canVoid || (b.status === 'draft' && canWrite)) {
                <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #more="matMenu">
                  @if (b.canVoid) {
                    <button mat-menu-item (click)="voidBill()"><mat-icon>block</mat-icon>ยกเลิกใบตั้งหนี้</button>
                  }
                  @if (b.status === 'draft' && canWrite) {
                    <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบฉบับร่าง</button>
                  }
                </mat-menu>
              }
            }
          </div>
        </div>

        @if (bill()?.subcontractClaimId) {
          <p class="notice">ตั้งหนี้อัตโนมัติจากงวดผู้รับเหมาช่วง แก้ไขยอดได้ที่สัญญาจ้างช่วง</p>
        }

        <section class="panel panel-pad">
          <div class="form-grid">
            <mat-form-field class="span-2">
              <mat-label>ผู้ขาย / เจ้าหนี้</mat-label>
              <mat-select [(ngModel)]="m.supplierId" (selectionChange)="onSupplier(); touch()" [disabled]="!editable() || !!m.poId" required>
                @for (s of suppliers(); track s.id) {
                  <mat-option [value]="s.id">{{ s.code }} {{ s.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>เลขที่ใบกำกับ/ใบแจ้งหนี้ผู้ขาย</mat-label>
              <input matInput [(ngModel)]="m.supplierInvoiceNo" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <div class="chk"><mat-checkbox [(ngModel)]="m.taxInvoice" (ngModelChange)="touch()" [disabled]="!editable()">เป็นใบกำกับภาษี (ขอคืน VAT ซื้อ)</mat-checkbox></div>
            <mat-form-field>
              <mat-label>วันที่เอกสาร</mat-label>
              <input matInput type="date" [(ngModel)]="m.billDate" (ngModelChange)="onDate(); touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ครบกำหนดจ่าย</mat-label>
              <input matInput type="date" [(ngModel)]="m.dueDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            @if (m.taxInvoice && m.vatEnabled) {
              <mat-form-field>
                <mat-label>ยื่นในเดือนภาษี</mat-label>
                <input matInput type="month" [(ngModel)]="m.taxPeriod" (ngModelChange)="touch()" [disabled]="!editable()" />
                <mat-hint>ใช้ภาษีซื้อได้ภายใน 6 เดือน</mat-hint>
              </mat-form-field>
            }
            <mat-form-field>
              <mat-label>ประเภทค่าใช้จ่าย</mat-label>
              <mat-select [(ngModel)]="m.category" (selectionChange)="touch()" [disabled]="!editable() || !!m.poId">
                @for (c of cats; track c[0]) {
                  <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>ลงต้นทุนโครงการ</mat-label>
              <mat-select [(ngModel)]="m.projectId" (selectionChange)="touch()" [disabled]="!editable() || !!m.poId">
                <mat-option [value]="null">– ค่าใช้จ่ายสำนักงาน –</mat-option>
                @for (p of projects(); track p.id) {
                  <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </section>

        <section class="panel">
          <div class="scroll">
            <table class="items">
              <thead><tr><th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคา/หน่วย</th><th class="c-money num">จำนวนเงิน</th><th class="c-act"></th></tr></thead>
              <tbody>
                @for (it of m.items; track $index; let i = $index) {
                  <tr>
                    <td class="c-no">{{ i + 1 }}</td>
                    <td><input [(ngModel)]="it.description" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="รายการ" /></td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.quantity" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="จำนวน" /></td>
                    <td><input [(ngModel)]="it.unit" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="หน่วย" /></td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.unitPrice" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="ราคา" /></td>
                    <td class="num">{{ line(it) | money }}</td>
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
          @if (editable()) {
            <div class="add-row"><button mat-button (click)="m.items.push({ description: '', quantity: 1, unit: '', unitPrice: 0 }); touch()"><mat-icon>add</mat-icon> เพิ่มรายการ</button></div>
          }
          <div class="bottom">
            <mat-form-field class="full">
              <mat-label>หมายเหตุ</mat-label>
              <textarea matInput rows="2" [(ngModel)]="m.notes" (ngModelChange)="touch()" [disabled]="!editable()"></textarea>
            </mat-form-field>
            <div class="totals">
              <dl>
                <div><dt>รวมเงิน</dt><dd>{{ calc().subtotal | money }}</dd></div>
                <div>
                  <dt><mat-checkbox [(ngModel)]="m.vatEnabled" (ngModelChange)="touch()" [disabled]="!editable()">VAT 7%</mat-checkbox></dt>
                  <dd>{{ calc().vat | money }}</dd>
                </div>
                <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>{{ calc().total | money }}</dd></div>
                <div>
                  <dt>
                    หัก ณ ที่จ่าย
                    @if (editable()) {
                      <select [(ngModel)]="m.whtPct" (ngModelChange)="touch()" aria-label="อัตราหัก ณ ที่จ่าย">
                        @for (r of whtRates; track r) {
                          <option [ngValue]="r">{{ r }}%</option>
                        }
                      </select>
                    } @else {
                      {{ m.whtPct }}%
                    }
                  </dt>
                  <dd>{{ calc().wht ? '−' : '' }}{{ calc().wht | money }}</dd>
                </div>
                <div>
                  <dt>หักประกันผลงาน</dt>
                  <dd>
                    @if (editable()) {
                      <input class="disc" type="number" min="0" [(ngModel)]="m.retentionAmount" (ngModelChange)="touch()" aria-label="หักประกันผลงาน" />
                    } @else {
                      {{ m.retentionAmount ? '−' : '' }}{{ m.retentionAmount | money }}
                    }
                  </dd>
                </div>
                <div class="grand"><dt>ยอดจ่ายสุทธิ</dt><dd>{{ calc().net | money }}</dd></div>
                @if (bill(); as b) {
                  @if (b.paidAmount) {
                    <div><dt>จ่ายแล้ว</dt><dd>{{ b.paidAmount | money }}</dd></div>
                    <div><dt>คงค้าง</dt><dd>{{ b.outstanding ?? 0 | money }}</dd></div>
                  }
                }
              </dl>
            </div>
          </div>
          @if (editable()) {
            <div class="sec-head"><span class="grow"></span><button mat-flat-button (click)="save()" [disabled]="busy() || !dirty()">บันทึก</button></div>
          }
        </section>

        @if (bill(); as b) {
          @if (b.payments.length) {
            <section class="panel">
              <div class="sec-head"><h2>การจ่ายเงิน</h2></div>
              <table class="grid">
                <thead><tr><th>ใบสำคัญจ่าย</th><th>วันที่</th><th class="num">ยอดจ่าย</th><th class="num">หัก ณ ที่จ่าย</th><th>สถานะ</th></tr></thead>
                <tbody>
                  @for (p of b.payments; track p.pvId) {
                    <tr class="clickable" [routerLink]="['/ap/vouchers', p.pvId]">
                      <td class="no">{{ p.pvNo }}</td>
                      <td class="small">{{ p.payDate | thDate }}</td>
                      <td class="num">{{ p.amount | money }}</td>
                      <td class="num">{{ p.whtAmount | money }}</td>
                      <td><span class="chip" [class]="pst[p.status].tone">{{ pst[p.status].label }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
          <section class="panel panel-pad">
            <h2>ไฟล์แนบ (ใบกำกับภาษี ใบส่งของ)</h2>
            <app-attachment-panel ownerType="ap_bill" [ownerId]="b.id" [canWrite]="canWrite" defaultCategory="other" />
          </section>
        }
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .bottom { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; padding: 0 16px; }
    @media (max-width: 900px) { .bottom { grid-template-columns: 1fr; } }
    .full { width: 100%; }
    .disc { width: 120px; height: 30px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    select { height: 28px; font: inherit; border: 1px solid var(--ktt-line); border-radius: 4px; margin-left: 6px; }
    .totals { padding: 0; }
    .totals dl { width: 100%; }
  `,
})
export class BillPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  readonly canWrite = this.auth.can(Perm.AP_WRITE);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  private readonly supplierList = toSignal(inject(PurchaseApi).supplierOptions(), { initialValue: [] as SupplierOption[] });
  readonly suppliers = computed(() => this.supplierList());
  readonly id = input<string>();
  readonly bill = signal<Bill | null>(null);
  readonly ready = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly st = BILL_STATUS;
  readonly pst = PV_STATUS;
  readonly cats = Object.entries(COST_CATEGORY);
  readonly whtRates = [0, 1, 2, 3, 5];

  m: BillSave = this.blank();

  readonly editable = computed(() => (this.bill() ? this.bill()!.canEdit : this.canWrite));
  readonly calc = computed(() => {
    this.version();
    const subtotal = round2(this.m.items.reduce((s, i) => s + this.line(i), 0));
    const vat = this.m.vatEnabled ? round2(subtotal * 0.07) : 0;
    const total = round2(subtotal + vat);
    const wht = round2((subtotal * Number(this.m.whtPct)) / 100);
    const net = round2(total - wht - (Number(this.m.retentionAmount) || 0));
    return { subtotal, vat, total, wht, net };
  });

  private blank(): BillSave {
    return {
      supplierId: '',
      supplierInvoiceNo: null,
      taxInvoice: true,
      billDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 30),
      taxPeriod: todayIso().slice(0, 7),
      projectId: null,
      poId: null,
      category: 'other',
      vatEnabled: true,
      whtPct: 0,
      retentionAmount: 0,
      notes: null,
      items: [{ description: '', quantity: 1, unit: '', unitPrice: 0 }],
    };
  }

  ngOnInit(): void {
    const id = this.id();
    if (!id || id === 'new') {
      this.ready.set(true);
      return;
    }
    this.load(id);
  }

  private load(id: string): void {
    this.api.bill(id).subscribe({
      next: (b) => this.set(b),
      error: (e) => {
        this.notify.error(e);
        this.router.navigateByUrl('/ap');
      },
    });
  }

  private set(b: Bill): void {
    this.bill.set(b);
    this.m = {
      supplierId: b.supplierId,
      supplierInvoiceNo: b.supplierInvoiceNo,
      taxInvoice: b.taxInvoice,
      billDate: b.billDate,
      dueDate: b.dueDate,
      taxPeriod: b.taxPeriod,
      projectId: b.projectId,
      poId: b.poId,
      category: b.category,
      vatEnabled: b.vatEnabled,
      whtPct: b.whtPct,
      retentionAmount: b.retentionAmount,
      notes: b.notes,
      items: b.items.map((i) => ({ ...i })),
    };
    this.dirty.set(false);
    this.ready.set(true);
    this.version.update((v) => v + 1);
  }

  line(i: BillItem): number {
    return round2((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0));
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  onSupplier(): void {
    const s = this.supplierList().find((x) => x.id === this.m.supplierId);
    if (!s) return;
    this.m.vatEnabled = s.vatRegistered;
    this.m.taxInvoice = s.vatRegistered;
    this.m.dueDate = addDaysIso(this.m.billDate, s.creditDays);
    if (s.kind === 'subcontractor') {
      this.m.category = 'subcontract';
      this.m.whtPct = 3;
    }
  }

  onDate(): void {
    if (this.m.billDate) this.m.taxPeriod = this.m.billDate.slice(0, 7);
  }

  save(): void {
    const items = this.m.items.filter((i) => i.description.trim());
    if (!this.m.supplierId || !items.length) {
      this.notify.error('กรุณาเลือกเจ้าหนี้และใส่รายการอย่างน้อย 1 รายการ');
      return;
    }
    this.busy.set(true);
    const body: BillSave = {
      ...this.m,
      supplierInvoiceNo: this.m.supplierInvoiceNo || null,
      dueDate: this.m.dueDate || null,
      taxPeriod: this.m.taxInvoice && this.m.vatEnabled ? this.m.taxPeriod || null : null,
      whtPct: Number(this.m.whtPct) || 0,
      retentionAmount: Number(this.m.retentionAmount) || 0,
      notes: this.m.notes || null,
      items: items.map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 0, unit: i.unit || null, unitPrice: Number(i.unitPrice) || 0 })),
    };
    this.api.saveBill(this.bill()?.id ?? null, body).subscribe({
      next: (b) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!this.bill()) this.router.navigate(['/ap/bills', b.id], { replaceUrl: true });
        this.set(b);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  approve(): void {
    const b = this.bill()!;
    confirmAction(this.dialog, { title: 'อนุมัติตั้งหนี้', message: `อนุมัติ ${b.docNo} ยอดจ่ายสุทธิ ${b.netPayable.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`, confirmText: 'อนุมัติ' }).subscribe(
      (ok) => ok && this.api.approveBill(b.id).subscribe({ next: (r) => this.set(r), error: (e) => this.notify.error(e) }),
    );
  }

  pay(b: Bill): void {
    this.dialog
      .open(PvDialog, { data: { supplierId: b.supplierId, billId: b.id }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.router.navigate(['/ap/vouchers', r.id]));
  }

  voidBill(): void {
    prompt(this.dialog, { title: 'ยกเลิกใบตั้งหนี้', label: 'เหตุผล', confirmText: 'ยกเลิกเอกสาร', required: true }).subscribe((v) => {
      if (!v) return;
      this.api.voidBill(this.bill()!.id, v).subscribe({ next: (r) => this.set(r), error: (e) => this.notify.error(e) });
    });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบฉบับร่าง', message: 'ลบใบตั้งหนี้ฉบับร่างนี้?', confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteBill(this.bill()!.id).subscribe({ next: () => this.router.navigateByUrl('/ap'), error: (e) => this.notify.error(e) });
    });
  }
}
