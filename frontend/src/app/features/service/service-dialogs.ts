import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { map } from 'rxjs';
import { errorMessage } from '../../core/api/api-error';
import { todayIso } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { CustomerPicker, Lookups } from '../../shared/lookups';
import { ProjectRow, ProjectsApi } from '../projects/projects.api';
import { SURVEY_METHOD, Survey, SurveySave, ServiceApi, TICKET_CATEGORY, TICKET_CHANNEL, TICKET_PRIORITY, Ticket, TicketSave } from './service.api';

/** แปลง ISO → ค่าใน input datetime-local (เวลาเครื่อง) */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

// ======================================================================= รับแจ้งซ่อม

@Component({
  selector: 'app-ticket-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, CustomerPicker],
  template: `
    <h2 mat-dialog-title>{{ t ? 'แก้ไขงานแจ้งซ่อม ' + t.docNo : 'รับแจ้งซ่อม' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid2">
        <mat-form-field class="span">
          <mat-label>โครงการที่ส่งมอบแล้ว</mat-label>
          <mat-select [(ngModel)]="m.projectId" (selectionChange)="onProject()">
            <mat-option [value]="null">– ไม่ใช่งานของเรา / งานซ่อมทั่วไป –</mat-option>
            @for (p of projects(); track p.id) {
              <mat-option [value]="p.id">{{ p.code }} {{ p.name }} ({{ p.customerName }})</mat-option>
            }
          </mat-select>
          <mat-hint>เลือกโครงการเพื่อตรวจระยะรับประกันให้อัตโนมัติ</mat-hint>
        </mat-form-field>
        @if (!m.projectId) {
          <div class="span picker"><app-customer-picker [(customerId)]="m.customerId" [initialName]="t?.customerName ?? null" [required]="true" /></div>
        }
        <mat-form-field class="span">
          <mat-label>เรื่องที่แจ้ง</mat-label>
          <input matInput [(ngModel)]="m.title" required placeholder="เช่น น้ำซึมฝ้าห้องน้ำชั้น 2" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>หมวด</mat-label>
          <mat-select [(ngModel)]="m.category">
            @for (c of categories; track c[0]) {
              <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ความเร่งด่วน</mat-label>
          <mat-select [(ngModel)]="m.priority">
            @for (c of priorities; track c[0]) {
              <mat-option [value]="c[0]">{{ c[1].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>แจ้งทาง</mat-label>
          <mat-select [(ngModel)]="m.channel">
            @for (c of channels; track c[0]) {
              <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>วันเวลาที่แจ้ง</mat-label>
          <input matInput type="datetime-local" [(ngModel)]="reportedAt" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ผู้แจ้ง</mat-label>
          <input matInput [(ngModel)]="m.reporterName" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>เบอร์ติดต่อ</mat-label>
          <input matInput type="tel" [(ngModel)]="m.reporterPhone" />
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>รายละเอียด</mat-label>
          <textarea matInput rows="3" [(ngModel)]="m.description"></textarea>
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>สถานที่ (เว้นว่างใช้ที่อยู่ไซต์งาน)</mat-label>
          <input matInput [(ngModel)]="m.siteAddress" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title || (!m.projectId && !m.customerId)">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(660px, 92vw); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; row-gap: 4px; }
    .span { grid-column: 1 / -1; }
    .picker { margin-bottom: 14px; }
    @media (max-width: 600px) { .grid2 { grid-template-columns: 1fr; } }
    .err { color: var(--ktt-danger); }
  `,
})
export class TicketDialog {
  private readonly api = inject(ServiceApi);
  private readonly ref = inject(MatDialogRef<TicketDialog, Ticket>);
  readonly t = inject<Ticket | null>(MAT_DIALOG_DATA);
  readonly projects = toSignal(inject(ProjectsApi).list({ page: 0, size: 200 }).pipe(map((r) => r.items.filter((p) => p.status !== 'cancelled'))), {
    initialValue: [] as ProjectRow[],
  });
  readonly categories = Object.entries(TICKET_CATEGORY);
  readonly priorities = Object.entries(TICKET_PRIORITY);
  readonly channels = Object.entries(TICKET_CHANNEL);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  reportedAt = toLocalInput(this.t?.reportedAt ?? new Date().toISOString());
  m: TicketSave = {
    projectId: this.t?.projectId ?? null,
    customerId: this.t?.customerId ?? null,
    title: this.t?.title ?? '',
    description: this.t?.description ?? null,
    category: this.t?.category ?? 'other',
    priority: this.t?.priority ?? 'normal',
    channel: this.t?.channel ?? 'phone',
    reporterName: this.t?.reporterName ?? null,
    reporterPhone: this.t?.reporterPhone ?? null,
    siteAddress: this.t?.siteAddress ?? null,
    reportedAt: null,
  };

  onProject(): void {
    const p = this.projects().find((x) => x.id === this.m.projectId);
    if (p) {
      this.m.customerId = p.customerId;
      this.m.reporterName ||= p.customerName;
    }
  }

  save(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.save(this.t?.id ?? null, { ...this.m, reportedAt: fromLocalInput(this.reportedAt) }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= นัดหมาย

@Component({
  selector: 'app-schedule-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>นัดหมายเข้าซ่อม {{ t.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-form-field class="full">
        <mat-label>ผู้รับผิดชอบ / ช่าง</mat-label>
        <mat-select [(ngModel)]="assigneeId">
          <mat-option [value]="null">– ยังไม่ระบุ –</mat-option>
          @for (u of users(); track u.id) {
            <mat-option [value]="u.id">{{ u.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>วันเวลานัด</mat-label>
        <input matInput type="datetime-local" [(ngModel)]="at" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>บันทึก (เช่น ลูกค้าสะดวกช่วงเช้า)</mat-label>
        <input matInput [(ngModel)]="note" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || (!assigneeId && !at)">บันทึกนัด</button>
    </mat-dialog-actions>
  `,
  styles: `.content { width: min(420px, 86vw); } .full { width: 100%; } .err { color: var(--ktt-danger); }`,
})
export class ScheduleDialog {
  private readonly api = inject(ServiceApi);
  private readonly ref = inject(MatDialogRef<ScheduleDialog, Ticket>);
  readonly users = toSignal(inject(Lookups).users(), { initialValue: [] });
  readonly t = inject<Ticket>(MAT_DIALOG_DATA);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  assigneeId: string | null = this.t.assigneeId;
  at = toLocalInput(this.t.appointmentAt);
  note = '';

  save(): void {
    this.busy.set(true);
    this.api.schedule(this.t.id, { assigneeId: this.assigneeId, appointmentAt: fromLocalInput(this.at), note: this.note || null }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= ซ่อมเสร็จ

@Component({
  selector: 'app-resolve-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>บันทึกซ่อมเสร็จ {{ t.docNo }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-form-field class="full">
        <mat-label>สาเหตุและวิธีแก้ไข</mat-label>
        <textarea matInput rows="3" [(ngModel)]="m.resolution" required></textarea>
      </mat-form-field>
      <div class="three">
        <mat-form-field><mat-label>ค่าแรง (ต้นทุน)</mat-label><input matInput type="number" min="0" [(ngModel)]="m.laborCost" /></mat-form-field>
        <mat-form-field><mat-label>ค่าวัสดุ (ต้นทุน)</mat-label><input matInput type="number" min="0" [(ngModel)]="m.materialCost" /></mat-form-field>
        <mat-form-field>
          <mat-label>เรียกเก็บลูกค้า</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.chargeAmount" [disabled]="t.inWarranty" />
          @if (t.inWarranty) {
            <mat-hint>อยู่ในประกัน ไม่เรียกเก็บ</mat-hint>
          }
        </mat-form-field>
      </div>
      <p class="muted small">ต้นทุนรวม {{ (+m.laborCost || 0) + (+m.materialCost || 0) | money }} บาท{{ t.inWarranty ? ' เป็นค่าใช้จ่ายรับประกันของโครงการ' : '' }} · ถ่ายรูปหลังซ่อมแนบได้ที่หน้างานแจ้งซ่อม</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.resolution">ซ่อมเสร็จ</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(560px, 90vw); }
    .full { width: 100%; }
    .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 600px) { .three { grid-template-columns: 1fr; } }
    .err { color: var(--ktt-danger); }
  `,
})
export class ResolveDialog {
  private readonly api = inject(ServiceApi);
  private readonly ref = inject(MatDialogRef<ResolveDialog, Ticket>);
  readonly t = inject<Ticket>(MAT_DIALOG_DATA);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m = { resolution: this.t.resolution ?? '', laborCost: this.t.laborCost || 0, materialCost: this.t.materialCost || 0, chargeAmount: this.t.chargeAmount || 0 };

  save(): void {
    this.busy.set(true);
    this.api
      .resolve(this.t.id, { resolution: this.m.resolution, laborCost: Number(this.m.laborCost) || 0, materialCost: Number(this.m.materialCost) || 0, chargeAmount: this.t.inWarranty ? 0 : Number(this.m.chargeAmount) || 0 })
      .subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e));
        },
      });
  }
}

// ======================================================================= ความพึงพอใจ

@Component({
  selector: 'app-survey-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatButtonToggleModule, MatIconModule, CustomerPicker],
  template: `
    <h2 mat-dialog-title>บันทึกความพึงพอใจลูกค้า</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      @if (data?.label) {
        <p class="muted">{{ data!.label }}</p>
      } @else {
        <mat-form-field class="full">
          <mat-label>โครงการ</mat-label>
          <mat-select [(ngModel)]="m.projectId">
            <mat-option [value]="null">– ไม่ระบุโครงการ –</mat-option>
            @for (p of projects(); track p.id) {
              <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (!m.projectId) {
          <div class="picker"><app-customer-picker [(customerId)]="m.customerId" [required]="true" /></div>
        }
      }
      <div class="three">
        <mat-form-field><mat-label>วันที่สอบถาม</mat-label><input matInput type="date" [(ngModel)]="m.surveyDate" [max]="today" /></mat-form-field>
        <mat-form-field>
          <mat-label>วิธีสอบถาม</mat-label>
          <mat-select [(ngModel)]="m.method">
            @for (x of methods; track x[0]) {
              <mat-option [value]="x[0]">{{ x[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field><mat-label>ผู้ตอบ</mat-label><input matInput [(ngModel)]="m.respondent" /></mat-form-field>
      </div>
      <fieldset>
        <legend>คะแนน 1 (ไม่พอใจมาก) ถึง 5 (พอใจมาก)</legend>
        @for (q of questions; track q.key) {
          <div class="row">
            <span class="lbl">{{ q.label }}{{ q.key === 'overall' ? ' *' : '' }}</span>
            <div class="stars" role="radiogroup" [attr.aria-label]="q.label">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <button type="button" role="radio" [attr.aria-checked]="m[q.key] === n" [class.on]="m[q.key] !== null && n <= m[q.key]!" (click)="m[q.key] = n">{{ n }}</button>
              }
            </div>
          </div>
        }
        <div class="row">
          <span class="lbl">จะแนะนำต่อหรือไม่</span>
          <mat-button-toggle-group [(ngModel)]="m.recommend" hideSingleSelectionIndicator aria-label="แนะนำต่อ">
            <mat-button-toggle [value]="true">แนะนำ</mat-button-toggle>
            <mat-button-toggle [value]="false">ไม่แนะนำ</mat-button-toggle>
            <mat-button-toggle [value]="null">ไม่ตอบ</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      </fieldset>
      <mat-form-field class="full"><mat-label>ความเห็นลูกค้า</mat-label><textarea matInput rows="3" [(ngModel)]="m.comment"></textarea></mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.overall || (!m.projectId && !m.customerId && !m.ticketId)">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(600px, 92vw); }
    .full { width: 100%; }
    .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 600px) { .three { grid-template-columns: 1fr; } }
    .picker { margin-bottom: 14px; }
    fieldset { border: 1px solid var(--ktt-line); border-radius: 8px; padding: 8px 14px 12px; margin: 0 0 14px; }
    legend { color: var(--ktt-steel); font-size: 0.85rem; padding: 0 4px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 4px 0; flex-wrap: wrap; }
    .lbl { width: 170px; }
    .stars { display: flex; gap: 4px; }
    .stars button { width: 36px; height: 36px; border-radius: 6px; border: 1px solid var(--ktt-line); background: #fff; font: inherit; cursor: pointer; }
    .stars button.on { background: #2a78d6; border-color: #2a78d6; color: #fff; }
    .err { color: var(--ktt-danger); }
  `,
})
export class SurveyDialog implements OnInit {
  private readonly api = inject(ServiceApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly ref = inject(MatDialogRef<SurveyDialog, Survey>);
  readonly data = inject<{ projectId?: string; ticketId?: string; customerId?: string; label?: string } | null>(MAT_DIALOG_DATA);
  readonly projects = signal<ProjectRow[]>([]);
  readonly methods = Object.entries(SURVEY_METHOD);
  readonly today = todayIso();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly questions: { key: 'quality' | 'timeliness' | 'communication' | 'cleanliness' | 'overall'; label: string }[] = [
    { key: 'quality', label: 'คุณภาพงาน' },
    { key: 'timeliness', label: 'ตรงต่อเวลา' },
    { key: 'communication', label: 'การสื่อสาร/ประสานงาน' },
    { key: 'cleanliness', label: 'ความสะอาดเรียบร้อย' },
    { key: 'overall', label: 'ความพึงพอใจโดยรวม' },
  ];
  m: SurveySave = {
    customerId: this.data?.customerId ?? null,
    projectId: this.data?.projectId ?? null,
    ticketId: this.data?.ticketId ?? null,
    surveyDate: todayIso(),
    method: 'phone',
    respondent: null,
    quality: null,
    timeliness: null,
    communication: null,
    cleanliness: null,
    overall: null,
    recommend: null,
    comment: null,
  };

  ngOnInit(): void {
    if (!this.data?.label) this.projectsApi.list({ page: 0, size: 200 }).subscribe((r) => this.projects.set(r.items));
  }

  save(): void {
    this.busy.set(true);
    this.api.addSurvey(this.m).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
