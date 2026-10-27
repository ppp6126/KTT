import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const BILL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  approved: { label: 'อนุมัติ รอจ่าย', tone: 'warn' },
  partial: { label: 'จ่ายบางส่วน', tone: 'warn' },
  paid: { label: 'จ่ายครบ', tone: 'ok' },
  void: { label: 'ยกเลิก', tone: 'danger' },
};

export const PV_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  approved: { label: 'อนุมัติ รอจ่าย', tone: 'warn' },
  paid: { label: 'จ่ายแล้ว', tone: 'ok' },
  void: { label: 'ยกเลิก', tone: 'danger' },
};

export const COST_CATEGORY: Record<string, string> = {
  material: 'วัสดุ',
  subcontract: 'ผู้รับเหมาช่วง',
  labor: 'ค่าแรง',
  equipment: 'เครื่องจักร/เช่าอุปกรณ์',
  overhead: 'ค่าใช้จ่ายสำนักงาน',
  other: 'อื่น ๆ',
};

export interface BillRow {
  id: string;
  docNo: string;
  supplierName: string;
  supplierInvoiceNo: string | null;
  billDate: string;
  dueDate: string | null;
  projectCode: string | null;
  category: string;
  status: string;
  totalAmount: number;
  netPayable: number;
  outstanding: number | null;
  overdue: boolean;
}

export interface BillItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  amount?: number;
}

export interface Bill {
  id: string;
  docNo: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string | null;
  supplierBranchNo: string | null;
  supplierInvoiceNo: string | null;
  taxInvoice: boolean;
  billDate: string;
  dueDate: string | null;
  taxPeriod: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  poId: string | null;
  poNo: string | null;
  subcontractClaimId: string | null;
  category: string;
  subtotal: number;
  vatEnabled: boolean;
  vatPct: number;
  vatAmount: number;
  totalAmount: number;
  retentionAmount: number;
  whtPct: number;
  whtAmount: number;
  netPayable: number;
  paidAmount: number;
  outstanding: number | null;
  status: string;
  notes: string | null;
  createdByName: string | null;
  items: BillItem[];
  payments: { pvId: string; pvNo: string; payDate: string; status: string; amount: number; whtAmount: number }[];
  canEdit: boolean;
  canApprove: boolean;
  canVoid: boolean;
  createdAt: string;
}

export interface BillSave {
  supplierId: string;
  supplierInvoiceNo: string | null;
  taxInvoice: boolean;
  billDate: string;
  dueDate: string | null;
  taxPeriod: string | null;
  projectId: string | null;
  poId: string | null;
  category: string;
  vatEnabled: boolean;
  whtPct: number;
  retentionAmount: number;
  notes: string | null;
  items: BillItem[];
}

export interface PvRow {
  id: string;
  docNo: string;
  supplierName: string;
  payDate: string;
  method: string;
  status: string;
  grossAmount: number;
  whtAmount: number;
  netPaid: number;
}

export interface Cert {
  id: string;
  bookNo: string;
  runNo: number;
  form: 'pnd3' | 'pnd53';
  payeeName: string;
  payeeTaxId: string | null;
  payeeAddress: string | null;
  payDate: string;
  incomeType: string;
  amount: number;
  whtRate: number;
  whtAmount: number;
  status: string;
  pvId: string;
  pvNo: string | null;
}

export interface Pv {
  id: string;
  docNo: string;
  supplierId: string;
  supplierName: string;
  supplierTaxId: string | null;
  supplierBank: string | null;
  payDate: string;
  method: string;
  bankRef: string | null;
  grossAmount: number;
  whtAmount: number;
  netPaid: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  lines: { billId: string; billNo: string; supplierInvoiceNo: string | null; billDate: string; category: string; billTotal: number; amount: number; whtAmount: number }[];
  certificates: Cert[];
  canApprove: boolean;
  canPay: boolean;
  canVoid: boolean;
  createdAt: string;
}

// ---- reports
export interface VatRow {
  date: string;
  docNo: string;
  partyName: string;
  partyTaxId: string | null;
  partyBranch: string | null;
  base: number;
  vat: number;
  note: string | null;
  refId: string;
}

export interface VatReport {
  period: string;
  kind: string;
  rows: VatRow[];
  totalBase: number;
  totalVat: number;
}

export interface WhtRow {
  certificateId: string;
  certNo: string;
  payDate: string;
  payeeName: string;
  payeeTaxId: string | null;
  payeeAddress: string | null;
  incomeType: string;
  rate: number;
  amount: number;
  wht: number;
}

export interface WhtReport {
  period: string;
  form: string;
  rows: WhtRow[];
  totalAmount: number;
  totalWht: number;
}

export interface CostLine {
  category: string;
  label: string;
  actual: number;
  committed: number;
}

export interface ProjectCost {
  projectId: string;
  code: string;
  name: string;
  revenue: number;
  billed: number;
  budget: number;
  actualCost: number;
  committed: number;
  forecastCost: number;
  grossProfit: number;
  marginPct: number | null;
  budgetUsedPct: number | null;
  progressPct: number;
  lines: CostLine[];
  months: { month: string; material: number; subcontract: number; labor: number; other: number }[];
}

export interface CostRow {
  projectId: string;
  code: string;
  name: string;
  status: string;
  revenue: number;
  budget: number;
  actualCost: number;
  committed: number;
  marginPct: number | null;
  budgetUsedPct: number | null;
  progressPct: number;
}

export interface UsageRow {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  boqQty: number;
  usedQty: number;
  variance: number;
  usedPct: number | null;
  boqCost: number;
  usedCost: number;
}

export interface CashItem {
  direction: 'in' | 'out';
  kind: string;
  label: string;
  date: string | null;
  amount: number;
}

export interface CashWeek {
  weekStart: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
  items: CashItem[];
}

export interface CashFlow {
  asOf: string;
  weeks: number;
  overdueIn: number;
  overdueOut: number;
  rows: CashWeek[];
}

@Injectable({ providedIn: 'root' })
export class ApApi {
  private readonly http = inject(HttpClient);

  bills(f: { status?: string; supplierId?: string; projectId?: string; q?: string; open?: boolean; page: number; size: number }): Observable<PageResult<BillRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    for (const k of ['status', 'supplierId', 'projectId', 'q'] as const) if (f[k]) params = params.set(k, f[k]!);
    if (f.open) params = params.set('open', true);
    return this.http.get<PageResult<BillRow>>('/api/ap/bills', { params });
  }

  bill(id: string): Observable<Bill> {
    return this.http.get<Bill>(`/api/ap/bills/${id}`);
  }

  saveBill(id: string | null, body: BillSave): Observable<Bill> {
    return id ? this.http.put<Bill>(`/api/ap/bills/${id}`, body) : this.http.post<Bill>('/api/ap/bills', body);
  }

  billFromPo(poId: string): Observable<Bill> {
    return this.http.post<Bill>(`/api/ap/bills/from-po/${poId}`, {});
  }

  approveBill(id: string): Observable<Bill> {
    return this.http.post<Bill>(`/api/ap/bills/${id}/approve`, {});
  }

  voidBill(id: string, reason: string): Observable<Bill> {
    return this.http.post<Bill>(`/api/ap/bills/${id}/void`, { reason });
  }

  deleteBill(id: string): Observable<void> {
    return this.http.delete<void>(`/api/ap/bills/${id}`);
  }

  vouchers(f: { status?: string; supplierId?: string; page: number; size: number }): Observable<PageResult<PvRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    if (f.status) params = params.set('status', f.status);
    if (f.supplierId) params = params.set('supplierId', f.supplierId);
    return this.http.get<PageResult<PvRow>>('/api/ap/vouchers', { params });
  }

  voucher(id: string): Observable<Pv> {
    return this.http.get<Pv>(`/api/ap/vouchers/${id}`);
  }

  createVoucher(body: { supplierId: string; payDate: string; method: string; bankRef: string | null; notes: string | null; lines: { billId: string; amount: number }[] }): Observable<Pv> {
    return this.http.post<Pv>('/api/ap/vouchers', body);
  }

  voucherAction(id: string, action: 'approve' | 'pay' | 'void', body: unknown = {}): Observable<Pv> {
    return this.http.post<Pv>(`/api/ap/vouchers/${id}/${action}`, body);
  }

  certificate(id: string): Observable<Cert> {
    return this.http.get<Cert>(`/api/ap/wht-certificates/${id}`);
  }

  // ---- reports
  vat(kind: 'sales' | 'purchase', period: string): Observable<VatReport> {
    return this.http.get<VatReport>(`/api/reports/vat-${kind}`, { params: new HttpParams().set('period', period) });
  }

  wht(form: 'pnd3' | 'pnd53', period: string): Observable<WhtReport> {
    return this.http.get<WhtReport>('/api/reports/wht', { params: new HttpParams().set('period', period).set('form', form) });
  }

  projectCost(projectId: string): Observable<ProjectCost> {
    return this.http.get<ProjectCost>(`/api/reports/project-cost/${projectId}`);
  }

  costSummary(): Observable<CostRow[]> {
    return this.http.get<CostRow[]>('/api/reports/project-cost');
  }

  usage(projectId: string): Observable<UsageRow[]> {
    return this.http.get<UsageRow[]>(`/api/reports/material-usage/${projectId}`);
  }

  cashFlow(weeks = 12): Observable<CashFlow> {
    return this.http.get<CashFlow>('/api/reports/cash-flow', { params: new HttpParams().set('weeks', weeks) });
  }
}
