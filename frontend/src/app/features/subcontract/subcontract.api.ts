import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const SC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  active: { label: 'กำลังทำงาน', tone: 'warn' },
  completed: { label: 'ปิดงาน', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'danger' },
};

export const CLAIM_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'รอตรวจรับ', tone: 'warn' },
  approved: { label: 'ตรวจรับแล้ว', tone: 'ok' },
  billed: { label: 'ตั้งหนี้แล้ว', tone: 'ok' },
};

export interface ScRow {
  id: string;
  docNo: string;
  projectId: string;
  projectCode: string | null;
  supplierName: string | null;
  title: string;
  amount: number;
  claimed: number;
  claimedPct: number;
  status: string;
  endDate: string | null;
}

export interface Claim {
  id: string;
  claimNo: number;
  claimDate: string;
  description: string;
  progressPct: number | null;
  amount: number;
  retention: number;
  wht: number;
  vat: number;
  net: number;
  status: string;
  apBillId: string | null;
  apBillNo: string | null;
  apBillStatus: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

export interface Sc {
  id: string;
  docNo: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  supplierId: string;
  supplierName: string | null;
  supplierTaxId: string | null;
  title: string;
  scope: string | null;
  amount: number;
  vatEnabled: boolean;
  vatPct: number;
  retentionPct: number;
  whtPct: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  notes: string | null;
  claimed: number;
  claimedPct: number;
  retentionHeld: number;
  retentionReleased: number;
  paid: number;
  claims: Claim[];
  canEdit: boolean;
  createdAt: string;
}

export interface ScSave {
  projectId: string;
  supplierId: string;
  title: string;
  scope: string | null;
  amount: number;
  vatEnabled: boolean;
  retentionPct: number;
  whtPct: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

// ---- labor
export interface Worker {
  id: string;
  name: string;
  nickname: string | null;
  trade: string | null;
  dailyWage: number;
  otRate: number;
  phone: string | null;
  idCard: string | null;
  supplierId: string | null;
  supplierName: string | null;
  active: boolean;
}

export interface Entry {
  workerId: string;
  workDate: string;
  days: number;
  otHours: number;
  wage?: number;
  note: string | null;
  locked?: boolean;
}

export interface Timesheet {
  projectId: string;
  from: string;
  to: string;
  workers: Worker[];
  entries: Entry[];
  totalWage: number;
  totalDays: number;
}

export interface WageLine {
  workerId: string;
  workerName: string;
  trade: string | null;
  days: number;
  otHours: number;
  amount: number;
}

export interface WagePayment {
  id: string;
  docNo: string;
  periodFrom: string;
  periodTo: string;
  projectId: string | null;
  projectCode: string | null;
  total: number;
  paidDate: string | null;
  status: string;
  notes: string | null;
  lines: WageLine[];
  createdByName: string | null;
}

@Injectable({ providedIn: 'root' })
export class SubcontractApi {
  private readonly http = inject(HttpClient);

  list(projectId?: string, status?: string): Observable<ScRow[]> {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    if (status) params = params.set('status', status);
    return this.http.get<ScRow[]>('/api/subcontracts', { params });
  }

  get(id: string): Observable<Sc> {
    return this.http.get<Sc>(`/api/subcontracts/${id}`);
  }

  save(id: string | null, body: ScSave): Observable<Sc> {
    return id ? this.http.put<Sc>(`/api/subcontracts/${id}`, body) : this.http.post<Sc>('/api/subcontracts', body);
  }

  status(id: string, status: string): Observable<Sc> {
    return this.http.post<Sc>(`/api/subcontracts/${id}/status`, { status });
  }

  addClaim(id: string, body: { claimDate: string; description: string; progressPct: number | null; amount: number }): Observable<Sc> {
    return this.http.post<Sc>(`/api/subcontracts/${id}/claims`, body);
  }

  approveClaim(id: string, claimId: string): Observable<Sc> {
    return this.http.post<Sc>(`/api/subcontracts/${id}/claims/${claimId}/approve`, {});
  }

  deleteClaim(id: string, claimId: string): Observable<Sc> {
    return this.http.delete<Sc>(`/api/subcontracts/${id}/claims/${claimId}`);
  }

  releaseRetention(id: string, amount: number): Observable<Sc> {
    return this.http.post<Sc>(`/api/subcontracts/${id}/retention-release`, { amount });
  }

  // ---- labor
  workers(active = false): Observable<Worker[]> {
    return this.http.get<Worker[]>('/api/labor/workers', { params: new HttpParams().set('active', active) });
  }

  saveWorker(id: string | null, body: Omit<Worker, 'id' | 'supplierName'>): Observable<Worker> {
    return id ? this.http.put<Worker>(`/api/labor/workers/${id}`, body) : this.http.post<Worker>('/api/labor/workers', body);
  }

  timesheet(projectId: string, from: string, to: string): Observable<Timesheet> {
    return this.http.get<Timesheet>('/api/labor/timesheets', { params: new HttpParams().set('projectId', projectId).set('from', from).set('to', to) });
  }

  saveTimesheet(projectId: string, entries: Entry[]): Observable<Timesheet> {
    return this.http.put<Timesheet>('/api/labor/timesheets', { projectId, entries });
  }

  wagePreview(from: string, to: string, projectId?: string): Observable<WageLine[]> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<WageLine[]>('/api/labor/wage-preview', { params });
  }

  wagePayments(): Observable<WagePayment[]> {
    return this.http.get<WagePayment[]>('/api/labor/wage-payments');
  }

  createWagePayment(body: { from: string; to: string; projectId: string | null; notes: string | null }): Observable<WagePayment> {
    return this.http.post<WagePayment>('/api/labor/wage-payments', body);
  }

  wageAction(id: string, action: 'pay' | 'void', paidDate?: string): Observable<WagePayment> {
    return this.http.post<WagePayment>(`/api/labor/wage-payments/${id}/${action}`, action === 'pay' ? { paidDate } : {});
  }
}
