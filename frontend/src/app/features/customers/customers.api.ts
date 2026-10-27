import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export type CustomerType = 'person' | 'company';
export type CustomerSource = 'facebook' | 'referral' | 'google' | 'other';

export interface Contact {
  id: string | null;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
}

export interface CustomerRow {
  id: string;
  type: CustomerType;
  name: string;
  taxId: string | null;
  branchNo: string | null;
  phone: string | null;
  email: string | null;
  source: CustomerSource;
  createdAt: string;
}

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  taxId: string | null;
  branchNo: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  billingAddress: string | null;
  source: CustomerSource;
  note: string | null;
  pdpaConsentAt: string | null;
  contacts: Contact[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  type: CustomerType;
  name: string;
  taxId: string | null;
  branchNo: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  billingAddress: string | null;
  source: CustomerSource;
  note: string | null;
  pdpaConsent: boolean;
  contacts: Contact[];
}

export interface CustomerQuery {
  q?: string;
  type?: string;
  source?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  list(q: CustomerQuery): Observable<PageResult<CustomerRow>> {
    let params = new HttpParams().set('page', q.page).set('size', q.size);
    for (const key of ['q', 'type', 'source', 'sort', 'dir'] as const) {
      const v = q[key];
      if (v) params = params.set(key, v);
    }
    return this.http.get<PageResult<CustomerRow>>('/api/customers', { params });
  }

  get(id: string): Observable<Customer> {
    return this.http.get<Customer>(`/api/customers/${id}`);
  }

  create(input: CustomerInput): Observable<Customer> {
    return this.http.post<Customer>('/api/customers', input);
  }

  update(id: string, input: CustomerInput): Observable<Customer> {
    return this.http.put<Customer>(`/api/customers/${id}`, input);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`/api/customers/${id}`);
  }
}

/** ตรวจ check digit เลขผู้เสียภาษี 13 หลัก (เหมือน backend) */
export function isValidThaiTaxId(v: string): boolean {
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(v[12]);
}
