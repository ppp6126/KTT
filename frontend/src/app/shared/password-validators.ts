import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** ตรงกับ PasswordPolicy ฝั่ง backend: ≥10 ตัว มีตัวอักษรและตัวเลข */
export const passwordPolicy: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = (c.value as string) ?? '';
  if (!v) return null;
  if (v.length < 10) return { policy: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร' };
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) return { policy: 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข' };
  return null;
};

/** ใช้กับ FormGroup ที่มี newPassword และ confirm */
export const passwordsMatch: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const a = g.get('newPassword')?.value;
  const b = g.get('confirm')?.value;
  return a && b && a !== b ? { mismatch: true } : null;
};

export const PASSWORD_HINT = 'อย่างน้อย 10 ตัวอักษร มีทั้งตัวอักษรและตัวเลข';
