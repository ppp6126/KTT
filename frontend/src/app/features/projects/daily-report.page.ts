import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import { ThDatePipe, thDateLong, todayIso } from '../../core/util/format';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { DAILY_STATUS, DailyReport, DailyReportSave, ProjectsApi, Task, WEATHER, WORKER_TRADES, WorkerLine } from './projects.api';

interface TaskEntry {
  task: Task;
  pct: number | null;
  note: string;
}

/**
 * รายงานประจำวันหน้างาน ออกแบบให้กรอกบนมือถือได้ด้วยมือเดียว:
 * ปุ่มใหญ่ ตัวนับคนงาน +/- รูปถ่ายจากกล้องโดยตรง
 */
@Component({
  selector: 'app-daily-report-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatIconModule, ThDatePipe, AttachmentPanel],
  template: `
    @if (ready()) {
      <div class="page narrow">
        <a [routerLink]="['/projects', pid(), 'daily']" class="back"><mat-icon>arrow_back</mat-icon> {{ projectLabel() }}</a>
        <div class="page-head">
          <div>
            <h1>รายงานประจำวัน</h1>
            <p>
              {{ longDate(m.reportDate) }}
              @if (report(); as r) {
                <span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span>
              }
            </p>
          </div>
          @if (report(); as r) {
            @if (r.canAcknowledge) {
              <button mat-flat-button (click)="ack()"><mat-icon>done_all</mat-icon> รับทราบ</button>
            }
          }
        </div>

        @if (report()?.status === 'submitted' || report()?.status === 'acknowledged') {
          <p class="muted small">
            ส่งโดย {{ report()!.submittedByName }} {{ report()!.submittedAt | thDate: true }}
            @if (report()!.acknowledgedAt) {
              , PM {{ report()!.acknowledgedByName }} รับทราบ {{ report()!.acknowledgedAt | thDate: true }}
            }
          </p>
        }

        <section class="panel panel-pad">
          <mat-form-field class="date">
            <mat-label>วันที่</mat-label>
            <input matInput type="date" [(ngModel)]="m.reportDate" [max]="today" [disabled]="!editable()" />
          </mat-form-field>
          <div class="weather">
            <div>
              <span class="label">อากาศช่วงเช้า</span>
              <mat-button-toggle-group [(ngModel)]="m.weatherAm" [disabled]="!editable()" aria-label="อากาศช่วงเช้า" hideSingleSelectionIndicator>
                @for (w of weathers; track w[0]) {
                  <mat-button-toggle [value]="w[0]" [attr.aria-label]="w[1].label"><mat-icon>{{ w[1].icon }}</mat-icon></mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
            <div>
              <span class="label">ช่วงบ่าย</span>
              <mat-button-toggle-group [(ngModel)]="m.weatherPm" [disabled]="!editable()" aria-label="อากาศช่วงบ่าย" hideSingleSelectionIndicator>
                @for (w of weathers; track w[0]) {
                  <mat-button-toggle [value]="w[0]" [attr.aria-label]="w[1].label"><mat-icon>{{ w[1].icon }}</mat-icon></mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
          </div>
        </section>

        <section class="panel panel-pad">
          <div class="sec-title"><h2>คนงาน</h2><span class="total">รวม {{ workersTotal() }} คน</span></div>
          <ul class="workers">
            @for (w of m.workers; track $index; let i = $index) {
              <li>
                <input class="trade" [(ngModel)]="w.trade" [disabled]="!editable()" aria-label="ประเภทช่าง" />
                <div class="stepper">
                  <button mat-icon-button (click)="bump(w, -1)" [disabled]="!editable() || w.count <= 0" aria-label="ลด"><mat-icon>remove</mat-icon></button>
                  <input type="number" min="0" [(ngModel)]="w.count" (ngModelChange)="tick()" [disabled]="!editable()" aria-label="จำนวนคน" />
                  <button mat-icon-button (click)="bump(w, 1)" [disabled]="!editable()" aria-label="เพิ่ม"><mat-icon>add</mat-icon></button>
                </div>
              </li>
            }
          </ul>
          @if (editable()) {
            <button mat-button (click)="m.workers.push({ trade: '', count: 1 }); tick()"><mat-icon>add</mat-icon> ประเภทช่างอื่น</button>
          }
        </section>

        <section class="panel panel-pad">
          <h2>งานที่ทำวันนี้</h2>
          <mat-form-field class="full">
            <mat-label>รายละเอียดงานที่ทำ</mat-label>
            <textarea matInput rows="4" [(ngModel)]="m.workDone" [disabled]="!editable()" placeholder="เช่น เทคอนกรีตพื้นชั้น 2 โซน A ประมาณ 12 คิว"></textarea>
          </mat-form-field>
          @if (entries().length) {
            <h3>อัปเดตความคืบหน้างาน</h3>
            <p class="muted small">กรอกเฉพาะงานที่มีความคืบหน้าวันนี้ ค่าจะเข้าแผนงานเมื่อกดส่งรายงาน</p>
            <ul class="tasks">
              @for (e of entries(); track e.task.id) {
                <li [class.set]="e.pct !== null">
                  <div class="t-name">
                    {{ e.task.name }}
                    <span class="muted small">เดิม {{ e.task.progressPct }}%</span>
                  </div>
                  <div class="t-input">
                    <input type="range" min="0" max="100" step="5" [ngModel]="e.pct ?? e.task.progressPct" (ngModelChange)="e.pct = +$event; tick()" [disabled]="!editable()" [attr.aria-label]="'% ' + e.task.name" />
                    <input type="number" min="0" max="100" class="pct" [ngModel]="e.pct" (ngModelChange)="e.pct = $event === null || $event === '' ? null : +$event; tick()" [placeholder]="'' + e.task.progressPct" [disabled]="!editable()" aria-label="%" />
                    <span>%</span>
                  </div>
                </li>
              }
            </ul>
          }
          <mat-form-field class="full">
            <mat-label>แผนงานพรุ่งนี้</mat-label>
            <textarea matInput rows="2" [(ngModel)]="m.workPlanned" [disabled]="!editable()"></textarea>
          </mat-form-field>
        </section>

        <section class="panel panel-pad">
          <h2>อื่น ๆ</h2>
          <mat-form-field class="full">
            <mat-label>ปัญหา / อุปสรรค</mat-label>
            <textarea matInput rows="2" [(ngModel)]="m.problems" [disabled]="!editable()"></textarea>
          </mat-form-field>
          <mat-form-field class="full">
            <mat-label>วัสดุเข้าหน้างาน</mat-label>
            <textarea matInput rows="2" [(ngModel)]="m.materialsIn" [disabled]="!editable()" placeholder="เช่น เหล็ก DB12 50 เส้น, ปูนซีเมนต์ 40 ถุง"></textarea>
          </mat-form-field>
          <mat-form-field class="full">
            <mat-label>เครื่องจักร / อุปกรณ์</mat-label>
            <input matInput [(ngModel)]="m.equipment" [disabled]="!editable()" />
          </mat-form-field>
          <mat-form-field class="full">
            <mat-label>ผู้เข้าตรวจ / ผู้มาติดต่อ</mat-label>
            <input matInput [(ngModel)]="m.visitors" [disabled]="!editable()" />
          </mat-form-field>
          <mat-form-field class="full">
            <mat-label>ความปลอดภัย</mat-label>
            <input matInput [(ngModel)]="m.safetyNote" [disabled]="!editable()" placeholder="เช่น ทำ Toolbox talk เรื่องการใช้นั่งร้าน" />
          </mat-form-field>
        </section>

        <section class="panel panel-pad">
          <h2>รูปถ่ายหน้างาน</h2>
          @if (report(); as r) {
            <app-attachment-panel ownerType="daily_report" [ownerId]="r.id" [canWrite]="r.canEdit" defaultCategory="site_photo" accept="image/*" [camera]="true" />
          } @else {
            <p class="muted">บันทึกร่างก่อน แล้วจึงถ่ายหรือแนบรูปได้</p>
          }
        </section>

        @if (editable()) {
          <div class="sticky-actions">
            @if (report()?.status === 'draft') {
              <button mat-button (click)="remove()">ลบ</button>
            }
            <span class="grow"></span>
            <button mat-stroked-button (click)="save(false)" [disabled]="busy()">บันทึก{{ report()?.status === 'draft' || !report() ? 'ร่าง' : '' }}</button>
            @if (!report() || report()!.status === 'draft') {
              <button mat-flat-button class="btn-primary" (click)="save(true)" [disabled]="busy()"><mat-icon>send</mat-icon> ส่งรายงาน</button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .narrow { max-width: 760px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    .page-head p .chip { margin-left: 8px; }
    section.panel { margin-bottom: 12px; }
    h2 { margin: 0 0 10px; }
    h3 { margin: 4px 0 2px; font-size: 0.95rem; }
    .full { display: block; width: 100%; }
    .date { width: 200px; }
    .label { display: block; color: var(--ktt-steel); font-size: 0.85rem; margin-bottom: 4px; }
    .weather { display: flex; gap: 20px; flex-wrap: wrap; }
    .sec-title { display: flex; justify-content: space-between; align-items: baseline; }
    .total { font-weight: 600; font-variant-numeric: tabular-nums; }
    .workers { list-style: none; margin: 0; padding: 0; }
    .workers li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #eceeed; }
    .trade { flex: 1; min-width: 0; height: 36px; border: 1px solid transparent; border-radius: 4px; padding: 0 6px; font: inherit; background: transparent; }
    .trade:focus { outline: none; border-color: var(--ktt-ink-2); background: #fff; }
    .stepper { display: flex; align-items: center; gap: 2px; }
    .stepper input { width: 56px; height: 36px; text-align: center; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; font-size: 1.05rem; }
    .tasks { list-style: none; padding: 0; margin: 6px 0 14px; }
    .tasks li { padding: 8px 0; border-bottom: 1px solid #eceeed; }
    .tasks li.set .t-name { font-weight: 600; }
    .t-input { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .t-input input[type='range'] { flex: 1; accent-color: var(--ktt-ink-2); }
    .pct { width: 64px; height: 34px; text-align: right; border: 1px solid var(--ktt-line); border-radius: 4px; font: inherit; padding: 0 6px; }
    .small { font-size: 0.85rem; }
    .sticky-actions {
      position: sticky; bottom: 0; z-index: 2; display: flex; gap: 8px; align-items: center;
      padding: 12px 16px; margin: 0 -16px; background: rgb(255 255 255 / 0.96); border-top: 1px solid var(--ktt-line);
    }
    .grow { flex: 1; }
    .sticky-actions button { white-space: nowrap; }
    @media (max-width: 600px) {
      .sticky-actions button { flex: 1; padding: 0 8px; }
      .sticky-actions mat-icon { display: none; }
      .sticky-actions .grow { display: none; }
    }
  `,
})
export class DailyReportPage implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  /** route: projects/:projectId/daily/new */
  readonly projectId = input<string>();
  /** route: daily-reports/:reportId */
  readonly reportId = input<string>();

  readonly report = signal<DailyReport | null>(null);
  readonly entries = signal<TaskEntry[]>([]);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly projectLabel = signal('');
  readonly st = DAILY_STATUS;
  readonly weathers = Object.entries(WEATHER);
  readonly today = todayIso();

  m: DailyReportSave = {
    reportDate: todayIso(),
    weatherAm: 'sunny',
    weatherPm: 'sunny',
    workers: WORKER_TRADES.slice(0, 4).map((trade) => ({ trade, count: 0 })),
    workDone: '',
    workPlanned: '',
    problems: '',
    materialsIn: '',
    equipment: '',
    visitors: '',
    safetyNote: '',
    tasks: [],
  };

  readonly pid = computed(() => this.report()?.projectId ?? this.projectId() ?? '');
  readonly editable = computed(() => (this.report() ? this.report()!.canEdit : true));
  readonly workersTotal = computed(() => {
    this.version();
    return this.m.workers.reduce((s, w) => s + (Number(w.count) || 0), 0);
  });

  ngOnInit(): void {
    if (this.reportId()) {
      this.api.daily(this.reportId()!).subscribe({
        next: (r) => {
          this.apply(r);
          this.loadTasks(r.projectId, r);
        },
        error: (e) => this.notify.error(e),
      });
    } else if (this.projectId()) {
      this.api.get(this.projectId()!).subscribe({
        next: (p) => this.projectLabel.set(`${p.code} ${p.name}`),
        error: (e) => this.notify.error(e),
      });
      this.loadTasks(this.projectId()!, null);
    }
  }

  private loadTasks(projectId: string, r: DailyReport | null): void {
    this.api.schedule(projectId).subscribe({
      next: (s) => {
        const set = new Map((r?.tasks ?? []).map((t) => [t.taskId, t]));
        // งานย่อยที่ยังไม่เสร็จ หรือที่รายงานฉบับนี้กรอกไว้ ; งานที่อยู่ในช่วงแผนขึ้นก่อน
        const leaves = s.tasks.filter((t) => t.leaf && (t.progressPct < 100 || set.has(t.id)));
        const active = (t: Task) => (t.plannedStart && t.plannedStart <= this.m.reportDate && (!t.plannedEnd || t.plannedEnd >= this.m.reportDate) ? 0 : 1);
        leaves.sort((a, b) => active(a) - active(b) || a.sortOrder - b.sortOrder);
        this.entries.set(leaves.map((t) => ({ task: t, pct: set.get(t.id)?.progressPct ?? null, note: set.get(t.id)?.note ?? '' })));
        this.ready.set(true);
      },
      error: (e) => {
        this.notify.error(e);
        this.ready.set(true);
      },
    });
  }

  private apply(r: DailyReport): void {
    this.report.set(r);
    this.projectLabel.set(`${r.projectCode} ${r.projectName}`);
    const trades = new Map(r.workers.map((w) => [w.trade, w.count]));
    const base = WORKER_TRADES.slice(0, 4).filter((t) => !trades.has(t)).map((trade) => ({ trade, count: 0 }));
    this.m = {
      reportDate: r.reportDate,
      weatherAm: r.weatherAm,
      weatherPm: r.weatherPm,
      workers: [...r.workers.map((w) => ({ ...w })), ...(r.canEdit ? base : [])],
      workDone: r.workDone ?? '',
      workPlanned: r.workPlanned ?? '',
      problems: r.problems ?? '',
      materialsIn: r.materialsIn ?? '',
      equipment: r.equipment ?? '',
      visitors: r.visitors ?? '',
      safetyNote: r.safetyNote ?? '',
      tasks: [],
    };
    this.tick();
  }

  longDate(d: string): string {
    return thDateLong(d);
  }

  tick(): void {
    this.version.update((v) => v + 1);
  }

  bump(w: WorkerLine, d: number): void {
    w.count = Math.max(0, (Number(w.count) || 0) + d);
    this.tick();
  }

  private body(): DailyReportSave {
    return {
      ...this.m,
      weatherAm: this.m.weatherAm || null,
      weatherPm: this.m.weatherPm || null,
      workers: this.m.workers.filter((w) => w.trade.trim() && Number(w.count) > 0).map((w) => ({ trade: w.trade.trim(), count: Number(w.count) })),
      workDone: this.m.workDone || null,
      workPlanned: this.m.workPlanned || null,
      problems: this.m.problems || null,
      materialsIn: this.m.materialsIn || null,
      equipment: this.m.equipment || null,
      visitors: this.m.visitors || null,
      safetyNote: this.m.safetyNote || null,
      tasks: this.entries()
        .filter((e) => e.pct !== null && !Number.isNaN(e.pct))
        .map((e) => ({ taskId: e.task.id, progressPct: Math.min(100, Math.max(0, Number(e.pct))), note: e.note || null })),
    };
  }

  save(submit: boolean): void {
    const r = this.report();
    if (submit && !this.m.workDone?.trim()) {
      this.notify.error(null, 'กรุณากรอกงานที่ทำวันนี้ก่อนส่งรายงาน');
      return;
    }
    this.busy.set(true);
    const req = r ? this.api.updateDaily(r.id, this.body()) : this.api.createDaily(this.projectId()!, this.body());
    req.subscribe({
      next: (saved) => {
        if (submit) {
          this.api.submitDaily(saved.id).subscribe({
            next: (s) => {
              this.busy.set(false);
              this.notify.ok('ส่งรายงานแล้ว');
              this.router.navigate(['/projects', s.projectId, 'daily']);
            },
            error: (e) => {
              this.busy.set(false);
              this.apply(saved);
              this.notify.error(e);
            },
          });
          return;
        }
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!r) {
          this.router.navigate(['/daily-reports', saved.id], { replaceUrl: true });
        }
        this.apply(saved);
      },
      error: (e) => {
        this.busy.set(false);
        if (errorCode(e) === 'report_exists' && e instanceof HttpErrorResponse && e.error?.details?.id) {
          this.notify.error(e, 'มีรายงานของวันนี้แล้ว กำลังเปิดฉบับเดิม');
          this.router.navigate(['/daily-reports', e.error.details.id]);
          return;
        }
        this.notify.error(e);
      },
    });
  }

  ack(): void {
    this.api.acknowledgeDaily(this.report()!.id).subscribe({ next: (r) => this.apply(r), error: (e) => this.notify.error(e) });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบรายงาน', message: 'ลบรายงานฉบับร่างนี้', confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      const pid = this.pid();
      this.api.deleteDaily(this.report()!.id).subscribe({
        next: () => this.router.navigate(['/projects', pid, 'daily']),
        error: (e) => this.notify.error(e),
      });
    });
  }
}
