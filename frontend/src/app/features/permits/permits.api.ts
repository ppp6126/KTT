import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const PERMIT_KIND: Record<string, string> = {
  company_license: 'ใบอนุญาตบริษัท',
  building_permit: 'ใบอนุญาตก่อสร้าง',
  insurance: 'กรมธรรม์ประกันภัย',
  vehicle: 'ภาษี/พ.ร.บ. รถ',
  equipment: 'ตรวจสภาพเครื่องจักร',
  certificate: 'ใบรับรอง/ใบประกอบวิชาชีพ',
  other: 'อื่น ๆ',
};

export const PERMIT_STATE: Record<string, { label: string; tone: Tone }> = {
  ok: { label: 'ปกติ', tone: 'ok' },
  soon: { label: 'ใกล้หมดอายุ', tone: 'warn' },
  expired: { label: 'หมดอายุแล้ว', tone: 'danger' },
  none: { label: 'ไม่มีวันหมดอายุ', tone: '' },
  renewed: { label: 'ต่ออายุแล้ว', tone: '' },
  cancelled: { label: 'ยกเลิก', tone: '' },
};

export interface Permit {
  id: string;
  kind: string;
  name: string;
  number: string | null;
  issuer: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notifyDays: number;
  daysLeft: number | null;
  state: string;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  renewedFromId: string | null;
  notes: string | null;
  attachmentCount: number;
  updatedAt: string;
}

export interface PermitSave {
  kind: string;
  name: string;
  number: string | null;
  issuer: string | null;
  projectId: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notifyDays: number;
  ownerId: string | null;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class PermitsApi {
  private readonly http = inject(HttpClient);

  list(f: { filter?: string; projectId?: string; kind?: string; q?: string }): Observable<Permit[]> {
    let params = new HttpParams();
    for (const k of ['filter', 'projectId', 'kind', 'q'] as const) if (f[k]) params = params.set(k, f[k]!);
    return this.http.get<Permit[]>('/api/permits', { params });
  }

  save(id: string | null, body: PermitSave): Observable<Permit> {
    return id ? this.http.put<Permit>(`/api/permits/${id}`, body) : this.http.post<Permit>('/api/permits', body);
  }

  renew(id: string, body: { number: string | null; issueDate: string | null; expiryDate: string; notes: string | null }): Observable<Permit> {
    return this.http.post<Permit>(`/api/permits/${id}/renew`, body);
  }

  status(id: string, status: 'active' | 'renewing' | 'cancelled'): Observable<Permit> {
    return this.http.post<Permit>(`/api/permits/${id}/status`, { status });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/permits/${id}`);
  }
}
