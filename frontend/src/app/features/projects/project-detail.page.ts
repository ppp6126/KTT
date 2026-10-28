import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { ContractPage } from '../contracts/contract.page';
import { ContractsApi } from '../contracts/contracts.api';
import { ProgressBar } from './progress-bar';
import { ProjectDialog } from './project-dialog';
import { PROJECT_STATUS, Project, ProjectsApi, Schedule } from './projects.api';
import { SCurve } from './s-curve';
import { ScheduleEditor } from './schedule-editor';
import { DailyTab, IssuesTab, PunchTab, QcTab, SafetyTab } from './site-tabs';
import { ProjectCostView } from '../reports/project-cost';

const TABS = ['overview', 'schedule', 'daily', 'issues', 'punch', 'qc', 'safety', 'docs', 'contract', 'cost'] as const;

@Component({
  selector: 'app-project-detail-page',
  imports: [
    RouterLink,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    ThDatePipe,
    MoneyPipe,
    ProgressBar,
    SCurve,
    ScheduleEditor,
    DailyTab,
    IssuesTab,
    PunchTab,
    QcTab,
    SafetyTab,
    ProjectCostView,
    AttachmentPanel,
    ContractPage,
  ],
  template: `
    @if (p(); as p) {
      <div class="page wide">
        <a routerLink="/projects" class="back"><mat-icon>arrow_back</mat-icon> โครงการทั้งหมด</a>
        <div class="page-head">
          <div>
            <h1>{{ p.name }} <span class="chip" [class]="status_[p.status].tone">{{ status_[p.status].label }}</span></h1>
            <p>
              <span class="code">{{ p.code }}</span>,
              <a [routerLink]="['/customers', p.customerId]">{{ p.customerName }}</a>
              @if (p.quotationNo) {
                , จาก <a [routerLink]="['/quotations', p.quotationId]">{{ p.quotationNo }}</a>
              }
            </p>
          </div>
          <div class="actions">
            @if (p.canReport) {
              <a mat-flat-button class="btn-primary" [routerLink]="['/projects', p.id, 'daily', 'new']"><mat-icon>edit_note</mat-icon> รายงานประจำวัน</a>
            }
            <a mat-stroked-button [routerLink]="['/print/progress', p.id]" target="_blank"><mat-icon>print</mat-icon> รายงานความคืบหน้า</a>
            @if (p.canEdit) {
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                <button mat-menu-item (click)="edit()"><mat-icon>edit</mat-icon>แก้ไขข้อมูลโครงการ</button>
                <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบโครงการ</button>
              </mat-menu>
            }
          </div>
        </div>

        <section class="facts panel panel-pad">
          <div class="prog">
            <span class="label">ความคืบหน้า ณ วันนี้ (จริง / แผน)</span>
            <app-progress-bar [actual]="p.progressPct" [planned]="p.plannedPct" />
          </div>
          <div><span class="label">ระยะเวลาตามแผน</span>{{ p.plannedStart | thDate }} – {{ p.plannedEnd | thDate }}</div>
          <div><span class="label">เริ่มจริง</span>{{ p.actualStart | thDate }}</div>
          <div><span class="label">PM / โฟร์แมน</span>{{ p.managerName || '–' }} / {{ p.foremanName || '–' }}</div>
          @if (p.contract; as c) {
            <div><span class="label">มูลค่าสัญญา (ปรับปรุง)</span>{{ c.revisedAmount | money }}</div>
            <div><span class="label">วางบิล / รับแล้ว</span>{{ c.billedAmount | money }} / {{ c.receivedAmount | money }}</div>
          }
          @if (p.budgetCost !== null) {
            <div><span class="label">งบต้นทุน</span>{{ p.budgetCost | money }}</div>
          }
          <div class="wide"><span class="label">ไซต์งาน</span>{{ p.siteAddress || '–' }}</div>
        </section>

        <mat-tab-group animationDuration="0ms" [selectedIndex]="tabIndex()" (selectedIndexChange)="goTab($event)" mat-stretch-tabs="false" class="tabs">
          <mat-tab label="ภาพรวม">
            <div class="tab-body overview">
              <section class="panel panel-pad">
                <h2>S-Curve</h2>
                <app-s-curve [points]="schedule()?.curve ?? []" [today]="schedule()?.asOf ?? null" />
              </section>
              <section class="panel panel-pad">
                <h2>ความคืบหน้าตามหมวดงาน</h2>
                @for (c of schedule()?.categories ?? []; track c.taskId) {
                  <div class="cat">
                    <div class="cat-name">{{ c.name }} <span class="muted small">({{ c.weightPct }}% ของงาน)</span></div>
                    <app-progress-bar [actual]="c.actualPct" [planned]="c.plannedPct" />
                  </div>
                } @empty {
                  <p class="muted">ยังไม่มีแผนงาน</p>
                }
              </section>
              <section class="panel panel-pad counters">
                <h2>เรื่องที่ต้องติดตาม</h2>
                <button class="ctr" (click)="goTabKey('issues')"><strong [class.bad]="p.counters.openIssues">{{ p.counters.openIssues }}</strong> ปัญหาที่ยังไม่ปิด</button>
                <button class="ctr" (click)="goTabKey('issues')"><strong>{{ p.counters.openRisks }}</strong> ความเสี่ยง</button>
                <button class="ctr" (click)="goTabKey('punch')"><strong>{{ p.counters.openPunch }}</strong> รายการแก้ไข (Punch)</button>
                <button class="ctr" (click)="goTabKey('qc')"><strong [class.bad]="p.counters.pendingQc">{{ p.counters.pendingQc }}</strong> QC รอ/ไม่ผ่าน</button>
                <button class="ctr" (click)="goTabKey('safety')"><strong>{{ p.counters.openSafety }}</strong> เรื่องความปลอดภัย</button>
                <button class="ctr" (click)="goTabKey('daily')"><strong>{{ p.counters.dailyReports }}</strong> รายงานประจำวัน</button>
              </section>
            </div>
          </mat-tab>
          <mat-tab label="แผนงาน">
            <div class="tab-body">
              <app-schedule-editor [projectId]="p.id" [schedule]="schedule()" [canEdit]="p.canEdit" (saved)="onScheduleSaved($event)" />
            </div>
          </mat-tab>
          <mat-tab label="รายงานประจำวัน">
            <ng-template matTabContent>
              <div class="tab-body"><app-daily-tab [projectId]="p.id" [canReport]="p.canReport" /></div>
            </ng-template>
          </mat-tab>
          <mat-tab [label]="'ปัญหา/ความเสี่ยง' + (p.counters.openIssues ? ' (' + p.counters.openIssues + ')' : '')">
            <ng-template matTabContent>
              <div class="tab-body"><app-issues-tab [projectId]="p.id" [canEdit]="p.canReport" (changed)="reload()" /></div>
            </ng-template>
          </mat-tab>
          <mat-tab label="Punch list">
            <ng-template matTabContent>
              <div class="tab-body"><app-punch-tab [projectId]="p.id" [canEdit]="p.canReport" (changed)="reload()" /></div>
            </ng-template>
          </mat-tab>
          <mat-tab label="QC">
            <ng-template matTabContent>
              <div class="tab-body"><app-qc-tab [projectId]="p.id" [canEdit]="p.canReport" [tasks]="schedule()?.tasks ?? []" (changed)="reload()" /></div>
            </ng-template>
          </mat-tab>
          <mat-tab label="ความปลอดภัย">
            <ng-template matTabContent>
              <div class="tab-body"><app-safety-tab [projectId]="p.id" [canEdit]="p.canReport" (changed)="reload()" /></div>
            </ng-template>
          </mat-tab>
          <mat-tab label="เอกสาร">
            <ng-template matTabContent>
              <div class="tab-body panel panel-pad">
                <p class="muted small">แบบก่อสร้าง ใบอนุญาต หนังสือโต้ตอบ และเอกสารอื่นของโครงการ (ไฟล์เก็บบนเซิร์ฟเวอร์ของบริษัท)</p>
                <app-attachment-panel ownerType="project" [ownerId]="p.id" [canWrite]="p.canEdit || p.canReport" defaultCategory="drawing" />
              </div>
            </ng-template>
          </mat-tab>
          @if (canContract) {
            <mat-tab label="สัญญาและการเงิน">
              <ng-template matTabContent>
                <div class="tab-body">
                  @if (p.contract) {
                    <app-contract-page [projectId]="p.id" [embedded]="true" />
                  } @else {
                    <div class="panel empty-state">
                      <p>โครงการนี้ยังไม่มีสัญญา</p>
                      @if (p.quotationId) {
                        <p class="muted small">สร้างจากหน้าใบเสนอราคา {{ p.quotationNo }}</p>
                      }
                      @if (auth.can(Perm.CONTRACT_WRITE)) {
                        <button mat-flat-button (click)="createContract()">สร้างสัญญาเปล่า</button>
                      }
                    </div>
                  }
                </div>
              </ng-template>
            </mat-tab>
          }
          @if (canCost) {
            <mat-tab label="ต้นทุน">
              <ng-template matTabContent>
                <div class="tab-body"><app-project-cost [projectId]="p.id" /></div>
              </ng-template>
            </mat-tab>
          }
        </mat-tab-group>
      </div>
    }
  `,
  styles: `
    .wide { max-width: 1440px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    h1 .chip { font-size: 0.8rem; vertical-align: middle; margin-left: 8px; }
    .code { font-weight: 600; color: var(--ktt-ink); }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px 20px; margin-bottom: 8px; }
    .facts > div { display: flex; flex-direction: column; gap: 2px; }
    .facts .label, .label { color: var(--ktt-steel); font-size: 0.82rem; }
    .facts .prog { grid-column: span 2; }
    .facts .wide { grid-column: 1 / -1; }
    @media (max-width: 600px) { .facts .prog { grid-column: 1 / -1; } }
    .tab-body { padding: 16px 0; }
    .overview { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .overview .counters { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .overview .counters h2 { width: 100%; margin: 0 0 4px; }
    @media (max-width: 960px) { .overview { grid-template-columns: 1fr; } }
    h2 { margin: 0 0 12px; }
    .cat { margin-bottom: 12px; }
    .cat-name { margin-bottom: 4px; }
    .small { font-size: 0.85rem; }
    .ctr { display: flex; align-items: baseline; gap: 6px; padding: 10px 14px; border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-s); background: #fafbfa; font: inherit; cursor: pointer; }
    .ctr:hover { border-color: var(--ktt-ink-2); }
    .ctr strong { font-size: 1.2rem; font-variant-numeric: tabular-nums; }
    .ctr strong.bad { color: var(--ktt-danger); }
  `,
})
export class ProjectDetailPage implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly contracts = inject(ContractsApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;
  readonly canContract = this.auth.can(Perm.CONTRACT_READ) || this.auth.can(Perm.FINANCE_READ);
  readonly canCost = this.auth.can(Perm.COST_VIEW);
  /** แท็บที่ผู้ใช้เห็นจริง (แท็บสัญญาและต้นทุนขึ้นกับสิทธิ์) ใช้แปลงชื่อแท็บ <-> ลำดับ */
  private readonly tabs = TABS.filter((t) => (t !== 'contract' || this.canContract) && (t !== 'cost' || this.canCost));

  readonly id = input.required<string>();
  readonly tab = input<string>();

  readonly p = signal<Project | null>(null);
  readonly schedule = signal<Schedule | null>(null);
  readonly status_ = PROJECT_STATUS;
  readonly selected = signal(0);
  readonly tabIndex = computed(() => this.selected());

  constructor() {
    effect(() => {
      const t = this.tab();
      const i = this.tabs.indexOf((t ?? 'overview') as (typeof TABS)[number]);
      this.selected.set(i < 0 ? 0 : i);
    });
  }

  ngOnInit(): void {
    this.reload();
    this.api.schedule(this.id()).subscribe({ next: (s) => this.schedule.set(s), error: (e) => this.notify.error(e) });
  }

  reload(): void {
    this.api.get(this.id()).subscribe({ next: (p) => this.p.set(p), error: (e) => this.notify.error(e) });
  }

  goTab(i: number): void {
    this.selected.set(i);
    const key = this.tabs[i] ?? 'overview';
    this.location.replaceState(key === 'overview' ? `/projects/${this.id()}` : `/projects/${this.id()}/${key}`);
  }

  goTabKey(key: (typeof TABS)[number]): void {
    this.goTab(this.tabs.indexOf(key));
  }

  onScheduleSaved(s: Schedule): void {
    this.schedule.set(s);
    this.reload();
  }

  edit(): void {
    this.dialog
      .open(ProjectDialog, { data: this.p() })
      .afterClosed()
      .subscribe((p) => p && this.p.set(p));
  }

  remove(): void {
    const p = this.p()!;
    confirmAction(this.dialog, { title: 'ลบโครงการ', message: `ลบ ${p.code} ${p.name}`, confirmText: 'ลบโครงการ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(p.id).subscribe({
        next: () => {
          this.notify.ok('ลบโครงการแล้ว');
          this.router.navigate(['/projects']);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  createContract(): void {
    const p = this.p()!;
    this.contracts.create({ projectId: p.id, title: p.name, amount: 0, vatEnabled: true }).subscribe({
      next: () => {
        this.notify.ok('สร้างสัญญาฉบับร่างแล้ว แก้ไขมูลค่าและงวดงานได้เลย');
        this.reload();
      },
      error: (e) => this.notify.error(e),
    });
  }
}
