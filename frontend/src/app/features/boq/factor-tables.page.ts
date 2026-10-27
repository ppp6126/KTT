import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { BoqApi, FactorTable } from './boq.api';

interface Draft {
  id: string | null;
  name: string;
  workType: string;
  advancePct: number | null;
  retentionPct: number | null;
  interestPct: number | null;
  vatPct: number | null;
  note: string | null;
  rows: { cost: number; factor: number }[];
}

/** ตาราง Factor F ตามหลักเกณฑ์ราคากลางงานก่อสร้าง (กรอกจากเอกสารกรมบัญชีกลางฉบับที่ใช้) */
@Component({
  selector: 'app-factor-tables-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>ตาราง Factor F</h1>
          <p>ใช้คำนวณแบบ ปร.5 กรอกค่าตามตารางของกรมบัญชีกลางฉบับที่ใช้อยู่ ระบบคำนวณค่าระหว่างช่วงให้อัตโนมัติ</p>
        </div>
        @if (canWrite()) {
          <button mat-stroked-button (click)="newTable()"><mat-icon>add</mat-icon> เพิ่มตาราง</button>
        }
      </div>
      <div class="layout">
        <nav class="panel list" aria-label="ตาราง Factor F">
          @for (t of tables(); track t.id) {
            <button type="button" [class.active]="draft()?.id === t.id" (click)="select(t)">
              <span>{{ t.name }}</span>
              <span class="muted small">{{ t.rows.length }} ช่วง</span>
            </button>
          } @empty {
            <p class="muted pad">ยังไม่มีตาราง</p>
          }
        </nav>
        @if (draft(); as d) {
          <section class="panel panel-pad">
            <div class="form-grid">
              <mat-form-field class="span-2"><mat-label>ชื่อตาราง</mat-label><input matInput [(ngModel)]="d.name" [disabled]="!canWrite()" placeholder="งานอาคาร เงินล่วงหน้า 0% ประกัน 0% ดอกเบี้ย 7% VAT 7%" /></mat-form-field>
              <mat-form-field><mat-label>เงินล่วงหน้า %</mat-label><input matInput type="number" [(ngModel)]="d.advancePct" [disabled]="!canWrite()" /></mat-form-field>
              <mat-form-field><mat-label>เงินประกันผลงานหัก %</mat-label><input matInput type="number" [(ngModel)]="d.retentionPct" [disabled]="!canWrite()" /></mat-form-field>
              <mat-form-field><mat-label>ดอกเบี้ยเงินกู้ %</mat-label><input matInput type="number" [(ngModel)]="d.interestPct" [disabled]="!canWrite()" /></mat-form-field>
              <mat-form-field><mat-label>VAT %</mat-label><input matInput type="number" [(ngModel)]="d.vatPct" [disabled]="!canWrite()" /></mat-form-field>
            </div>
            <table class="rows">
              <thead><tr><th class="num">ค่างานต้นทุน (บาท)</th><th class="num">Factor F</th><th></th></tr></thead>
              <tbody>
                @for (r of d.rows; track $index; let i = $index) {
                  <tr>
                    <td><input type="number" min="0" [(ngModel)]="r.cost" [disabled]="!canWrite()" aria-label="ค่างานต้นทุน" /></td>
                    <td><input type="number" step="0.0001" min="0.5" max="3" [(ngModel)]="r.factor" [disabled]="!canWrite()" aria-label="Factor F" /></td>
                    <td>
                      @if (canWrite()) {
                        <button mat-icon-button (click)="d.rows.splice(i, 1)" aria-label="ลบแถว"><mat-icon>close</mat-icon></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (canWrite()) {
              <button mat-button (click)="d.rows.push({ cost: 0, factor: 1 })"><mat-icon>add</mat-icon> เพิ่มช่วง</button>
            }

            <div class="try">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>ทดลองค่างานต้นทุน</mat-label>
                <input matInput type="number" [(ngModel)]="tryCost" />
              </mat-form-field>
              <span>Factor F = <strong>{{ interpolate(d, tryCost) }}</strong></span>
            </div>

            @if (canWrite()) {
              <div class="actions">
                <button mat-flat-button class="btn-primary" (click)="save(d)">บันทึกตาราง</button>
                @if (d.id) {
                  <button mat-button (click)="remove(d)">ลบตาราง</button>
                }
              </div>
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
    .list { padding: 6px; }
    .list button { display: flex; justify-content: space-between; width: 100%; padding: 10px 12px; border: 0; border-left: 3px solid transparent; background: none; font: inherit; color: inherit; cursor: pointer; text-align: left; border-radius: var(--ktt-radius-s); }
    .list button.active { background: #e8eff4; border-left-color: var(--ktt-ink); }
    .pad { padding: 12px; }
    .small { font-size: 0.82rem; }
    .rows { border-collapse: collapse; margin: 8px 0; }
    .rows th, .rows td { padding: 4px 8px; }
    .rows th { color: var(--ktt-steel); font-weight: 500; }
    .rows input { width: 160px; height: 32px; padding: 0 8px; text-align: right; border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-s); font: inherit; }
    .try { display: flex; align-items: center; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
    .actions { display: flex; gap: 8px; }
  `,
})
export class FactorTablesPage implements OnInit {
  private readonly api = inject(BoqApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  readonly tables = signal<FactorTable[]>([]);
  readonly draft = signal<Draft | null>(null);
  readonly canWrite = computed(() => this.auth.can(Perm.BOQ_WRITE));
  tryCost = 5_000_000;

  ngOnInit(): void {
    this.load();
  }

  load(selectId?: string): void {
    this.api.factorTables().subscribe((t) => {
      this.tables.set(t);
      const pick = t.find((x) => x.id === selectId) ?? t[0];
      if (pick) this.select(pick);
    });
  }

  select(t: FactorTable): void {
    this.draft.set({ ...t, rows: t.rows.map((r) => ({ cost: Number(r.cost), factor: Number(r.factor) })) });
  }

  newTable(): void {
    this.draft.set({
      id: null,
      name: '',
      workType: 'building',
      advancePct: 0,
      retentionPct: 0,
      interestPct: null,
      vatPct: 7,
      note: null,
      rows: [{ cost: 500000, factor: 1 }],
    });
  }

  interpolate(d: Draft, cost: number): string {
    const rows = [...d.rows].filter((r) => r.cost !== null && r.factor !== null).sort((a, b) => a.cost - b.cost);
    if (!rows.length) return '–';
    let f: number;
    if (cost <= rows[0].cost) f = rows[0].factor;
    else if (cost >= rows[rows.length - 1].cost) f = rows[rows.length - 1].factor;
    else {
      const i = rows.findIndex((r) => r.cost >= cost);
      const lo = rows[i - 1];
      const hi = rows[i];
      f = lo.factor - ((lo.factor - hi.factor) * (cost - lo.cost)) / (hi.cost - lo.cost);
    }
    return f.toFixed(4);
  }

  save(d: Draft): void {
    if (!d.name.trim() || !d.rows.length) {
      this.notify.error(null, 'กรุณากรอกชื่อตารางและอย่างน้อย 1 ช่วง');
      return;
    }
    const { id, ...body } = d;
    this.api.saveFactorTable(id, { ...body, rows: d.rows.map((r) => ({ cost: Number(r.cost), factor: Number(r.factor) })) }).subscribe({
      next: (t) => {
        this.notify.ok('บันทึกตารางแล้ว');
        this.load(t.id);
      },
      error: (e) => this.notify.error(e),
    });
  }

  remove(d: Draft): void {
    if (!d.id) return;
    confirmAction(this.dialog, { title: 'ลบตาราง', message: `ลบ "${d.name}"`, confirmText: 'ลบ', danger: true }).subscribe(
      (ok) =>
        ok &&
        this.api.deleteFactorTable(d.id!).subscribe({
          next: () => {
            this.draft.set(null);
            this.load();
          },
          error: (e) => this.notify.error(e),
        }),
    );
  }
}
