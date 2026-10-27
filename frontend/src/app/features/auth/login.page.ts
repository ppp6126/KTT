import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { errorCode, errorMessage } from '../../core/api/api-error';
import { LoginResponse } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AuthFrame } from './auth-frame';

@Component({
  selector: 'app-login-page',
  imports: [
    AuthFrame,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './login.page.html',
  styleUrl: './auth.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly returnUrl = input<string>();

  readonly step = signal<'password' | 'mfa'>('password');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly hidePassword = signal(true);
  readonly useRecovery = signal(false);
  readonly notice = computed(() => this.auth.signedOutReason());
  private mfaToken: string | null = null;

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly mfaForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(email.trim(), password).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.mfaRequired) {
          this.mfaToken = r.mfaToken;
          this.step.set('mfa');
          setTimeout(() => this.codeInput()?.nativeElement.focus());
        } else {
          this.done(r);
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
        this.form.controls.password.reset();
      },
    });
  }

  submitMfa(): void {
    if (this.mfaForm.invalid || this.busy() || !this.mfaToken) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.verifyMfa(this.mfaToken, this.mfaForm.getRawValue().code.trim()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.done(r);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
        this.mfaForm.reset();
        if (errorCode(err) === 'mfa_expired') {
          this.backToPassword();
        }
      },
    });
  }

  toggleRecovery(): void {
    this.useRecovery.update((v) => !v);
    this.mfaForm.reset();
    this.error.set(null);
    setTimeout(() => this.codeInput()?.nativeElement.focus());
  }

  backToPassword(): void {
    this.step.set('password');
    this.mfaToken = null;
    this.useRecovery.set(false);
    this.form.controls.password.reset();
  }

  private done(r: LoginResponse): void {
    const restriction = r.user?.restriction;
    if (restriction === 'password_change') {
      this.router.navigate(['/setup/password']);
    } else if (restriction === 'mfa_setup') {
      this.router.navigate(['/setup/mfa']);
    } else {
      const target = this.returnUrl();
      this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/');
    }
  }
}
