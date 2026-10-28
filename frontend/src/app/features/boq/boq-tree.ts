import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MoneyPipe, QtyPipe } from '../../core/util/money';
import { BoqTotals, EditRow, blockRange, emptyRow } from './boq-calc';
import { PickItem } from './boq.api';
import { PricePickerDialog } from './price-picker-dialog';

/**
 * ตารางแก้ไข BOQ แบบลำดับชั้น (ใช้ทั้งหน้า BOQ และหน้าแม่แบบ)
 * mode = boq: มีคอลัมน์ราคา, template: มีเฉพาะปริมาณและการผูกฐานราคา
 */
@Component({
  selector: 'app-boq-tree',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MoneyPipe, QtyPipe],
  templateUrl: './boq-tree.html',
  styleUrl: './boq-tree.scss',
})
export class BoqTree {
  private readonly dialog = inject(MatDialog);

  readonly rows = model.required<EditRow[]>();
  readonly totals = input.required<BoqTotals>();
  readonly mode = input<'boq' | 'template'>('boq');
  readonly editable = input(true);
  readonly showCost = input(true);

  readonly colCount = computed(() => (this.mode() === 'template' ? 5 : this.showCost() ? 10 : 7));

  calc(r: EditRow) {
    return this.totals().rows.get(r.key);
  }

  touch(): void {
    this.rows.set([...this.rows()]);
  }

  addRoot(): void {
    this.rows.set([...this.rows(), { ...emptyRow(null), description: '' }]);
    this.focusLast();
  }

  addChild(index: number): void {
    const list = [...this.rows()];
    const [, end] = blockRange(list, index);
    list.splice(end + 1, 0, emptyRow(list[index].key));
    this.rows.set(list);
  }

  addSibling(index: number): void {
    const list = [...this.rows()];
    const [, end] = blockRange(list, index);
    list.splice(end + 1, 0, emptyRow(list[index].parentKey));
    this.rows.set(list);
  }

  remove(index: number): void {
    const list = [...this.rows()];
    const [start, end] = blockRange(list, index);
    list.splice(start, end - start + 1);
    this.rows.set(list);
  }

  move(index: number, dir: -1 | 1): void {
    const list = [...this.rows()];
    const parent = list[index].parentKey;
    const [start, end] = blockRange(list, index);
    if (dir === -1) {
      // หาพี่คนก่อนหน้า (parent เดียวกัน)
      let prev = start - 1;
      while (prev >= 0 && list[prev].parentKey !== parent) {
        if (list[prev].key === parent) return;
        prev--;
      }
      if (prev < 0 || list[prev].parentKey !== parent) return;
      const [ps] = blockRange(list, prev);
      const block = list.splice(start, end - start + 1);
      list.splice(ps, 0, ...block);
    } else {
      const next = end + 1;
      if (next >= list.length || list[next].parentKey !== parent) return;
      const [, ne] = blockRange(list, next);
      const nextBlock = list.splice(next, ne - next + 1);
      list.splice(start, 0, ...nextBlock);
    }
    this.rows.set(list);
  }

  /** เลื่อนแถวขึ้นไปเป็นลูกของพี่คนก่อนหน้า (ย่อหน้า) */
  indent(index: number): void {
    const list = [...this.rows()];
    const r = list[index];
    let prev = index - 1;
    while (prev >= 0 && list[prev].parentKey !== r.parentKey) prev--;
    if (prev < 0) return;
    const level = this.calc(list[prev])?.level ?? 1;
    const depthBelow = this.maxDepthBelow(list, index);
    if (level + 1 + depthBelow > 3) return;
    list[index] = { ...r, parentKey: list[prev].key };
    // ย้ายไปท้ายลูกของพี่
    const [start, end] = blockRange(list, index);
    const block = list.splice(start, end - start + 1);
    const [, pe] = blockRange(list, list.findIndex((x) => x.key === list[prev].key));
    list.splice(pe + 1, 0, ...block);
    this.rows.set(list);
  }

  outdent(index: number): void {
    const list = [...this.rows()];
    const r = list[index];
    if (!r.parentKey) return;
    const parentIdx = list.findIndex((x) => x.key === r.parentKey);
    const grand = list[parentIdx].parentKey;
    const [start, end] = blockRange(list, index);
    const block = list.splice(start, end - start + 1);
    block[0] = { ...block[0], parentKey: grand };
    const [, pe] = blockRange(list, list.findIndex((x) => x.key === r.parentKey));
    list.splice(pe + 1, 0, ...block);
    this.rows.set(list);
  }

  private maxDepthBelow(list: EditRow[], index: number): number {
    const [start, end] = blockRange(list, index);
    let max = 0;
    const depth = new Map<string, number>([[list[start].key, 0]]);
    for (let i = start + 1; i <= end; i++) {
      const d = (depth.get(list[i].parentKey!) ?? 0) + 1;
      depth.set(list[i].key, d);
      max = Math.max(max, d);
    }
    return max;
  }

  pick(index: number, type: 'material' | 'labor' | 'equipment'): void {
    const r = this.rows()[index];
    this.dialog
      .open(PricePickerDialog, { data: { type, q: r.description.slice(0, 20) } })
      .afterClosed()
      .subscribe((p?: PickItem) => {
        if (!p) return;
        const list = [...this.rows()];
        const x = { ...list[index] };
        if (!x.description.trim()) x.description = p.name;
        if (!x.unit) x.unit = p.unit;
        if (p.type === 'material') {
          x.materialId = p.id;
          x.unitMaterialCost = p.unitCost;
        } else if (p.type === 'labor') {
          x.laborId = p.id;
          x.unitLabor = p.unitCost;
        } else {
          x.equipmentId = p.id;
          x.unitEquipment = p.unitCost;
        }
        list[index] = x;
        this.rows.set(list);
      });
  }

  unlink(index: number): void {
    const list = [...this.rows()];
    list[index] = { ...list[index], materialId: null, laborId: null, equipmentId: null };
    this.rows.set(list);
  }

  linked(r: EditRow): boolean {
    return !!(r.materialId || r.laborId || r.equipmentId);
  }

  private focusLast(): void {
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('app-boq-tree input.desc');
      inputs[inputs.length - 1]?.focus();
    });
  }
}
