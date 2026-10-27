import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { SessionInfo } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, describeUserAgent } from '../../core/util/format';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { PASSWORD_HINT, passwordPolicy, passwordsMatch } from '../../shared/password-validators';
import { MfaSetupFlow } from '../auth/mfa-setup-flow';

@Component({
  selector: 'app-account-page',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, ThDatePipe, MfaSetupFlow],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly hint = PASSWORD_HINT;
  readonly describeUa = describeUserAgent;
  readonly sessions = signal<SessionInfo[]>([]);
  readonly mfaMode = signal<'view' | 'enable' | 'disable' | 'regenerate'>('view');
  readonly newCodes = signal<string[] | null>(null);
  readonly busy = signal(false);

  readonly pwForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  readonly disableForm = this.fb.nonNullable.group({
    password: ['', Validators.required],
    code: ['', Validators.required],
  });

  readonly regenForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    this.loadSessions();
  }

  loadSessions(): void {
    this.auth.sessions().subscribe({ next: (s) => this.sessions.set(s), error: (e) => this.notify.error(e) });
  }

  changePassword(): void {
    if (this.pwForm.invalid) {
      this.pwForm.markAllAsTouched();
      return;
    }
    const v = this.pwForm.getRawValue();
    this.busy.set(true);
    this.auth.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => {
        this.busy.set(false);
        this.pwForm.reset();
        this.notify.ok('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ');
        this.loadSessions();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  mfaEnabledDone(): void {
    this.mfaMode.set('view');
    this.auth.reloadMe().subscribe();
    this.loadSessions();
  }

  disableMfa(): void {
    if (this.disableForm.invalid) return;
    const v = this.disableForm.getRawValue();
    this.busy.set(true);
    this.auth.mfaDisable(v.password, v.code.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.disableForm.reset();
        this.mfaMode.set('view');
        this.notify.ok('ปิดการยืนยันตัวตน 2 ขั้นตอนแล้ว');
        this.auth.reloadMe().subscribe();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  regenerate(): void {
    if (this.regenForm.invalid) return;
    this.busy.set(true);
    this.auth.regenerateRecoveryCodes(this.regenForm.getRawValue().code).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.regenForm.reset();
        this.newCodes.set(r.codes);
        this.mfaMode.set('view');
        this.auth.reloadMe().subscribe();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  revoke(s: SessionInfo): void {
    confirmAction(this.dialog, {
      title: 'ออกจากระบบอุปกรณ์นี้',
      message: `${describeUserAgent(s.userAgent)} จะต้องเข้าสู่ระบบใหม่`,
      confirmText: 'ออกจากระบบอุปกรณ์',
    }).subscribe((ok) => {
      if (!ok) return;
      this.auth.revokeSession(s.id).subscribe({
        next: () => this.loadSessions(),
        error: (e) => this.notify.error(e),
      });
    });
  }

  revokeOthers(): void {
    this.auth.revokeOtherSessions().subscribe({
      next: (r) => {
        this.notify.ok(`ออกจากระบบอุปกรณ์อื่น ${r.revoked} เครื่องแล้ว`);
        this.loadSessions();
      },
      error: (e) => this.notify.error(e),
    });
  }
}
