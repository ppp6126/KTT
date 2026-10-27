import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

type Tone = '' | 'ok' | 'warn' | 'danger';

export const PR_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  submitted: { label: 'รออนุมัติ', tone: 'warn' },
  approved: { label: 'อนุมัติ รอสั่งซื้อ', tone: 'warn' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger' },
  ordered: { label: 'สั่งซื้อแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: '' },
};

export const PO_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  pending_approval: { label: 'รออนุมัติ', tone: 'warn' },
  approved: { label: 'อนุมัติ รอรับของ', tone: 'warn' },
  partial: { label: 'รับของบางส่วน', tone: 'warn' },
  received: { label: 'รับของครบ', tone: 'ok' },
  closed: { label: 'ปิดแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'danger' },
};

export const SUPPLIER_KIND: Record<string, string> = {
  supplier: 'ผู้ขายวัสดุ',
  subcontractor: 'ผู้รับเหมาช่วง',
  both: 'ทั้งสองแบบ',
};

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  personType: string;
  taxId: string | null;
  phone: string | null;
  contactName: string | null;
  category: string | null;
  creditDays: number;
  active: boolean;
  rating: number | null;
  openPayable: number;
}

export interface Evaluation {
  id: string;
  projectId: string | null;
  projectCode: string | null;
  evalDate: string;
  quality: number;
  delivery: number;
  price: number;
  service: number;
  average: number;
  comment: string | null;
  createdByName: string | null;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  kind: string;
  personType: string;
  taxId: string | null;
  branchNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  category: string | null;
  creditDays: number;
  vatRegistered: boolean;
  bankName: string | null;
  bankAccount: string | null;
  notes: string | null;
  active: boolean;
  rating: number | null;
  evaluations: Evaluation[];
  createdAt: string;
}

export type SupplierSave = Omit<Supplier, 'id' | 'rating' | 'evaluations' | 'createdAt' | 'code'> & { code: string | null };

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
  kind: string;
  creditDays: number;
  vatRegistered: boolean;
}

export interface PrRow {
  id: string;
  docNo: string;
  projectCode: string | null;
  projectName: string | null;
  requestDate: string;
  requiredDate: string | null;
  status: string;
  itemCount: number;
  estTotal: number;
  createdByName: string | null;
  poNo: string | null;
}

export interface PrItem {
  id?: string | null;
  sortOrder?: number;
  materialId: string | null;
  materialCode?: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  estUnitPrice: number | null;
  note: string | null;
}

export interface Quote {
  id: string;
  supplierId: string;
  supplierName: string | null;
  quoteRef: string | null;
  quoteDate: string | null;
  deliveryDays: number | null;
  creditDays: number | null;
  vatIncluded: boolean;
  prices: Record<string, number>;
  total: number;
  totalExVat: number;
  selected: boolean;
  notes: string | null;
  supplierRating: number | null;
}

export interface Pr {
  id: string;
  docNo: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  warehouseId: string | null;
  requestDate: string;
  requiredDate: string | null;
  status: string;
  notes: string | null;
  createdByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  items: PrItem[];
  quotes: Quote[];
  poId: string | null;
  poNo: string | null;
  canEdit: boolean;
  canApprove: boolean;
  canQuote: boolean;
  createdAt: string;
}

export interface PrSave {
  projectId: string | null;
  warehouseId: string | null;
  requestDate: string;
  requiredDate: string | null;
  notes: string | null;
  items: PrItem[];
}

export interface QuoteSave {
  supplierId: string;
  quoteRef: string | null;
  quoteDate: string | null;
  deliveryDays: number | null;
  creditDays: number | null;
  vatIncluded: boolean;
  prices: Record<string, number | null>;
  notes: string | null;
}

export interface PoRow {
  id: string;
  docNo: string;
  supplierName: string;
  projectCode: string | null;
  orderDate: string;
  deliveryDate: string | null;
  status: string;
  totalAmount: number;
  receivedPct: number;
  createdByName: string | null;
}

export interface PoItem {
  id?: string | null;
  sortOrder?: number;
  materialId: string | null;
  materialCode?: string | null;
  prItemId: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  amount?: number;
  receivedQty?: number;
  remainingQty?: number;
}

export interface GrRow {
  id: string;
  docNo: string;
  receiveDate: string;
  deliveryNoteNo: string | null;
  status: string;
  warehouseName: string;
  value: number;
  createdByName: string | null;
  lines: { description: string; quantity: number; unit: string | null; unitCost: number }[];
}

export interface Po {
  id: string;
  docNo: string;
  supplierId: string;
  supplierName: string;
  supplierAddress: string | null;
  supplierTaxId: string | null;
  supplierBranchNo: string | null;
  supplierPhone: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  prId: string | null;
  prNo: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  orderDate: string;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  status: string;
  subtotal: number;
  discountAmount: number;
  vatEnabled: boolean;
  vatPct: number;
  vatAmount: number;
  totalAmount: number;
  creditDays: number;
  paymentTerms: string | null;
  notes: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  items: PoItem[];
  receipts: GrRow[];
  billedAmount: number;
  canEdit: boolean;
  canApprove: boolean;
  canReceive: boolean;
  needsApproval: boolean;
  createdAt: string;
}

export interface PoSave {
  supplierId: string;
  projectId: string | null;
  warehouseId: string | null;
  orderDate: string;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  discountAmount: number;
  vatEnabled: boolean;
  creditDays: number;
  paymentTerms: string | null;
  notes: string | null;
  items: PoItem[];
}

export interface MaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  costPrice: number | null;
}

@Injectable({ providedIn: 'root' })
export class PurchaseApi {
  private readonly http = inject(HttpClient);

  // ---- suppliers
  suppliers(f: { q?: string; kind?: string; page: number; size: number }): Observable<PageResult<SupplierRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    if (f.q) params = params.set('q', f.q);
    if (f.kind) params = params.set('kind', f.kind);
    return this.http.get<PageResult<SupplierRow>>('/api/suppliers', { params });
  }

  supplierOptions(kind?: string): Observable<SupplierOption[]> {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get<SupplierOption[]>('/api/suppliers/options', { params });
  }

  supplier(id: string): Observable<Supplier> {
    return this.http.get<Supplier>(`/api/suppliers/${id}`);
  }

  saveSupplier(id: string | null, body: SupplierSave): Observable<Supplier> {
    return id ? this.http.put<Supplier>(`/api/suppliers/${id}`, body) : this.http.post<Supplier>('/api/suppliers', body);
  }

  deleteSupplier(id: string): Observable<void> {
    return this.http.delete<void>(`/api/suppliers/${id}`);
  }

  evaluate(id: string, body: { projectId: string | null; evalDate: string; quality: number; delivery: number; price: number; service: number; comment: string | null }): Observable<Supplier> {
    return this.http.post<Supplier>(`/api/suppliers/${id}/evaluations`, body);
  }

  materials(q: string): Observable<MaterialOption[]> {
    const params = new HttpParams().set('q', q).set('size', 20);
    return this.http.get<PageResult<MaterialOption>>('/api/pricing/materials', { params }).pipe(map((r) => r.items));
  }

  // ---- PR
  prs(f: { status?: string; projectId?: string; q?: string; page: number; size: number }): Observable<PageResult<PrRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    if (f.status) params = params.set('status', f.status);
    if (f.projectId) params = params.set('projectId', f.projectId);
    if (f.q) params = params.set('q', f.q);
    return this.http.get<PageResult<PrRow>>('/api/purchase-requests', { params });
  }

  pr(id: string): Observable<Pr> {
    return this.http.get<Pr>(`/api/purchase-requests/${id}`);
  }

  savePr(id: string | null, body: PrSave): Observable<Pr> {
    return id ? this.http.put<Pr>(`/api/purchase-requests/${id}`, body) : this.http.post<Pr>('/api/purchase-requests', body);
  }

  prAction(id: string, action: 'submit' | 'approve' | 'reject' | 'cancel', comment?: string): Observable<Pr> {
    return this.http.post<Pr>(`/api/purchase-requests/${id}/${action}`, { comment: comment ?? null });
  }

  saveQuote(prId: string, quoteId: string | null, body: QuoteSave): Observable<Pr> {
    return quoteId
      ? this.http.put<Pr>(`/api/purchase-requests/${prId}/quotes/${quoteId}`, body)
      : this.http.post<Pr>(`/api/purchase-requests/${prId}/quotes`, body);
  }

  deleteQuote(prId: string, quoteId: string): Observable<Pr> {
    return this.http.delete<Pr>(`/api/purchase-requests/${prId}/quotes/${quoteId}`);
  }

  orderFromQuote(prId: string, quoteId: string): Observable<Po> {
    return this.http.post<Po>(`/api/purchase-requests/${prId}/quotes/${quoteId}/order`, {});
  }

  // ---- PO
  pos(f: { status?: string; supplierId?: string; projectId?: string; q?: string; page: number; size: number }): Observable<PageResult<PoRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    for (const k of ['status', 'supplierId', 'projectId', 'q'] as const) if (f[k]) params = params.set(k, f[k]!);
    return this.http.get<PageResult<PoRow>>('/api/purchase-orders', { params });
  }

  po(id: string): Observable<Po> {
    return this.http.get<Po>(`/api/purchase-orders/${id}`);
  }

  savePo(id: string | null, body: PoSave): Observable<Po> {
    return id ? this.http.put<Po>(`/api/purchase-orders/${id}`, body) : this.http.post<Po>('/api/purchase-orders', body);
  }

  poAction(id: string, action: 'submit' | 'approve' | 'reject' | 'cancel' | 'close', comment?: string): Observable<Po> {
    return this.http.post<Po>(`/api/purchase-orders/${id}/${action}`, { comment: comment ?? null });
  }

  deletePo(id: string): Observable<void> {
    return this.http.delete<void>(`/api/purchase-orders/${id}`);
  }

  receive(id: string, body: { receiveDate: string; deliveryNoteNo: string | null; notes: string | null; lines: { poItemId: string; quantity: number }[] }): Observable<Po> {
    return this.http.post<Po>(`/api/purchase-orders/${id}/receipts`, body);
  }

  voidReceipt(grId: string): Observable<Po> {
    return this.http.post<Po>(`/api/goods-receipts/${grId}/void`, {});
  }
}
