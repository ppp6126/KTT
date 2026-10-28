import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

type Tone = '' | 'ok' | 'warn' | 'danger';

export type DocType = 'invoice' | 'invoice_tax' | 'billing_note' | 'receipt' | 'tax_receipt' | 'credit_note';

export const DOC_TYPE: Record<DocType, { label: string; short: string; icon: string }> = {
  invoice: { label: 'ใบแจ้งหนี้', short: 'ใบแจ้งหนี้', icon: 'receipt_long' },
  invoice_tax: { label: 'ใบแจ้งหนี้/ใบกำกับภาษี', short: 'ใบแจ้งหนี้/ใบกำกับ', icon: 'receipt_long' },
  billing_note: { label: 'ใบวางบิล', short: 'ใบวางบิล', icon: 'summarize' },
  receipt: { label: 'ใบเสร็จรับเงิน', short: 'ใบเสร็จ', icon: 'paid' },
  tax_receipt: { label: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', short: 'ใบเสร็จ/ใบกำกับ', icon: 'paid' },
  credit_note: { label: 'ใบลดหนี้', short: 'ใบลดหนี้', icon: 'remove_circle_outline' },
};

export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  issued: { label: 'ออกแล้ว', tone: 'warn' },
  partial: { label: 'รับชำระบางส่วน', tone: 'warn' },
  paid: { label: 'ชำระครบ', tone: 'ok' },
  void: { label: 'ยกเลิก', tone: 'danger' },
};

export const PAY_METHOD: Record<string, string> = {
  transfer: 'โอนเงิน',
  cash: 'เงินสด',
  cheque: 'เช็ค',
  other: 'อื่น ๆ',
};

export const KIND: Record<string, string> = {
  normal: 'ทั่วไป',
  advance: 'เงินล่วงหน้า',
  milestone: 'งวดงาน',
};

export interface DocItem {
  id?: string;
  sortOrder?: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  amount?: number;
  milestoneId: string | null;
}

export interface DocLink {
  id: string;
  docType: DocType;
  docNo: string;
  docDate: string;
  status: string;
  totalAmount: number;
  netAmount: number;
  outstanding: number | null;
}

export interface SalesDocRow {
  id: string;
  docType: DocType;
  docNo: string;
  docDate: string;
  dueDate: string | null;
  status: string;
  customerName: string;
  projectCode: string | null;
  kind: string;
  totalAmount: number;
  netAmount: number;
  settledAmount: number;
  outstanding: number | null;
  overdue: boolean;
}

export interface SalesDoc {
  id: string;
  docType: DocType;
  title: string;
  docNo: string;
  docDate: string;
  dueDate: string | null;
  status: string;
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  customerTaxId: string | null;
  customerBranchNo: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  contractId: string | null;
  contractNo: string | null;
  kind: string;
  subtotal: number;
  discountAmount: number;
  advanceDeduct: number;
  taxableAmount: number;
  vatEnabled: boolean;
  vatPct: number;
  vatAmount: number;
  totalAmount: number;
  retentionPct: number;
  retentionAmount: number;
  whtPct: number;
  whtAmount: number;
  netAmount: number;
  settledAmount: number;
  outstanding: number | null;
  originalAmount: number | null;
  correctAmount: number | null;
  reason: string | null;
  paymentMethod: string | null;
  paymentRef: string | null;
  paidDate: string | null;
  notes: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  createdByName: string | null;
  items: DocItem[];
  refDoc: DocLink | null;
  related: DocLink[];
  billingLines: DocLink[];
  canEdit: boolean;
  canIssue: boolean;
  canPay: boolean;
  canVoid: boolean;
  canCredit: boolean;
}

export interface InvoiceSave {
  docType: 'invoice' | 'invoice_tax';
  customerId: string | null;
  contractId: string | null;
  projectId: string | null;
  kind: string | null;
  docDate: string;
  dueDate: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;
  customerBranchNo: string | null;
  discountAmount: number;
  advanceDeduct: number;
  vatEnabled: boolean;
  vatPct: number;
  retentionPct: number;
  whtPct: number;
  notes: string | null;
  items: DocItem[];
}

export interface PaymentSave {
  paidDate: string;
  method: string;
  reference: string | null;
  cashAmount: number;
  whtAmount: number;
  retentionAmount: number;
  notes: string | null;
}

export interface AgingRow {
  customerId: string | null;
  customerName: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
  total: number;
  retentionHeld: number;
}

export interface Receivables {
  asOf: string;
  rows: AgingRow[];
  totals: AgingRow;
}

@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly http = inject(HttpClient);

  list(f: {
    type?: string;
    status?: string;
    q?: string;
    customerId?: string;
    projectId?: string;
    contractId?: string;
    open?: boolean;
    page: number;
    size: number;
  }): Observable<PageResult<SalesDocRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    for (const k of ['type', 'status', 'q', 'customerId', 'projectId', 'contractId'] as const) {
      if (f[k]) params = params.set(k, f[k]!);
    }
    if (f.open) params = params.set('open', true);
    return this.http.get<PageResult<SalesDocRow>>('/api/finance/docs', { params });
  }

  get(id: string): Observable<SalesDoc> {
    return this.http.get<SalesDoc>(`/api/finance/docs/${id}`);
  }

  createInvoice(body: InvoiceSave): Observable<SalesDoc> {
    return this.http.post<SalesDoc>('/api/finance/invoices', body);
  }

  fromContract(body: { contractId: string; docType: string; advance: boolean; milestoneIds: string[] }): Observable<SalesDoc> {
    return this.http.post<SalesDoc>('/api/finance/invoices/from-contract', body);
  }

  updateInvoice(id: string, body: InvoiceSave): Observable<SalesDoc> {
    return this.http.put<SalesDoc>(`/api/finance/invoices/${id}`, body);
  }

  pay(id: string, body: PaymentSave): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`/api/finance/invoices/${id}/payments`, body);
  }

  billingNote(body: { customerId: string; docDate: string; dueDate: string | null; notes: string | null; invoiceIds: string[] }): Observable<SalesDoc> {
    return this.http.post<SalesDoc>('/api/finance/billing-notes', body);
  }

  creditNote(body: { refDocId: string; docDate: string; correctAmount: number; reason: string; notes: string | null }): Observable<SalesDoc> {
    return this.http.post<SalesDoc>('/api/finance/credit-notes', body);
  }

  issue(id: string): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`/api/finance/docs/${id}/issue`, {});
  }

  void(id: string, reason: string): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`/api/finance/docs/${id}/void`, { reason });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/finance/docs/${id}`);
  }

  printed(id: string): Observable<void> {
    return this.http.post<void>(`/api/finance/docs/${id}/printed`, {});
  }

  receivables(): Observable<Receivables> {
    return this.http.get<Receivables>('/api/finance/receivables');
  }
}
