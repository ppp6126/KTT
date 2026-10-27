import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { PageResult } from '../core/api/api-error';

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  projectId: string | null;
  active: boolean;
}

/** ตัวเลือกที่ใช้ในหลายฟอร์ม (โครงการที่ยังเปิดอยู่ คลัง) โหลดครั้งเดียวต่อการเปิดหน้า */
@Injectable({ providedIn: 'root' })
export class Options {
  private readonly http = inject(HttpClient);

  projects(): Observable<ProjectOption[]> {
    const params = new HttpParams().set('status', 'open').set('size', 200).set('page', 0);
    return this.http.get<PageResult<ProjectOption>>('/api/projects', { params }).pipe(
      map((r) => r.items),
      catchError(() => of([])),
      shareReplay(1),
    );
  }

  warehouses(): Observable<WarehouseOption[]> {
    return this.http.get<WarehouseOption[]>('/api/stock/warehouses').pipe(
      map((l) => l.filter((w) => w.active)),
      catchError(() => of([])),
      shareReplay(1),
    );
  }
}
