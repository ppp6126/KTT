import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AuthFrame } from './auth-frame';

@Component({
  selector: 'app-forgot-password-page',
  imports: [AuthFrame, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  styleUrl: './auth.scss',
  template: `
    <app-auth-frame heading="ลืมรหัสผ่าน" subheading="กรอกอีเมลที่ใช้เข้าสู่ระบบ เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้">
      @if (sent()) {
        <div class="alert ok" role="status">
          ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ ลิงก์ตั้งรหัสผ่านใหม่จะถูกส่งไปภายในไม่กี่นาที ลิงก์ใช้ได้ 30 นาที
        </div>
        <a mat-stroked-button routerLink="/login">กลับไปหน้าเข้าสู่ระบบ</a>
      } @else {
        @if (error()) {
          <div class="alert error" role="alert">{{ error() }}</div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <mat-form-field class="w-full">
            <mat-label>อีเมล</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" autofocus />
            @if (form.controls.email.invalid) {
              <mat-error>กรุณากรอกอีเมลให้ถูกต้อง</mat-error>
            }
          </mat-form-field>
          <button mat-flat-button class="btn-primary submit" type="submit" [disabled]="busy()">ส่งลิงก์ตั้งรหัสผ่าน</button>
          <div class="row-between mt">
            <a routerLink="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </div>
        </form>
      }
    </app-auth-frame>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  readonly form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.auth.forgotPassword(this.form.getRawValue().email.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
