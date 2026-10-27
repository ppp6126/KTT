import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notify } from '../../shared/notify.service';
import { JOB_TYPES } from '../leads/leads.api';
import { EditRow, calcBoq, emptyRow } from './boq-calc';
import { BoqTree } from './boq-tree';
import { BoqApi } from './boq.api';

@Component({
  selector: 'app-template-editor-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, BoqTree],
  template: `
    <div class="page">
      <a routerLink="/boq-templates" class="back"><mat-icon>arrow_back</mat-icon> แม่แบบทั้งหมด</a>
      <div class="page-head">
        <h1>{{ isNew() ? 'สร้างแม่แบบ' : name }}</h1>
        @if (canWrite()) {
          <button mat-flat-button class="btn-primary" (click)="save()" [disabled]="busy()">บันทึกแม่แบบ</button>
        }
      </div>
      <section class="panel panel-pad">
        <div class="form-grid">
          <mat-form-field class="span-2">
            <mat-label>ชื่อแม่แบบ</mat-label>
            <input matInput [(ngModel)]="name" [disabled]="!canWrite()" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>ประเภทงาน</mat-label>
            <mat-select [(ngModel)]="jobType" [disabled]="!canWrite()">
              <mat-option [value]="null">ทุกประเภท</mat-option>
              @for (j of jobTypes; track j[0]) {
                <mat-option [value]="j[0]">{{ j[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>คำอธิบาย</mat-label>
            <input matInput [(ngModel)]="description" [disabled]="!canWrite()" />
          </mat-form-field>
        </div>
        <p class="muted small">ใส่ปริมาณมาตรฐาน (แก้ได้ใน BOQ) และผูกรายการกับฐานราคา ราคาจะดึงค่าปัจจุบันตอนสร้าง BOQ</p>
        <app-boq-tree mode="template" [(rows)]="rows" [totals]="totals()" [editable]="canWrite()" [showCost]="false" />
      </section>
    </div>
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    .small { font-size: 0.85rem; }
  `,
})
export class TemplateEditorPage implements OnInit {
  private readonly api = inject(BoqApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly id = input<string>();
  readonly isNew = computed(() => !this.id() || this.id() === 'new');
  readonly canWrite = computed(() => this.auth.can(Perm.BOQ_WRITE));
  readonly rows = signal<EditRow[]>([]);
  readonly totals = computed(() => calcBoq(this.rows(), 0, 0, 0));
  readonly busy = signal(false);
  readonly jobTypes = Object.entries(JOB_TYPES);
  name = '';
  jobType: string | null = null;
  description = '';

  ngOnInit(): void {
    if (this.isNew()) {
      this.rows.set([{ ...emptyRow(null), description: 'งานฐานราก' }]);
      return;
    }
    this.api.template(this.id()!).subscribe({
      next: (t) => {
        this.name = t.name;
        this.jobType = t.jobType;
        this.description = t.description ?? '';
        this.rows.set(
          t.items.map((i) => ({
            ...emptyRow(i.parentId),
            key: i.id,
            description: i.description,
            unit: i.unit,
            quantity: Number(i.quantity),
            materialId: i.materialId,
            laborId: i.laborId,
            equipmentId: i.equipmentId,
            note: i.note,
          })),
        );
      },
      error: (e) => this.notify.error(e),
    });
  }

  save(): void {
    if (!this.name.trim()) {
      this.notify.error(null, 'กรุณากรอกชื่อแม่แบบ');
      return;
    }
    if (this.rows().some((r) => !r.description.trim())) {
      this.notify.error(null, 'กรุณากรอกรายละเอียดให้ครบทุกแถว');
      return;
    }
    this.busy.set(true);
    const items = this.rows().map((r) => ({
      key: r.key,
      parentKey: r.parentKey,
      description: r.description.trim(),
      unit: r.unit || null,
      quantity: Number(r.quantity) || 0,
      materialId: r.materialId,
      laborId: r.laborId,
      equipmentId: r.equipmentId,
      unitMaterialCost: 0,
      unitLabor: 0,
      unitEquipment: 0,
      note: r.note,
    }));
    this.api
      .saveTemplate(this.isNew() ? null : this.id()!, { name: this.name.trim(), jobType: this.jobType, description: this.description || null, items })
      .subscribe({
        next: (t) => {
          this.busy.set(false);
          this.notify.ok('บันทึกแม่แบบแล้ว');
          if (this.isNew()) this.router.navigate(['/boq-templates', t.id], { replaceUrl: true });
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
