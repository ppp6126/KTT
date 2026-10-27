import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export type LeadStatus = 'new' | 'site_visit' | 'estimating' | 'quoted' | 'negotiating' | 'won' | 'lost';

export const LEAD_STATUSES: { code: LeadStatus; label: string }[] = [
  { code: 'new', label: 'ลีดใหม่' },
  { code: 'site_visit', label: 'นัดดูไซต์' },
  { code: 'estimating', label: 'ประเมินราคา' },
  { code: 'quoted', label: 'เสนอราคาแล้ว' },
  { code: 'negotiating', label: 'ต่อรอง' },
  { code: 'won', label: 'ได้งาน' },
  { code: 'lost', label: 'ไม่ได้งาน' },
];

export const LEAD_STATUS_LABEL: Record<string, string> = Object.fromEntries(LEAD_STATUSES.map((s) => [s.code, s.label]));

export const JOB_TYPES: Record<string, string> = {
  new_house: 'สร้างบ้านใหม่',
  extension: 'ต่อเติม',
  renovation: 'รีโนเวท',
  interior: 'ตกแต่งภายใน',
  mep: 'งานระบบไฟฟ้า/ประปา',
  landscape: 'รั้ว/ภูมิทัศน์',
  structure: 'งานโครงสร้าง',
  roof: 'งานหลังคา',
  repair: 'ซ่อมบำรุง',
  subcontract: 'รับเหมาช่วง',
};

export const ACTIVITY_TYPES: Record<string, { label: string; icon: string }> = {
  call: { label: 'โทร', icon: 'call' },
  visit: { label: 'ดูไซต์', icon: 'location_on' },
  meeting: { label: 'ประชุม', icon: 'groups' },
  note: { label: 'บันทึก', icon: 'sticky_note_2' },
  status_change: { label: 'เปลี่ยนสถานะ', icon: 'swap_horiz' },
};

export interface LeadRow {
  id: string;
  title: string;
  jobType: string;
  status: LeadStatus;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  budgetEst: number | null;
  nextFollowupAt: string | null;
  siteAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  type: string;
  note: string;
  occurredAt: string;
  createdBy: string | null;
  createdByName: string | null;
}

export interface LeadDetail {
  lead: LeadRow;
  lostReason: string | null;
  activities: Activity[];
  attachmentCount: number;
}

export interface LeadInput {
  customerId: string;
  title: string;
  jobType: string;
  siteAddress: string | null;
  budgetEst: number | null;
  ownerId: string | null;
  nextFollowupAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class LeadsApi {
  private readonly http = inject(HttpClient);

  board(q?: string, ownerId?: string): Observable<LeadRow[]> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (ownerId) params = params.set('ownerId', ownerId);
    return this.http.get<LeadRow[]>('/api/leads/board', { params });
  }

  list(p: { q?: string; status?: string; customerId?: string; page: number; size: number }): Observable<PageResult<LeadRow>> {
    let params = new HttpParams().set('page', p.page).set('size', p.size);
    if (p.q) params = params.set('q', p.q);
    if (p.status) params = params.set('status', p.status);
    if (p.customerId) params = params.set('customerId', p.customerId);
    return this.http.get<PageResult<LeadRow>>('/api/leads', { params });
  }

  get(id: string): Observable<LeadDetail> {
    return this.http.get<LeadDetail>(`/api/leads/${id}`);
  }

  create(input: LeadInput): Observable<LeadRow> {
    return this.http.post<LeadRow>('/api/leads', input);
  }

  update(id: string, input: LeadInput): Observable<LeadRow> {
    return this.http.put<LeadRow>(`/api/leads/${id}`, input);
  }

  setStatus(id: string, status: LeadStatus, lostReason?: string | null): Observable<LeadRow> {
    return this.http.put<LeadRow>(`/api/leads/${id}/status`, { status, lostReason: lostReason ?? null });
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`/api/leads/${id}`);
  }

  addActivity(id: string, type: string, note: string, occurredAt?: string | null): Observable<Activity> {
    return this.http.post<Activity>(`/api/leads/${id}/activities`, { type, note, occurredAt: occurredAt ?? null });
  }

  deleteActivity(id: string, activityId: string): Observable<unknown> {
    return this.http.delete(`/api/leads/${id}/activities/${activityId}`);
  }
}
