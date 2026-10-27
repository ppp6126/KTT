import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { ThDatePipe, TaxIdPipe, addDaysIso, todayIso } from '../../core/util/format';
import { MoneyPipe, QtyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { CustomerPicker } from '../../shared/lookups';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { computeFinance } from './finance-calc';
import { BillingNoteDialog, CreditNoteDialog, PaymentDialog } from './finance-dialogs';
import { DOC_STATUS, DOC_TYPE, DocItem, FinanceApi, InvoiceSave, KIND, PAY_METHOD, SalesDoc } from './finance.api';

@Component({
  selector: 'app-sales-doc-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MoneyPipe, QtyPipe, ThDatePipe, TaxIdPipe, CustomerPicker],
  template: `
    @if (ready()) {
      <div class="page wide">
        <a routerLink="/finance/docs" class="back"><mat-icon>arrow_back</mat-icon> เอกสารการเงิน</a>
        <div class="page-head">
          <div>
            <h1>
              {{ title() }} {{ doc()?.docNo && !isDraft() ? doc()!.docNo : '' }}
              @if (doc(); as d) {
                <span class="chip" [class]="ds[d.status].tone">{{ ds[d.status].label }}</span>
              }
            </h1>
            @if (doc(); as d) {
              <p>
                @if (d.projectId) {
                  <a [routerLink]="['/projects', d.projectId]">{{ d.projectCode }} {{ d.projectName }}</a>
                }
                @if (d.contractNo) {
                  , สัญญา <a [routerLink]="['/contracts', d.contractId]">{{ d.contractNo }}</a>
                }
                @if (d.kind !== 'normal') {
                  , {{ kind[d.kind] }}
                }
              </p>
            }
          </div>
          <div class="actions">
            @if (doc(); as d) {
              @if (!isDraft()) {
                <a mat-stroked-button [routerLink]="['/print/finance', d.id]" target="_blank"><mat-icon>print</mat-icon> พิมพ์</a>
              }
              @if (d.canPay) {
                <button mat-flat-button class="btn-primary" (click)="pay()"><mat-icon>payments</mat-icon> รับชำระ</button>
              }
              @if (d.canIssue) {
                <button mat-flat-button class="btn-primary" (click)="issue()" [disabled]="dirty()"><mat-icon>task</mat-icon> ออกเอกสาร</button>
              }
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                @if (d.canPay) {
                  <button mat-menu-item (click)="billingNote()"><mat-icon>summarize</mat-icon>ทำใบวางบิล</button>
                }
                @if (d.canCredit) {
                  <button mat-menu-item (click)="creditNote()"><mat-icon>remove_circle_outline</mat-icon>ออกใบลดหนี้</button>
                }
                @if (d.canVoid) {
                  <button mat-menu-item (click)="voidDoc()"><mat-icon>block</mat-icon>ยกเลิกเอกสาร</button>
                }
                @if (isDraft()) {
                  <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบฉบับร่าง</button>
                }
              </mat-menu>
            }
          </div>
        </div>

        @if (doc()?.status === 'void') {
          <p class="notice danger pre">{{ doc()!.reason }}</p>
        }

        @if (editable()) {
          <!-- ===================================== แก้ไขใบแจ้งหนี้ (ร่าง) -->
          <section class="panel panel-pad">
            <div class="form-grid">
              <mat-form-field>
                <mat-label>ประเภทเอกสาร</mat-label>
                <mat-select [(ngModel)]="m.docType" (selectionChange)="touch()">
                  <mat-option value="invoice">ใบแจ้งหนี้</mat-option>
                  <mat-option value="invoice_tax">ใบแจ้งหนี้/ใบกำกับภาษี</mat-option>
                </mat-select>
                <mat-hint>งานบริการ: ภาษีขายเกิดเมื่อรับเงิน ใช้ "ใบแจ้งหนี้" แล้วออกใบเสร็จ/ใบกำกับตอนรับชำระ</mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>วันที่</mat-label>
                <input matInput type="date" [(ngModel)]="m.docDate" (ngModelChange)="touch()" />
              </mat-form-field>
              <mat-form-field>
                <mat-label>ครบกำหนดชำระ</mat-label>
                <input matInput type="date" [(ngModel)]="m.dueDate" (ngModelChange)="touch()" />
              </mat-form-field>
            </div>
            @if (!doc()) {
              <app-customer-picker label="ลูกค้า *" [required]="true" [customerId]="m.customerId" (customerIdChange)="m.customerId = $event; touch()" />
            } @else {
              <div class="form-grid">
                <mat-form-field class="span-2">
                  <mat-label>ชื่อลูกค้าบนเอกสาร</mat-label>
                  <input matInput [(ngModel)]="m.customerName" (ngModelChange)="touch()" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>เลขผู้เสียภาษี</mat-label>
                  <input matInput maxlength="13" [(ngModel)]="m.customerTaxId" (ngModelChange)="touch()" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>สาขา</mat-label>
                  <input matInput maxlength="5" [(ngModel)]="m.customerBranchNo" (ngModelChange)="touch()" placeholder="00000" />
                </mat-form-field>
                <mat-form-field class="span-all">
                  <mat-label>ที่อยู่</mat-label>
                  <textarea matInput rows="2" [(ngModel)]="m.customerAddress" (ngModelChange)="touch()"></textarea>
                </mat-form-field>
              </div>
            }
          </section>

          <section class="panel">
            <div class="scroll">
              <table class="items">
                <thead><tr><th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคา/หน่วย</th><th class="c-money num">จำนวนเงิน</th><th class="c-act"></th></tr></thead>
                <tbody>
                  @for (it of m.items; track $index; let i = $index) {
                    <tr>
                      <td class="c-no">{{ i + 1 }}</td>
                      <td>
                        <input [(ngModel)]="it.description" (ngModelChange)="touch()" aria-label="รายการ" />
                        @if (it.milestoneId) {
                          <span class="chip tiny">งวดงาน</span>
                        }
                      </td>
                      <td><input type="number" min="0" step="any" [(ngModel)]="it.quantity" (ngModelChange)="touch()" aria-label="จำนวน" /></td>
                      <td><input [(ngModel)]="it.unit" (ngModelChange)="touch()" aria-label="หน่วย" /></td>
                      <td><input type="number" step="any" [(ngModel)]="it.unitPrice" (ngModelChange)="touch()" aria-label="ราคาต่อหน่วย" /></td>
                      <td class="num">{{ calc().lineAmounts[i] | money }}</td>
                      <td class="c-act"><button mat-icon-button (click)="m.items.splice(i, 1); touch()" aria-label="ลบแถว"><mat-icon>close</mat-icon></button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="add"><button mat-button (click)="m.items.push({ description: '', quantity: 1, unit: 'งาน', unitPrice: 0, milestoneId: null }); touch()"><mat-icon>add</mat-icon> เพิ่มรายการ</button></div>
          </section>

          <section class="bottom">
            <div class="panel panel-pad">
              <div class="form-grid tight">
                <mat-form-field>
                  <mat-label>ส่วนลด (บาท)</mat-label>
                  <input matInput type="number" min="0" [(ngModel)]="m.discountAmount" (ngModelChange)="touch()" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>หักคืนเงินล่วงหน้า (บาท)</mat-label>
                  <input matInput type="number" min="0" [(ngModel)]="m.advanceDeduct" (ngModelChange)="touch()" />
                </mat-form-field>
                <div class="chk"><mat-checkbox [(ngModel)]="m.vatEnabled" (ngModelChange)="touch()">VAT {{ m.vatPct }}%</mat-checkbox></div>
                <mat-form-field>
                  <mat-label>เงินประกันผลงาน %</mat-label>
                  <input matInput type="number" min="0" max="100" [(ngModel)]="m.retentionPct" (ngModelChange)="touch()" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>ลูกค้าหัก ณ ที่จ่าย</mat-label>
                  <mat-select [(ngModel)]="m.whtPct" (selectionChange)="touch()">
                    @for (w of [0, 1, 2, 3, 5]; track w) {
                      <mat-option [value]="w">{{ w }}%</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field class="span-all">
                  <mat-label>หมายเหตุบนเอกสาร</mat-label>
                  <textarea matInput rows="2" [(ngModel)]="m.notes" (ngModelChange)="touch()"></textarea>
                </mat-form-field>
              </div>
            </div>
            <div class="panel panel-pad totals">
              <dl>
                <div><dt>รวมเงิน</dt><dd>{{ calc().subtotal | money }}</dd></div>
                @if (calc().discountAmount) {
                  <div><dt>ส่วนลด</dt><dd>-{{ calc().discountAmount | money }}</dd></div>
                }
                @if (calc().advanceDeduct) {
                  <div><dt>หักคืนเงินล่วงหน้า</dt><dd>-{{ calc().advanceDeduct | money }}</dd></div>
                }
                <div><dt>มูลค่าก่อนภาษี</dt><dd>{{ calc().taxable | money }}</dd></div>
                <div><dt>VAT {{ m.vatEnabled ? m.vatPct : 0 }}%</dt><dd>{{ calc().vatAmount | money }}</dd></div>
                <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>{{ calc().total | money }}</dd></div>
                @if (calc().retentionAmount) {
                  <div><dt>หักเงินประกันผลงาน {{ m.retentionPct }}%</dt><dd>-{{ calc().retentionAmount | money }}</dd></div>
                }
                @if (calc().whtAmount) {
                  <div><dt>หัก ณ ที่จ่าย {{ m.whtPct }}%</dt><dd>-{{ calc().whtAmount | money }}</dd></div>
                }
                <div class="grand net"><dt>ยอดชำระสุทธิ</dt><dd>{{ calc().net | money }}</dd></div>
              </dl>
              <button mat-flat-button class="full" (click)="save()" [disabled]="busy() || !dirty()">บันทึกร่าง</button>
            </div>
          </section>
        } @else if (doc(); as d) {
          <!-- ===================================== มุมมองเอกสารที่ออกแล้ว -->
          <section class="panel panel-pad facts">
            <div><span class="label">ลูกค้า</span>{{ d.customerName }}</div>
            <div><span class="label">เลขผู้เสียภาษี</span>{{ d.customerTaxId | taxId }} {{ d.customerBranchNo ? '(' + (d.customerBranchNo === '00000' ? 'สำนักงานใหญ่' : 'สาขา ' + d.customerBranchNo) + ')' : '' }}</div>
            <div><span class="label">วันที่</span>{{ d.docDate | thDate }}</div>
            @if (d.dueDate) {
              <div><span class="label">ครบกำหนด</span>{{ d.dueDate | thDate }}</div>
            }
            @if (d.paidDate && d.docType !== 'invoice' && d.docType !== 'invoice_tax') {
              <div><span class="label">รับชำระโดย</span>{{ pm[d.paymentMethod ?? 'other'] }} {{ d.paymentRef ?? '' }}</div>
            }
            @if (d.refDoc; as r) {
              <div><span class="label">อ้างอิง</span><a [routerLink]="['/finance/docs', r.id]">{{ dt[r.docType].short }} {{ r.docNo }}</a></div>
            }
            <div class="wide"><span class="label">ที่อยู่</span>{{ d.customerAddress || '–' }}</div>
          </section>

          <section class="panel">
            <div class="scroll">
              <table class="items view">
                <thead><tr><th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคา/หน่วย</th><th class="c-money num">จำนวนเงิน</th></tr></thead>
                <tbody>
                  @for (it of d.items; track it.id; let i = $index) {
                    <tr>
                      <td class="c-no">{{ i + 1 }}</td>
                      <td>{{ it.description }}</td>
                      <td class="num">{{ it.quantity | qty }}</td>
                      <td>{{ it.unit }}</td>
                      <td class="num">{{ it.unitPrice | money }}</td>
                      <td class="num">{{ it.amount | money }}</td>
                    </tr>
                  }
                  @for (l of d.billingLines; track l.id) {
                    @if (d.docType === 'billing_note') {
                      <tr>
                        <td class="c-no">{{ $index + 1 }}</td>
                        <td><a [routerLink]="['/finance/docs', l.id]">{{ dt[l.docType].short }} {{ l.docNo }}</a> ลงวันที่ {{ l.docDate | thDate }}</td>
                        <td></td><td></td><td></td>
                        <td class="num">{{ l.outstanding | money }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <div class="view-totals">
              <dl>
                @if (d.docType === 'credit_note') {
                  <div><dt>มูลค่าตามใบกำกับเดิม</dt><dd>{{ d.originalAmount | money }}</dd></div>
                  <div><dt>มูลค่าที่ถูกต้อง</dt><dd>{{ d.correctAmount | money }}</dd></div>
                  <div><dt>ผลต่าง</dt><dd>{{ d.taxableAmount | money }}</dd></div>
                  <div><dt>VAT {{ d.vatPct }}%</dt><dd>{{ d.vatAmount | money }}</dd></div>
                  <div class="grand"><dt>รวมลดหนี้</dt><dd>{{ d.totalAmount | money }}</dd></div>
                } @else if (d.docType === 'billing_note') {
                  <div class="grand"><dt>รวมยอดวางบิล</dt><dd>{{ d.totalAmount | money }}</dd></div>
                } @else {
                  <div><dt>รวมเงิน</dt><dd>{{ d.subtotal | money }}</dd></div>
                  @if (d.discountAmount) {
                    <div><dt>ส่วนลด</dt><dd>-{{ d.discountAmount | money }}</dd></div>
                  }
                  @if (d.advanceDeduct) {
                    <div><dt>หักคืนเงินล่วงหน้า</dt><dd>-{{ d.advanceDeduct | money }}</dd></div>
                  }
                  <div><dt>มูลค่าก่อนภาษี</dt><dd>{{ d.taxableAmount | money }}</dd></div>
                  @if (d.docType !== 'receipt') {
                    <div><dt>VAT {{ d.vatPct }}%</dt><dd>{{ d.vatAmount | money }}</dd></div>
                  }
                  <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>{{ d.totalAmount | money }}</dd></div>
                  @if (d.retentionAmount) {
                    <div><dt>เงินประกันผลงาน</dt><dd>-{{ d.retentionAmount | money }}</dd></div>
                  }
                  @if (d.whtAmount) {
                    <div><dt>ภาษีหัก ณ ที่จ่าย</dt><dd>-{{ d.whtAmount | money }}</dd></div>
                  }
                  <div class="grand net"><dt>{{ d.docType === 'receipt' || d.docType === 'tax_receipt' ? 'รับเงินสุทธิ' : 'ยอดชำระสุทธิ' }}</dt><dd>{{ d.netAmount | money }}</dd></div>
                  @if (d.outstanding !== null) {
                    <div><dt>ชำระแล้ว</dt><dd>{{ d.settledAmount | money }}</dd></div>
                    <div class="grand"><dt>ค้างชำระ</dt><dd [class.bad]="d.outstanding > 0">{{ d.outstanding | money }}</dd></div>
                  }
                }
              </dl>
            </div>
          </section>

          @if (d.notes || d.reason) {
            <section class="panel panel-pad">
              @if (d.notes) {
                <p class="pre"><span class="label">หมายเหตุ</span><br />{{ d.notes }}</p>
              }
              @if (d.reason && d.docType === 'credit_note') {
                <p class="pre"><span class="label">เหตุผลการลดหนี้</span><br />{{ d.reason }}</p>
              }
            </section>
          }

          @if (d.related.length || (d.billingLines.length && d.docType !== 'billing_note')) {
            <section class="panel panel-pad">
              <h2>เอกสารที่เกี่ยวข้อง</h2>
              <ul class="links">
                @for (r of d.related; track r.id) {
                  <li>
                    <a [routerLink]="['/finance/docs', r.id]">{{ dt[r.docType].label }} {{ r.docNo }}</a>
                    <span class="muted">{{ r.docDate | thDate }}</span>
                    <span class="chip" [class]="ds[r.status].tone">{{ ds[r.status].label }}</span>
                    <span class="num">{{ r.totalAmount | money }}</span>
                  </li>
                }
                @if (d.docType !== 'billing_note') {
                  @for (r of d.billingLines; track r.id) {
                    <li>
                      <a [routerLink]="['/finance/docs', r.id]">{{ dt[r.docType].label }} {{ r.docNo }}</a>
                      <span class="muted">{{ r.docDate | thDate }}</span>
                    </li>
                  }
                }
              </ul>
            </section>
          }
          <p class="muted small">สร้างโดย {{ d.createdByName }} {{ d.issuedAt ? ', ออกเอกสาร ' : '' }}{{ d.issuedAt | thDate: true }}</p>
        }
      </div>
    }
  `,
  styles: `
    .wide { max-width: 1200px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    h1 .chip { font-size: 0.8rem; vertical-align: middle; margin-left: 8px; }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .notice { padding: 10px 14px; border-left: 3px solid; border-radius: 4px; margin-bottom: 14px; }
    .notice.danger { border-color: var(--ktt-danger); background: #fbe9e7; }
    .pre { white-space: pre-line; }
    section.panel { margin-bottom: 14px; }
    .scroll { overflow-x: auto; }
    .items { width: 100%; min-width: 720px; border-collapse: collapse; }
    .items th { background: #f1f3f2; color: var(--ktt-steel); font-weight: 500; text-align: left; padding: 8px 6px; }
    .items td { padding: 2px 6px; border-bottom: 1px solid #eceeed; height: 38px; }
    .items.view td { padding: 8px 6px; }
    .items input { width: 100%; height: 32px; padding: 0 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; font: inherit; box-sizing: border-box; }
    .items input:hover { border-color: var(--ktt-line); }
    .items input:focus { outline: none; border-color: var(--ktt-ink-2); background: #fff; }
    .items input[type='number'] { text-align: right; }
    .chip.tiny { font-size: 0.72rem; padding: 0 6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .c-no { width: 40px; text-align: center; color: var(--ktt-steel); }
    .c-qty { width: 84px; }
    .c-unit { width: 80px; }
    .c-money { width: 130px; }
    .c-act { width: 44px; }
    .add { padding: 8px 10px; }
    .bottom { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
    @media (max-width: 960px) { .bottom { grid-template-columns: 1fr; } }
    .form-grid.tight { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .chk { display: flex; align-items: center; min-height: 56px; }
    dl { margin: 0; }
    dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }
    dt { color: var(--ktt-steel); }
    dd { margin: 0; font-variant-numeric: tabular-nums; }
    .grand { border-top: 1px solid var(--ktt-line); font-weight: 600; padding-top: 6px; margin-top: 2px; }
    .grand dt { color: var(--ktt-ink); }
    .net { font-size: 1.1rem; }
    .full { width: 100%; margin-top: 12px; }
    .view-totals { display: flex; justify-content: flex-end; padding: 12px 16px; }
    .view-totals dl { min-width: 320px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 20px; }
    .facts div { display: flex; flex-direction: column; }
    .facts .wide { grid-column: 1 / -1; }
    .label { color: var(--ktt-steel); font-size: 0.82rem; }
    .bad { color: var(--ktt-danger); }
    .links { list-style: none; padding: 0; margin: 0; }
    .links li { display: flex; gap: 12px; align-items: center; padding: 6px 0; border-top: 1px solid var(--ktt-line); flex-wrap: wrap; }
    .links li:first-child { border-top: none; }
    .links .num { margin-left: auto; }
    .small { font-size: 0.85rem; }
    h2 { margin: 0 0 8px; }
  `,
})
export class SalesDocPage implements OnInit {
  private readonly api = inject(FinanceApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly id = input<string>();
  /** ?customer= สำหรับใบแจ้งหนี้ใหม่ */
  readonly customer = input<string>();
  readonly project = input<string>();

  readonly doc = signal<SalesDoc | null>(null);
  readonly ready = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly ds = DOC_STATUS;
  readonly dt = DOC_TYPE;
  readonly kind = KIND;
  readonly pm = PAY_METHOD;

  m: InvoiceSave & { customerId: string | null } = {
    docType: 'invoice',
    customerId: null,
    contractId: null,
    projectId: null,
    kind: 'normal',
    docDate: todayIso(),
    dueDate: addDaysIso(todayIso(), 30),
    customerName: null,
    customerAddress: null,
    customerTaxId: null,
    customerBranchNo: null,
    discountAmount: 0,
    advanceDeduct: 0,
    vatEnabled: true,
    vatPct: 7,
    retentionPct: 0,
    whtPct: 0,
    notes: null,
    items: [{ description: '', quantity: 1, unit: 'งาน', unitPrice: 0, milestoneId: null }],
  };

  readonly isDraft = computed(() => this.doc()?.status === 'draft');
  readonly editable = computed(() => (this.doc() ? this.doc()!.canEdit : true));
  readonly title = computed(() => (this.doc() ? DOC_TYPE[this.doc()!.docType].label : 'ใบแจ้งหนี้ใหม่') + (this.isDraft() ? ' (ร่าง)' : ''));
  readonly calc = computed(() => {
    this.version();
    return computeFinance({
      lines: this.m.items.map((i) => ({ quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0 })),
      discountAmount: Number(this.m.discountAmount) || 0,
      advanceDeduct: Number(this.m.advanceDeduct) || 0,
      vatEnabled: this.m.vatEnabled,
      vatPct: Number(this.m.vatPct) || 0,
      retentionPct: Number(this.m.retentionPct) || 0,
      whtPct: Number(this.m.whtPct) || 0,
    });
  });

  ngOnInit(): void {
    if (this.id() && this.id() !== 'new') {
      this.load(this.id()!);
    } else {
      this.m.customerId = this.customer() ?? null;
      this.m.projectId = this.project() ?? null;
      this.ready.set(true);
    }
  }

  private load(id: string): void {
    this.api.get(id).subscribe({ next: (d) => this.apply(d), error: (e) => this.notify.error(e) });
  }

  private apply(d: SalesDoc): void {
    this.doc.set(d);
    if (d.canEdit) {
      this.m = {
        docType: d.docType as 'invoice' | 'invoice_tax',
        customerId: d.customerId,
        contractId: d.contractId,
        projectId: d.projectId,
        kind: d.kind,
        docDate: d.docDate,
        dueDate: d.dueDate,
        customerName: d.customerName,
        customerAddress: d.customerAddress,
        customerTaxId: d.customerTaxId,
        customerBranchNo: d.customerBranchNo,
        discountAmount: d.discountAmount,
        advanceDeduct: d.advanceDeduct,
        vatEnabled: d.vatEnabled,
        vatPct: d.vatEnabled ? d.vatPct : 7,
        retentionPct: d.retentionPct,
        whtPct: Number(d.whtPct),
        notes: d.notes,
        items: d.items.map((i) => ({ ...i })),
      };
    }
    this.dirty.set(false);
    this.version.update((v) => v + 1);
    this.ready.set(true);
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  save(): void {
    const items: DocItem[] = this.m.items
      .filter((i) => i.description.trim())
      .map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 0, unit: i.unit || null, unitPrice: Number(i.unitPrice) || 0, milestoneId: i.milestoneId }));
    if (!items.length) {
      this.notify.error(null, 'ต้องมีอย่างน้อย 1 รายการ');
      return;
    }
    if (!this.doc() && !this.m.customerId && !this.m.projectId) {
      this.notify.error(null, 'กรุณาเลือกลูกค้า');
      return;
    }
    const body: InvoiceSave = {
      ...this.m,
      dueDate: this.m.dueDate || null,
      discountAmount: Number(this.m.discountAmount) || 0,
      advanceDeduct: Number(this.m.advanceDeduct) || 0,
      vatPct: Number(this.m.vatPct) || 0,
      retentionPct: Number(this.m.retentionPct) || 0,
      notes: this.m.notes || null,
      items,
    };
    this.busy.set(true);
    const d = this.doc();
    (d ? this.api.updateInvoice(d.id, body) : this.api.createInvoice(body)).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!d) this.router.navigate(['/finance/docs', r.id], { replaceUrl: true });
        this.apply(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  issue(): void {
    const d = this.doc()!;
    confirmAction(this.dialog, {
      title: 'ออกเอกสาร',
      message: `ออก${DOC_TYPE[d.docType].label} ยอด ${d.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท เมื่อออกแล้วแก้ไขไม่ได้ (ต้องยกเลิกแล้วออกใหม่)`,
      confirmText: 'ออกเอกสาร',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.issue(d.id).subscribe({
        next: (r) => {
          this.apply(r);
          this.notify.ok(`ออกเอกสารเลขที่ ${r.docNo} แล้ว`);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  pay(): void {
    this.dialog
      .open(PaymentDialog, { data: this.doc() })
      .afterClosed()
      .subscribe((r: SalesDoc | undefined) => {
        if (!r) return;
        this.notify.ok(`ออก${DOC_TYPE[r.docType].label} ${r.docNo} แล้ว`);
        this.load(this.doc()!.id);
      });
  }

  billingNote(): void {
    const d = this.doc()!;
    this.dialog
      .open(BillingNoteDialog, { data: { customerId: d.customerId, invoiceIds: [d.id] }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.router.navigate(['/finance/docs', r.id]));
  }

  creditNote(): void {
    this.dialog
      .open(CreditNoteDialog, { data: this.doc() })
      .afterClosed()
      .subscribe((r) => r && this.router.navigate(['/finance/docs', r.id]));
  }

  voidDoc(): void {
    prompt(this.dialog, {
      title: 'ยกเลิกเอกสาร',
      message: 'เอกสารยังอยู่ในระบบพร้อมเลขที่เดิมและสถานะ "ยกเลิก" (ต้องเก็บต้นฉบับทุกฉบับไว้ตรวจสอบ)',
      label: 'เหตุผล',
      confirmText: 'ยกเลิกเอกสาร',
      required: true,
      multiline: true,
    }).subscribe((reason) => {
      if (!reason) return;
      this.api.void(this.doc()!.id, reason).subscribe({ next: (r) => this.apply(r), error: (e) => this.notify.error(e) });
    });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบฉบับร่าง', message: 'ลบเอกสารฉบับร่างนี้', confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(this.doc()!.id).subscribe({
        next: () => this.router.navigate(['/finance/docs']),
        error: (e) => this.notify.error(e),
      });
    });
  }
}
