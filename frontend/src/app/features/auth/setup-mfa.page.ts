import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthFrame } from './auth-frame';
import { MfaSetupFlow } from './mfa-setup-flow';

/** บทบาทที่บังคับ 2FA (owner/admin) ต้องตั้งค่าก่อนใช้งาน */
@Component({
  selector: 'app-setup-mfa-page',
  imports: [AuthFrame, MfaSetupFlow, MatButtonModule],
  template: `
    <app-auth-frame
      heading="ยืนยันตัวตน 2 ขั้นตอน"
      subheading="บทบาทของคุณเข้าถึงข้อมูลต้นทุนและสิทธิ์ผู้ใช้ จึงต้องใช้รหัสจากโทรศัพท์ทุกครั้งที่เข้าสู่ระบบ"
    >
      <app-mfa-setup-flow (done)="router.navigate(['/'])" />
      <div style="margin-top: 16px">
        <button mat-button type="button" (click)="auth.logout()">ออกจากระบบ</button>
      </div>
    </app-auth-frame>
  `,
})
export class SetupMfaPage {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
}
