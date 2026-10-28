import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDaysIso, thDateLong, thDateShort, todayIso } from '../../core/util/format';
import { FileService } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { ProgressBar } from '../projects/progress-bar';
import { ISSUE_STATUS, ProgressReport, ProjectsApi, SEVERITY, WEATHER } from '../projects/projects.api';
import { SCurve } from '../projects/s-curve';
import { CompanyHeaderStore } from './company-header';
import { PrintToolbar } from './print-toolbar';

/** รายงานความคืบหน้าโครงการสำหรับส่งลูกค้า (เลือกช่วงวันที่ได้) */
@Component({
  selector: 'app-progress-print-page',
  imports: [FormsModule, PrintToolbar, SCurve, ProgressBar],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="'รายงานความคืบหน้า ' + (r()?.project?.code ?? '')" (closed)="close()">
      <label class="range">ตั้งแต่ <input type="date" [(ngModel)]="from" (change)="load()" /></label>
      <label class="range">ถึง <input type="date" [(ngModel)]="to" (change)="load()" /></label>
      <label class="range"><input type="checkbox" [(ngModel)]="showMoney" /> แสดงข้อมูลการเงิน</label>
    </app-print-toolbar>

    @if (r(); as r) {
      @let c = store.header()?.company;
      @let p = r.project;
      <div class="sheet">
        <header class="hdr">
          <div class="logo">
            @if (store.logo()) {
              <img [src]="store.logo()" alt="โลโก้บริษัท" />
            }
          </div>
          <div>
            <div class="co">{{ c?.nameTh }}</div>
            <h1>รายงานความคืบหน้าโครงการ</h1>
            <div>ช่วงวันที่ {{ long(r.periodFrom) }} ถึง {{ long(r.periodTo) }}</div>
          </div>
        </header>

        <table class="info">
          <tr><th>โครงการ</th><td>{{ p.code }} {{ p.name }}</td><th>ผู้ว่าจ้าง</th><td>{{ p.customerName }}</td></tr>
          <tr><th>สถานที่</th><td colspan="3">{{ p.siteAddress || '-' }}</td></tr>
          <tr><th>ระยะเวลาตามแผน</th><td>{{ short(p.plannedStart) }} – {{ short(p.plannedEnd) }}</td><th>ผู้ควบคุมงาน</th><td>{{ p.managerName || '-' }}</td></tr>
          @if (showMoney && p.contract; as k) {
            <tr><th>มูลค่าสัญญา (ก่อน VAT)</th><td>{{ money(k.revisedAmount) }} บาท</td><th>วางบิลแล้ว</th><td>{{ money(k.billedAmount) }} บาท</td></tr>
          }
        </table>

        <section class="kpi">
          <div class="box">
            <div class="lbl">ความคืบหน้าจริง</div>
            <div class="big">{{ r.schedule.actualPct }}%</div>
          </div>
          <div class="box">
            <div class="lbl">ตามแผน ณ {{ short(r.schedule.asOf) }}</div>
            <div class="big">{{ r.schedule.plannedPct }}%</div>
          </div>
          <div class="box">
            <div class="lbl">{{ r.schedule.variancePct >= 0 ? 'เร็วกว่าแผน' : 'ช้ากว่าแผน' }}</div>
            <div class="big" [class.bad]="r.schedule.variancePct < 0">{{ abs(r.schedule.variancePct) }}%</div>
          </div>
          <div class="box">
            <div class="lbl">แรงงานในช่วงนี้</div>
            <div class="big">{{ r.manDays }} <small>คน-วัน</small></div>
            <div class="lbl">ฝนตก {{ r.rainDays }} วัน</div>
          </div>
        </section>

        <h2>S-Curve</h2>
        <app-s-curve [points]="r.schedule.curve" [today]="r.schedule.asOf" />

        <h2>ความคืบหน้าตามหมวดงาน</h2>
        <table class="doc">
          <thead><tr><th>หมวดงาน</th><th style="width: 14%">สัดส่วนงาน</th><th style="width: 14%">แผน</th><th style="width: 14%">จริง</th><th style="width: 26%"></th></tr></thead>
          <tbody>
            @for (cat of r.schedule.categories; track cat.taskId) {
              <tr>
                <td>{{ cat.name }}</td>
                <td class="num">{{ cat.weightPct }}%</td>
                <td class="num">{{ cat.plannedPct }}%</td>
                <td class="num">{{ cat.actualPct }}%</td>
                <td><app-progress-bar [actual]="cat.actualPct" [planned]="cat.plannedPct" /></td>
              </tr>
            }
          </tbody>
        </table>

        <h2>งานที่ดำเนินการ</h2>
        <table class="doc">
          <thead><tr><th style="width: 14%">วันที่</th><th style="width: 10%">อากาศ</th><th style="width: 8%">คนงาน</th><th>รายละเอียด</th></tr></thead>
          <tbody>
            @for (d of r.reports; track d.id) {
              <tr>
                <td>{{ short(d.reportDate) }}</td>
                <td>{{ d.weatherAm ? w[d.weatherAm].label : '' }}</td>
                <td class="num">{{ d.workersTotal }}</td>
                <td class="pre">{{ d.summary }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="center">ไม่มีรายงานในช่วงนี้</td></tr>
            }
          </tbody>
        </table>

        @if (r.nextPlan) {
          <h2>แผนงานถัดไป</h2>
          <p class="pre">{{ r.nextPlan }}</p>
        }

        @if (r.openIssues.length) {
          <h2>ปัญหาและความเสี่ยงที่ติดตามอยู่</h2>
          <table class="doc">
            <thead><tr><th>เรื่อง</th><th style="width: 14%">ระดับ</th><th style="width: 14%">สถานะ</th><th style="width: 30%">การแก้ไข</th></tr></thead>
            <tbody>
              @for (i of r.openIssues; track i.id) {
                <tr>
                  <td>{{ i.kind === 'risk' ? '(ความเสี่ยง) ' : '' }}{{ i.title }}</td>
                  <td>{{ sev[i.severity].label }}</td>
                  <td>{{ ist[i.status].label }}</td>
                  <td>{{ i.resolution || '-' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }

        @if (photos().length) {
          <h2>ภาพถ่ายหน้างาน</h2>
          <div class="photos">
            @for (ph of photos(); track ph.id) {
              <figure>
                <img [src]="ph.url" [alt]="ph.name" />
                <figcaption>{{ short(ph.date) }}</figcaption>
              </figure>
            }
          </div>
        }

        <section class="signs">
          <div>
            <div class="space"></div>
            <div>( {{ p.managerName || '........................................' }} )</div>
            <div>ผู้จัดการโครงการ</div>
          </div>
          <div>
            <div class="space"></div>
            <div>( ........................................ )</div>
            <div>ผู้ว่าจ้าง / ผู้ควบคุมงาน รับทราบ</div>
          </div>
        </section>
      </div>
    }
  `,
  styleUrls: ['./print.scss'],
  styles: `
    .range { color: #fff; font-size: 0.85rem; display: inline-flex; gap: 6px; align-items: center; }
    .range input[type='date'] { font: inherit; padding: 2px 4px; }
    .hdr { display: flex; gap: 6mm; align-items: center; border-bottom: 1pt solid #333; padding-bottom: 3mm; margin-bottom: 4mm; }
    .hdr img { width: 24mm; max-height: 22mm; object-fit: contain; }
    .co { font-weight: 600; }
    h1 { font-size: 15pt; margin: 1mm 0; }
    h2 { font-size: 11.5pt; margin: 5mm 0 2mm; break-after: avoid; }
    .info { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    .info th, .info td { border: 0.6pt solid #888; padding: 2pt 5pt; text-align: left; }
    .info th { background: #f1f1f1; width: 18%; font-weight: 600; }
    .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 4mm; }
    .box { border: 0.6pt solid #888; padding: 2mm 3mm; }
    .lbl { font-size: 8.5pt; color: #444; }
    .big { font-size: 16pt; font-weight: 700; }
    .big small { font-size: 9pt; font-weight: 400; }
    .bad { color: #b3261e; }
    .doc { font-size: 9.5pt; }
    .pre { white-space: pre-line; }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
    .photos figure { margin: 0; break-inside: avoid; }
    .photos img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border: 0.6pt solid #999; }
    .photos figcaption { font-size: 8pt; text-align: center; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; text-align: center; font-size: 9.5pt; break-inside: avoid; }
    .space { height: 16mm; }
  `,
})
export class ProgressPrintPage implements OnInit, OnDestroy {
  private readonly api = inject(ProjectsApi);
  private readonly files = inject(FileService);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly r = signal<ProgressReport | null>(null);
  readonly photos = signal<{ id: string; url: string; name: string; date: string }[]>([]);
  readonly w = WEATHER;
  readonly sev = SEVERITY;
  readonly ist = ISSUE_STATUS;
  from = addDaysIso(todayIso(), -6);
  to = todayIso();
  showMoney = false;

  ngOnInit(): void {
    this.store.load();
    this.load();
  }

  load(): void {
    this.api.progressReport(this.id(), this.from, this.to).subscribe({
      next: (r) => {
        this.r.set(r);
        this.revoke();
        this.photos.set([]);
        for (const ph of r.photos) {
          this.files.objectUrl(`/api/attachments/${ph.id}/file`).subscribe((url) =>
            this.photos.update((l) => [...l, { id: ph.id, url, name: ph.fileName, date: ph.date }]),
          );
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  short(d: string | null): string {
    return d ? thDateShort(d) : '-';
  }

  long(d: string): string {
    return thDateLong(d);
  }

  money(v: number): string {
    return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  abs(v: number): number {
    return Math.abs(Math.round(v * 100) / 100);
  }

  private revoke(): void {
    this.photos().forEach((p) => URL.revokeObjectURL(p.url));
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  close(): void {
    window.close();
    history.back();
  }
}
