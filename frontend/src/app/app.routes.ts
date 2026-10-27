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

  // ---------- หน้าพิมพ์เอกสาร (ไม่มีเมนู)
  {
    path: 'print/quotations/:id',
    canActivate: [authGuard, permissionGuard(Perm.QUOTATION_READ)],
    title: 'พิมพ์ใบเสนอราคา | KTT',
    loadComponent: () => import('./features/print/quotation-print.page').then((m) => m.QuotationPrintPage),
  },
  {
    path: 'print/boq/:id',
    canActivate: [authGuard, permissionGuard(Perm.COST_VIEW)],
    title: 'แบบ ปร.4 ปร.5 | KTT',
    loadComponent: () => import('./features/print/gov-form.page').then((m) => m.GovFormPage),
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
        path: 'leads',
        canActivate: [permissionGuard(Perm.LEAD_READ, Perm.LEAD_READ_ALL)],
        title: 'ลีด | KTT',
        loadComponent: () => import('./features/leads/leads-board.page').then((m) => m.LeadsBoardPage),
      },
      {
        path: 'leads/:id',
        canActivate: [permissionGuard(Perm.LEAD_READ, Perm.LEAD_READ_ALL)],
        title: 'รายละเอียดลีด | KTT',
        loadComponent: () => import('./features/leads/lead-detail.page').then((m) => m.LeadDetailPage),
      },
      {
        path: 'pricing',
        canActivate: [permissionGuard(Perm.PRICING_READ)],
        title: 'ฐานราคากลาง | KTT',
        loadComponent: () => import('./features/pricing/pricing.page').then((m) => m.PricingPage),
      },
      {
        path: 'boqs/:id',
        canActivate: [permissionGuard(Perm.BOQ_READ)],
        title: 'BOQ | KTT',
        loadComponent: () => import('./features/boq/boq-editor.page').then((m) => m.BoqEditorPage),
      },
      {
        path: 'boq-templates',
        canActivate: [permissionGuard(Perm.BOQ_READ)],
        title: 'แม่แบบ BOQ | KTT',
        loadComponent: () => import('./features/boq/templates.page').then((m) => m.TemplatesPage),
      },
      {
        path: 'boq-templates/:id',
        canActivate: [permissionGuard(Perm.BOQ_READ)],
        title: 'แม่แบบ BOQ | KTT',
        loadComponent: () => import('./features/boq/template-editor.page').then((m) => m.TemplateEditorPage),
      },
      {
        path: 'settings/factor-f',
        canActivate: [permissionGuard(Perm.BOQ_READ)],
        title: 'ตาราง Factor F | KTT',
        loadComponent: () => import('./features/boq/factor-tables.page').then((m) => m.FactorTablesPage),
      },
      {
        path: 'quotations',
        canActivate: [permissionGuard(Perm.QUOTATION_READ)],
        title: 'ใบเสนอราคา | KTT',
        loadComponent: () => import('./features/quotations/quotation-list.page').then((m) => m.QuotationListPage),
      },
      {
        path: 'quotations/:id',
        canActivate: [permissionGuard(Perm.QUOTATION_READ)],
        title: 'ใบเสนอราคา | KTT',
        loadComponent: () => import('./features/quotations/quotation-editor.page').then((m) => m.QuotationEditorPage),
      },
      {
        path: 'approvals',
        canActivate: [permissionGuard(Perm.QUOTATION_APPROVE)],
        title: 'รออนุมัติ | KTT',
        loadComponent: () => import('./features/approvals/approvals.page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'settings',
        title: 'ตั้งค่า | KTT',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
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
