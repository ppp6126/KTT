import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { thDateShort } from '../../core/util/format';
import { MoneyPipe, QtyPipe, bahtText } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { FinanceApi, PAY_METHOD, SalesDoc } from '../finance/finance.api';
import { CompanyHeaderStore } from './company-header';
import { PrintToolbar } from './print-toolbar';

const EN: Record<string, string> = {
  invoice: 'Invoice',
  invoice_tax: 'Invoice / Tax Invoice',
  billing_note: 'Billing Note',
  receipt: 'Receipt',
  tax_receipt: 'Receipt / Tax Invoice',
  credit_note: 'Credit Note',
};

/**
 * เอกสารการเงินทุกชนิดในแบบฟอร์มเดียวกับใบเสนอราคาของบริษัท
 * ใบกำกับภาษีมีรายการครบตามมาตรา 86/4: คำว่า "ใบกำกับภาษี", ชื่อ ที่อยู่ เลขผู้เสียภาษีของผู้ขายและผู้ซื้อ
 * (พร้อมสำนักงานใหญ่/สาขา), เลขที่, วันที่, รายการ, มูลค่า และภาษีแยกจากมูลค่า
 */
@Component({
  selector: 'app-finance-print-page',
  imports: [PrintToolbar, MoneyPipe, QtyPipe],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="(d()?.title ?? '') + ' ' + (d()?.docNo ?? '')" (printed)="onPrint()" (closed)="close()">
      <label class="copy-toggle">
        <input type="checkbox" [checked]="copy()" (change)="copy.set(!copy())" />
        พิมพ์เป็น "สำเนา"
      </label>
    </app-print-toolbar>

    @if (d(); as d) {
      @let c = store.header()?.company;
      <div class="sheet">
        @if (d.status === 'draft') {
          <div class="watermark">ร่าง</div>
        } @else if (d.status === 'void') {
          <div class="watermark">ยกเลิก</div>
        }
        <header class="top">
          <div class="logo">
            @if (store.logo()) {
              <img [src]="store.logo()" alt="โลโก้บริษัท" />
            }
          </div>
          <div class="company">
            <div class="en">{{ c?.nameEn }}</div>
            <div class="th">{{ c?.nameTh }}</div>
            <div>เลขประจำตัวผู้เสียภาษีอากร {{ c?.taxId }} {{ c?.branchNo && c?.branchNo !== '00000' ? 'สาขา ' + c?.branchNo : '(สำนักงานใหญ่)' }}</div>
            <div class="addr">{{ c?.address }}</div>
            <div>โทรศัพท์ {{ c?.phone }}</div>
          </div>
          <div class="title-box">
            <div class="tinted head">
              <div>{{ copy() ? 'สำเนา' : 'ต้นฉบับ' }}</div>
              <div class="doc-title">{{ d.title }}</div>
              <div class="doc-sub">{{ en[d.docType] }}</div>
            </div>
            <div class="kv"><span>เลขที่ /No.</span><b>{{ d.status === 'draft' ? '-' : d.docNo }}</b></div>
            <div class="kv"><span>วันที่/Date</span><b>{{ date(d.docDate) }}</b></div>
          </div>
        </header>

        <section class="party">
          <div class="left">
            <div class="kv2"><span>ชื่อลูกค้า / Customer:</span><span>{{ d.customerName }}</span></div>
            <div class="kv2"><span>ที่อยู่ / Address:</span><span class="addr">{{ d.customerAddress }}</span></div>
            <div class="kv2">
              <span>เลขประจำตัวผู้เสียภาษี / Tax ID:</span>
              <span>{{ d.customerTaxId || '-' }}{{ d.customerTaxId ? (d.customerBranchNo && d.customerBranchNo !== '00000' ? ' สาขา ' + d.customerBranchNo : ' (สำนักงานใหญ่)') : '' }}</span>
            </div>
            @if (d.projectName) {
              <div class="kv2"><span>โครงการ / Project:</span><span>{{ d.projectName }}</span></div>
            }
          </div>
          <div class="right">
            @if (d.contractNo) {
              <div class="kv3"><b>อ้างอิงสัญญาเลขที่:</b><span>{{ d.contractNo }}</span></div>
            }
            @if (d.refDoc; as r) {
              <div class="kv3"><b>อ้างอิงเอกสาร:</b><span>{{ r.docNo }}</span></div>
              <div class="kv3"><b>ลงวันที่:</b><span>{{ date(r.docDate) }}</span></div>
            }
            @if (d.dueDate) {
              <div class="kv3"><b>ครบกำหนดชำระ:</b><span>{{ date(d.dueDate) }}</span></div>
            }
            @if (isReceipt()) {
              <div class="kv3"><b>ชำระโดย:</b><span>{{ pm[d.paymentMethod ?? 'other'] }}</span></div>
              @if (d.paymentRef) {
                <div class="kv3"><b>อ้างอิงการชำระ:</b><span>{{ d.paymentRef }}</span></div>
              }
            }
          </div>
        </section>

        <table class="items">
          <thead>
            <tr class="tinted">
              <th style="width: 9%">ลำดับที่<br /><small>Item</small></th>
              <th>รายการ<br /><small>Description</small></th>
              @if (d.docType !== 'billing_note') {
                <th style="width: 11%">จำนวน<br /><small>Quantity</small></th>
                <th style="width: 9%">หน่วย<br /><small>Unit</small></th>
                <th style="width: 16%">ราคา/หน่วย<br /><small>Unit Price</small></th>
              } @else {
                <th style="width: 16%">วันที่<br /><small>Date</small></th>
                <th style="width: 16%">ครบกำหนด<br /><small>Due</small></th>
              }
              <th style="width: 16%">จำนวนเงิน<br /><small>Amount</small></th>
            </tr>
          </thead>
          <tbody>
            @if (d.docType === 'billing_note') {
              @for (l of d.billingLines; track l.id; let i = $index) {
                <tr>
                  <td class="center">{{ i + 1 }}</td>
                  <td>{{ l.docType === 'invoice_tax' ? 'ใบแจ้งหนี้/ใบกำกับภาษี' : 'ใบแจ้งหนี้' }} เลขที่ {{ l.docNo }}</td>
                  <td class="center">{{ date(l.docDate) }}</td>
                  <td></td>
                  <td class="num">{{ l.outstanding | money }}</td>
                </tr>
              }
            } @else {
              @for (it of d.items; track it.id; let i = $index) {
                <tr>
                  <td class="center">{{ i + 1 }}</td>
                  <td>{{ it.description }}</td>
                  <td class="num">{{ it.quantity | qty }}</td>
                  <td class="center">{{ it.unit }}</td>
                  <td class="num">{{ it.unitPrice | money }}</td>
                  <td class="num">{{ it.amount | money }}</td>
                </tr>
              }
            }
            @for (f of fillers(); track f) {
              <tr class="filler">
                <td></td><td></td><td></td><td></td>
                @if (d.docType !== 'billing_note') {
                  <td></td>
                }
                <td></td>
              </tr>
            }
          </tbody>
        </table>

        <section class="bottom">
          <div class="pay">
            @if (d.docType === 'credit_note') {
              <div class="pay-title"><b>เหตุผลการลดหนี้:</b></div>
              <div class="pre">{{ d.reason }}</div>
            } @else if (!isReceipt()) {
              <div class="pay-title">ชำระเงินโดยโอนเข้าบัญชี</div>
              <div class="line"><span>ธนาคาร/Bank</span><span class="dots">{{ c?.bankName }}</span><span>สาขา/Branch</span><span class="dots">{{ c?.bankBranch }}</span></div>
              <div class="line"><span>ชื่อบัญชี/Account Name</span><span class="dots wide">{{ c?.bankAccountName }}</span></div>
              <div class="line"><span>เลขที่บัญชี/Account No.</span><span class="dots wide">{{ c?.bankAccountNo }}</span></div>
            } @else {
              <div class="pay-title">ได้รับเงินถูกต้องแล้ว</div>
              <div class="line"><span>ช่องทาง</span><span class="dots wide">{{ pm[d.paymentMethod ?? 'other'] }} {{ d.paymentRef ?? '' }}</span></div>
              <div class="line"><span>วันที่รับเงิน</span><span class="dots wide">{{ date(d.paidDate) }}</span></div>
            }
          </div>
          <table class="sum">
            @if (d.docType === 'credit_note') {
              <tr><td>มูลค่าตามใบกำกับภาษีเดิม</td><td class="num">{{ d.originalAmount | money }}</td></tr>
              <tr><td>มูลค่าที่ถูกต้อง</td><td class="num">{{ d.correctAmount | money }}</td></tr>
              <tr><td>ผลต่าง</td><td class="num">{{ d.taxableAmount | money }}</td></tr>
              <tr><td>ภาษีมูลค่าเพิ่ม {{ d.vatPct }}%</td><td class="num">{{ d.vatAmount | money }}</td></tr>
              <tr class="tinted net"><td>รวมลดหนี้</td><td class="num">{{ d.totalAmount | money }}</td></tr>
            } @else if (d.docType === 'billing_note') {
              <tr class="tinted net"><td>รวมยอดวางบิล</td><td class="num">{{ d.totalAmount | money }}</td></tr>
            } @else {
              <tr><td>รวมเงิน</td><td class="num">{{ d.subtotal | money }}</td></tr>
              @if (d.discountAmount > 0) {
                <tr><td>ส่วนลด</td><td class="num">-{{ d.discountAmount | money }}</td></tr>
              }
              @if (d.advanceDeduct > 0) {
                <tr><td>หักคืนเงินล่วงหน้า</td><td class="num">-{{ d.advanceDeduct | money }}</td></tr>
              }
              @if (showVat()) {
                <tr><td>มูลค่าก่อนภาษี</td><td class="num">{{ d.taxableAmount | money }}</td></tr>
                <tr><td>ภาษีมูลค่าเพิ่ม {{ d.vatPct }}%</td><td class="num">{{ d.vatAmount | money }}</td></tr>
              }
              <tr class="tinted net"><td>{{ isReceipt() ? 'จำนวนเงินที่ตัดชำระ' : 'ยอดรวมทั้งสิ้น' }}</td><td class="num">{{ d.totalAmount | money }}</td></tr>
              @if (d.retentionAmount > 0) {
                <tr><td>หักเงินประกันผลงาน{{ d.retentionPct && !isReceipt() ? ' ' + d.retentionPct + '%' : '' }}</td><td class="num">-{{ d.retentionAmount | money }}</td></tr>
              }
              @if (d.whtAmount > 0) {
                <tr><td>หักภาษี ณ ที่จ่าย{{ d.whtPct && !isReceipt() ? ' ' + d.whtPct + '%' : '' }}</td><td class="num">-{{ d.whtAmount | money }}</td></tr>
              }
              @if (d.retentionAmount > 0 || d.whtAmount > 0) {
                <tr><td>{{ isReceipt() ? 'รับเงินสุทธิ' : 'ยอดชำระสุทธิ' }}</td><td class="num"><b>{{ d.netAmount | money }}</b></td></tr>
              }
            }
          </table>
        </section>

        <div class="words tinted">( {{ words(d.docType === 'billing_note' || d.docType === 'credit_note' ? d.totalAmount : d.netAmount) }} )</div>

        @if (d.notes) {
          <section class="terms"><b>หมายเหตุ:</b>&nbsp;<span class="pre">{{ d.notes }}</span></section>
        }

        <section class="signs">
          <div class="sign-box customer">
            <div class="space"></div>
            <div>( ........................................................ )</div>
            <div>{{ isReceipt() ? 'ผู้จ่ายเงิน' : 'ผู้รับเอกสาร' }}</div>
            <div>วันที่ ......../......../........</div>
          </div>
          <div class="sign-box">
            <div>ในนาม {{ c?.nameTh }}</div>
            <div class="space imgs">
              @if (store.logo()) {
                <img class="stamp" [src]="store.logo()" alt="" />
              }
              @if (store.signature()) {
                <img class="sig" [src]="store.signature()" alt="ลายเซ็น" />
              }
            </div>
            <div>( {{ c?.signerName }} )</div>
            <div>{{ isReceipt() ? 'ผู้รับเงิน' : 'ผู้มีอำนาจลงนาม' }}</div>
          </div>
        </section>

        <footer class="foot">{{ c?.address }}</footer>
      </div>
    }
  `,
  styleUrls: ['./print.scss', './quotation-print.page.scss'],
  styles: `.pre { white-space: pre-line; }`,
})
export class FinancePrintPage implements OnInit {
  private readonly api = inject(FinanceApi);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly d = signal<SalesDoc | null>(null);
  readonly copy = signal(false);
  readonly en = EN;
  readonly pm = PAY_METHOD;
  readonly date = thDateShort;
  readonly words = bahtText;
  readonly isReceipt = computed(() => ['receipt', 'tax_receipt'].includes(this.d()?.docType ?? ''));
  /** ใบเสร็จธรรมดา (อ้างใบกำกับภาษีเดิม) ไม่แสดง VAT ซ้ำ */
  readonly showVat = computed(() => this.d()?.docType !== 'receipt' && (this.d()?.vatAmount ?? 0) !== 0);
  readonly fillers = computed(() => {
    const d = this.d();
    const n = d?.docType === 'billing_note' ? d.billingLines.length : (d?.items.length ?? 0);
    return Array.from({ length: Math.max(0, 12 - n) }, (_, i) => i);
  });

  ngOnInit(): void {
    this.store.load();
    this.api.get(this.id()).subscribe({ next: (d) => this.d.set(d), error: (e) => this.notify.error(e) });
  }

  onPrint(): void {
    this.api.printed(this.id()).subscribe({ error: () => undefined });
  }

  close(): void {
    window.close();
    history.back();
  }
}
