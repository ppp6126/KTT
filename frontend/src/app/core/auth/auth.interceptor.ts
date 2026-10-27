import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** endpoint ที่ไม่ต้องแนบ access token (ใช้ cookie หรือไม่ต้องยืนยันตัวตน) */
const PUBLIC_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/mfa/verify',
  '/api/auth/password/forgot',
  '/api/auth/password/reset',
];

const RETRIED = new HttpContextToken<boolean>(() => false);

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * - แนบ Bearer token กับทุก /api/**
 * - token ใกล้หมดอายุ: refresh ก่อนส่ง
 * - ได้ 401: refresh 1 ครั้งแล้วส่งซ้ำ ถ้ายังไม่ได้ให้กลับไปหน้า login
 * - ได้ 403 restricted_*: พาไปหน้าเปลี่ยนรหัสผ่าน / ตั้ง 2FA
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }
  const auth = inject(AuthService);
  const router = inject(Router);

  if (PUBLIC_ENDPOINTS.some((p) => req.url.startsWith(p))) {
    return next(req.clone({ withCredentials: true }));
  }

  const send = (token: string | null) =>
    next(withToken(req, token)).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof HttpErrorResponse)) {
          return throwError(() => err);
        }
        if (err.status === 401 && !req.context.get(RETRIED)) {
          return auth.refresh().pipe(
            switchMap((fresh) => {
              if (!fresh) {
                auth.sessionExpired();
                return throwError(() => err);
              }
              return next(withToken(req.clone({ context: req.context.set(RETRIED, true) }), fresh));
            }),
          );
        }
        if (err.status === 401) {
          auth.sessionExpired();
        }
        const code = (err.error as { code?: string } | null)?.code;
        if (err.status === 403 && code === 'restricted_password_change') {
          router.navigate(['/setup/password']);
        } else if (err.status === 403 && code === 'restricted_mfa_setup') {
          router.navigate(['/setup/mfa']);
        }
        return throwError(() => err);
      }),
    );

  if (auth.expiresSoon) {
    return auth.refresh().pipe(switchMap((t) => send(t)));
  }
  return send(auth.token);
};
