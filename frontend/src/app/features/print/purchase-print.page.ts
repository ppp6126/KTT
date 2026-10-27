import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { TaxIdPipe, thDateShort } from '../../core/util/format';
import { MoneyPipe, QtyPipe, bahtText } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { PAY_METHOD } from '../ap/ap-list.page';
import { ApApi, COST_CATEGORY, Pv } from '../ap/ap.api';
import { Po, PurchaseApi } from '../purchase/purchase.api';
import { CompanyHeaderStore } from './company-header';
import { PrintToolbar } from './print-toolbar';

function closeWindow(): void {
  window.close();
  history.back();
}

/** ใบสั่งซื้อ (Purchase Order) ส่งให้ผู้ขาย */
@Component({
  selector: 'app-po-print-page',
  imports: [PrintToolbar, MoneyPipe, QtyPipe, TaxIdPipe],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="p()?.docNo ?? 'PO'" (closed)="close()" />
    @if (p(); as p) {
      @let c = store.header()?.company;
      <div class="sheet">
        @if (p.status === 'draft' || p.status === 'pending_approval') {
          <div class="watermark">ร่าง</div>
        }
        @if (p.status === 'cancelled') {
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
            <div class="addr">{{ c?.address }}</div>
            <div>โทรศัพท์ {{ c?.phone }} เลขประจำตัวผู้เสียภาษี {{ c?.taxId }}</div>
          </div>
          <div class="title-box">
            <div class="tinted head">
              <div class="doc-title">ใบสั่งซื้อ</div>
              <div class="doc-sub">Purchase Order</div>
            </div>
            <div class="kv"><span>เลขที่ /No.</span><b>{{ p.docNo }}</b></div>
            <div class="kv"><span>วันที่/Date</span><b>{{ date(p.orderDate) }}</b></div>
          </div>
        </header>

        <section class="party">
          <div class="left">
            <div class="kv2"><span>ผู้ขาย / Vendor:</span><span>{{ p.supplierName }}</span></div>
            <div class="kv2"><span>ที่อยู่ / Address:</span><span>{{ p.supplierAddress }}</span></div>
            <div class="kv2"><span>เลขผู้เสียภาษี:</span><span>{{ p.supplierTaxId | taxId }} {{ p.supplierBranchNo && p.supplierBranchNo !== '00000' ? 'สาขา ' + p.supplierBranchNo : '' }}</span></div>
            <div class="kv2"><span>โทร / Tel:</span><span>{{ p.supplierPhone }}</span></div>
          </div>
          <div class="right">
            <div class="kv3"><b>กำหนดส่ง:</b><span>{{ p.deliveryDate ? date(p.deliveryDate) : '–' }}</span></div>
            <div class="kv3"><b>เครดิต:</b><span>{{ p.creditDays }} วัน</span></div>
            <div class="kv3"><b>โครงการ:</b><span>{{ p.projectName || p.warehouseName || '–' }}</span></div>
            <div class="kv3"><b>ส่งที่:</b><span>{{ p.deliveryAddress || p.warehouseName || '–' }}</span></div>
          </div>
        </section>

        <table class="items">
          <thead>
            <tr class="tinted">
              <th style="width: 8%">ลำดับ</th>
              <th>รายการ</th>
              <th style="width: 11%">จำนวน</th>
              <th style="width: 9%">หน่วย</th>
              <th style="width: 15%">ราคา/หน่วย</th>
              <th style="width: 16%">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            @for (it of p.items; track $index; let i = $index) {
              <tr>
                <td class="center">{{ i + 1 }}</td>
                <td>{{ it.description }}</td>
                <td class="num">{{ it.quantity | qty }}</td>
                <td class="center">{{ it.unit }}</td>
                <td class="num">{{ it.unitPrice | money }}</td>
                <td class="num">{{ it.quantity * it.unitPrice | money }}</td>
              </tr>
            }
            @for (f of fillers(); track f) {
              <tr class="filler"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            }
          </tbody>
        </table>

        <section class="bottom">
          <div class="pay">
            <div class="pay-title">เงื่อนไข</div>
            <div class="pre small-text">{{ p.paymentTerms || 'ชำระเงินภายใน ' + p.creditDays + ' วันนับจากวันที่ได้รับสินค้าและใบกำกับภาษีครบถ้วน' }}</div>
            @if (p.notes) {
              <div class="pre small-text">{{ p.notes }}</div>
            }
            <div class="small-text">กรุณาระบุเลขที่ใบสั่งซื้อนี้ในใบส่งของและใบกำกับภาษีทุกครั้ง</div>
          </div>
          <table class="sum">
            <tr><td>รวมเงิน</td><td class="num">{{ p.subtotal | money }}</td></tr>
            @if (p.discountAmount) {
              <tr><td>ส่วนลด</td><td class="num">{{ p.discountAmount | money }}</td></tr>
            }
            <tr><td>ภาษีมูลค่าเพิ่ม {{ p.vatEnabled ? p.vatPct + '%' : '' }}</td><td class="num">{{ p.vatAmount | money }}</td></tr>
            <tr class="tinted net"><td>รวมทั้งสิ้น</td><td class="num">{{ p.totalAmount | money }}</td></tr>
          </table>
        </section>
        <div class="words tinted">( {{ words(p.totalAmount) }} )</div>

        <section class="signs">
          <div class="sign-box customer">
            <div>ผู้ขายรับทราบคำสั่งซื้อ</div>
            <div class="space"></div>
            <div>( ........................................................ )</div>
            <div>วันที่ ......../......../........</div>
          </div>
          <div class="sign-box">
            <div>ผู้สั่งซื้อ {{ p.createdByName }}</div>
            <div class="space"></div>
            <div>( {{ p.approvedByName || '........................................' }} )</div>
            <div>ผู้อนุมัติ</div>
          </div>
        </section>
        <footer class="foot">{{ c?.address }}</footer>
      </div>
    }
  `,
  styleUrls: ['./print.scss', './quotation-print.page.scss'],
  styles: `.small-text { font-size: 9pt; margin-top: 2mm; } .pre { white-space: pre-line; }`,
})
export class PoPrintPage implements OnInit {
  private readonly api = inject(PurchaseApi);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly p = signal<Po | null>(null);
  readonly date = thDateShort;
  readonly words = bahtText;
  readonly close = closeWindow;
  readonly fillers = computed(() => Array.from({ length: Math.max(0, 12 - (this.p()?.items.length ?? 0)) }, (_, i) => i));

  ngOnInit(): void {
    this.store.load();
    this.api.po(this.id()).subscribe({ next: (p) => this.p.set(p), error: (e) => this.notify.error(e) });
  }
}

/** ใบสำคัญจ่าย (Payment Voucher) เก็บเข้าแฟ้มคู่ใบกำกับภาษีผู้ขาย */
@Component({
  selector: 'app-pv-print-page',
  imports: [PrintToolbar, MoneyPipe, TaxIdPipe],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="v()?.docNo ?? 'PV'" (closed)="close()" />
    @if (v(); as v) {
      @let c = store.header()?.company;
      <div class="sheet">
        @if (v.status === 'void') {
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
            <div class="addr">{{ c?.address }}</div>
          </div>
          <div class="title-box">
            <div class="tinted head">
              <div class="doc-title">ใบสำคัญจ่าย</div>
              <div class="doc-sub">Payment Voucher</div>
            </div>
            <div class="kv"><span>เลขที่ /No.</span><b>{{ v.docNo }}</b></div>
            <div class="kv"><span>วันที่/Date</span><b>{{ date(v.payDate) }}</b></div>
          </div>
        </header>

        <section class="party">
          <div class="left">
            <div class="kv2"><span>จ่ายให้ / Pay to:</span><span>{{ v.supplierName }}</span></div>
            <div class="kv2"><span>เลขผู้เสียภาษี:</span><span>{{ v.supplierTaxId | taxId }}</span></div>
            <div class="kv2"><span>บัญชีผู้รับ:</span><span>{{ v.supplierBank || '–' }}</span></div>
          </div>
          <div class="right">
            <div class="kv3"><b>จ่ายโดย:</b><span>{{ method[v.method] }}</span></div>
            <div class="kv3"><b>อ้างอิง:</b><span>{{ v.bankRef || '–' }}</span></div>
          </div>
        </section>

        <table class="items">
          <thead>
            <tr class="tinted">
              <th style="width: 7%">ลำดับ</th>
              <th style="width: 16%">ใบตั้งหนี้</th>
              <th>ใบกำกับ/ใบแจ้งหนี้ผู้ขาย</th>
              <th style="width: 14%">ประเภท</th>
              <th style="width: 15%">จำนวนเงิน</th>
              <th style="width: 14%">หัก ณ ที่จ่าย</th>
            </tr>
          </thead>
          <tbody>
            @for (l of v.lines; track l.billId; let i = $index) {
              <tr>
                <td class="center">{{ i + 1 }}</td>
                <td>{{ l.billNo }}</td>
                <td>{{ l.supplierInvoiceNo || '–' }} ลงวันที่ {{ date(l.billDate) }}</td>
                <td class="center">{{ cat[l.category] }}</td>
                <td class="num">{{ l.amount | money }}</td>
                <td class="num">{{ l.whtAmount | money }}</td>
              </tr>
            }
            @for (f of fillers(); track f) {
              <tr class="filler"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            }
          </tbody>
        </table>

        <section class="bottom">
          <div class="pay">
            @if (v.notes) {
              <div class="pay-title">หมายเหตุ</div>
              <div>{{ v.notes }}</div>
            }
          </div>
          <table class="sum">
            <tr><td>ยอดจ่าย</td><td class="num">{{ v.grossAmount | money }}</td></tr>
            <tr><td>หัก ภาษี ณ ที่จ่าย</td><td class="num">{{ v.whtAmount | money }}</td></tr>
            <tr class="tinted net"><td>จ่ายสุทธิ</td><td class="num">{{ v.netPaid | money }}</td></tr>
          </table>
        </section>
        <div class="words tinted">( {{ words(v.netPaid) }} )</div>

        <section class="signs four">
          <div class="sign-box"><div class="space"></div><div>( {{ v.createdByName }} )</div><div>ผู้จัดทำ</div></div>
          <div class="sign-box"><div class="space"></div><div>( {{ v.approvedByName || '..............................' }} )</div><div>ผู้อนุมัติ</div></div>
          <div class="sign-box"><div class="space"></div><div>( .............................. )</div><div>ผู้จ่ายเงิน</div></div>
          <div class="sign-box"><div class="space"></div><div>( .............................. )</div><div>ผู้รับเงิน</div><div>วันที่ ......../......../........</div></div>
        </section>
      </div>
    }
  `,
  styleUrls: ['./print.scss', './quotation-print.page.scss'],
  styles: `.signs.four { grid-template-columns: repeat(4, 1fr); gap: 4mm; } .signs.four .sign-box { font-size: 9pt; } .signs.four .space { height: 14mm; }`,
})
export class PvPrintPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly v = signal<Pv | null>(null);
  readonly date = thDateShort;
  readonly words = bahtText;
  readonly close = closeWindow;
  readonly method = PAY_METHOD;
  readonly cat = COST_CATEGORY;
  readonly fillers = computed(() => Array.from({ length: Math.max(0, 8 - (this.v()?.lines.length ?? 0)) }, (_, i) => i));

  ngOnInit(): void {
    this.store.load();
    this.api.voucher(this.id()).subscribe({ next: (v) => this.v.set(v), error: (e) => this.notify.error(e) });
  }
}
