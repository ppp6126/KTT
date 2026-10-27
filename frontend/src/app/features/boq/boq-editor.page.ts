import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { QuotationsApi } from '../quotations/quotations.api';
import { EditRow, calcBoq } from './boq-calc';
import { BoqTree } from './boq-tree';
import { Boq, BoqApi, BoqHeader, FactorTable, TemplateSummary } from './boq.api';

export function toEditRows(b: Boq): EditRow[] {
  return b.items.map((i) => ({
    key: i.id,
    parentKey: i.parentId,
    description: i.description,
    unit: i.unit,
    quantity: Number(i.quantity),
    materialId: i.materialId,
    laborId: i.laborId,
    equipmentId: i.equipmentId,
    unitMaterialCost: Number(i.unitMaterialCost ?? 0),
    unitLabor: Number(i.unitLabor ?? 0),
    unitEquipment: Number(i.unitEquipment ?? 0),
    note: i.note,
    ...(b.canViewCost ? {} : { serverSell: Number(i.lineSell), serverUnitSell: i.unitSell }),
  }));
}

@Component({
  selector: 'app-boq-editor-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
    MatProgressBarModule,
    MoneyPipe,
    ThDatePipe,
    BoqTree,
  ],
  templateUrl: './boq-editor.page.html',
  styleUrl: './boq-editor.page.scss',
})
export class BoqEditorPage implements OnInit {
  private readonly api = inject(BoqApi);
  private readonly qApi = inject(QuotationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly id = input.required<string>();
  readonly boq = signal<Boq | null>(null);
  readonly rows = signal<EditRow[]>([]);
  readonly header = signal<BoqHeader | null>(null);
  readonly templates = signal<TemplateSummary[]>([]);
  readonly factorTables = signal<FactorTable[]>([]);
  readonly saving = signal(false);
  private savedRows = '';
  private savedHeader = '';

  readonly canEdit = computed(() => this.auth.can(Perm.BOQ_WRITE) && this.auth.can(Perm.COST_VIEW));
  readonly canCost = computed(() => this.boq()?.canViewCost ?? false);
  readonly markup = computed(() => {
    const h = this.header();
    return h ? Number(h.overheadPct) + Number(h.profitPct) + Number(h.contingencyPct) : 0;
  });
  readonly totals = computed(() => {
    const h = this.header();
    return calcBoq(this.rows(), this.markup(), Number(h?.discountAmount ?? 0), Number(h?.vatPct ?? 7));
  });
  readonly dirty = computed(() => JSON.stringify(this.rows()) !== this.savedRows || JSON.stringify(this.header()) !== this.savedHeader);

  ngOnInit(): void {
    this.load();
    if (this.canEdit()) {
      this.api.templates().subscribe((t) => this.templates.set(t));
      this.api.factorTables().subscribe((t) => this.factorTables.set(t));
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }

  load(): void {
    this.api.get(this.id()).subscribe({
      next: (b) => this.apply(b),
      error: (e) => {
        this.notify.error(e);
        this.router.navigate(['/leads']);
      },
    });
  }

  private apply(b: Boq): void {
    this.boq.set(b);
    this.rows.set(toEditRows(b));
    this.header.set({
      name: b.name,
      optionLabel: b.optionLabel,
      overheadPct: Number(b.overheadPct ?? 0),
      profitPct: Number(b.profitPct ?? 0),
      contingencyPct: Number(b.contingencyPct ?? 0),
      discountAmount: Number(b.discountAmount),
      vatPct: Number(b.vatPct),
      whtPct: Number(b.whtPct),
      factorFMode: b.factorFMode,
      factorFValue: b.factorFValue === null ? null : Number(b.factorFValue),
      factorFTableId: b.factorFTableId,
      projectName: b.projectName,
      projectLocation: b.projectLocation,
      ownerAgency: b.ownerAgency,
      notes: b.notes,
    });
    this.savedRows = JSON.stringify(this.rows());
    this.savedHeader = JSON.stringify(this.header());
  }

  setHeader<K extends keyof BoqHeader>(key: K, value: BoqHeader[K]): void {
    const h = this.header();
    if (h) this.header.set({ ...h, [key]: value });
  }

  save(): void {
    const h = this.header();
    if (!h) return;
    const empty = this.rows().findIndex((r) => !r.description.trim());
    if (empty >= 0) {
      this.notify.error(null, `แถวที่ ${this.totals().rows.get(this.rows()[empty].key)?.number} ยังไม่มีรายละเอียด`);
      return;
    }
    this.saving.set(true);
    const items = this.rows().map((r) => ({
      key: r.key,
      parentKey: r.parentKey,
      description: r.description.trim(),
      unit: r.unit || null,
      quantity: Number(r.quantity) || 0,
      materialId: r.materialId,
      laborId: r.laborId,
      equipmentId: r.equipmentId,
      unitMaterialCost: Number(r.unitMaterialCost) || 0,
      unitLabor: Number(r.unitLabor) || 0,
      unitEquipment: Number(r.unitEquipment) || 0,
      note: r.note,
    }));
    const headerBody = {
      ...h,
      overheadPct: Number(h.overheadPct) || 0,
      profitPct: Number(h.profitPct) || 0,
      contingencyPct: Number(h.contingencyPct) || 0,
      discountAmount: Number(h.discountAmount) || 0,
      vatPct: Number(h.vatPct) || 0,
      whtPct: Number(h.whtPct) || 0,
      factorFValue: h.factorFValue === null || (h.factorFValue as unknown) === '' ? null : Number(h.factorFValue),
    };
    // บันทึกรายการก่อน แล้วค่อยบันทึกหัว (ยอดรวมคำนวณจากรายการล่าสุด)
    this.api.saveItems(this.id(), items).pipe(switchMap(() => this.api.updateHeader(this.id(), headerBody))).subscribe({
      next: (b) => {
        this.saving.set(false);
        this.apply(b);
        this.notify.ok('บันทึก BOQ แล้ว');
      },
      error: (e) => {
        this.saving.set(false);
        this.notify.error(e);
      },
    });
  }

  refreshPrices(): void {
    this.confirmIfDirty(() =>
      this.api.refreshPrices(this.id()).subscribe({
        next: (b) => {
          this.apply(b);
          this.notify.ok('ดึงราคาล่าสุดจากฐานราคาแล้ว');
        },
        error: (e) => this.notify.error(e),
      }),
    );
  }

  insertTemplate(t: TemplateSummary): void {
    this.confirmIfDirty(() =>
      this.api.insertTemplate(this.id(), t.id).subscribe({
        next: (b) => {
          this.apply(b);
          this.notify.ok(`แทรก "${t.name}" แล้ว`);
        },
        error: (e) => this.notify.error(e),
      }),
    );
  }

  saveAsTemplate(): void {
    prompt(this.dialog, { title: 'บันทึกเป็นแม่แบบ', label: 'ชื่อแม่แบบ', confirmText: 'บันทึก', required: true, value: this.boq()?.name })
      .subscribe((name) => {
        if (!name) return;
        this.api.saveAsTemplate(this.id(), name).subscribe({
          next: () => this.notify.ok('บันทึกแม่แบบแล้ว'),
          error: (e) => this.notify.error(e),
        });
      });
  }

  createQuotation(mode: 'summary' | 'detailed'): void {
    const b = this.boq();
    if (!b?.customerId) return;
    this.confirmIfDirty(() =>
      this.qApi.create({ customerId: b.customerId!, leadId: b.leadId, boqId: b.id, mode, title: b.leadTitle }).subscribe({
        next: (q) => this.router.navigate(['/quotations', q.id]),
        error: (e) => this.notify.error(e),
      }),
    );
  }

  remove(): void {
    const b = this.boq();
    if (!b) return;
    confirmAction(this.dialog, { title: 'ลบ BOQ', message: `ลบ "${b.name}"`, confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(b.id).subscribe({
        next: () => {
          this.savedRows = JSON.stringify(this.rows());
          this.savedHeader = JSON.stringify(this.header());
          this.router.navigate(['/leads', b.leadId]);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  private confirmIfDirty(run: () => void): void {
    if (!this.dirty()) {
      run();
      return;
    }
    confirmAction(this.dialog, {
      title: 'มีการแก้ไขที่ยังไม่บันทึก',
      message: 'การแก้ไขที่ยังไม่บันทึกจะหายไป',
      confirmText: 'ทำต่อโดยไม่บันทึก',
    }).subscribe((ok) => ok && run());
  }
}
