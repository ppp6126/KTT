import { Component, computed, input } from '@angular/core';

/**
 * แถบความคืบหน้า: แถบทึบ = จริง, เส้นตั้ง = แผน ณ วันนี้
 * สีเขียวเมื่อเร็วกว่า/ตามแผน, ส้มเมื่อช้ากว่าแผนไม่เกิน 10 จุด, แดงเมื่อช้ากว่านั้น
 */
@Component({
  selector: 'app-progress-bar',
  template: `
    <div class="wrap" [attr.aria-label]="'ความคืบหน้าจริง ' + actual() + '% แผน ' + planned() + '%'" role="img">
      <div class="track">
        <div class="fill" [class]="tone()" [style.width.%]="clamp(actual())"></div>
        <div class="plan" [style.left.%]="clamp(planned())"></div>
      </div>
      <div class="nums">
        <strong>{{ actual() }}%</strong>
        <span class="muted">/ {{ planned() }}%</span>
        @if (gap() < 0) {
          <span class="gap" [class]="tone()">{{ gap() }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .wrap { display: flex; flex-direction: column; gap: 3px; min-width: 140px; }
    .track { position: relative; height: 8px; background: #e6e9e8; border-radius: 4px; overflow: visible; }
    .fill { height: 100%; border-radius: 4px; background: var(--ktt-ok); }
    .fill.warn { background: #d98b2b; }
    .fill.danger { background: var(--ktt-danger); }
    .plan { position: absolute; top: -3px; width: 2px; height: 14px; background: var(--ktt-ink); transform: translateX(-1px); }
    .nums { display: flex; gap: 6px; align-items: baseline; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
    .gap { font-size: 0.78rem; font-weight: 600; }
    .gap.warn { color: #9a4b05; }
    .gap.danger { color: var(--ktt-danger); }
  `,
})
export class ProgressBar {
  readonly actual = input(0);
  readonly planned = input(0);
  readonly gap = computed(() => Math.round((this.actual() - this.planned()) * 100) / 100);
  readonly tone = computed(() => (this.gap() >= 0 ? '' : this.gap() >= -10 ? 'warn' : 'danger'));

  clamp(v: number): number {
    return Math.max(0, Math.min(100, v || 0));
  }
}
