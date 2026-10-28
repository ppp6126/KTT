import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { CustomerPicker, Lookups, UserOption } from '../../shared/lookups';
import { JOB_TYPES, LeadRow, LeadsApi } from './leads.api';

export interface LeadDialogData {
  lead: LeadRow | null;
  customerId?: string;
  customerName?: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-lead-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, CustomerPicker],
  template: `
    <h2 mat-dialog-title>{{ data.lead ? 'แก้ไขลีด' : 'เพิ่มลีด' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <app-customer-picker
          label="ลูกค้า *"
          [required]="true"
          [initialName]="data.lead?.customerName ?? data.customerName ?? null"
          [customerId]="form.controls.customerId.value || null"
          (customerIdChange)="form.controls.customerId.setValue($event ?? '')"
        />
        <mat-form-field>
          <mat-label>ชื่องาน</mat-label>
          <input matInput formControlName="title" placeholder="เช่น ต่อเติมครัวหลังบ้าน" />
        </mat-form-field>
        <div class="two">
          <mat-form-field>
            <mat-label>ประเภทงาน</mat-label>
            <mat-select formControlName="jobType">
              @for (j of jobTypes; track j[0]) {
                <mat-option [value]="j[0]">{{ j[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>งบประมาณลูกค้า (บาท)</mat-label>
            <input matInput type="number" min="0" formControlName="budgetEst" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>ที่ตั้งไซต์งาน</mat-label>
          <textarea matInput rows="2" formControlName="siteAddress"></textarea>
        </mat-form-field>
        <div class="two">
          <mat-form-field>
            <mat-label>ผู้รับผิดชอบ</mat-label>
            <mat-select formControlName="ownerId">
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>นัดติดตามผล</mat-label>
            <input matInput type="date" formControlName="nextFollowup" />
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ data.lead ? 'บันทึก' : 'เพิ่มลีด' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 4px; width: min(560px, 82vw); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .two { grid-template-columns: 1fr; } }
    .err { color: var(--ktt-danger); margin: 0 0 8px; }
  `,
})
export class LeadDialog implements OnInit {
  readonly data = inject<LeadDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<LeadDialog, LeadRow>);
  private readonly api = inject(LeadsApi);
  private readonly lookups = inject(Lookups);
  private readonly auth = inject(AuthService);

  readonly jobTypes = Object.entries(JOB_TYPES);
  readonly users = signal<UserOption[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    customerId: [this.data.lead?.customerId ?? this.data.customerId ?? '', Validators.required],
    title: [this.data.lead?.title ?? '', Validators.required],
    jobType: [this.data.lead?.jobType ?? 'new_house', Validators.required],
    budgetEst: [this.data.lead?.budgetEst ?? (null as number | null)],
    siteAddress: [this.data.lead?.siteAddress ?? ''],
    ownerId: [this.data.lead?.ownerId ?? this.auth.user()?.id ?? ''],
    nextFollowup: [toLocalInput(this.data.lead?.nextFollowupAt ?? null)],
  });

  ngOnInit(): void {
    this.lookups.users().subscribe((u) => this.users.set(u));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (!this.form.controls.customerId.value) this.error.set('กรุณาเลือกลูกค้าจากรายการ');
      return;
    }
    const v = this.form.getRawValue();
    const input = {
      customerId: v.customerId,
      title: v.title.trim(),
      jobType: v.jobType,
      budgetEst: v.budgetEst === null || (v.budgetEst as unknown) === '' ? null : Number(v.budgetEst),
      siteAddress: v.siteAddress || null,
      ownerId: v.ownerId || null,
      // นัดติดตามเวลา 09:00 ของวันนั้น (เวลาไทย)
      nextFollowupAt: v.nextFollowup ? new Date(`${v.nextFollowup}T09:00:00+07:00`).toISOString() : null,
    };
    this.busy.set(true);
    const req = this.data.lead ? this.api.update(this.data.lead.id, input) : this.api.create(input);
    req.subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
