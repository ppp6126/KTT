import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'รับแจ้ง', tone: 'warn' },
  scheduled: { label: 'นัดหมายแล้ว', tone: 'warn' },
  in_progress: { label: 'กำลังซ่อม', tone: 'warn' },
  resolved: { label: 'ซ่อมเสร็จ รอยืนยัน', tone: 'ok' },
  closed: { label: 'ปิดงาน', tone: 'ok' },
  rejected: { label: 'ไม่รับซ่อม', tone: 'danger' },
};

export const TICKET_CATEGORY: Record<string, string> = {
  structure: 'โครงสร้าง/รอยร้าว',
  roof_leak: 'หลังคารั่ว/น้ำซึม',
  plumbing: 'ประปา/สุขภัณฑ์',
  electrical: 'ไฟฟ้า',
  finishing: 'งานสี/ผิว/กระเบื้อง',
  door_window: 'ประตู/หน้าต่าง',
  other: 'อื่น ๆ',
};

export const TICKET_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'ต่ำ', tone: '' },
  normal: { label: 'ปกติ', tone: '' },
  high: { label: 'สูง', tone: 'warn' },
  urgent: { label: 'ด่วน', tone: 'danger' },
};

export const TICKET_CHANNEL: Record<string, string> = { phone: 'โทรศัพท์', line: 'LINE', walk_in: 'มาที่สำนักงาน', site: 'แจ้งหน้างาน', email: 'อีเมล', other: 'อื่น ๆ' };

export const SURVEY_METHOD: Record<string, string> = { phone: 'โทรสอบถาม', visit: 'เยี่ยมลูกค้า', paper: 'แบบสอบถามกระดาษ', line: 'LINE', other: 'อื่น ๆ' };

export const WARRANTY_STATE: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'อยู่ในประกัน', tone: 'ok' },
  expiring: { label: 'ใกล้หมดประกัน', tone: 'warn' },
  expired: { label: 'หมดประกัน', tone: '' },
  not_started: { label: 'ยังไม่ส่งมอบ', tone: '' },
};

export interface TicketRow {
  id: string;
  docNo: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  projectId: string | null;
  projectCode: string | null;
  customerName: string | null;
  inWarranty: boolean;
  reportedAt: string;
  appointmentAt: string | null;
  assigneeName: string | null;
  ageDays: number;
}

export interface TicketSave {
  projectId: string | null;
  customerId: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  channel: string;
  reporterName: string | null;
  reporterPhone: string | null;
  siteAddress: string | null;
  reportedAt: string | null;
}

export interface Survey {
  id: string;
  customerId: string;
  customerName: string | null;
  projectId: string | null;
  projectCode: string | null;
  ticketId: string | null;
  ticketNo: string | null;
  surveyDate: string;
  method: string;
  respondent: string | null;
  quality: number | null;
  timeliness: number | null;
  communication: number | null;
  cleanliness: number | null;
  overall: number;
  recommend: boolean | null;
  comment: string | null;
  createdByName: string | null;
}

export interface Ticket {
  id: string;
  docNo: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  channel: string;
  reporterName: string | null;
  reporterPhone: string | null;
  siteAddress: string | null;
  reportedAt: string;
  inWarranty: boolean;
  warrantyEnd: string | null;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  appointmentAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolution: string | null;
  laborCost: number;
  materialCost: number;
  chargeAmount: number;
  logs: { at: string; status: string | null; note: string | null; byName: string | null }[];
  surveys: Survey[];
  createdByName: string | null;
  createdAt: string;
}

export interface TicketStats {
  open: number;
  scheduled: number;
  inProgress: number;
  urgent: number;
  overdueAppointments: number;
  avgResolveDays: number | null;
  warrantyCostYtd: number;
}

export interface WarrantyRow {
  projectId: string;
  code: string;
  name: string;
  customerName: string;
  handoverDate: string | null;
  contractMonths: number | null;
  warrantyEnd: string | null;
  overridden: boolean;
  state: string;
  daysLeft: number | null;
  openTickets: number;
  totalTickets: number;
  warrantyCost: number;
}

export interface SurveySave {
  customerId: string | null;
  projectId: string | null;
  ticketId: string | null;
  surveyDate: string;
  method: string;
  respondent: string | null;
  quality: number | null;
  timeliness: number | null;
  communication: number | null;
  cleanliness: number | null;
  overall: number | null;
  recommend: boolean | null;
  comment: string | null;
}

export interface SurveySummary {
  count: number;
  overall: number | null;
  quality: number | null;
  timeliness: number | null;
  communication: number | null;
  cleanliness: number | null;
  recommendPct: number | null;
  byProject: { projectId: string; code: string; name: string; count: number; overall: number | null }[];
  byManager: { managerId: string; name: string; count: number; overall: number | null }[];
}

@Injectable({ providedIn: 'root' })
export class ServiceApi {
  private readonly http = inject(HttpClient);

  tickets(f: { status?: string; projectId?: string; q?: string; page: number; size: number }): Observable<PageResult<TicketRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    for (const k of ['status', 'projectId', 'q'] as const) if (f[k]) params = params.set(k, f[k]!);
    return this.http.get<PageResult<TicketRow>>('/api/service/tickets', { params });
  }

  stats(): Observable<TicketStats> {
    return this.http.get<TicketStats>('/api/service/tickets/stats');
  }

  ticket(id: string): Observable<Ticket> {
    return this.http.get<Ticket>(`/api/service/tickets/${id}`);
  }

  save(id: string | null, body: TicketSave): Observable<Ticket> {
    return id ? this.http.put<Ticket>(`/api/service/tickets/${id}`, body) : this.http.post<Ticket>('/api/service/tickets', body);
  }

  schedule(id: string, body: { assigneeId: string | null; appointmentAt: string | null; note: string | null }): Observable<Ticket> {
    return this.http.post<Ticket>(`/api/service/tickets/${id}/schedule`, body);
  }

  resolve(id: string, body: { resolution: string; laborCost: number; materialCost: number; chargeAmount: number }): Observable<Ticket> {
    return this.http.post<Ticket>(`/api/service/tickets/${id}/resolve`, body);
  }

  action(id: string, action: 'start' | 'close' | 'reject' | 'reopen' | 'note', note: string | null = null): Observable<Ticket> {
    return this.http.post<Ticket>(`/api/service/tickets/${id}/action`, { action, note });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/service/tickets/${id}`);
  }

  warranties(state?: string): Observable<WarrantyRow[]> {
    let params = new HttpParams();
    if (state) params = params.set('state', state);
    return this.http.get<WarrantyRow[]>('/api/service/warranties', { params });
  }

  setWarranty(projectId: string, warrantyUntil: string | null): Observable<void> {
    return this.http.put<void>(`/api/service/warranties/${projectId}`, { warrantyUntil });
  }

  surveys(f: { projectId?: string; from?: string; to?: string } = {}): Observable<Survey[]> {
    let params = new HttpParams();
    for (const k of ['projectId', 'from', 'to'] as const) if (f[k]) params = params.set(k, f[k]!);
    return this.http.get<Survey[]>('/api/service/surveys', { params });
  }

  summary(from: string, to: string): Observable<SurveySummary> {
    return this.http.get<SurveySummary>('/api/service/surveys/summary', { params: new HttpParams().set('from', from).set('to', to) });
  }

  addSurvey(body: SurveySave): Observable<Survey> {
    return this.http.post<Survey>('/api/service/surveys', body);
  }

  removeSurvey(id: string): Observable<void> {
    return this.http.delete<void>(`/api/service/surveys/${id}`);
  }
}
