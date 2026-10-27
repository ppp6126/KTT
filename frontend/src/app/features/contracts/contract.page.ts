import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { DOC_STATUS, DOC_TYPE, FinanceApi, SalesDocRow } from '../finance/finance.api';
import { MilestoneEditor, ContractEditDialog } from './contract-dialogs';
import { CONTRACT_STATUS, Contract, ContractsApi, MILESTONE_STATUS, Milestone, VO_STATUS } from './contracts.api';

/**
 * หน้าสัญญา: สรุปการเงิน งวดงาน (ส่งมอบ → วางบิล → รับเงิน) งานเพิ่ม-ลด และเอกสารการเงินของสัญญา
 * ใช้ได้ทั้งเป็นหน้าเต็ม (/contracts/:id) และฝังในแท็บของโครงการ (embedded)
 */
@Component({
  selector: 'app-contract-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatSelectModule, MatCheckboxModule, MatTooltipModule, MoneyPipe, ThDatePipe, MilestoneEditor],
  template: `
    @if (c(); as c) {
      <div [class.page]="!embedded()">
        @if (!embedded()) {
          <a [routerLink]="['/projects', c.projectId]" class="back"><mat-icon>arrow_back</mat-icon> {{ c.projectCode }} {{ c.projectName }}</a>
        }
        <div class="page-head">
          <div>
            <h1 [class.h2]="embedded()">
              สัญญา {{ c.docNo }}
              <span class="chip" [class]="st[c.status].tone">{{ st[c.status].label }}</span>
            </h1>
            <p>
              {{ c.title }}, {{ c.customerName }}, ลงวันที่ {{ c.contractDate | thDate }}
              @if (c.quotationNo) {
                , จาก <a [routerLink]="['/quotations', c.quotationId]">{{ c.quotationNo }}</a>
              }
            </p>
          </div>
          <div class="actions">
            @if (c.canEdit) {
              <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon> แก้ไขสัญญา</button>
            }
            @if (c.status === 'draft' && c.canApprove) {
              <button mat-flat-button class="btn-primary" (click)="setStatus('active')"><mat-icon>verified</mat-icon> เปิดใช้สัญญา</button>
            }
            @if (c.canEdit) {
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                @if (c.status === 'active') {
                  <button mat-menu-item (click)="setStatus('completed')"><mat-icon>task_alt</mat-icon>ปิดสัญญา (งานเสร็จสมบูรณ์)</button>
                }
                @if (c.status === 'active' || c.status === 'draft') {
                  <button mat-menu-item (click)="terminate()"><mat-icon>block</mat-icon>ยกเลิกสัญญา</button>
                }
                @if (c.status === 'draft') {
                  <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบสัญญาฉบับร่าง</button>
                }
              </mat-menu>
            }
          </div>
        </div>

        <!-- ตัวเลขสรุป -->
        <section class="kpis">
          <div class="kpi"><span class="label">มูลค่าตามสัญญา</span><strong>{{ c.financials.amount | money }}</strong></div>
          <div class="kpi"><span class="label">งานเพิ่ม-ลด (อนุมัติ)</span><strong [class.neg]="c.financials.voApproved < 0">{{ c.financials.voApproved | money }}</strong></div>
          <div class="kpi main"><span class="label">มูลค่าปรับปรุง (ก่อน VAT)</span><strong>{{ c.financials.revisedAmount | money }}</strong><span class="muted small">รวม VAT {{ c.financials.revisedTotal | money }}</span></div>
          <div class="kpi"><span class="label">วางบิลแล้ว</span><strong>{{ c.financials.billed | money }}</strong><span class="muted small">{{ billedPct() }}% ของมูลค่า</span></div>
          <div class="kpi"><span class="label">รับชำระแล้ว</span><strong>{{ c.financials.received | money }}</strong></div>
          <div class="kpi"><span class="label">ค้างรับ</span><strong [class.warn]="c.financials.outstanding > 0">{{ c.financials.outstanding | money }}</strong></div>
          @if (c.retentionPct > 0 || c.financials.retentionHeld > 0) {
            <div class="kpi">
              <span class="label">เงินประกันผลงานที่ลูกค้ากันไว้</span>
              <strong>{{ c.financials.retentionHeld | money }}</strong>
              @if (c.financials.retentionHeld > 0 && canFinance) {
                <button mat-button class="mini" (click)="releaseRetention()">บันทึกรับคืน</button>
              }
            </div>
          }
          @if (c.advancePct > 0) {
            <div class="kpi"><span class="label">เงินล่วงหน้า {{ c.advancePct }}%</span><strong>{{ c.financials.advanceBilled | money }}</strong><span class="muted small">หักคืนแล้ว {{ c.financials.advanceDeducted | money }}</span></div>
          }
        </section>

        <section class="panel panel-pad terms">
          <div><span class="label">ระยะเวลา</span>{{ c.startDate | thDate }} – {{ c.endDate | thDate }}</div>
          <div><span class="label">VAT</span>{{ c.vatEnabled ? c.vatPct + '%' : 'ไม่คิด' }}</div>
          <div><span class="label">หัก ณ ที่จ่าย</span>{{ c.whtPct }}%</div>
          <div><span class="label">เงินประกันผลงาน</span>{{ c.retentionPct }}% ต่องวด</div>
          <div><span class="label">ค่าปรับ</span>{{ c.penaltyPerDay ? (c.penaltyPerDay | money) + ' บาท/วัน' : '–' }}</div>
          <div><span class="label">รับประกัน</span>{{ c.warrantyMonths ? c.warrantyMonths + ' เดือน' : '–' }}</div>
        </section>

        <!-- งวดงาน -->
        <section class="panel">
          <div class="sec-head">
            <h2>งวดงาน</h2>
            <span class="grow"></span>
            @if (!editingMs() && c.canEdit && c.status !== 'completed') {
              <button mat-button (click)="startEditMs()"><mat-icon>edit</mat-icon> แก้งวดงาน</button>
            }
            @if (canFinance && c.status === 'active') {
              @if (c.advancePct > 0 && c.financials.advanceBilled === 0) {
                <button mat-stroked-button (click)="invoice(true)"><mat-icon>savings</mat-icon> เรียกเงินล่วงหน้า</button>
              }
              <mat-select class="dt" [(ngModel)]="docType" aria-label="ประเภทเอกสาร">
                <mat-option value="invoice">ใบแจ้งหนี้</mat-option>
                <mat-option value="invoice_tax">ใบแจ้งหนี้/ใบกำกับภาษี</mat-option>
              </mat-select>
              <button mat-flat-button (click)="invoice(false)" [disabled]="!selected().length">
                <mat-icon>receipt_long</mat-icon> วางบิล {{ selected().length ? selected().length + ' งวด' : '' }}
              </button>
            }
          </div>
          @if (editingMs()) {
            <div class="pad">
              <app-milestone-editor [list]="msDraft" [amount]="c.amount" />
              <div class="row-end">
                <button mat-button (click)="editingMs.set(false)">ยกเลิก</button>
                <button mat-flat-button (click)="saveMs()">บันทึกงวดงาน</button>
              </div>
            </div>
          } @else {
            <div class="scroll">
              <table class="t">
                <thead>
                  <tr>
                    @if (canFinance && c.status === 'active') {
                      <th class="chk"></th>
                    }
                    <th class="num">งวด</th><th>รายการ</th><th class="num">%</th><th class="num">จำนวนเงิน</th><th>กำหนด</th><th>สถานะ</th><th>เอกสาร</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of c.milestones; track m.id) {
                    <tr>
                      @if (canFinance && c.status === 'active') {
                        <td class="chk">
                          @if (m.status === 'pending' || m.status === 'ready') {
                            <mat-checkbox [checked]="sel().has(m.id!)" (change)="toggle(m.id!)" [attr.aria-label]="'เลือก ' + m.name" />
                          }
                        </td>
                      }
                      <td class="num">{{ m.seq }}</td>
                      <td>
                        {{ m.name }}
                        @if (m.changeOrderId) {
                          <span class="chip">VO</span>
                        }
                        @if (m.criteria) {
                          <div class="muted small">{{ m.criteria }}</div>
                        }
                      </td>
                      <td class="num">{{ m.changeOrderId ? '–' : m.pct }}</td>
                      <td class="num">{{ m.amount | money }}</td>
                      <td class="small">{{ m.dueDate | thDate }}</td>
                      <td><span class="chip" [class]="ms[m.status!].tone">{{ ms[m.status!].label }}</span></td>
                      <td class="small">
                        @if (m.invoiceId) {
                          <a [routerLink]="['/finance/docs', m.invoiceId]">{{ m.invoiceNo }}</a>
                        }
                      </td>
                      <td class="act">
                        @if (c.canEdit && c.status === 'active') {
                          @if (m.status === 'pending') {
                            <button mat-button class="mini" (click)="ready(m, true)">ส่งมอบแล้ว</button>
                          } @else if (m.status === 'ready') {
                            <button mat-button class="mini" (click)="ready(m, false)">ยกเลิกส่งมอบ</button>
                          }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (Math.abs(c.financials.milestonePctTotal - 100) > 0.01) {
              <p class="warn-text pad">งวดงานรวม {{ c.financials.milestonePctTotal }}% ต้องเท่ากับ 100% ก่อนเปิดใช้สัญญา</p>
            }
          }
        </section>

        <!-- งานเพิ่ม-ลด -->
        <section class="panel">
          <div class="sec-head">
            <h2>งานเพิ่ม-ลด (VO)</h2>
            <span class="grow"></span>
            @if (c.canEdit && (c.status === 'active' || c.status === 'draft')) {
              <a mat-stroked-button [routerLink]="['/change-orders/new']" [queryParams]="{ contract: c.id }"><mat-icon>add</mat-icon> เพิ่ม VO</a>
            }
          </div>
          <div class="scroll">
            <table class="t">
              <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>วันที่</th><th class="num">มูลค่า (ก่อน VAT)</th><th class="num">ขยายเวลา</th><th>สถานะ</th></tr></thead>
              <tbody>
                @for (v of c.changeOrders; track v.id) {
                  <tr class="clickable" [routerLink]="['/change-orders', v.id]" tabindex="0">
                    <td class="no">{{ v.docNo }}</td>
                    <td>{{ v.title }}</td>
                    <td class="small">{{ v.issueDate | thDate }}</td>
                    <td class="num" [class.neg]="v.amount < 0">{{ v.amount | money }}</td>
                    <td class="num">{{ v.daysExtension ? v.daysExtension + ' วัน' : '–' }}</td>
                    <td><span class="chip" [class]="vo[v.status].tone">{{ vo[v.status].label }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="empty muted">ไม่มีงานเพิ่ม-ลด</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <!-- เอกสารการเงิน -->
        @if (canFinanceRead) {
          <section class="panel">
            <div class="sec-head"><h2>เอกสารการเงินของสัญญานี้</h2></div>
            <div class="scroll">
              <table class="t">
                <thead><tr><th>เอกสาร</th><th>เลขที่</th><th>วันที่</th><th>สถานะ</th><th class="num">ยอดรวม</th><th class="num">ค้างชำระ</th></tr></thead>
                <tbody>
                  @for (d of docs(); track d.id) {
                    <tr class="clickable" [routerLink]="['/finance/docs', d.id]" tabindex="0">
                      <td class="small">{{ dt[d.docType].short }}</td>
                      <td class="no">{{ d.docNo }}</td>
                      <td class="small">{{ d.docDate | thDate }}</td>
                      <td><span class="chip" [class]="ds[d.status].tone">{{ ds[d.status].label }}</span></td>
                      <td class="num">{{ d.totalAmount | money }}</td>
                      <td class="num" [class.late]="d.overdue">{{ d.outstanding === null ? '' : (d.outstanding | money) }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="empty muted">ยังไม่มีเอกสาร</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (c.terms) {
          <section class="panel panel-pad">
            <h2>เงื่อนไขสัญญา</h2>
            <p class="pre">{{ c.terms }}</p>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    h1 .chip { font-size: 0.8rem; vertical-align: middle; margin-left: 8px; }
    h1.h2 { font-size: 1.2rem; }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .kpi { background: var(--ktt-paper); border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-m); padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
    .kpi strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
    .kpi.main { border-color: var(--ktt-ink-2); }
    .kpi .label, .terms .label { color: var(--ktt-steel); font-size: 0.82rem; }
    .neg { color: var(--ktt-danger); }
    .warn { color: #9a4b05; }
    .terms { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 16px; margin-bottom: 14px; }
    .terms div { display: flex; flex-direction: column; }
    section.panel { margin-bottom: 14px; }
    .sec-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 8px; flex-wrap: wrap; }
    .sec-head h2 { margin: 0; }
    .grow { flex: 1; }
    .dt { width: 200px; }
    .pad { padding: 0 16px 14px; }
    .row-end { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .scroll { overflow-x: auto; }
    .t { width: 100%; border-collapse: collapse; min-width: 720px; }
    .t th, .t td { padding: 9px 10px; border-top: 1px solid var(--ktt-line); text-align: left; vertical-align: middle; }
    .t th { background: #f6f7f6; color: var(--ktt-steel); font-weight: 500; white-space: nowrap; }
    .t tr.clickable { cursor: pointer; }
    .t tr.clickable:hover td { background: #f3f6f8; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .chk { width: 40px; }
    .act { text-align: right; white-space: nowrap; }
    .mini { min-width: 0; padding: 0 8px; }
    .no { white-space: nowrap; font-weight: 600; }
    .small { font-size: 0.85rem; }
    .empty { text-align: center; padding: 24px; }
    .late { color: var(--ktt-danger); }
    .warn-text { color: #9a4b05; font-size: 0.9rem; }
    .pre { white-space: pre-line; margin: 8px 0 0; }
  `,
})
export class ContractPage implements OnInit {
  private readonly api = inject(ContractsApi);
  private readonly finance = inject(FinanceApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** route param (หน้าเต็ม) */
  readonly id = input<string>();
  /** ฝังในโครงการ: ส่ง projectId แทน */
  readonly projectId = input<string>();
  readonly embedded = input(false);

  readonly c = signal<Contract | null>(null);
  readonly docs = signal<SalesDocRow[]>([]);
  readonly sel = signal(new Set<string>());
  readonly selected = computed(() => [...this.sel()]);
  readonly editingMs = signal(false);
  readonly billedPct = computed(() => {
    const c = this.c();
    return c && c.financials.revisedAmount ? Math.round((c.financials.billed / c.financials.revisedAmount) * 1000) / 10 : 0;
  });
  msDraft: Milestone[] = [];
  docType = 'invoice';
  readonly Math = Math;
  readonly st = CONTRACT_STATUS;
  readonly ms = MILESTONE_STATUS;
  readonly vo = VO_STATUS;
  readonly dt = DOC_TYPE;
  readonly ds = DOC_STATUS;
  canFinance = false;
  canFinanceRead = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.canFinance = this.auth.can('finance.write');
    this.canFinanceRead = this.auth.can('finance.read');
    const obs = this.id() ? this.api.get(this.id()!) : this.api.byProject(this.projectId()!);
    obs.subscribe({
      next: (c) => {
        this.c.set(c);
        this.sel.set(new Set());
        if (this.canFinanceRead) {
          this.finance.list({ contractId: c.id, page: 0, size: 100 }).subscribe((r) => this.docs.set(r.items));
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  toggle(id: string): void {
    this.sel.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  edit(): void {
    this.dialog
      .open(ContractEditDialog, { data: this.c() })
      .afterClosed()
      .subscribe((c) => {
        if (c) {
          this.c.set(c);
          this.notify.ok('บันทึกสัญญาแล้ว');
        }
      });
  }

  startEditMs(): void {
    this.msDraft = this.c()!.milestones.filter((m) => !m.changeOrderId).map((m) => ({ ...m }));
    this.editingMs.set(true);
  }

  saveMs(): void {
    const body = this.msDraft.map((m) => ({ id: m.id, name: m.name.trim(), criteria: m.criteria, pct: Number(m.pct) || 0, dueDate: m.dueDate || null }));
    this.api.saveMilestones(this.c()!.id, body).subscribe({
      next: (c) => {
        this.c.set(c);
        this.editingMs.set(false);
        this.notify.ok('บันทึกงวดงานแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  ready(m: Milestone, ready: boolean): void {
    this.api.milestoneReady(this.c()!.id, m.id!, ready).subscribe({ next: (c) => this.c.set(c), error: (e) => this.notify.error(e) });
  }

  setStatus(status: string): void {
    const label = status === 'active' ? 'เปิดใช้สัญญา' : 'ปิดสัญญา';
    confirmAction(this.dialog, {
      title: label,
      message: status === 'active' ? 'เมื่อเปิดใช้แล้วจะแก้มูลค่าและเงื่อนไขการเงินไม่ได้ (ทำเป็น VO แทน)' : 'ยืนยันว่างานตามสัญญาเสร็จสมบูรณ์',
      confirmText: label,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.status(this.c()!.id, status).subscribe({ next: (c) => this.c.set(c), error: (e) => this.notify.error(e) });
    });
  }

  terminate(): void {
    prompt(this.dialog, { title: 'ยกเลิกสัญญา', label: 'เหตุผล', confirmText: 'ยกเลิกสัญญา', required: true, multiline: true }).subscribe((r) => {
      if (!r) return;
      this.api.status(this.c()!.id, 'terminated', r).subscribe({ next: (c) => this.c.set(c), error: (e) => this.notify.error(e) });
    });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบสัญญา', message: `ลบสัญญาฉบับร่าง ${this.c()!.docNo}`, confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      const pid = this.c()!.projectId;
      this.api.delete(this.c()!.id).subscribe({
        next: () => {
          this.notify.ok('ลบสัญญาแล้ว');
          if (this.embedded()) this.c.set(null);
          else this.router.navigate(['/projects', pid]);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  releaseRetention(): void {
    const held = this.c()!.financials.retentionHeld;
    prompt(this.dialog, {
      title: 'รับคืนเงินประกันผลงาน',
      message: `ลูกค้ากันไว้ ${held.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`,
      label: 'จำนวนเงินที่ได้รับคืน (บาท)',
      value: String(held),
      confirmText: 'บันทึก',
      required: true,
    }).subscribe((v) => {
      if (!v) return;
      this.api.releaseRetention(this.c()!.id, Number(v.replace(/,/g, ''))).subscribe({
        next: (c) => this.c.set(c),
        error: (e) => this.notify.error(e),
      });
    });
  }

  invoice(advance: boolean): void {
    this.finance
      .fromContract({ contractId: this.c()!.id, docType: this.docType, advance, milestoneIds: advance ? [] : this.selected() })
      .subscribe({
        next: (d) => this.router.navigate(['/finance/docs', d.id]),
        error: (e) => this.notify.error(e),
      });
  }
}
