import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export type QuotationStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded';

export const QUOTATION_STATUS: Record<QuotationStatus, { label: string; tone: '' | 'ok' | 'warn' | 'danger' }> = {
  draft: { label: 'ร่าง', tone: '' },
  pending_approval: { label: 'รออนุมัติ', tone: 'warn' },
  approved: { label: 'อนุมัติแล้ว รอส่ง', tone: 'warn' },
  sent: { label: 'ส่งลูกค้าแล้ว', tone: '' },
  accepted: { label: 'ลูกค้าอนุมัติ', tone: 'ok' },
  rejected: { label: 'ลูกค้าปฏิเสธ', tone: 'danger' },
  expired: { label: 'หมดอายุ', tone: 'danger' },
  superseded: { label: 'มีฉบับใหม่แทน', tone: '' },
};

export const ROUNDING: Record<string, string> = {
  none: 'ไม่ปัดเศษ',
  down_1: 'ปัดลงหลักหน่วย',
  down_10: 'ปัดลงหลักสิบ',
  down_100: 'ปัดลงหลักร้อย',
};

export interface QuotationRow {
  id: string;
  docNo: string;
  revision: number;
  displayNo: string;
  status: QuotationStatus;
  title: string | null;
  customerId: string;
  customerName: string;
  leadId: string | null;
  issueDate: string;
  validUntil: string;
  discountPct: number;
  totalAmount: number;
  marginPct: number | null;
  createdByName: string | null;
  updatedAt: string;
}

export interface QItem {
  id?: string;
  sortOrder?: number;
  itemType: 'item' | 'heading' | 'note';
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  amount?: number;
  unitCost: number | null;
}

export interface Quotation {
  id: string;
  docNo: string;
  revision: number;
  displayNo: string;
  status: QuotationStatus;
  title: string | null;
  customerId: string;
  leadId: string | null;
  leadTitle: string | null;
  boqId: string | null;
  customerName: string;
  customerAddress: string | null;
  customerTaxId: string | null;
  customerBranchNo: string | null;
  customerPhone: string | null;
  issueDate: string;
  validUntil: string;
  referenceNo: string | null;
  paymentCondition: string | null;
  displayMode: 'summary' | 'detailed';
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  overheadPct: number;
  overheadAmount: number;
  vatEnabled: boolean;
  vatPct: number;
  vatAmount: number;
  roundingMode: string;
  roundingAmount: number;
  whtPct: number;
  whtAmount: number;
  totalAmount: number;
  costTotal: number | null;
  marginPct: number | null;
  durationDays: number | null;
  warrantyTerms: string | null;
  scopeIn: string | null;
  scopeOut: string | null;
  notes: string | null;
  lostReason: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: QItem[];
  approval: {
    id: string;
    status: string;
    reason: string;
    requestedByName: string | null;
    decidedByName: string | null;
    comment: string | null;
    createdAt: string;
    decidedAt: string | null;
  } | null;
  needsApproval: boolean;
  approvalThresholdPct: number;
  editable: boolean;
  latestRevision: boolean;
  projectId: string | null;
}

export interface PendingApproval {
  approvalId: string;
  quotationId: string;
  displayNo: string;
  customerName: string;
  title: string | null;
  discountPct: number;
  totalAmount: number;
  marginPct: number | null;
  requestedByName: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class QuotationsApi {
  private readonly http = inject(HttpClient);

  list(p: { q?: string; status?: string; leadId?: string; customerId?: string; page: number; size: number }): Observable<PageResult<QuotationRow>> {
    let params = new HttpParams().set('page', p.page).set('size', p.size);
    for (const k of ['q', 'status', 'leadId', 'customerId'] as const) {
      const v = p[k];
      if (v) params = params.set(k, v);
    }
    return this.http.get<PageResult<QuotationRow>>('/api/quotations', { params });
  }

  get(id: string): Observable<Quotation> {
    return this.http.get<Quotation>(`/api/quotations/${id}`);
  }

  revisions(id: string): Observable<{ id: string; revision: number; status: QuotationStatus; totalAmount: number; createdAt: string; sentAt: string | null }[]> {
    return this.http.get<{ id: string; revision: number; status: QuotationStatus; totalAmount: number; createdAt: string; sentAt: string | null }[]>(`/api/quotations/${id}/revisions`);
  }

  create(body: { customerId: string; leadId?: string | null; boqId?: string | null; mode: string; title?: string | null }): Observable<Quotation> {
    return this.http.post<Quotation>('/api/quotations', body);
  }

  update(id: string, body: unknown): Observable<Quotation> {
    return this.http.put<Quotation>(`/api/quotations/${id}`, body);
  }

  action(id: string, action: 'send' | 'accept' | 'revise', body: unknown = {}): Observable<Quotation> {
    return this.http.post<Quotation>(`/api/quotations/${id}/${action}`, body);
  }

  reject(id: string, reason: string | null): Observable<Quotation> {
    return this.http.post<Quotation>(`/api/quotations/${id}/reject`, { reason });
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`/api/quotations/${id}`);
  }

  printed(id: string): Observable<unknown> {
    return this.http.post(`/api/quotations/${id}/printed`, {});
  }

  pending(): Observable<PendingApproval[]> {
    return this.http.get<PendingApproval[]>('/api/approvals');
  }

  decide(approvalId: string, approve: boolean, comment: string | null): Observable<Quotation> {
    return this.http.post<Quotation>(`/api/approvals/${approvalId}/${approve ? 'approve' : 'reject'}`, { comment });
  }
}
