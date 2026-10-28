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

  {
    path: 'print/finance/:id',
    canActivate: [authGuard, permissionGuard(Perm.FINANCE_READ)],
    title: 'พิมพ์เอกสาร | KTT',
    loadComponent: () => import('./features/print/finance-print.page').then((m) => m.FinancePrintPage),
  },
  {
    path: 'print/change-orders/:id',
    canActivate: [authGuard, permissionGuard(Perm.CONTRACT_READ, Perm.FINANCE_READ)],
    title: 'พิมพ์ใบงานเพิ่ม-ลด | KTT',
    loadComponent: () => import('./features/print/vo-print.page').then((m) => m.VoPrintPage),
  },
  {
    path: 'print/progress/:id',
    canActivate: [authGuard, permissionGuard(Perm.PROJECT_READ, Perm.PROJECT_READ_ALL)],
    title: 'รายงานความคืบหน้า | KTT',
    loadComponent: () => import('./features/print/progress-print.page').then((m) => m.ProgressPrintPage),
  },

  {
    path: 'print/po/:id',
    canActivate: [authGuard, permissionGuard(Perm.PURCHASE_READ)],
    title: 'พิมพ์ใบสั่งซื้อ | KTT',
    loadComponent: () => import('./features/print/purchase-print.page').then((m) => m.PoPrintPage),
  },
  {
    path: 'print/pv/:id',
    canActivate: [authGuard, permissionGuard(Perm.AP_READ)],
    title: 'พิมพ์ใบสำคัญจ่าย | KTT',
    loadComponent: () => import('./features/print/purchase-print.page').then((m) => m.PvPrintPage),
  },
  {
    path: 'print/wht/:id',
    canActivate: [authGuard, permissionGuard(Perm.AP_READ, Perm.TAX_REPORT)],
    title: 'หนังสือรับรองหัก ณ ที่จ่าย | KTT',
    loadComponent: () => import('./features/print/wht-print.page').then((m) => m.WhtPrintPage),
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
        canActivate: [permissionGuard(Perm.QUOTATION_APPROVE, Perm.CONTRACT_APPROVE)],
        title: 'รออนุมัติ | KTT',
        loadComponent: () => import('./features/approvals/approvals.page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'projects',
        canActivate: [permissionGuard(Perm.PROJECT_READ, Perm.PROJECT_READ_ALL)],
        title: 'โครงการ | KTT',
        loadComponent: () => import('./features/projects/project-list.page').then((m) => m.ProjectListPage),
      },
      {
        path: 'projects/:projectId/daily/new',
        canActivate: [permissionGuard(Perm.SITE_REPORT, Perm.PROJECT_WRITE)],
        title: 'รายงานประจำวัน | KTT',
        loadComponent: () => import('./features/projects/daily-report.page').then((m) => m.DailyReportPage),
      },
      {
        path: 'projects/:id',
        canActivate: [permissionGuard(Perm.PROJECT_READ, Perm.PROJECT_READ_ALL)],
        title: 'โครงการ | KTT',
        loadComponent: () => import('./features/projects/project-detail.page').then((m) => m.ProjectDetailPage),
      },
      {
        path: 'projects/:id/:tab',
        canActivate: [permissionGuard(Perm.PROJECT_READ, Perm.PROJECT_READ_ALL)],
        title: 'โครงการ | KTT',
        loadComponent: () => import('./features/projects/project-detail.page').then((m) => m.ProjectDetailPage),
      },
      {
        path: 'daily-reports/:reportId',
        canActivate: [permissionGuard(Perm.PROJECT_READ, Perm.PROJECT_READ_ALL)],
        title: 'รายงานประจำวัน | KTT',
        loadComponent: () => import('./features/projects/daily-report.page').then((m) => m.DailyReportPage),
      },
      {
        path: 'contracts',
        canActivate: [permissionGuard(Perm.CONTRACT_READ, Perm.FINANCE_READ)],
        title: 'สัญญา | KTT',
        loadComponent: () => import('./features/contracts/contract-list.page').then((m) => m.ContractListPage),
      },
      {
        path: 'contracts/:id',
        canActivate: [permissionGuard(Perm.CONTRACT_READ, Perm.FINANCE_READ)],
        title: 'สัญญา | KTT',
        loadComponent: () => import('./features/contracts/contract.page').then((m) => m.ContractPage),
      },
      {
        path: 'change-orders/:id',
        canActivate: [permissionGuard(Perm.CONTRACT_READ, Perm.FINANCE_READ)],
        title: 'งานเพิ่ม-ลด | KTT',
        loadComponent: () => import('./features/contracts/change-order.page').then((m) => m.ChangeOrderPage),
      },
      {
        path: 'finance/docs',
        canActivate: [permissionGuard(Perm.FINANCE_READ)],
        title: 'เอกสารการเงิน | KTT',
        loadComponent: () => import('./features/finance/sales-docs.page').then((m) => m.SalesDocsPage),
      },
      {
        path: 'finance/docs/:id',
        canActivate: [permissionGuard(Perm.FINANCE_READ)],
        title: 'เอกสารการเงิน | KTT',
        loadComponent: () => import('./features/finance/sales-doc.page').then((m) => m.SalesDocPage),
      },
      {
        path: 'finance/receivables',
        canActivate: [permissionGuard(Perm.FINANCE_READ)],
        title: 'ลูกหนี้คงค้าง | KTT',
        loadComponent: () => import('./features/finance/receivables.page').then((m) => m.ReceivablesPage),
      },
      {
        path: 'purchase',
        canActivate: [permissionGuard(Perm.PURCHASE_REQUEST, Perm.PURCHASE_READ)],
        title: 'จัดซื้อ | KTT',
        loadComponent: () => import('./features/purchase/pr-list.page').then((m) => m.PurchasePage),
      },
      {
        path: 'purchase/requests/:id',
        canActivate: [permissionGuard(Perm.PURCHASE_REQUEST, Perm.PURCHASE_READ)],
        title: 'ใบขอซื้อ | KTT',
        loadComponent: () => import('./features/purchase/pr.page').then((m) => m.PrPage),
      },
      {
        path: 'purchase/orders/:id',
        canActivate: [permissionGuard(Perm.PURCHASE_READ)],
        title: 'ใบสั่งซื้อ | KTT',
        loadComponent: () => import('./features/purchase/po.page').then((m) => m.PoPage),
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard(Perm.PURCHASE_READ, Perm.AP_READ, Perm.SUBCONTRACT_READ)],
        title: 'ผู้ขายและผู้รับเหมาช่วง | KTT',
        loadComponent: () => import('./features/purchase/suppliers.page').then((m) => m.SuppliersPage),
      },
      {
        path: 'stock',
        canActivate: [permissionGuard(Perm.STOCK_READ)],
        title: 'คลังวัสดุ | KTT',
        loadComponent: () => import('./features/stock/stock.page').then((m) => m.StockPage),
      },
      {
        path: 'subcontracts',
        canActivate: [permissionGuard(Perm.SUBCONTRACT_READ)],
        title: 'ผู้รับเหมาช่วง | KTT',
        loadComponent: () => import('./features/subcontract/subcontract.page').then((m) => m.SubcontractList),
      },
      {
        path: 'subcontracts/:id',
        canActivate: [permissionGuard(Perm.SUBCONTRACT_READ)],
        title: 'สัญญาจ้างช่วง | KTT',
        loadComponent: () => import('./features/subcontract/subcontract.page').then((m) => m.SubcontractPage),
      },
      {
        path: 'labor',
        canActivate: [permissionGuard(Perm.LABOR_READ)],
        title: 'ค่าแรง | KTT',
        loadComponent: () => import('./features/labor/labor.page').then((m) => m.LaborPage),
      },
      {
        path: 'ap',
        canActivate: [permissionGuard(Perm.AP_READ)],
        title: 'เจ้าหนี้ | KTT',
        loadComponent: () => import('./features/ap/ap-list.page').then((m) => m.ApPage),
      },
      {
        path: 'ap/bills/:id',
        canActivate: [permissionGuard(Perm.AP_READ)],
        title: 'ใบตั้งหนี้ | KTT',
        loadComponent: () => import('./features/ap/bill.page').then((m) => m.BillPage),
      },
      {
        path: 'ap/vouchers/:id',
        canActivate: [permissionGuard(Perm.AP_READ)],
        title: 'ใบสำคัญจ่าย | KTT',
        loadComponent: () => import('./features/ap/voucher.page').then((m) => m.VoucherPage),
      },
      {
        path: 'reports/tax',
        canActivate: [permissionGuard(Perm.TAX_REPORT)],
        title: 'รายงานภาษี | KTT',
        loadComponent: () => import('./features/reports/tax.page').then((m) => m.TaxPage),
      },
      {
        path: 'reports/cost',
        canActivate: [permissionGuard(Perm.COST_VIEW)],
        title: 'ต้นทุนโครงการ | KTT',
        loadComponent: () => import('./features/reports/cost.page').then((m) => m.CostPage),
      },
      {
        path: 'reports/cost/:id',
        canActivate: [permissionGuard(Perm.COST_VIEW)],
        title: 'ต้นทุนโครงการ | KTT',
        loadComponent: () => import('./features/reports/cost.page').then((m) => m.CostDetailPage),
      },
      {
        path: 'reports/cash-flow',
        canActivate: [permissionGuard(Perm.FINANCE_READ, Perm.AP_READ)],
        title: 'กระแสเงินสด | KTT',
        loadComponent: () => import('./features/reports/cashflow.page').then((m) => m.CashflowPage),
      },
      {
        path: 'dashboard',
        canActivate: [permissionGuard(Perm.DASHBOARD_VIEW)],
        title: 'แดชบอร์ดผู้บริหาร | KTT',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'calendar',
        title: 'ปฏิทิน | KTT',
        loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'permits',
        canActivate: [permissionGuard(Perm.PERMIT_READ, Perm.PERMIT_WRITE)],
        title: 'ใบอนุญาต | KTT',
        loadComponent: () => import('./features/permits/permits.page').then((m) => m.PermitsPage),
      },
      {
        path: 'service/tickets',
        canActivate: [permissionGuard(Perm.SERVICE_READ, Perm.SERVICE_WRITE)],
        title: 'งานแจ้งซ่อม | KTT',
        loadComponent: () => import('./features/service/tickets.page').then((m) => m.TicketsPage),
      },
      {
        path: 'service/tickets/:id',
        canActivate: [permissionGuard(Perm.SERVICE_READ, Perm.SERVICE_WRITE)],
        title: 'งานแจ้งซ่อม | KTT',
        loadComponent: () => import('./features/service/ticket.page').then((m) => m.TicketPage),
      },
      {
        path: 'service/warranty',
        canActivate: [permissionGuard(Perm.SERVICE_READ, Perm.SERVICE_WRITE)],
        title: 'รับประกันผลงาน | KTT',
        loadComponent: () => import('./features/service/warranty.page').then((m) => m.WarrantyPage),
      },
      {
        path: 'service/satisfaction',
        canActivate: [permissionGuard(Perm.SERVICE_READ, Perm.SERVICE_WRITE)],
        title: 'ความพึงพอใจลูกค้า | KTT',
        loadComponent: () => import('./features/service/satisfaction.page').then((m) => m.SatisfactionPage),
      },
      {
        path: 'admin/backup',
        canActivate: [permissionGuard(Perm.BACKUP_MANAGE)],
        title: 'สำรองข้อมูล | KTT',
        loadComponent: () => import('./features/backup/backup.page').then((m) => m.BackupPage),
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
