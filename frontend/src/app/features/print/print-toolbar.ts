import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** แถบเครื่องมือเหนือเอกสาร (ไม่ถูกพิมพ์) */
@Component({
  selector: 'app-print-toolbar',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="bar no-print">
      <span class="title">{{ title() }}</span>
      <span class="hint">กด "พิมพ์" แล้วเลือกปลายทาง "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF</span>
      <ng-content />
      <button mat-flat-button class="btn-primary" (click)="print()"><mat-icon>print</mat-icon> พิมพ์ / บันทึก PDF</button>
      <button mat-button (click)="closed.emit()">ปิด</button>
    </div>
  `,
  styles: `
    .bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 20px; background: var(--ktt-ink); color: #fff; }
    .title { font-weight: 600; }
    .hint { flex: 1; color: #a9bccb; font-size: 0.85rem; }
    .bar button[mat-button] { color: #fff; }
  `,
})
export class PrintToolbar {
  readonly title = input('');
  readonly printed = output<void>();
  readonly closed = output<void>();

  print(): void {
    this.printed.emit();
    window.print();
  }
}
