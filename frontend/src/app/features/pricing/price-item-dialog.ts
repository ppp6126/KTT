import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { Category, MaterialRow, PriceType, PricingApi, RateRow, TRADES } from './pricing.api';

export interface PriceItemDialogData {
  type: PriceType;
  item: MaterialRow | RateRow | null;
  categories: Category[];
}

const TITLES: Record<PriceType, string> = { materials: 'วัสดุ', labor: 'ค่าแรง', equipment: 'เครื่องจักร/อุปกรณ์' };

@Component({
  selector: 'app-price-item-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'แก้ไข' : 'เพิ่ม' }}{{ title }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <div class="two">
          <mat-form-field>
            <mat-label>รหัส</mat-label>
            <input matInput formControlName="code" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>หน่วย</mat-label>
            <input matInput formControlName="unit" placeholder="ตร.ม. / ม. / จุด / วัน / ถุง" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>ชื่อ</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        @if (data.type === 'materials') {
          <mat-form-field>
            <mat-label>หมวด</mat-label>
            <mat-select formControlName="categoryId">
              <mat-option [value]="''">ไม่ระบุ</mat-option>
              @for (c of data.categories; track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="two">
            <mat-form-field>
              <mat-label>ราคาต้นทุน (บาท)</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="costPrice" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ราคาขาย (บาท)</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="sellPrice" />
            </mat-form-field>
          </div>
          <mat-form-field>
            <mat-label>ซัพพลายเออร์หลัก</mat-label>
            <input matInput formControlName="supplierName" />
          </mat-form-field>
        } @else {
          @if (data.type === 'labor') {
            <mat-form-field>
              <mat-label>ประเภทช่าง</mat-label>
              <mat-select formControlName="trade">
                @for (t of trades; track t[0]) {
                  <mat-option [value]="t[0]">{{ t[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>{{ data.type === 'labor' ? 'ค่าแรงต่อหน่วย (บาท)' : 'ราคาต่อหน่วย (บาท)' }}</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="rate" />
          </mat-form-field>
        }
        @if (data.item) {
          <p class="muted hint">เปลี่ยนราคาแล้วระบบจะเก็บประวัติราคาเดิมไว้ BOQ ที่ถอดไปแล้วไม่เปลี่ยนตาม</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
        <button mat-flat-button type="submit" [disabled]="busy()">บันทึก</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 4px; width: min(520px, 82vw); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .err { color: var(--ktt-danger); margin: 0 0 8px; }
    .hint { font-size: 0.85rem; margin: 0; }
  `,
})
export class PriceItemDialog {
  readonly data = inject<PriceItemDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PriceItemDialog, boolean>);
  private readonly api = inject(PricingApi);
  readonly title = TITLES[this.data.type];
  readonly trades = Object.entries(TRADES);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private readonly m = this.data.item as MaterialRow | null;
  private readonly r = this.data.item as RateRow | null;

  readonly form = inject(FormBuilder).nonNullable.group({
    code: [this.data.item?.code ?? '', Validators.required],
    name: [this.data.item?.name ?? '', Validators.required],
    unit: [this.data.item?.unit ?? '', Validators.required],
    categoryId: [this.m?.categoryId ?? ''],
    costPrice: [this.m?.costPrice ?? 0, [Validators.required, Validators.min(0)]],
    sellPrice: [this.m?.sellPrice ?? 0, [Validators.required, Validators.min(0)]],
    supplierName: [this.m?.supplierName ?? ''],
    trade: [this.r?.trade ?? 'mason'],
    rate: [this.r?.rate ?? 0, [Validators.required, Validators.min(0)]],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body =
      this.data.type === 'materials'
        ? {
            code: v.code.trim(),
            name: v.name.trim(),
            unit: v.unit.trim(),
            categoryId: v.categoryId || null,
            costPrice: Number(v.costPrice),
            sellPrice: Number(v.sellPrice),
            supplierName: v.supplierName || null,
          }
        : this.data.type === 'labor'
          ? { code: v.code.trim(), name: v.name.trim(), unit: v.unit.trim(), trade: v.trade, rate: Number(v.rate) }
          : { code: v.code.trim(), name: v.name.trim(), unit: v.unit.trim(), rate: Number(v.rate) };
    this.busy.set(true);
    this.api.save(this.data.type, this.data.item?.id ?? null, body).subscribe({
      next: () => this.ref.close(true),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
