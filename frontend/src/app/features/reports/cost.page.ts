import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { ApApi, CostRow } from '../ap/ap.api';
import { PROJECT_STATUS } from '../projects/projects.api';
import { ProjectCostView } from './project-cost';

/** สรุปต้นทุนทุกโครงการ: งบเทียบจริง และอัตรากำไรคาดการณ์ */
@Component({
  selector: 'app-cost-page',
  imports: [MatButtonModule, MatIconModule, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ต้นทุนโครงการ</h1>
          <p>ต้นทุนจริงรวมวัสดุที่เบิกใช้ ของส่งตรงหน้างาน งวดผู้รับเหมาช่วง ค่าแรง และค่าใช้จ่ายอื่นที่ลงโครงการ</p>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="label">มูลค่าสัญญารวม</span><strong>{{ sum().revenue | money }}</strong></div>
        <div class="kpi"><span class="label">งบต้นทุนรวม</span><strong>{{ sum().budget | money }}</strong></div>
        <div class="kpi"><span class="label">ต้นทุนจริงรวม</span><strong>{{ sum().actual | money }}</strong></div>
        <div class="kpi"><span class="label">ภาระผูกพันรวม</span><strong>{{ sum().committed | money }}</strong></div>
      </div>
      <div class="panel table-scroll">
        <table class="grid">
          <thead>
            <tr><th>โครงการ</th><th>สถานะ</th><th class="num">มูลค่าสัญญา</th><th class="num">งบต้นทุน</th><th class="num">ต้นทุนจริง</th><th class="num">ผูกพัน</th><th class="num">ใช้งบ</th><th class="num">ผลงาน</th><th class="num">กำไรคาดการณ์</th></tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.projectId) {
              <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
                <td><span class="no">{{ r.code }}</span> {{ r.name }}</td>
                <td class="small">{{ status[r.status]?.label ?? r.status }}</td>
                <td class="num">{{ r.revenue | money }}</td>
                <td class="num">{{ r.budget | money }}</td>
                <td class="num">{{ r.actualCost | money }}</td>
                <td class="num">{{ r.committed | money }}</td>
                <td class="num" [class.bad]="r.budgetUsedPct !== null && r.budgetUsedPct > r.progressPct + 10">{{ r.budgetUsedPct === null ? '–' : r.budgetUsedPct + '%' }}</td>
                <td class="num">{{ r.progressPct }}%</td>
                <td class="num" [class.bad]="r.marginPct !== null && r.marginPct < 0">{{ r.marginPct === null ? '–' : r.marginPct + '%' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="empty muted">ยังไม่มีโครงการ</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted small">ใช้งบเป็นสีแดงเมื่อสัดส่วนต้นทุนจริงต่องบ สูงกว่าผลงานเกิน 10 จุด</p>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
})
export class CostPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly rows = signal<CostRow[]>([]);
  readonly status = PROJECT_STATUS as Record<string, { label: string } | undefined>;
  readonly sum = computed(() =>
    this.rows().reduce(
      (s, r) => ({ revenue: s.revenue + r.revenue, budget: s.budget + r.budget, actual: s.actual + r.actualCost, committed: s.committed + r.committed }),
      { revenue: 0, budget: 0, actual: 0, committed: 0 },
    ),
  );

  ngOnInit(): void {
    this.api.costSummary().subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(r: CostRow): void {
    this.router.navigate(['/reports/cost', r.projectId]);
  }
}

@Component({
  selector: 'app-cost-detail-page',
  imports: [RouterLink, MatIconModule, ProjectCostView],
  template: `
    <div class="page wide">
      <a routerLink="/reports/cost" class="back"><mat-icon>arrow_back</mat-icon> ต้นทุนโครงการ</a>
      <div class="page-head">
        <div>
          <h1>ต้นทุน {{ name() }}</h1>
          <p><a [routerLink]="['/projects', id()]">เปิดหน้าโครงการ</a></p>
        </div>
      </div>
      <app-project-cost [projectId]="id()" />
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
})
export class CostDetailPage implements OnInit {
  private readonly api = inject(ApApi);
  readonly id = input.required<string>();
  readonly name = signal('');

  ngOnInit(): void {
    this.api.projectCost(this.id()).subscribe((c) => this.name.set(`${c.code} ${c.name}`));
  }
}
