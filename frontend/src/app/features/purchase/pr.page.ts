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
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe, QtyPipe, round2 } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { MaterialInput } from '../../shared/material-input';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { PR_STATUS, Pr, PrItem, PrSave, PurchaseApi, Quote, QuoteSave } from './purchase.api';

// ======================================================================= บันทึกราคาจากผู้ขาย

@Component({
  selector: 'app-quote-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MoneyPipe, QtyPipe],
  template: `
    <h2 mat-dialog-title>{{ data.quote ? 'แก้ไขราคา' : 'บันทึกใบเสนอราคาจากผู้ขาย' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field class="span2">
          <mat-label>ผู้ขาย</mat-label>
          <mat-select [(ngModel)]="m.supplierId" required>
            @for (s of suppliers(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>เลขที่ใบเสนอราคา</mat-label>
          <input matInput [(ngModel)]="m.quoteRef" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่</mat-label>
          <input matInput type="date" [(ngModel)]="m.quoteDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ส่งของภายใน (วัน)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.deliveryDays" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เครดิต (วัน)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.creditDays" />
        </mat-form-field>
      </div>
      <mat-checkbox [(ngModel)]="m.vatIncluded">ราคาที่ผู้ขายเสนอรวม VAT แล้ว</mat-checkbox>
      <table class="prices">
        <thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr></thead>
        <tbody>
          @for (it of data.items; track it.id) {
            <tr>
              <td>{{ it.description }}</td>
              <td class="num">{{ it.quantity | qty }} {{ it.unit }}</td>
              <td><input type="number" min="0" step="any" [(ngModel)]="m.prices[it.id!]" (ngModelChange)="v.set(v() + 1)" placeholder="ไม่เสนอ" [attr.aria-label]="'ราคา ' + it.description" /></td>
              <td class="num">{{ line(it) | money }}</td>
            </tr>
          }
        </tbody>
        <tfoot><tr><td colspan="3">รวม{{ m.vatIncluded ? ' (รวม VAT)' : '' }}</td><td class="num">{{ total() | money }}</td></tr></tfoot>
      </table>
      <mat-form-field class="full">
        <mat-label>หมายเหตุ</mat-label>
        <input matInput [(ngModel)]="m.notes" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.supplierId">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(680px, 90vw); }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 12px; }
    .span2 { grid-column: span 2; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr 1fr; } }
    .full { width: 100%; margin-top: 12px; }
    .err { color: var(--ktt-danger); }
    .prices { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .prices th, .prices td { padding: 4px 6px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    .prices th { color: var(--ktt-steel); font-weight: 500; }
    .prices input { width: 120px; height: 32px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .prices tfoot td { font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  `,
})
export class QuoteDialog {
  private readonly api = inject(PurchaseApi);
  private readonly ref = inject(MatDialogRef<QuoteDialog, Pr>);
  readonly data = inject<{ prId: string; items: PrItem[]; quote: Quote | null }>(MAT_DIALOG_DATA);
  readonly suppliers = toSignal(this.api.supplierOptions('supplier'), { initialValue: [] });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly v = signal(0);
  m: QuoteSave = {
    supplierId: this.data.quote?.supplierId ?? '',
    quoteRef: this.data.quote?.quoteRef ?? '',
    quoteDate: this.data.quote?.quoteDate ?? todayIso(),
    deliveryDays: this.data.quote?.deliveryDays ?? null,
    creditDays: this.data.quote?.creditDays ?? null,
    vatIncluded: this.data.quote?.vatIncluded ?? false,
    prices: { ...(this.data.quote?.prices ?? {}) },
    notes: this.data.quote?.notes ?? '',
  };
  readonly total = computed(() => {
    this.v();
    return round2(this.data.items.reduce((s, it) => s + this.line(it), 0));
  });

  line(it: PrItem): number {
    const p = this.m.prices[it.id!];
    return p === null || p === undefined || (p as unknown) === '' ? 0 : round2(Number(p) * it.quantity);
  }

  save(): void {
    const prices: Record<string, number | null> = {};
    for (const it of this.data.items) {
      const p = this.m.prices[it.id!];
      prices[it.id!] = p === null || p === undefined || (p as unknown) === '' ? null : Number(p);
    }
    this.busy.set(true);
    this.api
      .saveQuote(this.data.prId, this.data.quote?.id ?? null, {
        ...this.m,
        prices,
        quoteRef: this.m.quoteRef || null,
        quoteDate: this.m.quoteDate || null,
        deliveryDays: this.m.deliveryDays === null || (this.m.deliveryDays as unknown) === '' ? null : Number(this.m.deliveryDays),
        creditDays: this.m.creditDays === null || (this.m.creditDays as unknown) === '' ? null : Number(this.m.creditDays),
        notes: this.m.notes || null,
      })
      .subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

// ======================================================================= หน้าใบขอซื้อ

@Component({
  selector: 'app-pr-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MoneyPipe, QtyPipe, ThDatePipe, MaterialInput],
  template: `
    @if (ready()) {
      <div class="page wide">
        <a routerLink="/purchase" class="back"><mat-icon>arrow_back</mat-icon> จัดซื้อ</a>
        <div class="page-head">
          <div>
            <h1>
              {{ pr()?.docNo ?? 'ใบขอซื้อใหม่' }}
              @if (pr(); as p) {
                <span class="chip" [class]="st[p.status].tone">{{ st[p.status].label }}</span>
              }
            </h1>
            @if (pr(); as p) {
              <p>ขอโดย {{ p.createdByName }} {{ p.createdAt | thDate }}
                @if (p.poId) {
                  , สั่งซื้อแล้ว <a [routerLink]="['/purchase/orders', p.poId]">{{ p.poNo }}</a>
                }
              </p>
            }
          </div>
          <div class="actions">
            @if (pr(); as p) {
              @if (p.canApprove) {
                <button mat-stroked-button (click)="decide(false)">ไม่อนุมัติ</button>
                <button mat-flat-button class="btn-primary" (click)="decide(true)"><mat-icon>check</mat-icon> อนุมัติ</button>
              }
              @if (p.status === 'draft' && p.canEdit) {
                <button mat-flat-button class="btn-primary" (click)="submit()" [disabled]="dirty()"><mat-icon>send</mat-icon> ส่งขออนุมัติ</button>
              }
              @if (p.canQuote) {
                <button mat-flat-button (click)="addQuote(null)"><mat-icon>request_quote</mat-icon> บันทึกราคาผู้ขาย</button>
              }
              @if (!['ordered', 'cancelled'].includes(p.status) && p.canEdit) {
                <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #more="matMenu">
                  <button mat-menu-item (click)="cancel()"><mat-icon>block</mat-icon>ยกเลิกใบขอซื้อ</button>
                </mat-menu>
              }
            }
          </div>
        </div>

        @if (pr()?.decisionComment) {
          <p class="notice" [class.danger]="pr()!.status === 'rejected'">{{ pr()!.decidedByName }}: {{ pr()!.decisionComment }}</p>
        }

        <section class="panel panel-pad">
          <div class="form-grid">
            <mat-form-field>
              <mat-label>ใช้กับโครงการ</mat-label>
              <mat-select [(ngModel)]="m.projectId" (selectionChange)="touch()" [disabled]="!editable()">
                <mat-option [value]="null">– ไม่ระบุ (เติมสต็อก) –</mat-option>
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
              <mat-label>วันที่ขอ</mat-label>
              <input matInput type="date" [(ngModel)]="m.requestDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ต้องการใช้วันที่</mat-label>
              <input matInput type="date" [(ngModel)]="m.requiredDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field class="span-all">
              <mat-label>หมายเหตุ</mat-label>
              <input matInput [(ngModel)]="m.notes" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
          </div>
        </section>

        <section class="panel">
          <div class="scroll">
            <table class="items">
              <thead><tr><th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคาประมาณ</th><th>หมายเหตุ</th><th class="c-act"></th></tr></thead>
              <tbody>
                @for (it of m.items; track $index; let i = $index) {
                  <tr>
                    <td class="c-no">{{ i + 1 }}</td>
                    <td>
                      <app-material-input [(description)]="it.description" [code]="it.materialCode ?? null" [disabled]="!editable()"
                        (picked)="it.materialId = $event.id; it.materialCode = $event.code; it.unit = $event.unit; it.estUnitPrice = $event.costPrice; touch()" (typed)="touch()" />
                    </td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.quantity" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="จำนวน" /></td>
                    <td><input [(ngModel)]="it.unit" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="หน่วย" /></td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.estUnitPrice" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="ราคาประมาณ" /></td>
                    <td><input [(ngModel)]="it.note" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="หมายเหตุ" /></td>
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
            <span class="grow"></span>
            <span class="small muted">ประมาณการ {{ estTotal() | money }} บาท</span>
            @if (editable()) {
              <button mat-flat-button (click)="save()" [disabled]="busy() || !dirty()">บันทึก</button>
            }
          </div>
        </section>

        @if (pr(); as p) {
          @if (p.quotes.length || p.canQuote) {
            <section class="panel">
              <div class="sec-head"><h2>เปรียบเทียบราคา</h2><span class="muted small">ราคาก่อน VAT ช่องสีเขียวคือราคาต่ำสุดของรายการนั้น</span></div>
              <div class="scroll">
                <table class="items view">
                  <thead>
                    <tr>
                      <th>รายการ</th><th class="num">จำนวน</th>
                      @for (q of p.quotes; track q.id) {
                        <th class="num">
                          <button class="link" (click)="addQuote(q)" [disabled]="!p.canQuote">{{ q.supplierName }}</button>
                          @if (q.supplierRating) {
                            <div class="muted small">คะแนน {{ q.supplierRating }}</div>
                          }
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (it of p.items; track it.id) {
                      <tr>
                        <td>{{ it.description }}</td>
                        <td class="num">{{ it.quantity | qty }} {{ it.unit }}</td>
                        @for (q of p.quotes; track q.id) {
                          <td class="num" [class.best]="best()[it.id!] === q.id">{{ unitEx(q, it.id!) === null ? '–' : (unitEx(q, it.id!) | money) }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr><td colspan="2">รวมก่อน VAT</td>@for (q of p.quotes; track q.id) {<td class="num" [class.best]="q === p.quotes[0]">{{ q.totalExVat | money }}</td>}</tr>
                    <tr><td colspan="2">ส่งของ / เครดิต</td>@for (q of p.quotes; track q.id) {<td class="num small">{{ q.deliveryDays ?? '–' }} วัน / {{ q.creditDays ?? '–' }} วัน</td>}</tr>
                    @if (p.canQuote) {
                      <tr><td colspan="2"></td>@for (q of p.quotes; track q.id) {
                        <td class="num">
                          <button mat-stroked-button (click)="order(q)">สั่งซื้อ</button>
                          <button mat-icon-button (click)="removeQuote(q)" aria-label="ลบใบเสนอราคา"><mat-icon>delete</mat-icon></button>
                        </td>
                      }</tr>
                    } @else {
                      <tr><td colspan="2"></td>@for (q of p.quotes; track q.id) {<td class="num">@if (q.selected) {<span class="chip ok">เลือกแล้ว</span>}</td>}</tr>
                    }
                  </tfoot>
                </table>
              </div>
              @if (!p.quotes.length) {
                <p class="empty muted">ยังไม่มีราคาจากผู้ขาย กด "บันทึกราคาผู้ขาย" อย่างน้อย 1 ราย (แนะนำ 3 ราย)</p>
              }
            </section>
          }
        }
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `.link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--ktt-ink-2); cursor: pointer; } .link:disabled { color: inherit; cursor: default; }`,
})
export class PrPage implements OnInit {
  private readonly api = inject(PurchaseApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly options = inject(Options);
  readonly projects = toSignal(this.options.projects(), { initialValue: [] });
  readonly warehouses = toSignal(this.options.warehouses(), { initialValue: [] });

  readonly id = input<string>();
  readonly project = input<string>();

  readonly pr = signal<Pr | null>(null);
  readonly ready = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly st = PR_STATUS;

  m: PrSave = { projectId: null, warehouseId: null, requestDate: todayIso(), requiredDate: null, notes: null, items: [] };

  readonly editable = computed(() => (this.pr() ? this.pr()!.canEdit : true));
  readonly estTotal = computed(() => {
    this.version();
    return round2(this.m.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.estUnitPrice) || 0), 0));
  });
  /** ผู้เสนอราคาต่ำสุดของแต่ละรายการ (เทียบแบบก่อน VAT) */
  readonly best = computed(() => {
    const p = this.pr();
    const out: Record<string, string> = {};
    if (!p) return out;
    for (const it of p.items) {
      let bestId: string | null = null;
      let bestPrice = Infinity;
      for (const q of p.quotes) {
        const v = this.unitEx(q, it.id!);
        if (v !== null && v < bestPrice) {
          bestPrice = v;
          bestId = q.id;
        }
      }
      if (bestId) out[it.id!] = bestId;
    }
    return out;
  });

  ngOnInit(): void {
    if (this.id() && this.id() !== 'new') {
      this.api.pr(this.id()!).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
    } else {
      this.m.projectId = this.project() ?? null;
      this.addItem();
      this.ready.set(true);
    }
  }

  private apply(p: Pr): void {
    this.pr.set(p);
    this.m = {
      projectId: p.projectId,
      warehouseId: p.warehouseId,
      requestDate: p.requestDate,
      requiredDate: p.requiredDate,
      notes: p.notes,
      items: p.items.map((i) => ({ ...i })),
    };
    this.dirty.set(false);
    this.version.update((v) => v + 1);
    this.ready.set(true);
  }

  unitEx(q: Quote, itemId: string): number | null {
    const v = q.prices[itemId];
    if (v === undefined || v === null) return null;
    return q.vatIncluded ? round2((v * 100) / 107) : v;
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  addItem(): void {
    this.m.items.push({ id: null, materialId: null, materialCode: null, description: '', quantity: 1, unit: '', estUnitPrice: null, note: null });
    this.touch();
  }

  save(): void {
    const items = this.m.items.filter((i) => i.description.trim());
    if (!items.length) {
      this.notify.error(null, 'ต้องมีอย่างน้อย 1 รายการ');
      return;
    }
    const body: PrSave = {
      ...this.m,
      requiredDate: this.m.requiredDate || null,
      notes: this.m.notes || null,
      items: items.map((i) => ({
        id: i.id ?? null,
        materialId: i.materialId,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || null,
        estUnitPrice: i.estUnitPrice === null || (i.estUnitPrice as unknown) === '' ? null : Number(i.estUnitPrice),
        note: i.note || null,
      })),
    };
    this.busy.set(true);
    const p = this.pr();
    this.api.savePr(p?.id ?? null, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!p) this.router.navigate(['/purchase/requests', r.id], { replaceUrl: true });
        this.apply(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  submit(): void {
    this.api.prAction(this.pr()!.id, 'submit').subscribe({ next: (p) => (this.apply(p), this.notify.ok('ส่งขออนุมัติแล้ว')), error: (e) => this.notify.error(e) });
  }

  decide(approve: boolean): void {
    prompt(this.dialog, {
      title: approve ? 'อนุมัติใบขอซื้อ' : 'ไม่อนุมัติใบขอซื้อ',
      label: approve ? 'ความเห็น (ถ้ามี)' : 'เหตุผล',
      confirmText: approve ? 'อนุมัติ' : 'ไม่อนุมัติ',
      required: !approve,
      multiline: true,
    }).subscribe((c) => {
      if (c === undefined) return;
      this.api.prAction(this.pr()!.id, approve ? 'approve' : 'reject', c).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
    });
  }

  cancel(): void {
    confirmAction(this.dialog, { title: 'ยกเลิกใบขอซื้อ', message: this.pr()!.docNo, confirmText: 'ยกเลิก', danger: true }).subscribe((ok) => {
      if (ok) this.api.prAction(this.pr()!.id, 'cancel').subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
    });
  }

  addQuote(q: Quote | null): void {
    this.dialog
      .open(QuoteDialog, { data: { prId: this.pr()!.id, items: this.pr()!.items, quote: q }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((p) => p && this.apply(p));
  }

  removeQuote(q: Quote): void {
    this.api.deleteQuote(this.pr()!.id, q.id).subscribe({ next: (p) => this.apply(p), error: (e) => this.notify.error(e) });
  }

  order(q: Quote): void {
    confirmAction(this.dialog, {
      title: 'สร้างใบสั่งซื้อ',
      message: `สั่งซื้อจาก ${q.supplierName} ยอดก่อน VAT ${q.totalExVat.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท (สร้างเป็นฉบับร่างให้ตรวจก่อนส่ง)`,
      confirmText: 'สร้างใบสั่งซื้อ',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.orderFromQuote(this.pr()!.id, q.id).subscribe({ next: (po) => this.router.navigate(['/purchase/orders', po.id]), error: (e) => this.notify.error(e) });
    });
  }
}
