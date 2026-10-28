import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { CanDirective } from '../../shared/can.directive';
import { confirmAction } from '../../shared/confirm-dialog';
import { saveBlob } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { PriceHistoryDialog } from './price-history-dialog';
import { PriceItemDialog } from './price-item-dialog';
import { Category, ImportResult, MaterialRow, PriceType, PricingApi, RateRow, TRADES } from './pricing.api';

const TYPES: PriceType[] = ['materials', 'labor', 'equipment'];
const TYPE_LABEL: Record<PriceType, string> = { materials: 'วัสดุ', labor: 'ค่าแรง', equipment: 'เครื่องจักร' };

/** FR-03 ฐานราคากลาง + US-06 นำเข้า/ส่งออก Excel */
@Component({
  selector: 'app-pricing-page',
  imports: [
    FormsModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    MatPaginatorModule,
    MoneyPipe,
    ThDatePipe,
    CanDirective,
  ],
  templateUrl: './pricing.page.html',
  styleUrl: './pricing.page.scss',
})
export class PricingPage implements OnInit {
  private readonly api = inject(PricingApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly auth = inject(AuthService);

  readonly Perm = Perm;
  readonly trades = TRADES;
  readonly tradeList = Object.entries(TRADES);
  readonly typeLabel = TYPE_LABEL;
  readonly tab = signal(0);
  readonly type = computed<PriceType | null>(() => TYPES[this.tab()] ?? null);
  readonly canCost = computed(() => this.auth.can(Perm.COST_VIEW));
  readonly canWrite = computed(() => this.auth.can(Perm.PRICING_WRITE) && this.canCost());

  readonly materials = signal<MaterialRow[]>([]);
  readonly rates = signal<RateRow[]>([]);
  readonly total = signal(0);
  readonly categories = signal<Category[]>([]);
  readonly importResult = signal<ImportResult | null>(null);
  readonly busy = signal(false);

  q = '';
  categoryId = '';
  trade = '';
  page = 0;
  size = 50;
  private readonly search$ = new Subject<void>();

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page = 0;
      this.load();
    });
  }

  ngOnInit(): void {
    this.loadCategories();
    this.load();
  }

  onTab(i: number): void {
    this.tab.set(i);
    this.q = '';
    this.page = 0;
    this.importResult.set(null);
    if (i < 3) this.load();
  }

  onSearch(): void {
    this.search$.next();
  }

  loadCategories(): void {
    this.api.categories().subscribe((c) => this.categories.set(c));
  }

  load(): void {
    const t = this.type();
    if (!t) return;
    const p = { q: this.q.trim(), categoryId: this.categoryId || undefined, trade: this.trade || undefined, page: this.page, size: this.size };
    if (t === 'materials') {
      this.api.list<MaterialRow>(t, p).subscribe({
        next: (r) => {
          this.materials.set(r.items);
          this.total.set(r.total);
        },
        error: (e) => this.notify.error(e),
      });
    } else {
      this.api.list<RateRow>(t, p).subscribe({
        next: (r) => {
          this.rates.set(r.items);
          this.total.set(r.total);
        },
        error: (e) => this.notify.error(e),
      });
    }
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  edit(item: MaterialRow | RateRow | null): void {
    const type = this.type();
    if (!type) return;
    this.dialog
      .open(PriceItemDialog, { data: { type, item, categories: this.categories() } })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.notify.ok('บันทึกแล้ว');
          this.load();
          this.loadCategories();
        }
      });
  }

  remove(item: MaterialRow | RateRow): void {
    const type = this.type();
    if (!type) return;
    confirmAction(this.dialog, {
      title: 'ลบรายการ',
      message: `ลบ ${item.code} ${item.name} ออกจากฐานราคา (BOQ เดิมไม่เปลี่ยน)`,
      confirmText: 'ลบ',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(type, item.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
    });
  }

  history(item: MaterialRow | RateRow): void {
    const type = this.type();
    if (!type) return;
    const itemType = type === 'materials' ? 'material' : type;
    this.dialog.open(PriceHistoryDialog, { data: { itemType, id: item.id, title: `${item.code} ${item.name}` }, width: '560px' });
  }

  exportExcel(template: boolean): void {
    const type = this.type();
    if (!type) return;
    this.api.exportExcel(type, template).subscribe({
      next: (b) => saveBlob(b, `${template ? 'แบบฟอร์ม' : 'ฐานราคา'}-${TYPE_LABEL[type]}.xlsx`),
      error: (e) => this.notify.error(e),
    });
  }

  importExcel(input: HTMLInputElement): void {
    const type = this.type();
    const file = input.files?.[0];
    input.value = '';
    if (!type || !file) return;
    this.busy.set(true);
    this.api.importExcel(type, file).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.importResult.set(r);
        if (r.saved) {
          this.notify.ok(`นำเข้าแล้ว: เพิ่ม ${r.created} แก้ไข ${r.updated} ไม่เปลี่ยน ${r.unchanged}`);
          this.load();
          this.loadCategories();
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  // ---------------- categories
  editCategory(c: Category | null): void {
    prompt(this.dialog, { title: c ? 'แก้ไขหมวด' : 'เพิ่มหมวดวัสดุ', label: 'ชื่อหมวด', confirmText: 'บันทึก', required: true, value: c?.name ?? '' })
      .subscribe((name) => {
        if (!name) return;
        this.api.saveCategory(c?.id ?? null, { name, parentId: null, sortOrder: c?.sortOrder ?? 0 }).subscribe({
          next: () => this.loadCategories(),
          error: (e) => this.notify.error(e),
        });
      });
  }

  removeCategory(c: Category): void {
    this.api.deleteCategory(c.id).subscribe({ next: () => this.loadCategories(), error: (e) => this.notify.error(e) });
  }
}
