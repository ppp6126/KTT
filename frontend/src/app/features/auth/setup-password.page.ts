import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { PASSWORD_HINT, passwordPolicy, passwordsMatch } from '../../shared/password-validators';
import { AuthFrame } from './auth-frame';

/** บังคับเปลี่ยนรหัสผ่านชั่วคราวที่ผู้ดูแลตั้งให้ ก่อนเข้าใช้งานครั้งแรก */
@Component({
  selector: 'app-setup-password-page',
  imports: [AuthFrame, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  styleUrl: './auth.scss',
  template: `
    <app-auth-frame heading="ตั้งรหัสผ่านของคุณ" subheading="รหัสผ่านปัจจุบันเป็นรหัสชั่วคราว ต้องเปลี่ยนก่อนเริ่มใช้งาน">
      @if (error()) {
        <div class="alert error" role="alert">{{ error() }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-form-field class="w-full">
          <mat-label>รหัสผ่านชั่วคราว</mat-label>
          <input matInput type="password" formControlName="currentPassword" autocomplete="current-password" autofocus />
        </mat-form-field>
        <mat-form-field class="w-full">
          <mat-label>รหัสผ่านใหม่</mat-label>
          <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
          <mat-hint>{{ hint }}</mat-hint>
          @if (form.controls.newPassword.errors?.['policy']; as msg) {
            <mat-error>{{ msg }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field class="w-full">
          <mat-label>ยืนยันรหัสผ่านใหม่</mat-label>
          <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
        </mat-form-field>
        @if (form.hasError('mismatch') && form.controls.confirm.touched) {
          <p class="hint" style="color: var(--ktt-danger)">รหัสผ่านทั้งสองช่องไม่ตรงกัน</p>
        }
        <button mat-flat-button class="btn-primary submit" type="submit" [disabled]="busy()">บันทึกรหัสผ่าน</button>
        <div class="row-between mt">
          <button mat-button type="button" (click)="auth.logout()">ออกจากระบบ</button>
        </div>
      </form>
    </app-auth-frame>
  `,
})
export class SetupPasswordPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly hint = PASSWORD_HINT;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.router.navigate([r.user?.restriction === 'mfa_setup' ? '/setup/mfa' : '/']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
