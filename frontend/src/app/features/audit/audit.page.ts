import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { PageResult } from '../../core/api/api-error';
import { AUDIT_ACTION_LABEL, ENTITY_LABEL, ThDatePipe, describeUserAgent } from '../../core/util/format';
import { Notify } from '../../shared/notify.service';

interface AuditRow {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}

interface Change {
  field: string;
  before: string;
  after: string;
}

@Component({
  selector: 'app-audit-page',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatPaginatorModule, ThDatePipe],
  templateUrl: './audit.page.html',
  styleUrl: './audit.page.scss',
})
export class AuditPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(Notify);

  readonly actionLabel = AUDIT_ACTION_LABEL;
  readonly entityLabel = ENTITY_LABEL;
  readonly actions = Object.entries(AUDIT_ACTION_LABEL);
  readonly entities = Object.entries(ENTITY_LABEL);
  readonly describeUa = describeUserAgent;

  readonly rows = signal<AuditRow[]>([]);
  readonly total = signal(0);
  readonly expanded = signal<string | null>(null);

  entityType = '';
  action = '';
  from = '';
  to = '';
  page = 0;
  size = 50;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    let params = new HttpParams().set('page', this.page).set('size', this.size);
    if (this.entityType) params = params.set('entityType', this.entityType);
    if (this.action) params = params.set('action', this.action);
    if (this.from) params = params.set('from', this.from);
    if (this.to) params = params.set('to', this.to);
    this.http.get<PageResult<AuditRow>>('/api/audit-logs', { params }).subscribe({
      next: (r) => {
        this.rows.set(r.items);
        this.total.set(r.total);
      },
      error: (e) => this.notify.error(e),
    });
  }

  applyFilters(): void {
    this.page = 0;
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  toggle(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  changes(r: AuditRow): Change[] {
    const keys = new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})]);
    return [...keys].map((k) => ({
      field: k,
      before: this.show(r.before?.[k]),
      after: this.show(r.after?.[k]),
    }));
  }

  private show(v: unknown): string {
    if (v === undefined || v === null || v === '') return '–';
    if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่ใช่';
    if (Array.isArray(v)) return v.join(', ') || '–';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
