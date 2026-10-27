import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { PASSWORD_HINT, passwordPolicy, passwordsMatch } from '../../shared/password-validators';
import { AuthFrame } from './auth-frame';

@Component({
  selector: 'app-reset-password-page',
  imports: [AuthFrame, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  styleUrl: './auth.scss',
  template: `
    <app-auth-frame heading="ตั้งรหัสผ่านใหม่" [subheading]="hint">
      @if (done()) {
        <div class="alert ok" role="status">ตั้งรหัสผ่านใหม่แล้ว อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้จะต้องเข้าสู่ระบบใหม่</div>
        <a mat-flat-button class="btn-primary" routerLink="/login">เข้าสู่ระบบ</a>
      } @else if (!token()) {
        <div class="alert error" role="alert">ลิงก์ไม่ครบ กรุณาเปิดลิงก์จากอีเมลอีกครั้ง</div>
        <a routerLink="/forgot-password">ขอลิงก์ใหม่</a>
      } @else {
        @if (error()) {
          <div class="alert error" role="alert">{{ error() }}</div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field class="w-full">
            <mat-label>รหัสผ่านใหม่</mat-label>
            <input matInput type="password" formControlName="newPassword" autocomplete="new-password" autofocus />
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
          <button mat-flat-button class="btn-primary submit" type="submit" [disabled]="busy()">ตั้งรหัสผ่านใหม่</button>
          <div class="row-between mt">
            <a routerLink="/forgot-password">ขอลิงก์ใหม่</a>
          </div>
        </form>
      }
    </app-auth-frame>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  readonly token = input<string>();
  readonly hint = PASSWORD_HINT;
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  submit(): void {
    const token = this.token();
    if (this.form.invalid || !token) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.resetPassword(token, this.form.getRawValue().newPassword).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
