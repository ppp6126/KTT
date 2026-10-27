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
    items: [{ label: 'ลูกค้า', icon: 'contacts', link: '/customers', perm: Perm.CUSTOMER_READ }],
  },
  {
    label: 'ผู้ดูแลระบบ',
    items: [
      { label: 'ผู้ใช้งาน', icon: 'group', link: '/admin/users', perm: Perm.USER_READ },
      { label: 'บทบาทและสิทธิ์', icon: 'admin_panel_settings', link: '/admin/roles', perm: Perm.ROLE_MANAGE },
      { label: 'ประวัติการใช้งาน', icon: 'history', link: '/admin/audit', perm: Perm.AUDIT_READ },
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
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || perms.has(i.perm)) })).filter(
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
