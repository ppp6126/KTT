import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { Perm } from '../core/auth/auth.models';
import { AuthService } from '../core/auth/auth.service';
import { NotificationBell } from './notification-bell';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  perm?: string;
  exact?: boolean;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { label: null, items: [{ label: 'หน้าแรก', icon: 'home', link: '/', exact: true }] },
  {
    label: 'งานขาย',
    items: [
      { label: 'ลีดและงานที่เจรจา', icon: 'view_kanban', link: '/leads', perm: Perm.LEAD_READ },
      { label: 'ใบเสนอราคา', icon: 'request_quote', link: '/quotations', perm: Perm.QUOTATION_READ },
      { label: 'รออนุมัติ', icon: 'approval', link: '/approvals', perm: Perm.QUOTATION_APPROVE },
      { label: 'ลูกค้า', icon: 'contacts', link: '/customers', perm: Perm.CUSTOMER_READ },
    ],
  },
  {
    label: 'ประมาณราคา',
    items: [
      { label: 'ฐานราคากลาง', icon: 'sell', link: '/pricing', perm: Perm.PRICING_READ },
      { label: 'แม่แบบ BOQ', icon: 'library_books', link: '/boq-templates', perm: Perm.BOQ_READ },
    ],
  },
  {
    label: 'โครงการ',
    items: [
      { label: 'โครงการ', icon: 'construction', link: '/projects', perm: Perm.PROJECT_READ },
      { label: 'สัญญา', icon: 'contract', link: '/contracts', perm: Perm.CONTRACT_READ },
    ],
  },
  {
    label: 'การเงิน',
    items: [
      { label: 'เอกสารการเงิน', icon: 'receipt_long', link: '/finance/docs', perm: Perm.FINANCE_READ },
      { label: 'ลูกหนี้คงค้าง', icon: 'account_balance_wallet', link: '/finance/receivables', perm: Perm.FINANCE_READ },
    ],
  },
  {
    label: 'ผู้ดูแลระบบ',
    items: [
      { label: 'ผู้ใช้งาน', icon: 'group', link: '/admin/users', perm: Perm.USER_READ },
      { label: 'บทบาทและสิทธิ์', icon: 'admin_panel_settings', link: '/admin/roles', perm: Perm.ROLE_MANAGE },
      { label: 'ประวัติการใช้งาน', icon: 'history', link: '/admin/audit', perm: Perm.AUDIT_READ },
      { label: 'ตั้งค่า', icon: 'settings', link: '/settings', perm: Perm.SETTINGS_MANAGE },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    NotificationBell,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly isNarrow = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 960px)')
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  readonly nav = computed(() => {
    const perms = this.auth.permissions();
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || perms.has(i.perm) || (i.perm === Perm.LEAD_READ && perms.has(Perm.LEAD_READ_ALL)) || (i.perm === Perm.PROJECT_READ && perms.has(Perm.PROJECT_READ_ALL)) || (i.perm === Perm.CONTRACT_READ && perms.has(Perm.FINANCE_READ)) || (i.perm === Perm.QUOTATION_APPROVE && perms.has(Perm.CONTRACT_APPROVE))) })).filter(
      (g) => g.items.length > 0,
    );
  });

  readonly initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    return name.trim().slice(0, 1) || '?';
  });

  logout(): void {
    this.auth.logout();
  }
}
