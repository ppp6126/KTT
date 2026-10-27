import { FormControl, FormGroup } from '@angular/forms';
import { isValidThaiTaxId } from '../features/customers/customers.api';
import { passwordPolicy, passwordsMatch } from './password-validators';

describe('validators', () => {
  it('ตรวจ check digit เลขผู้เสียภาษี', () => {
    expect(isValidThaiTaxId('0105558000014')).toBe(true);
    expect(isValidThaiTaxId('1101700207030')).toBe(true);
    expect(isValidThaiTaxId('1101700207031')).toBe(false);
    expect(isValidThaiTaxId('12345')).toBe(false);
  });

  it('นโยบายรหัสผ่านตรงกับ backend', () => {
    expect(passwordPolicy(new FormControl('short1'))).toEqual({ policy: expect.any(String) });
    expect(passwordPolicy(new FormControl('onlyletterslong'))).toEqual({ policy: expect.any(String) });
    expect(passwordPolicy(new FormControl('Bangkok-Site-77'))).toBeNull();
    expect(passwordPolicy(new FormControl('รหัสผ่านไทย2026'))).toBeNull();
  });

  it('รหัสผ่านยืนยันต้องตรงกัน', () => {
    const g = new FormGroup({ newPassword: new FormControl('Abcdefgh12'), confirm: new FormControl('Abcdefgh13') });
    expect(passwordsMatch(g)).toEqual({ mismatch: true });
    g.controls.confirm.setValue('Abcdefgh12');
    expect(passwordsMatch(g)).toBeNull();
  });
});
