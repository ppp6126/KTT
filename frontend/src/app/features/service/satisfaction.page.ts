import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, todayIso } from '../../core/util/format';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { SurveyDialog } from './service-dialogs';
import { SURVEY_METHOD, ServiceApi, Survey, SurveySummary } from './service.api';

@Component({
  selector: 'app-satisfaction-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ความพึงพอใจลูกค้า</h1>
          <p>บันทึกจากการโทรหรือเยี่ยมลูกค้าหลังส่งมอบงานและหลังซ่อม คะแนนต่ำ (1–2) แจ้งผู้บริหารทันที</p>
        </div>
        <div class="actions">
          <mat-button-toggle-group [ngModel]="range()" (ngModelChange)="range.set($event); load()" hideSingleSelectionIndicator aria-label="ช่วงเวลา">
            <mat-button-toggle value="12m">12 เดือน</mat-button-toggle>
            <mat-button-toggle value="ytd">ปีนี้</mat-button-toggle>
            <mat-button-toggle value="all">ทั้งหมด</mat-button-toggle>
          </mat-button-toggle-group>
          @if (canWrite) {
            <button mat-flat-button class="btn-primary" (click)="add()"><mat-icon>add</mat-icon> บันทึกผลสอบถาม</button>
          }
        </div>
      </div>

      @if (sum(); as s) {
        <div class="kpis">
          <div class="kpi"><span class="label">คะแนนโดยรวมเฉลี่ย</span><strong>{{ s.overall === null ? '–' : s.overall + ' / 5' }}</strong><span class="sub">จาก {{ s.count }} ครั้ง</span></div>
          <div class="kpi"><span class="label">จะแนะนำต่อ</span><strong>{{ s.recommendPct === null ? '–' : s.recommendPct + '%' }}</strong></div>
        </div>

        <div class="two">
          <section class="panel panel-pad">
            <h2>คะแนนรายด้าน</h2>
            <div class="bars" role="list">
              @for (a of aspects(); track a.label) {
                <div class="bar-row" role="listitem">
                  <span class="lbl">{{ a.label }}</span>
                  <span class="track"><span class="fill" [style.width.%]="a.value === null ? 0 : (a.value / 5) * 100"></span></span>
                  <span class="val">{{ a.value === null ? '–' : a.value }}</span>
                </div>
              }
            </div>
            <p class="muted small">เต็ม 5 คะแนน ไม่นับข้อที่ลูกค้าไม่ได้ตอบ</p>
          </section>
          <section class="panel">
            <div class="sec-head"><h2>ตามผู้จัดการโครงการ</h2></div>
            <table class="grid compact">
              <thead><tr><th>PM</th><th class="num">ครั้ง</th><th class="num">เฉลี่ย</th></tr></thead>
              <tbody>
                @for (m of s.byManager; track m.managerId) {
                  <tr><td>{{ m.name }}</td><td class="num">{{ m.count }}</td><td class="num">{{ m.overall }}</td></tr>
                } @empty {
                  <tr><td colspan="3" class="empty muted">ยังไม่มีข้อมูล</td></tr>
                }
              </tbody>
            </table>
          </section>
        </div>

        <section class="panel">
          <div class="sec-head"><h2>ตามโครงการ</h2><span class="muted small">เรียงจากคะแนนต่ำสุด</span></div>
          <div class="scroll">
            <table class="grid">
              <thead><tr><th>โครงการ</th><th class="num">ครั้ง</th><th class="num">เฉลี่ย</th></tr></thead>
              <tbody>
                @for (p of s.byProject; track p.projectId) {
                  <tr>
                    <td><a [routerLink]="['/projects', p.projectId]" class="no">{{ p.code }}</a> {{ p.name }}</td>
                    <td class="num">{{ p.count }}</td>
                    <td class="num" [class.bad]="(p.overall ?? 5) < 3">{{ p.overall }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="empty muted">ยังไม่มีข้อมูล</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="panel">
        <div class="sec-head"><h2>ผลสอบถามล่าสุด</h2></div>
        <div class="scroll">
          <table class="grid">
            <thead><tr><th>วันที่</th><th>ลูกค้า</th><th>โครงการ / งานซ่อม</th><th>วิธี</th><th class="num">คุณภาพ</th><th class="num">เวลา</th><th class="num">สื่อสาร</th><th class="num">สะอาด</th><th class="num">โดยรวม</th><th>แนะนำ</th><th>ความเห็น</th><th></th></tr></thead>
            <tbody>
              @for (r of list(); track r.id) {
                <tr>
                  <td class="small">{{ r.surveyDate | thDate }}</td>
                  <td>{{ r.customerName }}<div class="small muted">{{ r.respondent }}</div></td>
                  <td class="small">
                    {{ r.projectCode || '–' }}
                    @if (r.ticketId) {
                      <div><a [routerLink]="['/service/tickets', r.ticketId]">{{ r.ticketNo }}</a></div>
                    }
                  </td>
                  <td class="small">{{ method[r.method] }}</td>
                  <td class="num">{{ r.quality ?? '–' }}</td>
                  <td class="num">{{ r.timeliness ?? '–' }}</td>
                  <td class="num">{{ r.communication ?? '–' }}</td>
                  <td class="num">{{ r.cleanliness ?? '–' }}</td>
                  <td class="num"><b [class.bad]="r.overall <= 2">{{ r.overall }}</b></td>
                  <td class="small">{{ r.recommend === null ? '–' : r.recommend ? 'แนะนำ' : 'ไม่แนะนำ' }}</td>
                  <td class="small comment">{{ r.comment }}</td>
                  <td>
                    @if (canWrite) {
                      <button mat-icon-button (click)="remove(r)" aria-label="ลบ"><mat-icon>delete</mat-icon></button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="12" class="empty muted">ยังไม่มีผลสอบถาม</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .kpi .sub { color: var(--ktt-steel); font-size: 0.78rem; }
    .two { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 960px) { .two { grid-template-columns: 1fr; } }
    .two .panel { margin: 0; }
    .grid.compact { min-width: 0; }
    h2 { margin: 0 0 10px; }
    .bar-row { display: grid; grid-template-columns: 150px 1fr 40px; gap: 10px; align-items: center; padding: 6px 0; }
    .track { height: 10px; background: #eef0ef; border-radius: 4px; overflow: hidden; }
    .fill { display: block; height: 100%; background: #2a78d6; border-radius: 0 4px 4px 0; }
    .val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .comment { max-width: 320px; }
  `,
})
export class SatisfactionPage implements OnInit {
  private readonly api = inject(ServiceApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly canWrite = inject(AuthService).can(Perm.SERVICE_WRITE);
  readonly method = SURVEY_METHOD;
  readonly range = signal<'12m' | 'ytd' | 'all'>('12m');
  readonly sum = signal<SurveySummary | null>(null);
  readonly list = signal<Survey[]>([]);
  readonly aspects = computed(() => {
    const s = this.sum();
    if (!s) return [];
    return [
      { label: 'คุณภาพงาน', value: s.quality },
      { label: 'ตรงต่อเวลา', value: s.timeliness },
      { label: 'การสื่อสาร', value: s.communication },
      { label: 'ความสะอาดเรียบร้อย', value: s.cleanliness },
      { label: 'โดยรวม', value: s.overall },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  private from(): string {
    const t = todayIso();
    if (this.range() === 'ytd') return t.slice(0, 4) + '-01-01';
    if (this.range() === 'all') return '2000-01-01';
    const d = new Date(t + 'T00:00:00');
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  load(): void {
    const from = this.from();
    const to = todayIso();
    this.api.summary(from, to).subscribe({ next: (s) => this.sum.set(s), error: (e) => this.notify.error(e) });
    this.api.surveys({ from, to }).subscribe((l) => this.list.set(l));
  }

  add(): void {
    this.dialog
      .open(SurveyDialog, { data: null, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }

  remove(r: Survey): void {
    confirmAction(this.dialog, { title: 'ลบผลสอบถาม', message: `ลบผลสอบถามของ ${r.customerName} วันที่ ${r.surveyDate}?`, confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.removeSurvey(r.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }),
    );
  }
}
