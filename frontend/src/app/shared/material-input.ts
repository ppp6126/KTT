import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MaterialOption, PurchaseApi } from '../features/purchase/purchase.api';

/** ช่องรายการที่พิมพ์อิสระได้ และค้นหาวัสดุจากฐานราคากลางมาเติมให้ */
@Component({
  selector: 'app-material-input',
  imports: [FormsModule, MatAutocompleteModule],
  template: `
    <div class="wrap">
      <input
        [(ngModel)]="text"
        (ngModelChange)="onType($event)"
        [matAutocomplete]="auto"
        [disabled]="disabled()"
        [attr.aria-label]="label()"
        [placeholder]="placeholder()"
      />
      @if (code()) {
        <span class="code" title="ผูกกับวัสดุในฐานราคา">{{ code() }}</span>
      }
    </div>
    <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pick($event.option.value)" [displayWith]="display">
      @for (m of options(); track m.id) {
        <mat-option [value]="m">
          <span class="opt-code">{{ m.code }}</span> {{ m.name }} <span class="opt-unit">/{{ m.unit }}</span>
        </mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host { display: block; }
    .wrap { position: relative; }
    input { width: 100%; height: 32px; padding: 0 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; font: inherit; color: inherit; box-sizing: border-box; }
    input:hover:not(:disabled) { border-color: var(--ktt-line); }
    input:focus { outline: none; border-color: var(--ktt-ink-2); background: #fff; }
    .code { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 0.72rem; color: var(--ktt-steel); background: #eef1f3; padding: 0 5px; border-radius: 3px; pointer-events: none; }
    .opt-code { color: var(--ktt-steel); font-size: 0.85em; margin-right: 6px; }
    .opt-unit { color: var(--ktt-steel); }
  `,
})
export class MaterialInput {
  private readonly api = inject(PurchaseApi);
  readonly description = model<string>('');
  readonly code = input<string | null>(null);
  readonly disabled = input(false);
  readonly label = input('รายการ');
  readonly placeholder = input('พิมพ์ชื่อหรือรหัสวัสดุ');
  readonly picked = output<MaterialOption>();
  /** พิมพ์แก้ข้อความเอง (ไม่ได้เลือกจากรายการ) */
  readonly typed = output<string>();
  readonly options = signal<MaterialOption[]>([]);
  private readonly search$ = new Subject<string>();
  text: string | MaterialOption = '';
  readonly display = (v: string | MaterialOption | null) => (typeof v === 'string' ? v : (v?.name ?? ''));

  constructor() {
    this.search$
      .pipe(
        debounceTime(250),
        switchMap((q) => this.api.materials(q)),
        takeUntilDestroyed(),
      )
      .subscribe((l) => this.options.set(l));
  }

  ngOnInit(): void {
    this.text = this.description();
  }

  onType(v: string | MaterialOption): void {
    if (typeof v !== 'string') return;
    this.description.set(v);
    this.typed.emit(v);
    if (v.trim().length >= 2) this.search$.next(v.trim());
  }

  pick(m: MaterialOption): void {
    this.text = m.name;
    this.description.set(m.name);
    this.picked.emit(m);
  }
}
