import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { thDateShort } from '../../core/util/format';
import { MoneyPipe, QtyPipe, bahtText } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { ContractsApi, Vo } from '../contracts/contracts.api';
import { CompanyHeaderStore } from './company-header';
import { PrintToolbar } from './print-toolbar';

/** ใบงานเพิ่ม-ลด (Variation Order) ให้ลูกค้าลงนามยืนยัน */
@Component({
  selector: 'app-vo-print-page',
  imports: [PrintToolbar, MoneyPipe, QtyPipe],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="v()?.docNo ?? 'VO'" (closed)="close()" />
    @if (v(); as v) {
      @let c = store.header()?.company;
      <div class="sheet">
        @if (v.status === 'draft' || v.status === 'pending_approval') {
          <div class="watermark">ร่าง</div>
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
            <div>โทรศัพท์ {{ c?.phone }}</div>
          </div>
          <div class="title-box">
            <div class="tinted head">
              <div class="doc-title">ใบงานเพิ่ม-ลด</div>
              <div class="doc-sub">Variation Order</div>
            </div>
            <div class="kv"><span>เลขที่ /No.</span><b>{{ v.docNo }}</b></div>
            <div class="kv"><span>วันที่/Date</span><b>{{ date(v.issueDate) }}</b></div>
          </div>
        </header>

        <section class="party">
          <div class="left">
            <div class="kv2"><span>ผู้ว่าจ้าง / Employer:</span><span>{{ v.customerName }}</span></div>
            <div class="kv2"><span>โครงการ / Project:</span><span>{{ v.projectName }}</span></div>
            <div class="kv2"><span>เรื่อง / Subject:</span><span>{{ v.title }}</span></div>
          </div>
          <div class="right">
            <div class="kv3"><b>อ้างอิงสัญญาเลขที่:</b><span>{{ v.contractNo }}</span></div>
            <div class="kv3"><b>ขยายระยะเวลา:</b><span>{{ v.daysExtension ? v.daysExtension + ' วัน' : 'ไม่มี' }}</span></div>
            <div class="kv3"><b>ผู้ขอเปลี่ยนแปลง:</b><span>{{ v.requestedByCustomer ? 'ผู้ว่าจ้าง' : 'ผู้รับจ้าง' }}</span></div>
          </div>
        </section>

        @if (v.reason) {
          <p class="reason"><b>เหตุผล:</b> {{ v.reason }}</p>
        }

        <table class="items">
          <thead>
            <tr class="tinted">
              <th style="width: 9%">ลำดับ</th>
              <th>รายการ</th>
              <th style="width: 11%">จำนวน</th>
              <th style="width: 9%">หน่วย</th>
              <th style="width: 16%">ราคา/หน่วย</th>
              <th style="width: 16%">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            @for (it of v.items; track $index; let i = $index) {
              <tr>
                <td class="center">{{ i + 1 }}</td>
                <td>{{ it.description }}</td>
                <td class="num">{{ it.quantity | qty }}</td>
                <td class="center">{{ it.unit }}</td>
                <td class="num">{{ it.unitPrice | money }}</td>
                <td class="num">{{ it.amount | money }}</td>
              </tr>
            }
            @for (f of fillers(); track f) {
              <tr class="filler"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            }
          </tbody>
        </table>

        <section class="bottom">
          <div class="pay">
            <div class="pay-title">มูลค่างาน{{ v.amount >= 0 ? 'เพิ่ม' : 'ลด' }}นี้จะปรับเข้ามูลค่าสัญญาและเรียกเก็บตามงวดที่ตกลง</div>
          </div>
          <table class="sum">
            <tr><td>มูลค่า{{ v.amount >= 0 ? 'งานเพิ่ม' : 'งานลด' }}</td><td class="num">{{ v.amount | money }}</td></tr>
            <tr><td>ภาษีมูลค่าเพิ่ม</td><td class="num">{{ v.vatAmount | money }}</td></tr>
            <tr class="tinted net"><td>รวมทั้งสิ้น</td><td class="num">{{ v.total | money }}</td></tr>
          </table>
        </section>
        <div class="words tinted">( {{ words(Math.abs(v.total)) }}{{ v.total < 0 ? ' (ลดลง)' : '' }} )</div>

        <section class="signs">
          <div class="sign-box customer">
            <div>ผู้ว่าจ้างตกลงตามรายการข้างต้น</div>
            <div class="space"></div>
            <div>( ........................................................ )</div>
            <div>ผู้ว่าจ้าง</div>
            <div>วันที่ ......../......../........</div>
          </div>
          <div class="sign-box">
            <div>ในนาม {{ c?.nameTh }}</div>
            <div class="space imgs">
              @if (store.signature()) {
                <img class="sig" [src]="store.signature()" alt="ลายเซ็น" />
              }
            </div>
            <div>( {{ c?.signerName }} )</div>
            <div>{{ c?.signerTitle }}</div>
          </div>
        </section>
        <footer class="foot">{{ c?.address }}</footer>
      </div>
    }
  `,
  styleUrls: ['./print.scss', './quotation-print.page.scss'],
  styles: `.reason { font-size: 9.5pt; margin: 0 0 4mm; }`,
})
export class VoPrintPage implements OnInit {
  private readonly api = inject(ContractsApi);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly v = signal<Vo | null>(null);
  readonly date = thDateShort;
  readonly words = bahtText;
  readonly Math = Math;
  readonly fillers = computed(() => Array.from({ length: Math.max(0, 10 - (this.v()?.items.length ?? 0)) }, (_, i) => i));

  ngOnInit(): void {
    this.store.load();
    this.api.vo(this.id()).subscribe({ next: (v) => this.v.set(v), error: (e) => this.notify.error(e) });
  }

  close(): void {
    window.close();
    history.back();
  }
}
