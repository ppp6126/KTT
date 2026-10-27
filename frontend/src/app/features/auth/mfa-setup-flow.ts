import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import QRCode from 'qrcode';
import { errorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';

/**
 * ขั้นตอนเปิดใช้ 2FA: สแกน QR → กรอกรหัสยืนยัน → บันทึกรหัสสำรอง
 * ใช้ทั้งหน้าบังคับตั้งค่าครั้งแรก และหน้าบัญชีของฉัน
 */
@Component({
  selector: 'app-mfa-setup-flow',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  styleUrl: './auth.scss',
  template: `
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
    }

    @if (codes(); as list) {
      <div class="alert ok" role="status">เปิดใช้การยืนยันตัวตน 2 ขั้นตอนแล้ว</div>
      <p>
        เก็บรหัสสำรองด้านล่างไว้ในที่ปลอดภัย ใช้แทนรหัสจากแอปได้เมื่อโทรศัพท์หาย รหัสละครั้ง
        <strong>ระบบจะแสดงรหัสชุดนี้ครั้งเดียว</strong>
      </p>
      <ul class="codes mono-code">
        @for (c of list; track c) {
          <li>{{ c }}</li>
        }
      </ul>
      <div class="row-between">
        <button mat-stroked-button type="button" (click)="copy(list)">
          <mat-icon>content_copy</mat-icon> {{ copied() ? 'คัดลอกแล้ว' : 'คัดลอก' }}
        </button>
        <button mat-stroked-button type="button" (click)="download(list)">
          <mat-icon>download</mat-icon> ดาวน์โหลด .txt
        </button>
      </div>
      <button mat-flat-button class="btn-primary submit" type="button" (click)="done.emit()">บันทึกรหัสแล้ว ไปต่อ</button>
    } @else if (qr()) {
      <ol class="steps">
        <li>ติดตั้งแอป Google Authenticator หรือ Microsoft Authenticator ในโทรศัพท์</li>
        <li>ในแอป กดเพิ่มบัญชี แล้วสแกน QR นี้</li>
        <li>กรอกรหัส 6 หลักที่แอปแสดง</li>
      </ol>
      <img class="qr" [src]="qr()" alt="QR สำหรับเพิ่มบัญชี KTT ในแอป Authenticator" />
      <p class="hint">สแกนไม่ได้? กรอกรหัสนี้ในแอปแทน: <span class="mono-code secret">{{ secret() }}</span></p>

      <form [formGroup]="form" (ngSubmit)="enable()" novalidate>
        <mat-form-field class="w-full">
          <mat-label>รหัส 6 หลักจากแอป</mat-label>
          <input
            matInput
            formControlName="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            class="mono-code code-input"
          />
        </mat-form-field>
        <button mat-flat-button class="btn-primary submit" type="submit" [disabled]="busy() || form.invalid">
          เปิดใช้งาน
        </button>
      </form>
    }
    @if (busy()) {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class MfaSetupFlow implements OnInit {
  private readonly auth = inject(AuthService);
  readonly done = output<void>();

  readonly qr = signal<string | null>(null);
  readonly secret = signal<string | null>(null);
  readonly codes = signal<string[] | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    this.busy.set(true);
    this.auth.mfaSetup().subscribe({
      next: async (r) => {
        this.secret.set(r.secret.replace(/(.{4})/g, '$1 ').trim());
        this.qr.set(await QRCode.toDataURL(r.otpauthUri, { margin: 1, width: 368, color: { dark: '#1e3a4c' } }));
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  enable(): void {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.mfaEnable(this.form.getRawValue().code).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.codes.set(r.recoveryCodes);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
        this.form.reset();
      },
    });
  }

  copy(list: string[]): void {
    navigator.clipboard?.writeText(list.join('\n')).then(() => this.copied.set(true));
  }

  download(list: string[]): void {
    const text = `รหัสสำรอง KTT (${this.auth.user()?.email ?? ''})\nใช้ได้รหัสละครั้ง\n\n${list.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ktt-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}
