import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { Contract, ContractUpdate, ContractsApi, FromQuotation, Milestone } from './contracts.api';

const STYLES = `
  .content { width: min(720px, 90vw); }
  .full { display: block; width: 100%; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 12px; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
  .err { color: var(--ktt-danger); margin: 0 0 12px; }
  h3 { margin: 12px 0 6px; }
  .ms { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .ms th { text-align: left; color: var(--ktt-steel); font-weight: 500; padding: 4px; font-size: 0.85rem; }
  .ms td { padding: 2px 4px; vertical-align: middle; }
  .ms input { width: 100%; height: 32px; padding: 0 6px; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; box-sizing: border-box; }
  .ms input[type='number'] { text-align: right; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sum { display: flex; justify-content: space-between; font-size: 0.9rem; }
  .bad { color: var(--ktt-danger); font-weight: 600; }
`;

/** ตัวแก้งวดงานที่ใช้ทั้งตอนแปลงใบเสนอราคาและในหน้าสัญญา */
@Component({
  selector: 'app-milestone-editor',
  imports: [FormsModule, MatButtonModule, MatIconModule, MoneyPipe],
  template: `
    <table class="ms">
      <thead><tr><th style="width:36px">งวด</th><th>ชื่องวด / เงื่อนไขการส่งมอบ</th><th style="width:84px" class="num">%</th><th style="width:120px" class="num">จำนวนเงิน</th><th style="width:150px">กำหนด</th><th style="width:40px"></th></tr></thead>
      <tbody>
        @for (m of items; track $index; let i = $index) {
          <tr>
            <td class="num">{{ i + 1 }}</td>
            <td>
              <input [(ngModel)]="m.name" [disabled]="m.editable === false" aria-label="ชื่องวด" placeholder="เช่น งานฐานรากแล้วเสร็จ" />
            </td>
            <td><input type="number" min="0" max="100" step="any" [(ngModel)]="m.pct" [disabled]="m.editable === false" aria-label="% งวด" /></td>
            <td class="num">{{ amountOf(m.pct) | money }}</td>
            <td><input type="date" [(ngModel)]="m.dueDate" [disabled]="m.editable === false" aria-label="กำหนด" /></td>
            <td>
              @if (m.editable !== false) {
                <button mat-icon-button (click)="items.splice(i, 1)" aria-label="ลบงวด"><mat-icon>close</mat-icon></button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
    <div class="sum">
      <button mat-button (click)="items.push({ id: null, name: 'งวดที่ ' + (items.length + 1), criteria: null, pct: 0, dueDate: null })"><mat-icon>add</mat-icon> เพิ่มงวด</button>
      <span>รวม <strong [class.bad]="Math.abs(totalPct() - 100) > 0.01">{{ totalPct() }}%</strong> = {{ amountOf(totalPct()) | money }} บาท</span>
    </div>
  `,
  styles: STYLES,
})
export class MilestoneEditor {
  /** แก้ไขใน array นี้โดยตรง (ผู้เรียกเป็นเจ้าของ array) */
  readonly list = input.required<Milestone[]>();
  readonly amount = input(0);
  readonly Math = Math;

  get items(): Milestone[] {
    return this.list();
  }

  totalPct(): number {
    return Math.round(this.items.reduce((s, m) => s + (Number(m.pct) || 0), 0) * 1000) / 1000;
  }

  amountOf(pct: number): number {
    return round2(((Number(pct) || 0) * this.amount()) / 100);
  }
}

// ======================================================================= แปลงใบเสนอราคาเป็นสัญญา

export interface FromQuotationData {
  quotationId: string;
  displayNo: string;
  title: string | null;
  baseAmount: number;
  durationDays: number | null;
}

@Component({
  selector: 'app-from-quotation-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MoneyPipe, MilestoneEditor],
  template: `
    <h2 mat-dialog-title>สร้างโครงการและสัญญาจาก {{ data.displayNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <p class="muted">มูลค่าสัญญา (ก่อน VAT) {{ data.baseAmount | money }} บาท ตามใบเสนอราคา ข้อมูลลูกค้าคัดลอกจากใบเสนอราคา</p>
      <mat-form-field class="full">
        <mat-label>ชื่อโครงการ</mat-label>
        <input matInput [(ngModel)]="m.projectName" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>ที่ตั้งไซต์งาน (เว้นว่างเพื่อใช้จากลีด)</mat-label>
        <input matInput [(ngModel)]="m.siteAddress" />
      </mat-form-field>
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่ทำสัญญา</mat-label>
          <input matInput type="date" [(ngModel)]="m.contractDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เริ่มงาน</mat-label>
          <input matInput type="date" [(ngModel)]="m.startDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>สิ้นสุดสัญญา</mat-label>
          <input matInput type="date" [(ngModel)]="m.endDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เงินล่วงหน้า %</mat-label>
          <input matInput type="number" min="0" max="100" [(ngModel)]="m.advancePct" />
          <mat-hint>หักคืนตามสัดส่วนทุกงวด</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>เงินประกันผลงาน %</mat-label>
          <input matInput type="number" min="0" max="100" [(ngModel)]="m.retentionPct" />
          <mat-hint>ลูกค้ากันไว้ทุกงวด</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ลูกค้าหัก ณ ที่จ่าย</mat-label>
          <mat-select [(ngModel)]="m.whtPct">
            @for (w of [0, 1, 2, 3, 5]; track w) {
              <mat-option [value]="w">{{ w }}%</mat-option>
            }
          </mat-select>
          <mat-hint>นิติบุคคลจ้างทำของ 3%</mat-hint>
        </mat-form-field>
      </div>
      <h3>งวดงาน</h3>
      <app-milestone-editor #ed [list]="milestones" [amount]="data.baseAmount" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button class="btn-primary" (click)="save(ed)" [disabled]="busy()">สร้างโครงการและสัญญา</button>
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class FromQuotationDialog {
  private readonly api = inject(ContractsApi);
  private readonly ref = inject(MatDialogRef<FromQuotationDialog, Contract>);
  readonly data = inject<FromQuotationData>(MAT_DIALOG_DATA);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly m = {
    projectName: this.data.title ?? '',
    siteAddress: '',
    contractDate: todayIso(),
    startDate: todayIso(),
    endDate: '',
    advancePct: 0,
    retentionPct: 5,
    whtPct: 3,
  };

  /** ค่าตั้งต้น 3 งวด 30/40/30 ซึ่งใช้บ่อยในงานบ้าน แก้ได้ก่อนบันทึก */
  readonly milestones: Milestone[] = [
    { id: null, name: 'งวดที่ 1 เมื่อทำสัญญา / เริ่มงาน', criteria: null, pct: 30, dueDate: null },
    { id: null, name: 'งวดที่ 2 งานโครงสร้างแล้วเสร็จ', criteria: null, pct: 40, dueDate: null },
    { id: null, name: 'งวดที่ 3 ส่งมอบงานทั้งหมด', criteria: null, pct: 30, dueDate: null },
  ];

  save(ed: MilestoneEditor): void {
    const body: FromQuotation = {
      quotationId: this.data.quotationId,
      projectName: this.m.projectName || null,
      siteAddress: this.m.siteAddress || null,
      contractDate: this.m.contractDate || null,
      startDate: this.m.startDate || null,
      endDate: this.m.endDate || null,
      advancePct: Number(this.m.advancePct) || 0,
      retentionPct: Number(this.m.retentionPct) || 0,
      whtPct: this.m.whtPct,
      milestones: ed.items.map((x) => ({ ...x, pct: Number(x.pct) || 0, dueDate: x.dueDate || null })),
    };
    if (body.milestones.length && Math.abs(ed.totalPct() - 100) > 0.01) {
      this.error.set('งวดงานต้องรวมกันได้ 100%');
      return;
    }
    this.busy.set(true);
    this.api.fromQuotation(body).subscribe({
      next: (c) => this.ref.close(c),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= แก้ไขข้อมูลสัญญา

@Component({
  selector: 'app-contract-edit-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>แก้ไขสัญญา {{ c.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      @if (!draft) {
        <p class="muted">สัญญามีผลแล้ว แก้มูลค่าและเงื่อนไขการเงินไม่ได้ ให้ทำเป็นงานเพิ่ม-ลด (VO)</p>
      }
      <mat-form-field class="full">
        <mat-label>ชื่อสัญญา / งาน</mat-label>
        <input matInput [(ngModel)]="m.title" required />
      </mat-form-field>
      <div class="grid">
        <mat-form-field style="grid-column: span 2">
          <mat-label>ผู้ว่าจ้าง</mat-label>
          <input matInput [(ngModel)]="m.customerName" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เลขผู้เสียภาษี</mat-label>
          <input matInput [(ngModel)]="m.customerTaxId" maxlength="13" />
        </mat-form-field>
      </div>
      <mat-form-field class="full">
        <mat-label>ที่อยู่ผู้ว่าจ้าง</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.customerAddress"></textarea>
      </mat-form-field>
      <div class="grid">
        <mat-form-field>
          <mat-label>วันที่ทำสัญญา</mat-label>
          <input matInput type="date" [(ngModel)]="m.contractDate" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เริ่มงาน</mat-label>
          <input matInput type="date" [(ngModel)]="m.startDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>สิ้นสุดสัญญา</mat-label>
          <input matInput type="date" [(ngModel)]="m.endDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>มูลค่าก่อน VAT (บาท)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.amount" [disabled]="!draft" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>VAT %</mat-label>
          <input matInput type="number" min="0" max="20" [(ngModel)]="m.vatPct" [disabled]="!draft || !m.vatEnabled" />
        </mat-form-field>
        <div class="chk"><mat-checkbox [(ngModel)]="m.vatEnabled" [disabled]="!draft">คิด VAT</mat-checkbox></div>
        <mat-form-field>
          <mat-label>เงินล่วงหน้า %</mat-label>
          <input matInput type="number" min="0" max="100" [(ngModel)]="m.advancePct" [disabled]="!draft" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เงินประกันผลงาน %</mat-label>
          <input matInput type="number" min="0" max="100" [(ngModel)]="m.retentionPct" [disabled]="!draft" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>หัก ณ ที่จ่าย</mat-label>
          <mat-select [(ngModel)]="m.whtPct">
            @for (w of [0, 1, 2, 3, 5]; track w) {
              <mat-option [value]="w">{{ w }}%</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ค่าปรับรายวัน (บาท)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.penaltyPerDay" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>รับประกันผลงาน (เดือน)</mat-label>
          <input matInput type="number" min="0" max="240" [(ngModel)]="m.warrantyMonths" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่ลงนาม</mat-label>
          <input matInput type="date" [(ngModel)]="m.signedAt" />
        </mat-form-field>
      </div>
      <mat-form-field class="full">
        <mat-label>เงื่อนไขสัญญา</mat-label>
        <textarea matInput rows="5" [(ngModel)]="m.terms"></textarea>
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>หมายเหตุภายใน</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.notes"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy()">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: STYLES + `.chk { display: flex; align-items: center; height: 56px; }`,
})
export class ContractEditDialog {
  private readonly api = inject(ContractsApi);
  private readonly ref = inject(MatDialogRef<ContractEditDialog, Contract>);
  readonly c = inject<Contract>(MAT_DIALOG_DATA);
  readonly draft = this.c.status === 'draft';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly m = {
    title: this.c.title,
    customerName: this.c.customerName,
    customerAddress: this.c.customerAddress ?? '',
    customerTaxId: this.c.customerTaxId ?? '',
    contractDate: this.c.contractDate,
    startDate: this.c.startDate ?? '',
    endDate: this.c.endDate ?? '',
    amount: this.c.amount,
    vatEnabled: this.c.vatEnabled,
    vatPct: this.c.vatPct,
    advancePct: this.c.advancePct,
    retentionPct: this.c.retentionPct,
    whtPct: Number(this.c.whtPct),
    penaltyPerDay: this.c.penaltyPerDay,
    warrantyMonths: this.c.warrantyMonths,
    terms: this.c.terms ?? '',
    notes: this.c.notes ?? '',
    signedAt: this.c.signedAt ?? '',
  };

  save(): void {
    const m = this.m;
    const body: ContractUpdate = {
      title: m.title.trim(),
      customerName: m.customerName.trim(),
      customerAddress: m.customerAddress || null,
      customerTaxId: m.customerTaxId || null,
      customerBranchNo: this.c.customerBranchNo,
      contractDate: m.contractDate,
      startDate: m.startDate || null,
      endDate: m.endDate || null,
      amount: Number(m.amount) || 0,
      vatEnabled: m.vatEnabled,
      vatPct: Number(m.vatPct) || 0,
      advancePct: Number(m.advancePct) || 0,
      retentionPct: Number(m.retentionPct) || 0,
      whtPct: m.whtPct,
      penaltyPerDay: m.penaltyPerDay === null || (m.penaltyPerDay as unknown) === '' ? null : Number(m.penaltyPerDay),
      warrantyMonths: m.warrantyMonths === null || (m.warrantyMonths as unknown) === '' ? null : Number(m.warrantyMonths),
      terms: m.terms || null,
      notes: m.notes || null,
      signedAt: m.signedAt || null,
    };
    this.busy.set(true);
    this.api.update(this.c.id, body).subscribe({
      next: (c) => this.ref.close(c),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
