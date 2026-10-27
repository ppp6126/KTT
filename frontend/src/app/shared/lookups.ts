import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, Injectable, OnInit, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable, Subject, debounceTime, map, shareReplay, switchMap } from 'rxjs';
import { PageResult } from '../core/api/api-error';

export interface UserOption {
  id: string;
  name: string;
  role: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  taxId: string | null;
}

@Injectable({ providedIn: 'root' })
export class Lookups {
  private readonly http = inject(HttpClient);
  private users$?: Observable<UserOption[]>;

  users(): Observable<UserOption[]> {
    this.users$ ??= this.http.get<UserOption[]>('/api/users/options').pipe(shareReplay(1));
    return this.users$;
  }

  customers(q: string): Observable<CustomerOption[]> {
    const params = new HttpParams().set('q', q).set('size', 15);
    return this.http.get<PageResult<CustomerOption>>('/api/customers', { params }).pipe(map((r) => r.items));
  }
}

/** ช่องค้นหาและเลือกลูกค้า */
@Component({
  selector: 'app-customer-picker',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [(ngModel)]="text"
        (ngModelChange)="search$.next($event)"
        [matAutocomplete]="auto"
        [disabled]="disabled()"
        [required]="required()"
      />
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="display" (optionSelected)="pick($event.option.value)">
        @for (c of options(); track c.id) {
          <mat-option [value]="c">
            {{ c.name }}
            @if (c.phone) {
              <span class="muted"> {{ c.phone }}</span>
            }
          </mat-option>
        }
      </mat-autocomplete>
      <mat-hint>พิมพ์ชื่อ เบอร์โทร หรือเลขผู้เสียภาษี</mat-hint>
    </mat-form-field>
  `,
  styles: `.w-full { width: 100%; }`,
})
export class CustomerPicker implements OnInit {
  private readonly lookups = inject(Lookups);
  readonly label = input('ลูกค้า');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly initialName = input<string | null>(null);
  readonly customerId = model<string | null>(null);
  readonly picked = output<CustomerOption>();

  readonly options = signal<CustomerOption[]>([]);
  readonly search$ = new Subject<string | CustomerOption>();
  text: string | CustomerOption = '';
  readonly display = (c: string | CustomerOption | null) => (typeof c === 'string' ? c : (c?.name ?? ''));

  ngOnInit(): void {
    this.text = this.initialName() ?? '';
    this.search$
      .pipe(
        debounceTime(250),
        switchMap((q) => this.lookups.customers(typeof q === 'string' ? q : '')),
      )
      .subscribe((list) => this.options.set(list));
    this.search$.next(this.text);
  }

  pick(c: CustomerOption): void {
    this.customerId.set(c.id);
    this.picked.emit(c);
  }
}
