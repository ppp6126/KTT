import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, signedInGuard } from './core/auth/auth.guards';
import { Perm } from './core/auth/auth.models';

export const routes: Routes = [
  // ---------- หน้าก่อน login
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'เข้าสู่ระบบ | KTT',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    title: 'ลืมรหัสผ่าน | KTT',
    loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    title: 'ตั้งรหัสผ่านใหม่ | KTT',
    loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },

  // ---------- บังคับทำก่อนใช้งาน (token มีข้อจำกัด)
  {
    path: 'setup/password',
    canActivate: [signedInGuard],
    title: 'ตั้งรหัสผ่านใหม่ | KTT',
    loadComponent: () => import('./features/auth/setup-password.page').then((m) => m.SetupPasswordPage),
  },
  {
    path: 'setup/mfa',
    canActivate: [signedInGuard],
    title: 'ตั้งค่ายืนยันตัวตน 2 ขั้นตอน | KTT',
    loadComponent: () => import('./features/auth/setup-mfa.page').then((m) => m.SetupMfaPage),
  },

  // ---------- แอปหลัก
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'หน้าแรก | KTT',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard(Perm.CUSTOMER_READ)],
        title: 'ลูกค้า | KTT',
        loadComponent: () => import('./features/customers/customer-list.page').then((m) => m.CustomerListPage),
      },
      {
        path: 'customers/new',
        canActivate: [permissionGuard(Perm.CUSTOMER_WRITE)],
        title: 'เพิ่มลูกค้า | KTT',
        loadComponent: () => import('./features/customers/customer-form.page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'customers/:id',
        canActivate: [permissionGuard(Perm.CUSTOMER_READ)],
        title: 'ข้อมูลลูกค้า | KTT',
        loadComponent: () => import('./features/customers/customer-form.page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'admin/users',
        canActivate: [permissionGuard(Perm.USER_READ)],
        title: 'ผู้ใช้งาน | KTT',
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'admin/roles',
        canActivate: [permissionGuard(Perm.ROLE_MANAGE)],
        title: 'บทบาทและสิทธิ์ | KTT',
        loadComponent: () => import('./features/users/roles.page').then((m) => m.RolesPage),
      },
      {
        path: 'admin/audit',
        canActivate: [permissionGuard(Perm.AUDIT_READ)],
        title: 'ประวัติการใช้งาน | KTT',
        loadComponent: () => import('./features/audit/audit.page').then((m) => m.AuditPage),
      },
      {
        path: 'account',
        title: 'บัญชีของฉัน | KTT',
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'forbidden',
        title: 'ไม่มีสิทธิ์เข้าถึง | KTT',
        loadComponent: () => import('./features/home/forbidden.page').then((m) => m.ForbiddenPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
