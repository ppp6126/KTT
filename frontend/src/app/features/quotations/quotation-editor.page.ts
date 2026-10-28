import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { FromQuotationDialog } from '../contracts/contract-dialogs';
import { calcQuotation } from './quotation-calc';
import { QItem, QUOTATION_STATUS, Quotation, QuotationsApi, ROUNDING } from './quotations.api';

interface Form {
  title: string;
  customerName: string;
  customerAddress: string;
  customerTaxId: string;
  customerBranchNo: string;
  customerPhone: string;
  issueDate: string;
  validUntil: string;
  referenceNo: string;
  paymentCondition: string;
  displayMode: 'summary' | 'detailed';
  discountPct: number;
  overheadPct: number;
  vatEnabled: boolean;
  vatPct: number;
  roundingMode: string;
  whtPct: number;
  durationDays: number | null;
  warrantyTerms: string;
  scopeIn: string;
  scopeOut: string;
  notes: string;
}

@Component({
  selector: 'app-quotation-editor-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MoneyPipe,
    ThDatePipe,
  ],
  templateUrl: './quotation-editor.page.html',
  styleUrl: './quotation-editor.page.scss',
})
export class QuotationEditorPage implements OnInit {
  private readonly api = inject(QuotationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly id = input.required<string>();
  readonly Perm = Perm;
  readonly statusInfo = QUOTATION_STATUS;
  readonly roundingOptions = Object.entries(ROUNDING);
  readonly discountOptions = Array.from({ length: 16 }, (_, i) => i);

  readonly q = signal<Quotation | null>(null);
  readonly form = signal<Form | null>(null);
  readonly items = signal<QItem[]>([]);
  readonly revisions = signal<{ id: string; revision: number; status: string; totalAmount: number; createdAt: string }[]>([]);
  readonly busy = signal(false);
  private saved = '';

  readonly canWrite = computed(() => this.auth.can(Perm.QUOTATION_WRITE));
  readonly editable = computed(() => !!this.q()?.editable && this.canWrite());
  readonly canCost = computed(() => this.auth.can(Perm.COST_VIEW));
  readonly calc = computed(() => {
    const f = this.form();
    return calcQuotation({
      lines: this.items().map((i) => ({ itemType: i.itemType, quantity: i.quantity, unitPrice: i.unitPrice })),
      discountPct: Number(f?.discountPct ?? 0),
      overheadPct: Number(f?.overheadPct ?? 0),
      vatEnabled: !!f?.vatEnabled,
      vatPct: Number(f?.vatPct ?? 7),
      roundingMode: f?.roundingMode ?? 'none',
      whtPct: Number(f?.whtPct ?? 0),
    });
  });
  readonly costTotal = computed(() => {
    let sum = 0;
    let has = false;
    for (const i of this.items()) {
      if (i.itemType === 'item' && i.unitCost !== null && i.unitCost !== undefined) {
        has = true;
        sum += (Number(i.unitCost) || 0) * (Number(i.quantity) || 0);
      }
    }
    return has ? sum : null;
  });
  readonly margin = computed(() => {
    const c = this.costTotal();
    const base = this.calc().beforeVat;
    return c === null || base === 0 ? null : Math.round(((base - c) / base) * 10000) / 100;
  });
  readonly needsApproval = computed(() => (this.form()?.discountPct ?? 0) > (this.q()?.approvalThresholdPct ?? 5));
  readonly dirty = computed(() => this.editable() && JSON.stringify([this.form(), this.items()]) !== this.saved);

  ngOnInit(): void {
    this.load();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }

  load(id = this.id()): void {
    this.api.get(id).subscribe({
      next: (q) => this.apply(q),
      error: (e) => {
        this.notify.error(e);
        this.router.navigate(['/quotations']);
      },
    });
    this.api.revisions(id).subscribe((r) => this.revisions.set(r));
  }

  private apply(q: Quotation): void {
    this.q.set(q);
    this.form.set({
      title: q.title ?? '',
      customerName: q.customerName,
      customerAddress: q.customerAddress ?? '',
      customerTaxId: q.customerTaxId ?? '',
      customerBranchNo: q.customerBranchNo ?? '',
      customerPhone: q.customerPhone ?? '',
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      referenceNo: q.referenceNo ?? '',
      paymentCondition: q.paymentCondition ?? '',
      displayMode: q.displayMode,
      discountPct: Number(q.discountPct),
      overheadPct: Number(q.overheadPct),
      vatEnabled: q.vatEnabled,
      vatPct: Number(q.vatPct),
      roundingMode: q.roundingMode,
      whtPct: Number(q.whtPct),
      durationDays: q.durationDays,
      warrantyTerms: q.warrantyTerms ?? '',
      scopeIn: q.scopeIn ?? '',
      scopeOut: q.scopeOut ?? '',
      notes: q.notes ?? '',
    });
    this.items.set(q.items.map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity), unitPrice: i.unitPrice === null ? null : Number(i.unitPrice), unitCost: i.unitCost === null ? null : Number(i.unitCost) })));
    this.saved = JSON.stringify([this.form(), this.items()]);
  }

  set<K extends keyof Form>(key: K, value: Form[K]): void {
    const f = this.form();
    if (f) this.form.set({ ...f, [key]: value });
  }

  statusLabel(s: string): string {
    return (QUOTATION_STATUS as Record<string, { label: string }>)[s]?.label ?? s;
  }

  /** ลำดับที่ของรายการ (ไม่นับหัวข้อ/หมายเหตุ) */
  itemNo(index: number): number {
    let n = 0;
    const list = this.items();
    for (let i = 0; i <= index; i++) if (list[i].itemType === 'item') n++;
    return n;
  }

  touch(): void {
    this.items.set([...this.items()]);
  }

  addItem(type: 'item' | 'heading' | 'note' = 'item', at?: number): void {
    const row: QItem = { itemType: type, description: '', quantity: type === 'item' ? 1 : null, unit: type === 'item' ? 'งาน' : null, unitPrice: type === 'item' ? 0 : null, unitCost: null };
    const list = [...this.items()];
    list.splice(at === undefined ? list.length : at + 1, 0, row);
    this.items.set(list);
  }

  removeItem(i: number): void {
    const list = [...this.items()];
    list.splice(i, 1);
    this.items.set(list);
  }

  moveItem(i: number, dir: -1 | 1): void {
    const j = i + dir;
    const list = [...this.items()];
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.items.set(list);
  }

  save(after?: () => void): void {
    const f = this.form();
    const q = this.q();
    if (!f || !q) return;
    if (this.items().some((i) => !i.description.trim())) {
      this.notify.error(null, 'กรุณากรอกรายการให้ครบทุกแถว (หรือลบแถวว่าง)');
      return;
    }
    this.busy.set(true);
    const body = {
      ...f,
      title: f.title || null,
      customerAddress: f.customerAddress || null,
      customerTaxId: f.customerTaxId.replace(/\D/g, '') || null,
      customerBranchNo: f.customerBranchNo || null,
      customerPhone: f.customerPhone || null,
      referenceNo: f.referenceNo || null,
      paymentCondition: f.paymentCondition || null,
      durationDays: f.durationDays === null || (f.durationDays as unknown) === '' ? null : Number(f.durationDays),
      warrantyTerms: f.warrantyTerms || null,
      scopeIn: f.scopeIn || null,
      scopeOut: f.scopeOut || null,
      notes: f.notes || null,
      items: this.items().map((i) => ({
        id: i.id ?? null,
        itemType: i.itemType,
        description: i.description.trim(),
        quantity: i.itemType === 'item' ? Number(i.quantity) || 0 : null,
        unit: i.itemType === 'item' ? i.unit || null : null,
        unitPrice: i.itemType === 'item' ? Number(i.unitPrice) || 0 : null,
        unitCost: i.itemType === 'item' && i.unitCost !== null && (i.unitCost as unknown) !== '' ? Number(i.unitCost) : null,
      })),
    };
    this.api.update(q.id, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.apply(r);
        if (after) after();
        else this.notify.ok('บันทึกแล้ว');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  send(): void {
    const q = this.q();
    if (!q) return;
    const go = () => {
      const pending = this.needsApproval() && q.status === 'draft';
      confirmAction(this.dialog, {
        title: pending ? 'ขออนุมัติส่วนลด' : 'ส่งใบเสนอราคา',
        message: pending
          ? `ส่วนลด ${this.form()?.discountPct}% เกินเกณฑ์ ${q.approvalThresholdPct}% ระบบจะส่งให้ผู้บริหารอนุมัติก่อน`
          : 'ยืนยันว่าส่งให้ลูกค้าแล้ว หลังจากนี้แก้ไขไม่ได้ ต้องสร้าง Revision ใหม่',
        confirmText: pending ? 'ส่งขออนุมัติ' : 'ส่งแล้ว',
      }).subscribe((ok) => {
        if (!ok) return;
        this.api.action(q.id, 'send').subscribe({
          next: (r) => {
            this.apply(r);
            this.notify.ok(r.status === 'pending_approval' ? 'ส่งขออนุมัติแล้ว' : 'บันทึกการส่งแล้ว');
            this.load(r.id);
          },
          error: (e) => this.notify.error(e),
        });
      });
    };
    if (this.dirty()) this.save(go);
    else go();
  }

  accept(): void {
    const q = this.q();
    if (!q) return;
    confirmAction(this.dialog, { title: 'ลูกค้าอนุมัติ', message: `บันทึกว่าลูกค้าอนุมัติ ${q.displayNo} ลีดจะเปลี่ยนเป็น "ได้งาน"`, confirmText: 'บันทึก' })
      .subscribe((ok) => ok && this.api.action(q.id, 'accept').subscribe({ next: (r) => this.apply(r), error: (e) => this.notify.error(e) }));
  }

  reject(): void {
    const q = this.q();
    if (!q) return;
    prompt(this.dialog, { title: 'ลูกค้าปฏิเสธ', label: 'เหตุผล (ถ้ามี)', confirmText: 'บันทึก', multiline: true }).subscribe((reason) => {
      if (reason === undefined) return;
      this.api.reject(q.id, reason || null).subscribe({ next: (r) => this.apply(r), error: (e) => this.notify.error(e) });
    });
  }

  revise(): void {
    const q = this.q();
    if (!q) return;
    this.api.action(q.id, 'revise').subscribe({
      next: (r) => {
        this.notify.ok(`สร้าง Rev.${r.revision} แล้ว`);
        this.router.navigate(['/quotations', r.id]).then(() => this.load(r.id));
      },
      error: (e) => this.notify.error(e),
    });
  }

  remove(): void {
    const q = this.q();
    if (!q) return;
    confirmAction(this.dialog, { title: 'ลบฉบับร่าง', message: `ลบ ${q.displayNo}`, confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(q.id).subscribe({
        next: () => {
          this.saved = JSON.stringify([this.form(), this.items()]);
          this.router.navigate(['/quotations']);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  openRevision(id: string): void {
    this.router.navigate(['/quotations', id]).then(() => this.load(id));
  }

  /** แปลงใบเสนอราคาที่ลูกค้าอนุมัติเป็นโครงการ + สัญญา */
  toContract(): void {
    const q = this.q();
    if (!q) return;
    this.dialog
      .open(FromQuotationDialog, {
        data: { quotationId: q.id, displayNo: q.displayNo, title: q.title, baseAmount: q.totalAmount - q.vatAmount, durationDays: q.durationDays },
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((c) => {
        if (c) {
          this.notify.ok(`สร้างโครงการ ${c.projectCode} และสัญญา ${c.docNo} แล้ว`);
          this.router.navigate(['/projects', c.projectId, 'contract']);
        }
      });
  }

  print(): void {
    const q = this.q();
    if (!q) return;
    const open = () => window.open(`/print/quotations/${q.id}`, '_blank');
    if (this.dirty()) this.save(open);
    else open();
  }
}
