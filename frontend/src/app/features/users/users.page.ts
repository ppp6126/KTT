import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { CanDirective } from '../../shared/can.directive';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { TempPasswordDialog } from './temp-password-dialog';
import { UserDialog, UserDialogResult } from './user-dialog';
import { RoleDto, UserRow, UsersApi } from './users.api';

@Component({
  selector: 'app-users-page',
  imports: [
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ThDatePipe,
    CanDirective,
  ],
  templateUrl: './users.page.html',
  styles: `
    .filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      padding: 16px 16px 0;

      mat-form-field { width: 220px; }
      .search { flex: 1; min-width: 220px; }
    }
    .name { font-weight: 500; }
    .flags { display: flex; gap: 6px; flex-wrap: wrap; }
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;

  readonly columns = ['name', 'role', 'status', 'lastLogin', 'actions'];
  readonly rows = signal<UserRow[]>([]);
  readonly total = signal(0);
  readonly roles = signal<RoleDto[]>([]);
  readonly loading = signal(false);

  q = '';
  roleId = '';
  active: boolean | null = null;
  page = 0;
  size = 20;
  private readonly search$ = new Subject<void>();

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page = 0;
      this.load();
    });
  }

  ngOnInit(): void {
    this.api.roles().subscribe((r) => this.roles.set(r));
    this.load();
  }

  onSearch(): void {
    this.search$.next();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({ q: this.q.trim(), roleId: this.roleId || undefined, active: this.active, page: this.page, size: this.size })
      .subscribe({
        next: (r) => {
          this.rows.set(r.items);
          this.total.set(r.total);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.notify.error(e);
        },
      });
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  openDialog(user: UserRow | null): void {
    this.dialog
      .open<UserDialog, unknown, UserDialogResult>(UserDialog, { data: { user, roles: this.roles() } })
      .afterClosed()
      .subscribe((r) => {
        if (!r) return;
        this.notify.ok(user ? 'บันทึกแล้ว' : 'เพิ่มผู้ใช้แล้ว');
        if (r.temporaryPassword) {
          this.showTempPassword(r.saved.name, r.temporaryPassword);
        }
        this.load();
      });
  }

  resetPassword(u: UserRow): void {
    confirmAction(this.dialog, {
      title: 'รีเซ็ตรหัสผ่าน',
      message: `ระบบจะสร้างรหัสผ่านชั่วคราวให้ ${u.name} และออกจากระบบทุกอุปกรณ์`,
      confirmText: 'รีเซ็ตรหัสผ่าน',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.resetPassword(u.id).subscribe({
        next: (r) => {
          this.showTempPassword(u.name, r.temporaryPassword);
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  resetMfa(u: UserRow): void {
    confirmAction(this.dialog, {
      title: 'รีเซ็ต 2FA',
      message: `ใช้เมื่อ ${u.name} ทำโทรศัพท์หายและไม่มีรหัสสำรอง ผู้ใช้ต้องตั้งค่า 2FA ใหม่`,
      confirmText: 'รีเซ็ต 2FA',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.resetMfa(u.id).subscribe({
        next: () => {
          this.notify.ok('รีเซ็ต 2FA แล้ว');
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  unlock(u: UserRow): void {
    this.api.unlock(u.id).subscribe({
      next: () => {
        this.notify.ok(`ปลดล็อก ${u.name} แล้ว`);
        this.load();
      },
      error: (e) => this.notify.error(e),
    });
  }

  revokeSessions(u: UserRow): void {
    this.api.revokeSessions(u.id).subscribe({
      next: () => this.notify.ok(`${u.name} ถูกออกจากระบบทุกอุปกรณ์แล้ว`),
      error: (e) => this.notify.error(e),
    });
  }

  remove(u: UserRow): void {
    confirmAction(this.dialog, {
      title: 'ลบผู้ใช้',
      message: `ลบ ${u.name} ออกจากระบบ ประวัติการใช้งานยังเก็บไว้ตามเดิม`,
      confirmText: 'ลบผู้ใช้',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(u.id).subscribe({
        next: () => {
          this.notify.ok('ลบผู้ใช้แล้ว');
          this.load();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  private showTempPassword(name: string, password: string): void {
    this.dialog.open(TempPasswordDialog, { data: { name, password }, disableClose: true });
  }
}
