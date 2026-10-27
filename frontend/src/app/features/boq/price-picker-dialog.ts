import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { MoneyPipe } from '../../core/util/money';
import { BoqApi, PickItem } from './boq.api';

/** เลือกวัสดุ / ค่าแรง / เครื่องจักร จากฐานราคากลางมาใส่แถว BOQ */
@Component({
  selector: 'app-price-picker-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatIconModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>เลือกจากฐานราคา</h2>
    <mat-dialog-content class="content">
      <mat-button-toggle-group [(ngModel)]="type" (change)="search$.next()" aria-label="ประเภท">
        <mat-button-toggle value="material">วัสดุ</mat-button-toggle>
        <mat-button-toggle value="labor">ค่าแรง</mat-button-toggle>
        <mat-button-toggle value="equipment">เครื่องจักร</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-form-field class="w-full" subscriptSizing="dynamic">
        <mat-label>ค้นหารหัสหรือชื่อ</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [(ngModel)]="q" (ngModelChange)="search$.next()" cdkFocusInitial />
      </mat-form-field>
      <ul class="list">
        @for (p of items(); track p.id) {
          <li>
            <button type="button" (click)="ref.close(p)">
              <span class="code">{{ p.code }}</span>
              <span class="name">{{ p.name }}</span>
              <span class="muted">{{ p.unit }}</span>
              <span class="num">{{ p.unitCost | money }}</span>
            </button>
          </li>
        } @empty {
          <li class="muted empty">ไม่พบรายการ</li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>ยกเลิก</button></mat-dialog-actions>
  `,
  styles: `
    .content { width: min(620px, 86vw); display: flex; flex-direction: column; gap: 12px; }
    .w-full { width: 100%; }
    .list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow: auto; }
    .list button { display: grid; grid-template-columns: 90px 1fr 60px 100px; gap: 8px; width: 100%; padding: 8px; border: 0; border-bottom: 1px solid var(--ktt-line); background: none; font: inherit; text-align: left; cursor: pointer; color: inherit; }
    .list button:hover, .list button:focus-visible { background: #eef3f6; }
    .code { font-variant-numeric: tabular-nums; color: var(--ktt-steel); }
    .empty { padding: 16px; text-align: center; }
  `,
})
export class PricePickerDialog implements OnInit {
  readonly ref = inject(MatDialogRef<PricePickerDialog, PickItem>);
  readonly data = inject<{ type?: string; q?: string }>(MAT_DIALOG_DATA);
  private readonly api = inject(BoqApi);
  readonly items = signal<PickItem[]>([]);
  readonly search$ = new Subject<void>();
  type = this.data?.type ?? 'material';
  q = this.data?.q ?? '';

  ngOnInit(): void {
    this.search$
      .pipe(
        debounceTime(200),
        switchMap(() => this.api.pick(this.q.trim(), this.type)),
      )
      .subscribe((r) => this.items.set(r));
    this.search$.next();
  }
}
