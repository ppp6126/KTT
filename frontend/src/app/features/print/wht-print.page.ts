import { Component, OnInit, inject, input, signal } from '@angular/core';
import { TaxIdPipe, thDateShort } from '../../core/util/format';
import { MoneyPipe, bahtText } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { ApApi, Cert } from '../ap/ap.api';
import { CompanyHeaderStore } from './company-header';
import { PrintToolbar } from './print-toolbar';

/** หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ พิมพ์ 2 ฉบับ (ผู้ถูกหัก / เก็บเป็นหลักฐาน) */
@Component({
  selector: 'app-wht-print-page',
  imports: [PrintToolbar, MoneyPipe, TaxIdPipe],
  providers: [CompanyHeaderStore],
  template: `
    <app-print-toolbar [title]="'50 ทวิ ' + (c()?.bookNo ?? '')" (closed)="close()" />
    @if (c(); as c) {
      @let co = store.header()?.company;
      @for (copy of copies; track copy.no) {
        <div class="sheet wht" [class.page-break]="copy.no > 1">
          @if (c.status === 'void') {
            <div class="watermark">ยกเลิก</div>
          }
          <div class="copy">ฉบับที่ {{ copy.no }} ({{ copy.label }})</div>
          <div class="book">เล่มที่ {{ c.bookNo }} &nbsp; เลขที่ {{ c.runNo }}</div>
          <h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
          <div class="sub">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>

          <section class="box">
            <div class="row"><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b><span class="grow"></span>เลขประจำตัวผู้เสียภาษีอากร <span class="tid">{{ co?.taxId | taxId }}</span></div>
            <div class="row">ชื่อ <span class="fill">{{ co?.nameTh }}</span></div>
            <div class="row">ที่อยู่ <span class="fill">{{ co?.address }}</span></div>
          </section>

          <section class="box">
            <div class="row"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b><span class="grow"></span>เลขประจำตัวผู้เสียภาษีอากร <span class="tid">{{ c.payeeTaxId | taxId }}</span></div>
            <div class="row">ชื่อ <span class="fill">{{ c.payeeName }}</span></div>
            <div class="row">ที่อยู่ <span class="fill">{{ c.payeeAddress || '' }}</span></div>
            <div class="row forms">
              ลำดับที่ ........ ในแบบ
              <span class="opt"><span class="cb">{{ '' }}</span>(1) ภ.ง.ด.1ก</span>
              <span class="opt"><span class="cb">{{ '' }}</span>(2) ภ.ง.ด.1ก พิเศษ</span>
              <span class="opt"><span class="cb">{{ '' }}</span>(3) ภ.ง.ด.2</span>
              <span class="opt"><span class="cb">{{ c.form === 'pnd3' ? '✓' : '' }}</span>(4) ภ.ง.ด.3</span>
              <span class="opt"><span class="cb">{{ '' }}</span>(5) ภ.ง.ด.2ก</span>
              <span class="opt"><span class="cb">{{ '' }}</span>(6) ภ.ง.ด.3ก</span>
              <span class="opt"><span class="cb">{{ c.form === 'pnd53' ? '✓' : '' }}</span>(7) ภ.ง.ด.53</span>
            </div>
          </section>

          <table class="inc">
            <thead>
              <tr><th>ประเภทเงินได้พึงประเมินที่จ่าย</th><th style="width: 18%">วัน เดือน หรือปีภาษี ที่จ่าย</th><th style="width: 18%">จำนวนเงินที่จ่าย</th><th style="width: 18%">ภาษีที่หัก และนำส่งไว้</th></tr>
            </thead>
            <tbody>
              @for (r of rows; track r.no) {
                <tr>
                  <td>{{ r.text }}</td>
                  @if (r.no === row(c)) {
                    <td class="center">{{ date(c.payDate) }}</td>
                    <td class="num">{{ c.amount | money }}</td>
                    <td class="num">{{ c.whtAmount | money }}</td>
                  } @else {
                    <td></td><td></td><td></td>
                  }
                </tr>
                @if (r.no === row(c) && r.no >= 5) {
                  <tr class="detail"><td>&nbsp;&nbsp;&nbsp;&nbsp;({{ c.incomeType }} อัตรา {{ c.whtRate }}%)</td><td></td><td></td><td></td></tr>
                }
              }
            </tbody>
            <tfoot>
              <tr><td class="right"><b>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</b></td><td></td><td class="num"><b>{{ c.amount | money }}</b></td><td class="num"><b>{{ c.whtAmount | money }}</b></td></tr>
              <tr><td colspan="4"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b> &nbsp; {{ words(c.whtAmount) }}</td></tr>
            </tfoot>
          </table>

          <section class="box payer">
            <div class="row">
              ผู้จ่ายเงิน
              <span class="opt"><span class="cb">✓</span>(1) หัก ณ ที่จ่าย</span>
              <span class="opt"><span class="cb"></span>(2) ออกให้ตลอดไป</span>
              <span class="opt"><span class="cb"></span>(3) ออกให้ครั้งเดียว</span>
              <span class="opt"><span class="cb"></span>(4) อื่น ๆ</span>
            </div>
          </section>

          <section class="cert">
            <div class="warn">
              <b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
            </div>
            <div class="sign">
              <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
              <div class="space">
                @if (store.signature()) {
                  <img [src]="store.signature()" alt="ลายเซ็น" />
                }
              </div>
              <div>ลงชื่อ ........................................ ผู้จ่ายเงิน</div>
              <div>( {{ co?.signerName }} )</div>
              <div>{{ date(c.payDate) }}</div>
              <div class="muted-print">วัน เดือน ปี ที่ออกหนังสือรับรองฯ</div>
            </div>
          </section>
          <div class="ref">อ้างอิงใบสำคัญจ่าย {{ c.pvNo }}</div>
        </div>
      }
    }
  `,
  styleUrls: ['./print.scss'],
  styles: `
    .wht { font-size: 10pt; position: relative; }
    .copy { position: absolute; top: 10mm; right: 12mm; font-size: 9pt; }
    .book { position: absolute; top: 15mm; right: 12mm; font-size: 9pt; }
    h1 { text-align: center; font-size: 15pt; margin: 6mm 0 0; }
    .sub { text-align: center; margin-bottom: 4mm; }
    .box { border: 0.6pt solid #333; padding: 2mm 3mm; margin-bottom: 2mm; }
    .row { display: flex; gap: 2mm; align-items: baseline; flex-wrap: wrap; margin: 1mm 0; }
    .grow { flex: 1; }
    .fill { flex: 1; border-bottom: 0.4pt dotted #555; min-height: 4mm; }
    .tid { font-weight: 600; letter-spacing: 0.5pt; }
    .forms { font-size: 9pt; gap: 1.5mm; }
    .opt { white-space: nowrap; }
    .cb { display: inline-flex; width: 3.6mm; height: 3.6mm; border: 0.6pt solid #333; align-items: center; justify-content: center; font-size: 8pt; margin-left: 2mm; }
    .inc { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 2mm; }
    .inc th, .inc td { border: 0.6pt solid #333; padding: 1.2mm 2mm; vertical-align: top; }
    .inc th { font-weight: 600; text-align: center; }
    .inc .detail td { border-top: 0; font-style: italic; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .center { text-align: center; }
    .right { text-align: right; }
    .cert { display: grid; grid-template-columns: 1fr 1.2fr; border: 0.6pt solid #333; }
    .warn { padding: 3mm; border-right: 0.6pt solid #333; font-size: 8.5pt; }
    .sign { padding: 3mm; text-align: center; font-size: 9pt; }
    .sign .space { height: 14mm; display: flex; justify-content: center; align-items: center; }
    .sign .space img { height: 12mm; }
    .muted-print { font-size: 8pt; color: #555; }
    .ref { font-size: 8pt; color: #555; margin-top: 2mm; }
  `,
})
export class WhtPrintPage implements OnInit {
  private readonly api = inject(ApApi);
  private readonly notify = inject(Notify);
  readonly store = inject(CompanyHeaderStore);
  readonly id = input.required<string>();
  readonly c = signal<Cert | null>(null);
  readonly date = thDateShort;
  readonly words = bahtText;
  readonly copies = [
    { no: 1, label: 'สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี' },
    { no: 2, label: 'สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน' },
  ];
  readonly rows = [
    { no: 1, text: '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)' },
    { no: 2, text: '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)' },
    { no: 3, text: '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)' },
    { no: 4, text: '4. ดอกเบี้ย เงินปันผล ฯลฯ ตามมาตรา 40 (4)' },
    { no: 5, text: '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ค่าแห่งการโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ค่าจ้างทำของ ฯลฯ' },
    { no: 6, text: '6. อื่น ๆ (ระบุ)' },
  ];

  ngOnInit(): void {
    this.store.load();
    this.api.certificate(this.id()).subscribe({ next: (c) => this.c.set(c), error: (e) => this.notify.error(e) });
  }

  /** แถวประเภทเงินได้: งานรับเหมา ค่าบริการ ค่าเช่า ค่าขนส่ง อยู่ข้อ 5 นอกนั้นข้อ 6 */
  row(c: Cert): number {
    return /ค่าจ้าง|บริการ|เช่า|ขนส่ง|โฆษณา|รับเหมา/.test(c.incomeType) ? 5 : 6;
  }

  close(): void {
    window.close();
    history.back();
  }
}
