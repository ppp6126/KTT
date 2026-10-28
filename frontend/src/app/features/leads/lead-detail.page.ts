import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { CanDirective } from '../../shared/can.directive';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { BoqApi, BoqSummary, TemplateSummary } from '../boq/boq.api';
import { QUOTATION_STATUS, QuotationRow, QuotationsApi } from '../quotations/quotations.api';
import { LeadDialog } from './lead-dialog';
import { ACTIVITY_TYPES, JOB_TYPES, LEAD_STATUSES, LeadDetail, LeadStatus, LeadsApi } from './leads.api';

@Component({
  selector: 'app-lead-detail-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    MatTabsModule,
    ThDatePipe,
    MoneyPipe,
    AttachmentPanel,
    CanDirective,
  ],
  templateUrl: './lead-detail.page.html',
  styleUrl: './lead-detail.page.scss',
})
export class LeadDetailPage implements OnInit {
  private readonly api = inject(LeadsApi);
  private readonly boqApi = inject(BoqApi);
  private readonly qApi = inject(QuotationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly id = input.required<string>();
  readonly Perm = Perm;
  readonly statuses = LEAD_STATUSES;
  readonly jobTypes = JOB_TYPES;
  readonly activityTypes = ACTIVITY_TYPES;
  readonly qStatus = QUOTATION_STATUS;

  readonly detail = signal<LeadDetail | null>(null);
  readonly boqs = signal<BoqSummary[]>([]);
  readonly quotations = signal<QuotationRow[]>([]);
  readonly templates = signal<TemplateSummary[]>([]);
  readonly canWrite = computed(() => this.auth.can(Perm.LEAD_WRITE));
  readonly canBoq = computed(() => this.auth.can(Perm.BOQ_WRITE) && this.auth.can(Perm.COST_VIEW));

  actType = 'call';
  actNote = '';
  actBusy = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get(this.id()).subscribe({
      next: (d) => this.detail.set(d),
      error: (e) => {
        this.notify.error(e);
        this.router.navigate(['/leads']);
      },
    });
    if (this.auth.can(Perm.BOQ_READ)) {
      this.boqApi.listForLead(this.id()).subscribe((b) => this.boqs.set(b));
    }
    if (this.auth.can(Perm.QUOTATION_READ)) {
      this.qApi.list({ leadId: this.id(), page: 0, size: 50 }).subscribe((r) => this.quotations.set(r.items));
    }
    if (this.canBoq()) {
      this.boqApi.templates().subscribe((t) => this.templates.set(t));
    }
  }

  edit(): void {
    const d = this.detail();
    if (!d) return;
    this.dialog.open(LeadDialog, { data: { lead: d.lead } }).afterClosed().subscribe((r) => r && this.load());
  }

  setStatus(status: LeadStatus): void {
    const d = this.detail();
    if (!d || d.lead.status === status) return;
    const run = (reason?: string) =>
      this.api.setStatus(d.lead.id, status, reason).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
    if (status === 'lost') {
      prompt(this.dialog, {
        title: 'ไม่ได้งาน',
        label: 'เหตุผลที่ไม่ได้งาน',
        confirmText: 'บันทึก',
        required: true,
        multiline: true,
      }).subscribe((r) => r && run(r));
    } else {
      run();
    }
  }

  addActivity(): void {
    if (!this.actNote.trim()) return;
    this.actBusy = true;
    this.api.addActivity(this.id(), this.actType, this.actNote.trim()).subscribe({
      next: () => {
        this.actBusy = false;
        this.actNote = '';
        this.load();
      },
      error: (e) => {
        this.actBusy = false;
        this.notify.error(e);
      },
    });
  }

  deleteActivity(activityId: string): void {
    this.api.deleteActivity(this.id(), activityId).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
  }

  remove(): void {
    const d = this.detail();
    if (!d) return;
    confirmAction(this.dialog, {
      title: 'ลบลีด',
      message: `ลบ "${d.lead.title}" ลบได้เฉพาะลีดที่ยังไม่มีใบเสนอราคา`,
      confirmText: 'ลบลีด',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(d.lead.id).subscribe({
        next: () => {
          this.notify.ok('ลบลีดแล้ว');
          this.router.navigate(['/leads']);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  newBoq(templateId: string | null = null): void {
    const n = this.boqs().length;
    const option = `Option ${String.fromCharCode(65 + n)}`;
    prompt(this.dialog, { title: 'สร้าง BOQ', label: 'ชื่อ BOQ', confirmText: 'สร้าง', required: true, value: `${this.detail()?.lead.title ?? 'BOQ'} ${option}` })
      .subscribe((name) => {
        if (!name) return;
        this.boqApi.create({ leadId: this.id(), name, optionLabel: option, templateId }).subscribe({
          next: (b) => this.router.navigate(['/boqs', b.id]),
          error: (e) => this.notify.error(e),
        });
      });
  }

  copyBoq(b: BoqSummary): void {
    const option = `Option ${String.fromCharCode(65 + this.boqs().length)}`;
    prompt(this.dialog, { title: 'คัดลอก BOQ', label: 'ชื่อชุดใหม่', confirmText: 'คัดลอก', required: true, value: `${b.name} (สำเนา)` })
      .subscribe((name) => {
        if (!name) return;
        this.boqApi.copy(b.id, name, option).subscribe({
          next: (n) => this.router.navigate(['/boqs', n.id]),
          error: (e) => this.notify.error(e),
        });
      });
  }

  newQuotation(boqId: string | null, mode: 'manual' | 'summary' | 'detailed'): void {
    const d = this.detail();
    if (!d) return;
    this.qApi.create({ customerId: d.lead.customerId, leadId: d.lead.id, boqId, mode, title: d.lead.title }).subscribe({
      next: (q) => this.router.navigate(['/quotations', q.id]),
      error: (e) => this.notify.error(e),
    });
  }
}
