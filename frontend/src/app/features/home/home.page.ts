import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, addDaysIso, thDateShort, todayIso } from '../../core/util/format';
import { CAL_SOURCES, CalItem, CalendarApi } from '../calendar/calendar.api';

interface Shortcut {
  title: string;
  text: string;
  icon: string;
  link: string;
  perm: string;
}

const SHORTCUTS: Shortcut[] = [
  { title: 'แดชบอร์ดผู้บริหาร', text: 'ยอดขาย ต้นทุน กำไร ลูกหนี้ เจ้าหนี้ โครงการที่ต้องจับตา', icon: 'monitoring', link: '/dashboard', perm: Perm.DASHBOARD_VIEW },
  { title: 'รับแจ้งซ่อม', text: 'บันทึกงานซ่อม ตรวจระยะรับประกัน นัดช่าง', icon: 'home_repair_service', link: '/service/tickets', perm: Perm.SERVICE_WRITE },
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

      <section class="panel week">
        <div class="week-head">
          <h2>7 วันข้างหน้า</h2>
          <a routerLink="/calendar">เปิดปฏิทิน</a>
        </div>
        @for (it of week(); track it.id) {
          <a class="w-item" [routerLink]="it.link ?? '/calendar'">
            <span class="d">{{ day(it.date) }}</span>
            <i [style.background]="color(it.source)"></i>
            <span class="t">{{ it.title }}<span class="muted">{{ it.subtitle ? ' · ' + it.subtitle : '' }}</span></span>
          </a>
        } @empty {
          <p class="muted">ไม่มีนัดหมายหรือกำหนดการ</p>
        }
        @if (more() > 0) {
          <p class="muted small">และอีก {{ more() }} รายการ</p>
        }
      </section>

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

    .week {
      padding: 14px 18px;
      margin-bottom: 16px;
    }

    .week-head {
      display: flex;
      justify-content: space-between;
      align-items: center;

      h2 {
        margin: 0 0 6px;
      }
    }

    .w-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 0;
      border-top: 1px solid #eceeed;
      color: inherit;
      text-decoration: none;

      .d {
        width: 76px;
        flex: none;
        color: var(--ktt-steel);
        font-size: 0.85rem;
      }

      i {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        flex: none;
      }

      .t {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      &:hover .t {
        text-decoration: underline;
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
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly calendar = inject(CalendarApi);
  private readonly items = signal<CalItem[]>([]);
  readonly week = computed(() => this.items().slice(0, 8));
  readonly more = computed(() => Math.max(0, this.items().length - 8));

  ngOnInit(): void {
    const t = todayIso();
    this.calendar.items(t, addDaysIso(t, 6)).subscribe({ next: (r) => this.items.set(r), error: () => this.items.set([]) });
  }

  day(iso: string): string {
    return iso === todayIso() ? 'วันนี้' : thDateShort(iso);
  }

  color(source: string): string {
    return CAL_SOURCES.find((s) => s.key === source)?.color ?? '#888';
  }

  readonly shortcuts = computed(() => {
    const perms = this.auth.permissions();
    return SHORTCUTS.filter((s) => perms.has(s.perm));
  });
}
