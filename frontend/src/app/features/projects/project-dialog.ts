import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { CustomerPicker, Lookups } from '../../shared/lookups';
import { PROJECT_STATUS, Project, ProjectSave, ProjectsApi } from './projects.api';

/** สร้าง/แก้ไขโครงการ: ข้อมูลหลัก วันตามแผน ทีมงาน */
@Component({
  selector: 'app-project-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, CustomerPicker],
  template: `
    <h2 mat-dialog-title>{{ data ? 'แก้ไขโครงการ ' + data.code : 'สร้างโครงการ' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <mat-form-field class="full">
          <mat-label>ชื่อโครงการ</mat-label>
          <input matInput formControlName="name" placeholder="เช่น บ้านพักอาศัย 2 ชั้น คุณสมชาย" required />
        </mat-form-field>
        <app-customer-picker
          class="full"
          label="ลูกค้า (ผู้ว่าจ้าง) *"
          [required]="true"
          [initialName]="data?.customerName ?? null"
          [customerId]="form.controls.customerId.value || null"
          (customerIdChange)="form.controls.customerId.setValue($event ?? '')"
        />
        <mat-form-field class="full">
          <mat-label>ที่ตั้งไซต์งาน</mat-label>
          <textarea matInput rows="2" formControlName="siteAddress"></textarea>
        </mat-form-field>
        <div class="grid">
          <mat-form-field>
            <mat-label>สถานะ</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (canCost) {
            <mat-form-field>
              <mat-label>งบต้นทุน (บาท)</mat-label>
              <input matInput type="number" min="0" formControlName="budgetCost" />
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>เริ่มตามแผน</mat-label>
            <input matInput type="date" formControlName="plannedStart" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>เสร็จตามแผน</mat-label>
            <input matInput type="date" formControlName="plannedEnd" />
          </mat-form-field>
          @if (data) {
            <mat-form-field>
              <mat-label>เริ่มจริง</mat-label>
              <input matInput type="date" formControlName="actualStart" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>เสร็จจริง</mat-label>
              <input matInput type="date" formControlName="actualEnd" />
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>ผู้จัดการโครงการ</mat-label>
            <mat-select formControlName="managerId">
              <mat-option [value]="null">–</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>โฟร์แมน</mat-label>
            <mat-select formControlName="foremanId">
              <mat-option [value]="null">–</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <h3 class="sub">ทีมงานอื่น</h3>
        <p class="muted hint">ผู้ที่อยู่ในทีมเห็นโครงการนี้ได้แม้ไม่มีสิทธิ์ดูทุกโครงการ</p>
        <div formArrayName="members">
          @for (m of members.controls; track m; let i = $index) {
            <div class="member" [formGroupName]="i">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>ผู้ใช้</mat-label>
                <mat-select formControlName="userId">
                  @for (u of users(); track u.id) {
                    <mat-option [value]="u.id">{{ u.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>หน้าที่</mat-label>
                <input matInput formControlName="roleLabel" placeholder="เช่น วิศวกรสนาม" />
              </mat-form-field>
              <button mat-icon-button type="button" (click)="members.removeAt(i)" aria-label="ลบออกจากทีม"><mat-icon>close</mat-icon></button>
            </div>
          }
        </div>
        <button mat-button type="button" (click)="addMember()"><mat-icon>person_add</mat-icon> เพิ่มคนในทีม</button>

        <mat-form-field class="full notes">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
        <button mat-flat-button type="submit" [disabled]="busy()">บันทึก</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content { width: min(640px, 86vw); }
    .full { display: block; width: 100%; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
    .sub { margin: 8px 0 0; }
    .hint { margin: 2px 0 8px; font-size: 0.85rem; }
    .member { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
    .notes { margin-top: 12px; }
    .err { color: var(--ktt-danger); margin: 0 0 12px; }
  `,
})
export class ProjectDialog {
  private readonly api = inject(ProjectsApi);
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<ProjectDialog, Project>);
  readonly data = inject<Project | null>(MAT_DIALOG_DATA);
  readonly users = toSignal(inject(Lookups).users(), { initialValue: [] });
  readonly canCost = inject(AuthService).can(Perm.COST_VIEW);
  readonly statuses = Object.entries(PROJECT_STATUS);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly members = this.fb.array(
    (this.data?.members ?? []).map((m) => this.memberGroup(m.userId, m.roleLabel)),
  ) as FormArray;

  readonly form = this.fb.group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(255)]],
    customerId: [this.data?.customerId ?? '', Validators.required],
    siteAddress: [this.data?.siteAddress ?? ''],
    status: [this.data?.status ?? 'planning'],
    plannedStart: [this.data?.plannedStart ?? ''],
    plannedEnd: [this.data?.plannedEnd ?? ''],
    actualStart: [this.data?.actualStart ?? ''],
    actualEnd: [this.data?.actualEnd ?? ''],
    managerId: [this.data?.managerId ?? (null as string | null)],
    foremanId: [this.data?.foremanId ?? (null as string | null)],
    budgetCost: [this.data?.budgetCost ?? (null as number | null)],
    notes: [this.data?.notes ?? ''],
    members: this.members,
  });

  private memberGroup(userId: string | null, roleLabel: string | null) {
    return this.fb.group({ userId: [userId, Validators.required], roleLabel: [roleLabel ?? ''] });
  }

  addMember(): void {
    this.members.push(this.memberGroup(null, ''));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.form.controls.customerId.invalid ? 'กรุณาเลือกลูกค้าจากรายการ' : 'กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    const v = this.form.getRawValue();
    const body: ProjectSave = {
      name: v.name!.trim(),
      customerId: v.customerId!,
      siteAddress: v.siteAddress || null,
      status: v.status as ProjectSave['status'],
      plannedStart: v.plannedStart || null,
      plannedEnd: v.plannedEnd || null,
      actualStart: v.actualStart || null,
      actualEnd: v.actualEnd || null,
      managerId: v.managerId,
      foremanId: v.foremanId,
      budgetCost: v.budgetCost === null || (v.budgetCost as unknown) === '' ? null : Number(v.budgetCost),
      notes: v.notes || null,
      members: (v.members as { userId: string; roleLabel: string }[])
        .filter((m) => m.userId)
        .map((m) => ({ userId: m.userId, roleLabel: m.roleLabel || null })),
    };
    this.busy.set(true);
    this.error.set(null);
    (this.data ? this.api.update(this.data.id, body) : this.api.create(body)).subscribe({
      next: (p) => this.ref.close(p),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
