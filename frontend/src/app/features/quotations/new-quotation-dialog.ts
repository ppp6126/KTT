import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { MoneyPipe } from '../../core/util/money';
import { CustomerPicker } from '../../shared/lookups';
import { BoqApi, BoqSummary } from '../boq/boq.api';
import { LeadRow, LeadsApi } from '../leads/leads.api';
import { QuotationsApi } from './quotations.api';

/** สร้างใบเสนอราคา: เลือกลูกค้า → (ถ้ามี) ลีด → (ถ้ามี) BOQ และรูปแบบรายการ */
@Component({
  selector: 'app-new-quotation-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, CustomerPicker, MoneyPipe],
  template: `
    <h2 mat-dialog-title>สร้างใบเสนอราคา</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
      <app-customer-picker label="ลูกค้า *" [required]="true" (picked)="onCustomer($event.id)" />
      @if (customerId) {
        <mat-form-field>
          <mat-label>ลีด / งาน</mat-label>
          <mat-select [(ngModel)]="leadId" (selectionChange)="onLead()">
            <mat-option [value]="null">ไม่ผูกกับลีด</mat-option>
            @for (l of leads(); track l.id) {
              <mat-option [value]="l.id">{{ l.title }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      @if (leadId && boqs().length) {
        <mat-form-field>
          <mat-label>ดึงรายการจาก BOQ</mat-label>
          <mat-select [(ngModel)]="boqId">
            <mat-option [value]="null">ไม่ใช้ BOQ (กรอกรายการเอง)</mat-option>
            @for (b of boqs(); track b.id) {
              <mat-option [value]="b.id">{{ b.name }} ({{ b.grandTotal | money }})</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (boqId) {
          <mat-form-field>
            <mat-label>รูปแบบรายการ</mat-label>
            <mat-select [(ngModel)]="mode">
              <mat-option value="detailed">แสดงทุกรายการ (หัวข้อตามหมวด)</mat-option>
              <mat-option value="summary">สรุปหมวดละ 1 บรรทัด</mat-option>
            </mat-select>
          </mat-form-field>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="!customerId || busy()" (click)="create()">สร้าง</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 4px; width: min(520px, 82vw); }
    .err { color: var(--ktt-danger); }
  `,
})
export class NewQuotationDialog {
  readonly data = inject(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NewQuotationDialog>);
  private readonly leadsApi = inject(LeadsApi);
  private readonly boqApi = inject(BoqApi);
  private readonly api = inject(QuotationsApi);
  private readonly router = inject(Router);
  readonly leads = signal<LeadRow[]>([]);
  readonly boqs = signal<BoqSummary[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  customerId: string | null = null;
  leadId: string | null = null;
  boqId: string | null = null;
  mode: 'detailed' | 'summary' = 'detailed';

  onCustomer(id: string): void {
    this.customerId = id;
    this.leadId = null;
    this.boqId = null;
    this.leadsApi.list({ customerId: id, page: 0, size: 100 }).subscribe((r) => this.leads.set(r.items));
  }

  onLead(): void {
    this.boqId = null;
    this.boqs.set([]);
    if (this.leadId) this.boqApi.listForLead(this.leadId).subscribe((b) => this.boqs.set(b));
  }

  create(): void {
    if (!this.customerId) return;
    this.busy.set(true);
    const lead = this.leads().find((l) => l.id === this.leadId);
    this.api
      .create({ customerId: this.customerId, leadId: this.leadId, boqId: this.boqId, mode: this.boqId ? this.mode : 'manual', title: lead?.title ?? null })
      .subscribe({
        next: (q) => {
          this.ref.close();
          this.router.navigate(['/quotations', q.id]);
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}
