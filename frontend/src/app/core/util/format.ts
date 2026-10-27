import { Pipe, PipeTransform } from '@angular/core';

/** วันที่แบบไทย พ.ศ. (th-TH ใช้ปฏิทินพุทธศักราชเป็นค่าเริ่มต้น) */
const DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function thDate(value: string | Date | null | undefined): string {
  if (!value) return '–';
  return DATE.format(new Date(value));
}

/** แบบสั้นตามเอกสารเดิมของบริษัท เช่น 29/7/69 (ปี พ.ศ. 2 หลัก) */
export function thDateShort(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return `${d.getDate()}/${d.getMonth() + 1}/${String((d.getFullYear() + 543) % 100).padStart(2, '0')}`;
}

/** วันที่เต็มแบบไทย เช่น 29 กรกฎาคม 2569 */
export function thDateLong(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function thDateTime(value: string | Date | null | undefined): string {
  if (!value) return '–';
  return DATE_TIME.format(new Date(value));
}

@Pipe({ name: 'thDate' })
export class ThDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, withTime = false): string {
    return withTime ? thDateTime(value) : thDate(value);
  }
}

/** แสดงเลขผู้เสียภาษีแบบ 0-0000-00000-00-0 */
@Pipe({ name: 'taxId' })
export class TaxIdPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v || v.length !== 13) return v ?? '–';
    return `${v[0]}-${v.slice(1, 5)}-${v.slice(5, 10)}-${v.slice(10, 12)}-${v[12]}`;
  }
}

/** สรุป User-Agent ให้อ่านง่าย เช่น "Chrome บน Windows" */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'อุปกรณ์ไม่ทราบชื่อ';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'เบราว์เซอร์';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} บน ${os}` : browser;
}

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  person: 'บุคคลธรรมดา',
  company: 'นิติบุคคล',
};

export const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  referral: 'เพื่อน/ลูกค้าแนะนำ',
  google: 'Google',
  other: 'อื่น ๆ',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: 'สร้าง',
  update: 'แก้ไข',
  delete: 'ลบ',
  approve: 'อนุมัติ',
  reject: 'ไม่อนุมัติ',
  export: 'ส่งออก',
  login: 'เข้าสู่ระบบ',
  login_failed: 'เข้าสู่ระบบไม่สำเร็จ',
  logout: 'ออกจากระบบ',
  locked: 'บัญชีถูกล็อก',
  mfa_enabled: 'เปิด 2FA',
  mfa_disabled: 'ปิด 2FA',
  password_changed: 'เปลี่ยนรหัสผ่าน',
  password_reset: 'รีเซ็ตรหัสผ่าน',
  session_revoked: 'ยกเลิก session',
};

export const ENTITY_LABEL: Record<string, string> = {
  user: 'ผู้ใช้',
  role: 'บทบาท',
  customer: 'ลูกค้า',
  lead: 'ลีด',
  quotation: 'ใบเสนอราคา',
  boq: 'BOQ',
  project: 'โครงการ',
  contract: 'สัญญา',
  change_order: 'งานเพิ่ม-ลด',
  daily_report: 'รายงานประจำวัน',
  project_issue: 'ปัญหา/ความเสี่ยง',
  punch_item: 'Punch list',
  qc_inspection: 'ตรวจ QC',
  qc_template: 'แม่แบบ QC',
  safety_log: 'ความปลอดภัย',
  sales_doc: 'เอกสารการเงิน',
};

/** วันนี้ตามเวลาเครื่องในรูปแบบ yyyy-mm-dd (ใช้กับ input type=date) */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime()) / 86400000);
}
