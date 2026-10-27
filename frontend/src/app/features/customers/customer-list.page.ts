import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { CUSTOMER_TYPE_LABEL, SOURCE_LABEL, TaxIdPipe, ThDatePipe } from '../../core/util/format';
import { CanDirective } from '../../shared/can.directive';
import { Notify } from '../../shared/notify.service';
import { CustomerRow, CustomersApi } from './customers.api';

@Component({
  selector: 'app-customer-list-page',
  imports: [
    FormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ThDatePipe,
    TaxIdPipe,
    CanDirective,
  ],
  templateUrl: './customer-list.page.html',
  styles: `
    .filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      padding: 16px 16px 0;

      mat-form-field { width: 200px; }
      .search { flex: 1; min-width: 240px; }
    }
    .name { font-weight: 500; }
  `,
})
export class CustomerListPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly Perm = Perm;
  readonly typeLabel = CUSTOMER_TYPE_LABEL;
  readonly sourceLabel = SOURCE_LABEL;
  readonly sources = Object.entries(SOURCE_LABEL);
  readonly columns = ['name', 'taxId', 'contact', 'source', 'createdAt'];

  readonly rows = signal<CustomerRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);

  q = '';
  type = '';
  source = '';
  sort = 'name';
  dir: 'asc' | 'desc' = 'asc';
  page = 0;
  size = 20;
  private readonly search$ = new Subject<void>();

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page = 0;
      this.load();
    });
  }

  ngOnInit(): void {
    this.load();
  }

  onSearch(): void {
    this.search$.next();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list({ q: this.q.trim(), type: this.type, source: this.source, sort: this.sort, dir: this.dir, page: this.page, size: this.size })
      .subscribe({
        next: (r) => {
          this.rows.set(r.items);
          this.total.set(r.total);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.notify.error(e);
        },
      });
  }

  onSort(s: Sort): void {
    this.sort = s.direction ? s.active : 'name';
    this.dir = (s.direction || 'asc') as 'asc' | 'desc';
    this.page = 0;
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex;
    this.size = e.pageSize;
    this.load();
  }

  open(row: CustomerRow): void {
    this.router.navigate(['/customers', row.id]);
  }

  get hasFilter(): boolean {
    return !!(this.q || this.type || this.source);
  }
}
