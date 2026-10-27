import { HttpErrorResponse } from '@angular/common/http';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { fields?: Record<string, string>; [k: string]: unknown } | null;
}

/** ดึงข้อความ error ภาษาไทยจาก response ของ backend */
export function errorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    }
    const body = err.error as ApiErrorBody | null;
    if (body?.code === 'validation' && body.details?.fields) {
      const first = Object.values(body.details.fields)[0];
      if (first) return first;
    }
    if (body?.message) return body.message;
    if (err.status === 403) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
    if (err.status === 404) return 'ไม่พบข้อมูล';
  }
  return fallback;
}

export function errorCode(err: unknown): string | null {
  if (err instanceof HttpErrorResponse) {
    return (err.error as ApiErrorBody | null)?.code ?? null;
  }
  return null;
}

/** error รายฟิลด์จาก validation ของ backend */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | null;
    if (body?.code === 'validation' && body.details?.fields) {
      return body.details.fields;
    }
  }
  return {};
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
