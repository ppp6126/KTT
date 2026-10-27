import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  retry,
  shareReplay,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { LoginResponse, Me, MfaEnableResponse, MfaSetupResponse, SessionInfo } from './auth.models';

/**
 * สถานะการ login ของเว็บ
 * - access token เก็บใน memory เท่านั้น (ไม่ใช้ localStorage) ป้องกัน XSS ขโมย token
 * - refresh token อยู่ใน cookie HttpOnly ที่ backend ตั้งให้ JavaScript อ่านไม่ได้
 * - เปิดหน้าใหม่/รีเฟรชหน้า จะเรียก /api/auth/refresh เพื่อกู้ session จาก cookie
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<Me | null>(null);
  private expiresAt = 0;
  private refreshInFlight: Observable<string | null> | null = null;
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ktt-auth') : null;

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token() && !!this._user());
  readonly restriction = computed(() => this._user()?.restriction ?? null);
  readonly permissions = computed(() => new Set(this._user()?.permissions ?? []));

  /** ข้อความที่จะแสดงบนหน้า login หลังถูกออกจากระบบอัตโนมัติ */
  readonly signedOutReason = signal<string | null>(null);

  constructor() {
    // ออกจากระบบพร้อมกันทุกแท็บ
    this.channel?.addEventListener('message', (e) => {
      if (e.data === 'logout' && this._token()) {
        this.clear();
        this.router.navigate(['/login']);
      }
    });
  }

  get token(): string | null {
    return this._token();
  }

  /** token ใกล้หมดอายุ (เหลือไม่ถึง 30 วินาที) */
  get expiresSoon(): boolean {
    return !!this._token() && Date.now() > this.expiresAt - 30_000;
  }

  can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  canAny(...permissions: string[]): boolean {
    const set = this.permissions();
    return permissions.some((p) => set.has(p));
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(tap((r) => !r.mfaRequired && this.apply(r)));
  }

  verifyMfa(mfaToken: string, code: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/mfa/verify', { mfaToken, code }).pipe(tap((r) => this.apply(r)));
  }

  /**
   * ขอ access token ใหม่จาก cookie. เรียกพร้อมกันหลายที่จะส่ง request เดียว.
   * ถ้า backend ตอบ 409 (อีกแท็บเพิ่ง refresh) จะลองใหม่ 1 ครั้งด้วย cookie ล่าสุด
   */
  refresh(): Observable<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http.post<LoginResponse>('/api/auth/refresh', {}).pipe(
        retry({
          count: 2,
          delay: (err: unknown) =>
            err instanceof HttpErrorResponse && err.status === 409 ? timer(250) : throwError(() => err),
        }),
        map((r) => {
          this.apply(r);
          return r.accessToken;
        }),
        catchError(() => {
          this.clear();
          return of(null);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  /** ใช้ตอนเปิดแอป: กู้ session จาก cookie (ถ้ามี) */
  restore(): Promise<unknown> {
    return firstValueFrom(this.refresh());
  }

  reloadMe(): Observable<Me> {
    return this.http.get<Me>('/api/auth/me').pipe(tap((me) => this._user.set(me)));
  }

  logout(reason?: string): void {
    this.http
      .post('/api/auth/logout', {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.clear();
        this.signedOutReason.set(reason ?? null);
        this.channel?.postMessage('logout');
        this.router.navigate(['/login']);
      });
  }

  /** session หมดอายุระหว่างใช้งาน */
  sessionExpired(): void {
    if (!this._token() && !this._user()) {
      return;
    }
    this.clear();
    this.signedOutReason.set('Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  // ------------------------------------------------------------ password / 2FA / sessions

  changePassword(currentPassword: string, newPassword: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/password/change', { currentPassword, newPassword })
      .pipe(tap((r) => this.apply(r)));
  }

  forgotPassword(email: string): Observable<unknown> {
    return this.http.post('/api/auth/password/forgot', { email });
  }

  resetPassword(token: string, newPassword: string): Observable<unknown> {
    return this.http.post('/api/auth/password/reset', { token, newPassword });
  }

  mfaSetup(): Observable<MfaSetupResponse> {
    return this.http.post<MfaSetupResponse>('/api/auth/mfa/setup', {});
  }

  mfaEnable(code: string): Observable<MfaEnableResponse> {
    return this.http.post<MfaEnableResponse>('/api/auth/mfa/enable', { code }).pipe(tap((r) => this.apply(r.auth)));
  }

  mfaDisable(password: string, code: string): Observable<unknown> {
    return this.http.post('/api/auth/mfa/disable', { password, code });
  }

  regenerateRecoveryCodes(code: string): Observable<{ codes: string[] }> {
    return this.http.post<{ codes: string[] }>('/api/auth/mfa/recovery-codes', { code });
  }

  sessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>('/api/auth/sessions');
  }

  revokeSession(id: string): Observable<unknown> {
    return this.http.delete(`/api/auth/sessions/${id}`);
  }

  revokeOtherSessions(): Observable<{ revoked: number }> {
    return this.http.post<{ revoked: number }>('/api/auth/sessions/revoke-others', {});
  }

  // ------------------------------------------------------------ internal

  private apply(r: LoginResponse): void {
    if (!r.accessToken || !r.user) {
      return;
    }
    this._token.set(r.accessToken);
    this._user.set(r.user);
    this.expiresAt = Date.now() + (r.expiresIn ?? 900) * 1000;
    this.signedOutReason.set(null);
  }

  private clear(): void {
    this._token.set(null);
    this._user.set(null);
    this.expiresAt = 0;
  }
}
