import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export type PriceType = 'materials' | 'labor' | 'equipment';

export const TRADES: Record<string, string> = {
  mason: 'ช่างปูน',
  steel: 'ช่างเหล็ก',
  electric: 'ช่างไฟฟ้า',
  plumbing: 'ช่างประปา',
  paint: 'ช่างสี',
  tile: 'ช่างกระเบื้อง',
  carpentry: 'ช่างไม้',
  other: 'อื่น ๆ',
};

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  materialCount: number;
}

export interface MaterialRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  costPrice: number | null;
  sellPrice: number;
  supplierName: string | null;
  priceUpdatedAt: string | null;
}

export interface RateRow {
  id: string;
  code: string;
  name: string;
  trade?: string;
  unit: string;
  rate: number | null;
  updatedAt: string;
}

export interface PriceHistory {
  id: string;
  priceField: string;
  oldPrice: number | null;
  newPrice: number;
  changedAt: string;
  changedByName: string | null;
}

export interface ImportResult {
  saved: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
}

@Injectable({ providedIn: 'root' })
export class PricingApi {
  private readonly http = inject(HttpClient);

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/pricing/categories');
  }

  saveCategory(id: string | null, body: { name: string; parentId: string | null; sortOrder: number }): Observable<Category> {
    return id ? this.http.put<Category>(`/api/pricing/categories/${id}`, body) : this.http.post<Category>('/api/pricing/categories', body);
  }

  deleteCategory(id: string): Observable<unknown> {
    return this.http.delete(`/api/pricing/categories/${id}`);
  }

  list<T>(type: PriceType, p: { q?: string; categoryId?: string; trade?: string; page: number; size: number }): Observable<PageResult<T>> {
    let params = new HttpParams().set('page', p.page).set('size', p.size);
    if (p.q) params = params.set('q', p.q);
    if (p.categoryId) params = params.set('categoryId', p.categoryId);
    if (p.trade) params = params.set('trade', p.trade);
    return this.http.get<PageResult<T>>(`/api/pricing/${type}`, { params });
  }

  save(type: PriceType, id: string | null, body: unknown): Observable<unknown> {
    return id ? this.http.put(`/api/pricing/${type}/${id}`, body) : this.http.post(`/api/pricing/${type}`, body);
  }

  delete(type: PriceType, id: string): Observable<unknown> {
    return this.http.delete(`/api/pricing/${type}/${id}`);
  }

  history(itemType: 'material' | 'labor' | 'equipment', id: string): Observable<PriceHistory[]> {
    return this.http.get<PriceHistory[]>(`/api/pricing/history/${itemType}/${id}`);
  }

  exportExcel(type: PriceType, template: boolean): Observable<Blob> {
    return this.http.get(`/api/pricing/excel/${type}`, { params: { template }, responseType: 'blob' });
  }

  importExcel(type: PriceType, file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`/api/pricing/excel/${type}`, form);
  }
}
