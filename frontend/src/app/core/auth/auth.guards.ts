import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** ต้อง login และไม่มีข้อจำกัดค้างอยู่ */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  const restriction = auth.restriction();
  if (restriction === 'password_change') {
    return router.createUrlTree(['/setup/password']);
  }
  if (restriction === 'mfa_setup') {
    return router.createUrlTree(['/setup/mfa']);
  }
  return true;
};

/** หน้าที่ใช้ได้ขณะมีข้อจำกัด (เปลี่ยนรหัสผ่าน/ตั้ง 2FA): แค่ต้อง login */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** หน้า login/ลืมรหัสผ่าน: ถ้า login อยู่แล้วให้ไปหน้าแรก */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** ต้องมีสิทธิ์อย่างน้อย 1 ข้อ (ตรวจซ้ำที่ backend เสมอ ตัวนี้แค่ซ่อนหน้าที่ใช้ไม่ได้) */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    return auth.canAny(...permissions) ? true : inject(Router).createUrlTree(['/forbidden']);
  };
}
