import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';

interface Shortcut {
  title: string;
  text: string;
  icon: string;
  link: string;
  perm: string;
}

const SHORTCUTS: Shortcut[] = [
  { title: 'ลูกค้า', text: 'ทะเบียนลูกค้า ข้อมูลออกใบกำกับภาษี และผู้ติดต่อ', icon: 'contacts', link: '/customers', perm: Perm.CUSTOMER_READ },
  { title: 'ผู้ใช้งาน', text: 'เพิ่มพนักงาน กำหนดบทบาท รีเซ็ตรหัสผ่าน', icon: 'group', link: '/admin/users', perm: Perm.USER_READ },
  { title: 'บทบาทและสิทธิ์', text: 'กำหนดว่าใครเห็นต้นทุน ใครอนุมัติส่วนลดได้', icon: 'admin_panel_settings', link: '/admin/roles', perm: Perm.ROLE_MANAGE },
  { title: 'ประวัติการใช้งาน', text: 'ดูว่าใครแก้ไขอะไร เมื่อไหร่', icon: 'history', link: '/admin/audit', perm: Perm.AUDIT_READ },
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, MatIconModule, ThDatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>สวัสดี คุณ{{ auth.user()?.name }}</h1>
          <p>เข้าสู่ระบบล่าสุด {{ auth.user()?.lastLoginAt | thDate: true }}</p>
        </div>
      </div>

      @if (auth.user(); as u) {
        @if (!u.mfaEnabled) {
          <a class="notice panel" routerLink="/account">
            <mat-icon>shield</mat-icon>
            <span>เปิดใช้การยืนยันตัวตน 2 ขั้นตอน เพื่อป้องกันบัญชีถ้ารหัสผ่านรั่วไหล</span>
          </a>
        } @else if (u.recoveryCodesLeft <= 2) {
          <a class="notice panel" routerLink="/account">
            <mat-icon>key</mat-icon>
            <span>รหัสสำรองเหลือ {{ u.recoveryCodesLeft }} รหัส สร้างชุดใหม่ได้ที่บัญชีของฉัน</span>
          </a>
        }
      }

      <div class="grid">
        @for (s of shortcuts(); track s.link) {
          <a class="tile panel" [routerLink]="s.link">
            <mat-icon>{{ s.icon }}</mat-icon>
            <h2>{{ s.title }}</h2>
            <p>{{ s.text }}</p>
          </a>
        }
      </div>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px;
    }

    .tile {
      display: block;
      padding: 20px;
      color: inherit;
      text-decoration: none;

      mat-icon {
        color: var(--ktt-ink-2);
        margin-bottom: 8px;
      }

      p {
        margin: 6px 0 0;
        color: var(--ktt-steel);
        font-size: 0.92rem;
      }

      &:hover {
        border-color: var(--ktt-ink-2);
      }

      &:focus-visible {
        outline: 2px solid var(--ktt-ink-2);
      }
    }

    .notice {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      border-left: 3px solid var(--ktt-safety);
      color: inherit;
      text-decoration: none;

      mat-icon {
        color: var(--ktt-safety);
      }
    }
  `,
})
export class HomePage {
  readonly auth = inject(AuthService);
  readonly shortcuts = computed(() => {
    const perms = this.auth.permissions();
    return SHORTCUTS.filter((s) => perms.has(s.perm));
  });
}
