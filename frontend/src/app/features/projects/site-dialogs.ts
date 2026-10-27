import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../core/api/api-error';
import { todayIso } from '../../core/util/format';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { Lookups } from '../../shared/lookups';
import {
  ISSUE_STATUS,
  Issue,
  ProjectsApi,
  PUNCH_STATUS,
  Punch,
  Qc,
  QcItem,
  QcTemplate,
  SAFETY_KIND,
  SEVERITY,
  Safety,
  Task,
} from './projects.api';

interface Base<T> {
  projectId: string;
  item: T | null;
  canEdit: boolean;
}

const SHARED = [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule];
const STYLES = `
  .content { width: min(620px, 88vw); }
  .full { display: block; width: 100%; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
  @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
  .err { color: var(--ktt-danger); margin: 0 0 12px; }
  h3 { margin: 12px 0 8px; }
`;

abstract class RecordDialog<T extends { id: string }> {
  protected readonly api = inject(ProjectsApi);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  abstract readonly kind: 'issues' | 'punch' | 'qc' | 'safety';
  abstract readonly ref: MatDialogRef<unknown, T | 'deleted'>;
  abstract readonly data: Base<T>;

  protected submit(body: unknown): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.saveRecord<T>(this.data.projectId, this.kind, this.data.item?.id ?? null, body).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  remove(): void {
    if (!this.data.item || !confirm('ลบรายการนี้')) return;
    this.api.deleteRecord(this.data.projectId, this.kind, this.data.item.id).subscribe({
      next: () => this.ref.close('deleted'),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}

// ======================================================================= ปัญหา / ความเสี่ยง

@Component({
  selector: 'app-issue-dialog',
  imports: [...SHARED, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'แก้ไข' : 'บันทึก' }}{{ m.kind === 'risk' ? 'ความเสี่ยง' : 'ปัญหา' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-form-field class="full">
        <mat-label>หัวข้อ</mat-label>
        <input matInput [(ngModel)]="m.title" required [disabled]="!data.canEdit" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>รายละเอียด</mat-label>
        <textarea matInput rows="3" [(ngModel)]="m.description" [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      <div class="grid">
        <mat-form-field>
          <mat-label>ประเภท</mat-label>
          <mat-select [(ngModel)]="m.kind" [disabled]="!data.canEdit">
            <mat-option value="issue">ปัญหา (เกิดแล้ว)</mat-option>
            <mat-option value="risk">ความเสี่ยง (อาจเกิด)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ความรุนแรง</mat-label>
          <mat-select [(ngModel)]="m.severity" [disabled]="!data.canEdit">
            @for (s of severities; track s[0]) {
              <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (m.kind === 'risk') {
          <mat-form-field>
            <mat-label>โอกาสเกิด</mat-label>
            <mat-select [(ngModel)]="m.likelihood" [disabled]="!data.canEdit">
              <mat-option value="low">ต่ำ</mat-option>
              <mat-option value="medium">ปานกลาง</mat-option>
              <mat-option value="high">สูง</mat-option>
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>สถานะ</mat-label>
          <mat-select [(ngModel)]="m.status" [disabled]="!data.canEdit">
            @for (s of statuses; track s[0]) {
              <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ผู้รับผิดชอบ</mat-label>
          <mat-select [(ngModel)]="m.ownerId" [disabled]="!data.canEdit">
            <mat-option [value]="null">–</mat-option>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>กำหนดแก้ไข</mat-label>
          <input matInput type="date" [(ngModel)]="m.dueDate" [disabled]="!data.canEdit" />
        </mat-form-field>
      </div>
      <mat-form-field class="full">
        <mat-label>{{ m.kind === 'risk' ? 'แผนรับมือ / ผลการจัดการ' : 'วิธีแก้ไข / ผลการแก้ไข' }}</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.resolution" [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      @if (data.item) {
        <h3>รูปและไฟล์</h3>
        <app-attachment-panel ownerType="project_issue" [ownerId]="data.item.id" [canWrite]="data.canEdit" defaultCategory="site_photo" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.item && data.canEdit) {
        <button mat-button (click)="remove()">ลบ</button>
      }
      <span style="flex:1"></span>
      <button mat-button mat-dialog-close>ปิด</button>
      @if (data.canEdit) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title.trim()">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class IssueDialog extends RecordDialog<Issue> {
  readonly kind = 'issues' as const;
  readonly ref = inject(MatDialogRef<IssueDialog, Issue | 'deleted'>);
  readonly data = inject<Base<Issue> & { kindDefault?: 'issue' | 'risk' }>(MAT_DIALOG_DATA);
  readonly users = toSignal(inject(Lookups).users(), { initialValue: [] });
  readonly severities = Object.entries(SEVERITY);
  readonly statuses = Object.entries(ISSUE_STATUS);
  readonly m = {
    kind: this.data.item?.kind ?? this.data.kindDefault ?? 'issue',
    title: this.data.item?.title ?? '',
    description: this.data.item?.description ?? '',
    severity: this.data.item?.severity ?? 'medium',
    likelihood: this.data.item?.likelihood ?? 'medium',
    status: this.data.item?.status ?? 'open',
    ownerId: this.data.item?.ownerId ?? (null as string | null),
    dueDate: this.data.item?.dueDate ?? '',
    resolution: this.data.item?.resolution ?? '',
  };

  save(): void {
    this.submit({ ...this.m, likelihood: this.m.kind === 'risk' ? this.m.likelihood : null, dueDate: this.m.dueDate || null });
  }
}

// ======================================================================= Punch list

@Component({
  selector: 'app-punch-dialog',
  imports: [...SHARED, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Punch #' + data.item.itemNo : 'เพิ่มรายการแก้ไข' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-form-field class="full">
        <mat-label>ตำแหน่ง</mat-label>
        <input matInput [(ngModel)]="m.location" placeholder="เช่น ห้องนอน 2 ผนังด้านทิศเหนือ" [disabled]="!data.canEdit" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>สิ่งที่ต้องแก้ไข</mat-label>
        <textarea matInput rows="3" [(ngModel)]="m.description" required [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      <div class="grid">
        <mat-form-field>
          <mat-label>ผู้รับผิดชอบ / ช่าง</mat-label>
          <input matInput [(ngModel)]="m.responsible" [disabled]="!data.canEdit" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>กำหนดเสร็จ</mat-label>
          <input matInput type="date" [(ngModel)]="m.dueDate" [disabled]="!data.canEdit" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>สถานะ</mat-label>
          <mat-select [(ngModel)]="m.status" [disabled]="!data.canEdit">
            @for (s of statuses; track s[0]) {
              <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (data.item) {
        <h3>รูปก่อน/หลังแก้ไข</h3>
        <app-attachment-panel ownerType="punch_item" [ownerId]="data.item.id" [canWrite]="data.canEdit" defaultCategory="before" />
      } @else {
        <p class="muted">บันทึกก่อนแล้วจึงแนบรูปได้</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.item && data.canEdit) {
        <button mat-button (click)="remove()">ลบ</button>
      }
      <span style="flex:1"></span>
      <button mat-button mat-dialog-close>ปิด</button>
      @if (data.canEdit) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.description.trim()">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class PunchDialog extends RecordDialog<Punch> {
  readonly kind = 'punch' as const;
  readonly ref = inject(MatDialogRef<PunchDialog, Punch | 'deleted'>);
  readonly data = inject<Base<Punch>>(MAT_DIALOG_DATA);
  readonly statuses = Object.entries(PUNCH_STATUS);
  readonly m = {
    location: this.data.item?.location ?? '',
    description: this.data.item?.description ?? '',
    responsible: this.data.item?.responsible ?? '',
    dueDate: this.data.item?.dueDate ?? '',
    status: this.data.item?.status ?? 'open',
  };

  save(): void {
    this.submit({ ...this.m, dueDate: this.m.dueDate || null });
  }
}

// ======================================================================= QC

@Component({
  selector: 'app-qc-dialog',
  imports: [...SHARED, MatButtonToggleModule, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'ผลตรวจ QC' : 'ตรวจ QC' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      @if (!data.item && data.canEdit) {
        <mat-form-field class="full">
          <mat-label>ใช้แม่แบบรายการตรวจ</mat-label>
          <mat-select (selectionChange)="useTemplate($event.value)">
            @for (t of data.templates; track t.id) {
              <mat-option [value]="t">{{ t.category ? t.category + ': ' : '' }}{{ t.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      <div class="grid">
        <mat-form-field>
          <mat-label>หัวข้อการตรวจ</mat-label>
          <input matInput [(ngModel)]="m.title" required [disabled]="!data.canEdit" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่ตรวจ</mat-label>
          <input matInput type="date" [(ngModel)]="m.inspectedOn" [disabled]="!data.canEdit" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>งานในแผน</mat-label>
          <mat-select [(ngModel)]="m.taskId" [disabled]="!data.canEdit">
            <mat-option [value]="null">–</mat-option>
            @for (t of data.tasks; track t.id) {
              <mat-option [value]="t.id">{{ t.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <ol class="checks">
        @for (it of m.items; track $index) {
          <li>
            <div class="row">
              <input class="text" [(ngModel)]="it.text" [disabled]="!data.canEdit" aria-label="รายการตรวจ" />
              <mat-button-toggle-group [(ngModel)]="it.result" [disabled]="!data.canEdit" aria-label="ผลตรวจ" hideSingleSelectionIndicator>
                <mat-button-toggle value="pass">ผ่าน</mat-button-toggle>
                <mat-button-toggle value="fail">ไม่ผ่าน</mat-button-toggle>
                <mat-button-toggle value="na">N/A</mat-button-toggle>
              </mat-button-toggle-group>
              @if (data.canEdit) {
                <button mat-icon-button (click)="m.items.splice($index, 1)" aria-label="ลบรายการ"><mat-icon>close</mat-icon></button>
              }
            </div>
            @if (it.result === 'fail' || it.note) {
              <input class="note" [(ngModel)]="it.note" placeholder="หมายเหตุ / สิ่งที่ต้องแก้" [disabled]="!data.canEdit" aria-label="หมายเหตุ" />
            }
          </li>
        }
      </ol>
      @if (data.canEdit) {
        <button mat-button (click)="m.items.push({ text: '', result: null, note: null })"><mat-icon>add</mat-icon> เพิ่มรายการตรวจ</button>
      }
      <mat-form-field class="full">
        <mat-label>สรุป / หมายเหตุ</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.notes" [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      @if (data.item) {
        <h3>รูปประกอบ</h3>
        <app-attachment-panel ownerType="qc_inspection" [ownerId]="data.item.id" [canWrite]="data.canEdit" defaultCategory="site_photo" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.item && data.canEdit) {
        <button mat-button (click)="remove()">ลบ</button>
      }
      <span style="flex:1"></span>
      <button mat-button mat-dialog-close>ปิด</button>
      @if (data.canEdit) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title.trim()">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles:
    STYLES +
    `
    .checks { padding-left: 20px; margin: 4px 0 8px; }
    .checks li { margin-bottom: 8px; }
    .row { display: flex; gap: 8px; align-items: center; }
    .text, .note { flex: 1; height: 32px; padding: 0 8px; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; }
    .note { width: 100%; margin-top: 4px; box-sizing: border-box; }
    @media (max-width: 560px) { .row { flex-wrap: wrap; } .text { flex-basis: 100%; } }
  `,
})
export class QcDialog extends RecordDialog<Qc> {
  readonly kind = 'qc' as const;
  readonly ref = inject(MatDialogRef<QcDialog, Qc | 'deleted'>);
  readonly data = inject<Base<Qc> & { templates: QcTemplate[]; tasks: Task[] }>(MAT_DIALOG_DATA);
  readonly m = {
    title: this.data.item?.title ?? '',
    inspectedOn: this.data.item?.inspectedOn ?? todayIso(),
    taskId: this.data.item?.taskId ?? (null as string | null),
    items: (this.data.item?.items ?? []).map((i) => ({ ...i })) as QcItem[],
    notes: this.data.item?.notes ?? '',
  };

  useTemplate(t: QcTemplate): void {
    if (!this.m.title) this.m.title = t.name;
    this.m.items = t.items.map((text) => ({ text, result: null, note: null }));
  }

  save(): void {
    const items = this.m.items.filter((i) => i.text.trim());
    this.submit({ ...this.m, items, inspectorId: null });
  }
}

// ======================================================================= ความปลอดภัย

@Component({
  selector: 'app-safety-dialog',
  imports: [...SHARED, AttachmentPanel],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'บันทึกความปลอดภัย' : 'เพิ่มบันทึกความปลอดภัย' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field>
          <mat-label>ประเภท</mat-label>
          <mat-select [(ngModel)]="m.kind" [disabled]="!data.canEdit">
            @for (k of kinds; track k[0]) {
              <mat-option [value]="k[0]">{{ k[1].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันที่</mat-label>
          <input matInput type="date" [(ngModel)]="m.logDate" [disabled]="!data.canEdit" />
        </mat-form-field>
      </div>
      <mat-form-field class="full">
        <mat-label>หัวข้อ</mat-label>
        <input matInput [(ngModel)]="m.title" required [disabled]="!data.canEdit" placeholder="เช่น ประชุมก่อนเริ่มงาน เรื่องการทำงานบนที่สูง" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>รายละเอียด</mat-label>
        <textarea matInput rows="3" [(ngModel)]="m.detail" [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      <div class="grid">
        <mat-form-field>
          <mat-label>จำนวนผู้เข้าร่วม/เกี่ยวข้อง</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.peopleCount" [disabled]="!data.canEdit" />
        </mat-form-field>
        @if (m.kind === 'incident' || m.kind === 'near_miss') {
          <mat-form-field>
            <mat-label>ผู้บาดเจ็บ (คน)</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="m.injuredCount" [disabled]="!data.canEdit" />
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>ระดับความรุนแรง</mat-label>
          <mat-select [(ngModel)]="m.severity" [disabled]="!data.canEdit">
            <mat-option value="low">ต่ำ</mat-option>
            <mat-option value="medium">ปานกลาง</mat-option>
            <mat-option value="high">สูง</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>สถานะ</mat-label>
          <mat-select [(ngModel)]="m.status" [disabled]="!data.canEdit">
            <mat-option value="open">ยังต้องติดตาม</mat-option>
            <mat-option value="closed">ปิดเรื่องแล้ว</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
      <mat-form-field class="full">
        <mat-label>มาตรการแก้ไข / ป้องกัน</mat-label>
        <textarea matInput rows="2" [(ngModel)]="m.correctiveAction" [disabled]="!data.canEdit"></textarea>
      </mat-form-field>
      @if (data.item) {
        <h3>รูปและไฟล์</h3>
        <app-attachment-panel ownerType="safety_log" [ownerId]="data.item.id" [canWrite]="data.canEdit" defaultCategory="site_photo" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.item && data.canEdit) {
        <button mat-button (click)="remove()">ลบ</button>
      }
      <span style="flex:1"></span>
      <button mat-button mat-dialog-close>ปิด</button>
      @if (data.canEdit) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title.trim()">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles: STYLES,
})
export class SafetyDialog extends RecordDialog<Safety> {
  readonly kind = 'safety' as const;
  readonly ref = inject(MatDialogRef<SafetyDialog, Safety | 'deleted'>);
  readonly data = inject<Base<Safety>>(MAT_DIALOG_DATA);
  readonly kinds = Object.entries(SAFETY_KIND);
  readonly m = {
    kind: this.data.item?.kind ?? 'toolbox',
    logDate: this.data.item?.logDate ?? todayIso(),
    title: this.data.item?.title ?? '',
    detail: this.data.item?.detail ?? '',
    peopleCount: this.data.item?.peopleCount ?? (null as number | null),
    injuredCount: this.data.item?.injuredCount ?? 0,
    severity: this.data.item?.severity ?? 'low',
    correctiveAction: this.data.item?.correctiveAction ?? '',
    status: this.data.item?.status ?? 'open',
  };

  save(): void {
    this.submit({ ...this.m, injuredCount: Number(this.m.injuredCount) || 0 });
  }
}
