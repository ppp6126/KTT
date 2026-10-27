import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { errorMessage } from '../../core/api/api-error';
import { RoleDto, UserRow, UsersApi } from './users.api';

export interface UserDialogData {
  user: UserRow | null;
  roles: RoleDto[];
}

export type UserDialogResult = { saved: UserRow; temporaryPassword?: string };

@Component({
  selector: 'app-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <mat-form-field>
          <mat-label>อีเมล</mat-label>
          <input matInput type="email" formControlName="email" />
          @if (data.user) {
            <mat-hint>อีเมลใช้เข้าสู่ระบบ แก้ไขไม่ได้</mat-hint>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>ชื่อ-นามสกุล</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>โทรศัพท์</mat-label>
          <input matInput formControlName="phone" inputmode="tel" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>บทบาท</mat-label>
          <mat-select formControlName="roleId">
            @for (r of data.roles; track r.id) {
              <mat-option [value]="r.id">{{ r.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (!data.user) {
          <mat-form-field>
            <mat-label>รหัสผ่านชั่วคราว (ไม่บังคับ)</mat-label>
            <input matInput formControlName="temporaryPassword" autocomplete="off" />
            <mat-hint>เว้นว่างให้ระบบสุ่มให้ ผู้ใช้ต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก</mat-hint>
          </mat-form-field>
        } @else {
          <mat-slide-toggle formControlName="active">เปิดใช้งานบัญชี</mat-slide-toggle>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ data.user ? 'บันทึก' : 'เพิ่มผู้ใช้' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: min(440px, 80vw);
    }
    .err {
      color: var(--ktt-danger);
      margin: 0 0 8px;
    }
  `,
})
export class UserDialog {
  readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserDialog, UserDialogResult>);
  private readonly api = inject(UsersApi);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: [{ value: this.data.user?.email ?? '', disabled: !!this.data.user }, [Validators.required, Validators.email]],
    name: [this.data.user?.name ?? '', Validators.required],
    phone: [this.data.user?.phone ?? ''],
    roleId: [this.data.user?.roleId ?? '', Validators.required],
    temporaryPassword: [''],
    active: [this.data.user?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    const done = {
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    };
    if (this.data.user) {
      this.api
        .update(this.data.user.id, { name: v.name, phone: v.phone || null, roleId: v.roleId, active: v.active })
        .subscribe({ ...done, next: (saved) => this.ref.close({ saved }) });
    } else {
      this.api
        .create({
          email: v.email,
          name: v.name,
          phone: v.phone || null,
          roleId: v.roleId,
          temporaryPassword: v.temporaryPassword || null,
        })
        .subscribe({ ...done, next: (r) => this.ref.close({ saved: r.user, temporaryPassword: r.temporaryPassword }) });
    }
  }
}
