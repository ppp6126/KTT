import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ThDatePipe } from '../../core/util/format';
import { Notify } from '../../shared/notify.service';
import {
  DAILY_STATUS,
  DailyReportRow,
  ISSUE_STATUS,
  Issue,
  ProjectsApi,
  PUNCH_STATUS,
  Punch,
  QC_RESULT,
  Qc,
  QcTemplate,
  SAFETY_KIND,
  SEVERITY,
  Safety,
  Task,
  WEATHER,
} from './projects.api';
import { IssueDialog, PunchDialog, QcDialog, SafetyDialog } from './site-dialogs';

const TABLE = `
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .grow { flex: 1; }
  .t { width: 100%; border-collapse: collapse; }
  .t th, .t td { padding: 9px 10px; border-bottom: 1px solid var(--ktt-line); text-align: left; vertical-align: top; }
  .t th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; white-space: nowrap; }
  .t tr.clickable { cursor: pointer; }
  .t tr.clickable:hover td { background: #f3f6f8; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .small { font-size: 0.85rem; }
  .empty { text-align: center; padding: 28px; }
  .late { color: var(--ktt-danger); font-weight: 500; }
  .scroll { overflow-x: auto; }
  .clip { max-width: 420px; }
  mat-icon.sm { font-size: 18px; width: 18px; height: 18px; vertical-align: -4px; }
`;

// ======================================================================= Daily reports

@Component({
  selector: 'app-daily-tab',
  imports: [RouterLink, MatButtonModule, MatIconModule, ThDatePipe],
  template: `
    <div class="head">
      <span class="muted small">โฟร์แมนส่งรายงานทุกวัน ความคืบหน้าที่กรอกจะอัปเดตแผนงานและ S-Curve</span>
      <span class="grow"></span>
      @if (canReport()) {
        <a mat-flat-button [routerLink]="['/projects', projectId(), 'daily', 'new']"><mat-icon>edit_note</mat-icon> เขียนรายงานวันนี้</a>
      }
    </div>
    <div class="scroll">
      <table class="t">
        <thead><tr><th>วันที่</th><th>สถานะ</th><th>อากาศ</th><th class="num">คนงาน</th><th>งานที่ทำ</th><th class="num">รูป</th><th>ผู้รายงาน</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="clickable" [routerLink]="['/daily-reports', r.id]" tabindex="0">
              <td>{{ r.reportDate | thDate }}</td>
              <td><span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span></td>
              <td class="small">
                @if (r.weatherAm) {
                  <mat-icon class="sm" [attr.aria-label]="w[r.weatherAm].label">{{ w[r.weatherAm].icon }}</mat-icon>
                }
                @if (r.weatherPm && r.weatherPm !== r.weatherAm) {
                  <mat-icon class="sm" [attr.aria-label]="w[r.weatherPm].label">{{ w[r.weatherPm].icon }}</mat-icon>
                }
              </td>
              <td class="num">{{ r.workersTotal }}</td>
              <td class="small clip">{{ r.summary }}</td>
              <td class="num">{{ r.photos || '' }}</td>
              <td class="small">{{ r.createdByName }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty muted">ยังไม่มีรายงานประจำวัน</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: TABLE,
})
export class DailyTab implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly canReport = input(false);
  readonly rows = signal<DailyReportRow[]>([]);
  readonly st = DAILY_STATUS;
  readonly w = WEATHER;

  ngOnInit(): void {
    this.api.dailyList(this.projectId(), 0, 60).subscribe({ next: (r) => this.rows.set(r.items), error: (e) => this.notify.error(e) });
  }
}

// ======================================================================= Issues & risks

@Component({
  selector: 'app-issues-tab',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatButtonToggleModule, ThDatePipe],
  template: `
    <div class="head">
      <mat-button-toggle-group [(ngModel)]="filter" aria-label="กรอง" hideSingleSelectionIndicator>
        <mat-button-toggle value="open">ยังไม่ปิด</mat-button-toggle>
        <mat-button-toggle value="issue">ปัญหา</mat-button-toggle>
        <mat-button-toggle value="risk">ความเสี่ยง</mat-button-toggle>
        <mat-button-toggle value="all">ทั้งหมด</mat-button-toggle>
      </mat-button-toggle-group>
      <span class="grow"></span>
      @if (canEdit()) {
        <button mat-stroked-button (click)="open(null, 'risk')"><mat-icon>add</mat-icon> ความเสี่ยง</button>
        <button mat-flat-button (click)="open(null, 'issue')"><mat-icon>add</mat-icon> ปัญหา</button>
      }
    </div>
    <div class="scroll">
      <table class="t">
        <thead><tr><th>ประเภท</th><th>หัวข้อ</th><th>ความรุนแรง</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th></tr></thead>
        <tbody>
          @for (r of shown(); track r.id) {
            <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
              <td class="small">{{ r.kind === 'risk' ? 'ความเสี่ยง' : 'ปัญหา' }}</td>
              <td>
                <div>{{ r.title }}</div>
                @if (r.description) {
                  <div class="muted small clip">{{ r.description }}</div>
                }
              </td>
              <td><span class="chip" [class]="sev[r.severity].tone">{{ sev[r.severity].label }}</span></td>
              <td><span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span></td>
              <td class="small">{{ r.ownerName || '–' }}</td>
              <td class="small" [class.late]="r.overdue">{{ r.dueDate | thDate }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty muted">ไม่มีรายการ</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: TABLE,
})
export class IssuesTab implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly canEdit = input(false);
  readonly changed = output<void>();
  readonly rows = signal<Issue[]>([]);
  readonly sev = SEVERITY;
  readonly st = ISSUE_STATUS;
  filterSig = signal('open');
  get filter(): string {
    return this.filterSig();
  }
  set filter(v: string) {
    this.filterSig.set(v);
  }
  readonly shown = computed(() => {
    const f = this.filterSig();
    return this.rows().filter((r) =>
      f === 'all' ? true : f === 'open' ? r.status === 'open' || r.status === 'in_progress' : r.kind === f,
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.records<Issue>(this.projectId(), 'issues').subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(item: Issue | null, kind: 'issue' | 'risk' = 'issue'): void {
    this.dialog
      .open(IssueDialog, { data: { projectId: this.projectId(), item, canEdit: this.canEdit(), kindDefault: kind } })
      .afterClosed()
      .subscribe((r) => {
        if (r) {
          this.load();
          this.changed.emit();
        }
      });
  }
}

// ======================================================================= Punch list

@Component({
  selector: 'app-punch-tab',
  imports: [MatButtonModule, MatIconModule, ThDatePipe],
  template: `
    <div class="head">
      <span class="muted small">รายการที่ต้องแก้ก่อนส่งมอบ ช่างแก้เสร็จกด "แก้แล้ว" PM ตรวจรับ</span>
      <span class="grow"></span>
      <span class="small">เหลือ {{ openCount() }} / {{ rows().length }} รายการ</span>
      @if (canEdit()) {
        <button mat-flat-button (click)="open(null)"><mat-icon>add</mat-icon> เพิ่มรายการ</button>
      }
    </div>
    <div class="scroll">
      <table class="t">
        <thead><tr><th class="num">#</th><th>ตำแหน่ง</th><th>รายละเอียด</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>สถานะ</th><th class="num">รูป</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
              <td class="num">{{ r.itemNo }}</td>
              <td class="small">{{ r.location || '–' }}</td>
              <td class="clip">{{ r.description }}</td>
              <td class="small">{{ r.responsible || '–' }}</td>
              <td class="small" [class.late]="r.overdue">{{ r.dueDate | thDate }}</td>
              <td><span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span></td>
              <td class="num">{{ r.photos || '' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty muted">ยังไม่มีรายการแก้ไข</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: TABLE,
})
export class PunchTab implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly canEdit = input(false);
  readonly changed = output<void>();
  readonly rows = signal<Punch[]>([]);
  readonly openCount = computed(() => this.rows().filter((r) => r.status !== 'verified').length);
  readonly st = PUNCH_STATUS;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.records<Punch>(this.projectId(), 'punch').subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(item: Punch | null): void {
    this.dialog
      .open(PunchDialog, { data: { projectId: this.projectId(), item, canEdit: this.canEdit() } })
      .afterClosed()
      .subscribe((r) => {
        if (r) {
          this.load();
          this.changed.emit();
        }
      });
  }
}

// ======================================================================= QC

@Component({
  selector: 'app-qc-tab',
  imports: [MatButtonModule, MatIconModule, ThDatePipe],
  template: `
    <div class="head">
      <span class="muted small">ตรวจคุณภาพตามรายการมาตรฐาน มีข้อไม่ผ่านจะแจ้ง PM ทันที</span>
      <span class="grow"></span>
      @if (canEdit()) {
        <button mat-flat-button (click)="open(null)"><mat-icon>add</mat-icon> ตรวจ QC</button>
      }
    </div>
    <div class="scroll">
      <table class="t">
        <thead><tr><th>วันที่</th><th>หัวข้อ</th><th>งาน</th><th>ผล</th><th class="num">ผ่าน / ไม่ผ่าน</th><th>ผู้ตรวจ</th><th class="num">รูป</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
              <td class="small">{{ r.inspectedOn | thDate }}</td>
              <td>{{ r.title }}</td>
              <td class="small">{{ r.taskName || '–' }}</td>
              <td><span class="chip" [class]="res[r.result].tone">{{ res[r.result].label }}</span></td>
              <td class="num">{{ r.passCount }} / {{ r.failCount }}</td>
              <td class="small">{{ r.inspectorName || '–' }}</td>
              <td class="num">{{ r.photos || '' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty muted">ยังไม่มีการตรวจ QC</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: TABLE,
})
export class QcTab implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly canEdit = input(false);
  readonly tasks = input<Task[]>([]);
  readonly changed = output<void>();
  readonly rows = signal<Qc[]>([]);
  readonly templates = signal<QcTemplate[]>([]);
  readonly res = QC_RESULT;

  ngOnInit(): void {
    this.load();
    this.api.qcTemplates().subscribe((t) => this.templates.set(t));
  }

  load(): void {
    this.api.records<Qc>(this.projectId(), 'qc').subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(item: Qc | null): void {
    this.dialog
      .open(QcDialog, {
        data: { projectId: this.projectId(), item, canEdit: this.canEdit(), templates: this.templates(), tasks: this.tasks().filter((t) => t.leaf) },
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((r) => {
        if (r) {
          this.load();
          this.changed.emit();
        }
      });
  }
}

// ======================================================================= Safety

@Component({
  selector: 'app-safety-tab',
  imports: [MatButtonModule, MatIconModule, ThDatePipe],
  template: `
    <div class="head">
      <div class="stats small">
        <span>Toolbox talk {{ count('toolbox') }} ครั้ง</span>
        <span>เหตุเกือบเกิด {{ count('near_miss') }}</span>
        <span [class.late]="count('incident') > 0">อุบัติเหตุ {{ count('incident') }}</span>
      </div>
      <span class="grow"></span>
      @if (canEdit()) {
        <button mat-flat-button (click)="open(null)"><mat-icon>add</mat-icon> บันทึก</button>
      }
    </div>
    <div class="scroll">
      <table class="t">
        <thead><tr><th>วันที่</th><th>ประเภท</th><th>หัวข้อ</th><th class="num">คน</th><th>ความรุนแรง</th><th>สถานะ</th><th class="num">รูป</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
              <td class="small">{{ r.logDate | thDate }}</td>
              <td class="small"><mat-icon class="sm">{{ kinds[r.kind].icon }}</mat-icon> {{ kinds[r.kind].label }}</td>
              <td>
                {{ r.title }}
                @if (r.injuredCount > 0) {
                  <span class="late small">บาดเจ็บ {{ r.injuredCount }} คน</span>
                }
              </td>
              <td class="num">{{ r.peopleCount ?? '' }}</td>
              <td><span class="chip" [class]="sev[r.severity].tone">{{ sev[r.severity].label }}</span></td>
              <td class="small">{{ r.status === 'open' ? 'ติดตาม' : 'ปิดแล้ว' }}</td>
              <td class="num">{{ r.photos || '' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty muted">ยังไม่มีบันทึกความปลอดภัย</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: TABLE + `.stats { display: flex; gap: 16px; flex-wrap: wrap; }`,
})
export class SafetyTab implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly projectId = input.required<string>();
  readonly canEdit = input(false);
  readonly changed = output<void>();
  readonly rows = signal<Safety[]>([]);
  readonly kinds = SAFETY_KIND;
  readonly sev = SEVERITY;

  ngOnInit(): void {
    this.load();
  }

  count(kind: string): number {
    return this.rows().filter((r) => r.kind === kind).length;
  }

  load(): void {
    this.api.records<Safety>(this.projectId(), 'safety').subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(item: Safety | null): void {
    this.dialog
      .open(SafetyDialog, { data: { projectId: this.projectId(), item, canEdit: this.canEdit() } })
      .afterClosed()
      .subscribe((r) => {
        if (r) {
          this.load();
          this.changed.emit();
        }
      });
  }
}
