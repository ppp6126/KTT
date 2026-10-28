import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { thDate } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { CanDirective } from '../../shared/can.directive';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { LeadDialog } from './lead-dialog';
import { JOB_TYPES, LEAD_STATUSES, LeadRow, LeadStatus, LeadsApi } from './leads.api';

/** US-02 Pipeline แบบ Kanban: ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ */
@Component({
  selector: 'app-leads-board-page',
  imports: [
    FormsModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MoneyPipe,
    CanDirective,
  ],
  templateUrl: './leads-board.page.html',
  styleUrl: './leads-board.page.scss',
})
export class LeadsBoardPage implements OnInit {
  private readonly api = inject(LeadsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly Perm = Perm;
  readonly statuses = LEAD_STATUSES;
  readonly jobTypes = JOB_TYPES;
  readonly leads = signal<LeadRow[]>([]);
  readonly loading = signal(true);
  readonly columns = computed(() => {
    const by: Record<string, LeadRow[]> = {};
    for (const s of LEAD_STATUSES) by[s.code] = [];
    for (const l of this.leads()) by[l.status]?.push(l);
    return LEAD_STATUSES.map((s) => ({
      ...s,
      items: by[s.code],
      total: by[s.code].reduce((sum, l) => sum + (l.budgetEst ?? 0), 0),
    }));
  });

  q = '';
  mine: 'all' | 'mine' = 'all';
  private readonly search$ = new Subject<void>();

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.load());
  }

  ngOnInit(): void {
    this.load();
  }

  onSearch(): void {
    this.search$.next();
  }

  load(): void {
    this.loading.set(true);
    const owner = this.mine === 'mine' ? this.auth.user()?.id : undefined;
    this.api.board(this.q.trim() || undefined, owner).subscribe({
      next: (r) => {
        this.leads.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }

  add(): void {
    this.dialog
      .open(LeadDialog, { data: { lead: null } })
      .afterClosed()
      .subscribe((r?: LeadRow) => {
        if (r) {
          this.notify.ok('เพิ่มลีดแล้ว');
          this.router.navigate(['/leads', r.id]);
        }
      });
  }

  open(l: LeadRow): void {
    this.router.navigate(['/leads', l.id]);
  }

  drop(e: CdkDragDrop<LeadStatus, LeadStatus, LeadRow>): void {
    const lead = e.item.data;
    const to = e.container.data;
    if (lead.status === to || !this.auth.can(Perm.LEAD_WRITE)) return;
    const apply = (reason?: string) => {
      const prev = lead.status;
      this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, status: to } : l)));
      this.api.setStatus(lead.id, to, reason).subscribe({
        error: (err) => {
          this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, status: prev } : l)));
          this.notify.error(err);
        },
      });
    };
    if (to === 'lost') {
      prompt(this.dialog, {
        title: 'ไม่ได้งาน',
        message: `บันทึกเหตุผลของ "${lead.title}" เพื่อใช้ปรับปรุงการเสนอราคาครั้งต่อไป`,
        label: 'เหตุผลที่ไม่ได้งาน',
        confirmText: 'บันทึก',
        required: true,
        multiline: true,
      }).subscribe((reason) => reason && apply(reason));
    } else {
      apply();
    }
  }

  followupClass(l: LeadRow): string {
    if (!l.nextFollowupAt || l.status === 'won' || l.status === 'lost') return '';
    const d = new Date(l.nextFollowupAt);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return d <= today ? 'due' : '';
  }

  date(v: string | null): string {
    return thDate(v);
  }
}
