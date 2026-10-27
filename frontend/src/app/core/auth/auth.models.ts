export interface RoleRef {
  id: string;
  code: string;
  name: string;
}

/** ข้อจำกัดของ token: ต้องเปลี่ยนรหัสผ่าน หรือ ต้องตั้ง 2FA ก่อนใช้งานส่วนอื่น */
export type Restriction = 'password_change' | 'mfa_setup' | null;

export interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: RoleRef;
  permissions: string[];
  mfaEnabled: boolean;
  recoveryCodesLeft: number;
  mustChangePassword: boolean;
  restriction: Restriction;
  lastLoginAt: string | null;
}

export interface LoginResponse {
  mfaRequired: boolean;
  mfaToken: string | null;
  accessToken: string | null;
  expiresIn: number | null;
  user: Me | null;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface MfaEnableResponse {
  recoveryCodes: string[];
  auth: LoginResponse;
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

/** ต้องตรงกับ com.ktt.security.Perm ฝั่ง backend */
export const Perm = {
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_WRITE: 'customer.write',
  CUSTOMER_DELETE: 'customer.delete',
  LEAD_READ: 'lead.read',
  LEAD_READ_ALL: 'lead.read_all',
  LEAD_WRITE: 'lead.write',
  LEAD_DELETE: 'lead.delete',
  PRICING_READ: 'pricing.read',
  PRICING_WRITE: 'pricing.write',
  PRICING_IMPORT: 'pricing.import',
  BOQ_READ: 'boq.read',
  BOQ_WRITE: 'boq.write',
  QUOTATION_READ: 'quotation.read',
  QUOTATION_WRITE: 'quotation.write',
  QUOTATION_SEND: 'quotation.send',
  QUOTATION_APPROVE: 'quotation.approve',
  QUOTATION_EXPORT: 'quotation.export',
  ATTACHMENT_READ: 'attachment.read',
  ATTACHMENT_WRITE: 'attachment.write',
  COST_VIEW: 'cost.view',
  PROJECT_READ: 'project.read',
  PROJECT_READ_ALL: 'project.read_all',
  PROJECT_WRITE: 'project.write',
  SITE_REPORT: 'site.report',
  CONTRACT_READ: 'contract.read',
  CONTRACT_WRITE: 'contract.write',
  CONTRACT_APPROVE: 'contract.approve',
  FINANCE_READ: 'finance.read',
  FINANCE_WRITE: 'finance.write',
  FINANCE_VOID: 'finance.void',
} as const;
