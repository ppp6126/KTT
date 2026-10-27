import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { PriceHistory, PricingApi } from './pricing.api';

const FIELD: Record<string, string> = { cost_price: 'ต้นทุน', sell_price: 'ราคาขาย', rate: 'ราคา' };

@Component({
  selector: 'app-price-history-dialog',
  imports: [MatDialogModule, MatButtonModule, MoneyPipe, ThDatePipe],
  template: `
    <h2 mat-dialog-title>ประวัติราคา {{ data.title }}</h2>
    <mat-dialog-content>
      <table class="t">
        <thead><tr><th>วันที่</th><th>ราคา</th><th class="num">เดิม</th><th class="num">ใหม่</th><th>ผู้แก้ไข</th></tr></thead>
        <tbody>
          @for (h of rows(); track h.id) {
            <tr>
              <td>{{ h.changedAt | thDate: true }}</td>
              <td>{{ field[h.priceField] || h.priceField }}</td>
              <td class="num muted">{{ h.oldPrice | money }}</td>
              <td class="num" [class.up]="(h.oldPrice ?? 0) < h.newPrice" [class.down]="(h.oldPrice ?? 0) > h.newPrice">{{ h.newPrice | money }}</td>
              <td>{{ h.changedByName || '–' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="muted">ยังไม่เคยเปลี่ยนราคา</td></tr>
          }
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>ปิด</button></mat-dialog-actions>
  `,
  styles: `
    .t { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--ktt-line); text-align: left; }
    th { color: var(--ktt-steel); font-weight: 500; }
    .up { color: var(--ktt-danger); }
    .down { color: var(--ktt-ok); }
  `,
})
export class PriceHistoryDialog implements OnInit {
  readonly data = inject<{ itemType: 'material' | 'labor' | 'equipment'; id: string; title: string }>(MAT_DIALOG_DATA);
  private readonly api = inject(PricingApi);
  readonly rows = signal<PriceHistory[]>([]);
  readonly field = FIELD;

  ngOnInit(): void {
    this.api.history(this.data.itemType, this.data.id).subscribe((r) => this.rows.set(r));
  }
}
