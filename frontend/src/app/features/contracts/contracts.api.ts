import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const CONTRACT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  active: { label: 'มีผลบังคับ', tone: 'warn' },
  completed: { label: 'ปิดสัญญา', tone: 'ok' },
  terminated: { label: 'ยกเลิกสัญญา', tone: 'danger' },
};

export const MILESTONE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'ยังไม่ถึงงวด', tone: '' },
  ready: { label: 'ส่งมอบแล้ว รอวางบิล', tone: 'warn' },
  billed: { label: 'วางบิลแล้ว', tone: 'warn' },
  paid: { label: 'รับเงินแล้ว', tone: 'ok' },
};

export const VO_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  pending_approval: { label: 'รออนุมัติ', tone: 'warn' },
  approved: { label: 'อนุมัติแล้ว', tone: 'ok' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger' },
  cancelled: { label: 'ยกเลิก', tone: '' },
};

export interface Milestone {
  id: string | null;
  seq?: number;
  name: string;
  criteria: string | null;
  pct: number;
  amount?: number;
  dueDate: string | null;
  status?: string;
  changeOrderId?: string | null;
  completedAt?: string | null;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  editable?: boolean;
}

export interface VoRow {
  id: string;
  docNo: string;
  title: string;
  status: string;
  issueDate: string;
  amount: number;
  daysExtension: number;
  decidedAt: string | null;
}

export interface Financials {
  amount: number;
  voApproved: number;
  revisedAmount: number;
  vatAmount: number;
  revisedTotal: number;
  billed: number;
  received: number;
  outstanding: number;
  advanceBilled: number;
  advanceDeducted: number;
  retentionHeld: number;
  retentionReleased: number;
  milestonePctTotal: number;
}

export interface Contract {
  id: string;
  docNo: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  quotationId: string | null;
  quotationNo: string | null;
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  customerTaxId: string | null;
  customerBranchNo: string | null;
  title: string;
  contractDate: string;
  startDate: string | null;
  endDate: string | null;
  amount: number;
  vatEnabled: boolean;
  vatPct: number;
  advancePct: number;
  retentionPct: number;
  whtPct: number;
  penaltyPerDay: number | null;
  warrantyMonths: number | null;
  status: string;
  terms: string | null;
  notes: string | null;
  signedAt: string | null;
  milestones: Milestone[];
  changeOrders: VoRow[];
  financials: Financials;
  canEdit: boolean;
  canApprove: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractRow {
  id: string;
  docNo: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  customerName: string;
  status: string;
  contractDate: string;
  endDate: string | null;
  revisedAmount: number;
  billed: number;
  received: number;
}

export interface ContractUpdate {
  title: string;
  customerName: string;
  customerAddress: string | null;
  customerTaxId: string | null;
  customerBranchNo: string | null;
  contractDate: string;
  startDate: string | null;
  endDate: string | null;
  amount: number;
  vatEnabled: boolean;
  vatPct: number;
  advancePct: number;
  retentionPct: number;
  whtPct: number;
  penaltyPerDay: number | null;
  warrantyMonths: number | null;
  terms: string | null;
  notes: string | null;
  signedAt: string | null;
}

export interface FromQuotation {
  quotationId: string;
  projectName: string | null;
  siteAddress: string | null;
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
  advancePct: number;
  retentionPct: number;
  whtPct: number;
  milestones: Milestone[];
}

export interface VoItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  unitCost: number | null;
  amount?: number;
}

export interface Vo {
  id: string;
  docNo: string;
  contractId: string;
  contractNo: string;
  projectId: string;
  projectName: string | null;
  customerName: string;
  title: string;
  reason: string | null;
  requestedByCustomer: boolean;
  amount: number;
  vatAmount: number;
  total: number;
  costAmount: number | null;
  daysExtension: number;
  status: string;
  issueDate: string;
  customerApprovedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdByName: string | null;
  items: VoItem[];
  editable: boolean;
  canApprove: boolean;
  createdAt: string;
}

export interface VoSave {
  title: string;
  reason: string | null;
  requestedByCustomer: boolean;
  issueDate: string;
  daysExtension: number;
  customerApprovedAt: string | null;
  items: VoItem[];
}

@Injectable({ providedIn: 'root' })
export class ContractsApi {
  private readonly http = inject(HttpClient);

  list(f: { q?: string; status?: string; page: number; size: number }): Observable<PageResult<ContractRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    if (f.q) params = params.set('q', f.q);
    if (f.status) params = params.set('status', f.status);
    return this.http.get<PageResult<ContractRow>>('/api/contracts', { params });
  }

  get(id: string): Observable<Contract> {
    return this.http.get<Contract>(`/api/contracts/${id}`);
  }

  byProject(projectId: string): Observable<Contract> {
    return this.http.get<Contract>(`/api/projects/${projectId}/contract`);
  }

  fromQuotation(body: FromQuotation): Observable<Contract> {
    return this.http.post<Contract>('/api/contracts/from-quotation', body);
  }

  create(body: { projectId: string; title: string | null; amount: number; vatEnabled: boolean }): Observable<Contract> {
    return this.http.post<Contract>('/api/contracts', body);
  }

  update(id: string, body: ContractUpdate): Observable<Contract> {
    return this.http.put<Contract>(`/api/contracts/${id}`, body);
  }

  saveMilestones(id: string, milestones: Milestone[]): Observable<Contract> {
    return this.http.put<Contract>(`/api/contracts/${id}/milestones`, { milestones });
  }

  milestoneReady(id: string, msId: string, ready: boolean): Observable<Contract> {
    return this.http.post<Contract>(`/api/contracts/${id}/milestones/${msId}/${ready ? 'ready' : 'unready'}`, {});
  }

  status(id: string, status: string, reason?: string): Observable<Contract> {
    return this.http.post<Contract>(`/api/contracts/${id}/status`, { status, reason: reason ?? null });
  }

  releaseRetention(id: string, amount: number): Observable<Contract> {
    return this.http.post<Contract>(`/api/contracts/${id}/retention-release`, { amount });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/contracts/${id}`);
  }

  // ---- VO
  createVo(contractId: string, body: VoSave): Observable<Vo> {
    return this.http.post<Vo>(`/api/contracts/${contractId}/change-orders`, body);
  }

  vo(id: string): Observable<Vo> {
    return this.http.get<Vo>(`/api/change-orders/${id}`);
  }

  updateVo(id: string, body: VoSave): Observable<Vo> {
    return this.http.put<Vo>(`/api/change-orders/${id}`, body);
  }

  voAction(id: string, action: 'submit' | 'approve' | 'reject' | 'cancel', body: unknown = {}): Observable<Vo> {
    return this.http.post<Vo>(`/api/change-orders/${id}/${action}`, body);
  }

  pendingVo(): Observable<VoRow[]> {
    return this.http.get<VoRow[]>('/api/change-orders/pending');
  }
}
