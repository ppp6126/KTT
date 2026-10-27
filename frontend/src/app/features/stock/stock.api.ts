import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export const STOCK_KIND: Record<string, string> = {
  receive: 'รับเข้า',
  issue: 'เบิกใช้',
  transfer_in: 'โอนเข้า',
  transfer_out: 'โอนออก',
  adjust: 'ปรับยอด',
  return: 'รับคืน',
  transfer: 'โอนย้าย',
};

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  active: boolean;
  stockValue: number;
}

export interface OnHand {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  qty: number;
  avgCost: number | null;
  value: number | null;
  minQty: number;
  low: boolean;
  lastMovement: string | null;
}

export interface LedgerRow {
  date: string;
  kind: string;
  qty: number;
  unitCost: number;
  refType: string;
  refId: string;
  refNo: string | null;
  projectCode: string | null;
  note: string | null;
  balance: number;
  balanceValue: number;
}

export interface StockDoc {
  id: string;
  docNo: string;
  kind: string;
  docDate: string;
  warehouseName: string;
  toWarehouseName: string | null;
  projectCode: string | null;
  notes: string | null;
  createdByName: string | null;
  value: number;
  lines: { materialId: string; code: string; name: string; unit: string; qty: number; unitCost: number; note: string | null }[];
}

export interface StockDocSave {
  kind: 'issue' | 'transfer' | 'adjust' | 'return';
  docDate: string;
  warehouseId: string;
  toWarehouseId: string | null;
  projectId: string | null;
  notes: string | null;
  lines: { materialId: string; qty: number; unitCost: number | null; note: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class StockApi {
  private readonly http = inject(HttpClient);

  warehouses(): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>('/api/stock/warehouses');
  }

  saveWarehouse(id: string | null, body: { code: string; name: string; projectId: string | null; active: boolean }): Observable<Warehouse> {
    return id ? this.http.put<Warehouse>(`/api/stock/warehouses/${id}`, body) : this.http.post<Warehouse>('/api/stock/warehouses', body);
  }

  onHand(f: { warehouseId?: string; q?: string; low?: boolean }): Observable<OnHand[]> {
    let params = new HttpParams();
    if (f.warehouseId) params = params.set('warehouseId', f.warehouseId);
    if (f.q) params = params.set('q', f.q);
    if (f.low) params = params.set('low', true);
    return this.http.get<OnHand[]>('/api/stock/on-hand', { params });
  }

  ledger(materialId: string, warehouseId: string): Observable<LedgerRow[]> {
    const params = new HttpParams().set('materialId', materialId).set('warehouseId', warehouseId);
    return this.http.get<LedgerRow[]>('/api/stock/ledger', { params });
  }

  minQty(materialId: string, warehouseId: string, minQty: number): Observable<void> {
    return this.http.put<void>('/api/stock/min-qty', { materialId, warehouseId, minQty });
  }

  docs(projectId?: string): Observable<StockDoc[]> {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<StockDoc[]>('/api/stock/docs', { params });
  }

  post(body: StockDocSave): Observable<StockDoc> {
    return this.http.post<StockDoc>('/api/stock/docs', body);
  }
}
