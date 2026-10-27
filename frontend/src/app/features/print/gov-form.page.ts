import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MoneyPipe, QtyPipe, bahtText } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { BoqApi, GovForm } from '../boq/boq.api';
import { PrintToolbar } from './print-toolbar';

/** แบบ ปร.4 (รายละเอียดค่าวัสดุและค่าแรง) และ ปร.5 (สรุปค่าก่อสร้างคูณ Factor F) */
@Component({
  selector: 'app-gov-form-page',
  imports: [PrintToolbar, MoneyPipe, QtyPipe],
  template: `
    <app-print-toolbar title="แบบ ปร.4 / ปร.5" (closed)="close()" />
    @if (form(); as f) {
      <div class="sheet landscape">
        <div class="form-no">แบบ ปร.4</div>
        <h1>แบบสรุปรายละเอียดการคำนวณราคากลางงานก่อสร้าง</h1>
        <div class="meta">
          <div>ชื่อโครงการ / งานก่อสร้าง: <b>{{ f.projectName || f.boqName }}</b></div>
          <div>สถานที่ก่อสร้าง: {{ f.projectLocation || '–' }}</div>
          <div>หน่วยงานเจ้าของโครงการ: {{ f.ownerAgency || f.customerName || '–' }}</div>
        </div>
        <table class="doc f4">
          <thead>
            <tr>
              <th rowspan="2" style="width: 7%">ลำดับที่</th>
              <th rowspan="2">รายการ</th>
              <th rowspan="2" style="width: 7%">จำนวน</th>
              <th rowspan="2" style="width: 6%">หน่วย</th>
              <th colspan="2">ราคาค่าวัสดุ</th>
              <th colspan="2">ราคาค่าแรงงาน</th>
              <th rowspan="2" style="width: 11%">รวมค่าวัสดุ<br />และค่าแรงงาน</th>
              <th rowspan="2" style="width: 8%">หมายเหตุ</th>
            </tr>
            <tr>
              <th style="width: 9%">ราคาต่อหน่วย</th>
              <th style="width: 10%">จำนวนเงิน</th>
              <th style="width: 9%">ราคาต่อหน่วย</th>
              <th style="width: 10%">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            @for (r of f.form4; track $index) {
              <tr [class.group]="!r.leaf" [class.lvl1]="r.level === 1">
                <td class="center">{{ r.number }}</td>
                <td [style.padding-left.pt]="5 + (r.level - 1) * 10">{{ r.description }}</td>
                <td class="num">{{ r.quantity | qty }}</td>
                <td class="center">{{ r.unit }}</td>
                <td class="num">{{ r.leaf ? (r.materialUnit | money) : '' }}</td>
                <td class="num">{{ r.materialAmount | money }}</td>
                <td class="num">{{ r.leaf ? (r.laborUnit | money) : '' }}</td>
                <td class="num">{{ r.laborAmount | money }}</td>
                <td class="num">{{ r.total | money }}</td>
                <td>{{ r.note }}</td>
              </tr>
            }
            <tr class="total">
              <td colspan="5" class="center">รวมค่างานต้นทุน</td>
              <td class="num">{{ f.totalMaterial | money }}</td>
              <td></td>
              <td class="num">{{ f.totalLabor | money }}</td>
              <td class="num">{{ f.totalCost | money }}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p class="note">หมายเหตุ: ราคาค่าวัสดุรวมค่าเครื่องจักร/อุปกรณ์แล้ว</p>
      </div>

      <div class="sheet page-break">
        <div class="form-no">แบบ ปร.5</div>
        <h1>แบบสรุปค่าก่อสร้าง</h1>
        <div class="meta">
          <div>ชื่อโครงการ / งานก่อสร้าง: <b>{{ f.projectName || f.boqName }}</b></div>
          <div>สถานที่ก่อสร้าง: {{ f.projectLocation || '–' }}</div>
          <div>หน่วยงานเจ้าของโครงการ: {{ f.ownerAgency || f.customerName || '–' }}</div>
        </div>
        <table class="doc">
          <thead>
            <tr>
              <th style="width: 8%">ลำดับที่</th>
              <th>รายการ</th>
              <th style="width: 18%">ค่างานต้นทุน (บาท)</th>
              <th style="width: 12%">Factor F</th>
              <th style="width: 18%">ค่าก่อสร้าง (บาท)</th>
            </tr>
          </thead>
          <tbody>
            @for (r of f.form5; track $index) {
              <tr>
                <td class="center">{{ r.number }}</td>
                <td>{{ r.description }}</td>
                <td class="num">{{ r.cost | money }}</td>
                <td class="center">{{ r.factorF }}</td>
                <td class="num">{{ r.price | money }}</td>
              </tr>
            }
            <tr class="total">
              <td colspan="2" class="center">รวมค่าก่อสร้าง</td>
              <td class="num">{{ f.totalCost | money }}</td>
              <td></td>
              <td class="num">{{ f.totalPrice | money }}</td>
            </tr>
            <tr class="total">
              <td colspan="4" class="center">คิดเป็นเงินประมาณ (ปัดเศษลงหลักร้อย)</td>
              <td class="num">{{ f.totalPriceRounded | money }}</td>
            </tr>
          </tbody>
        </table>
        <p class="words">({{ words(f.totalPriceRounded) }})</p>
        <div class="factor">
          Factor F = {{ f.factorF }}
          @if (f.factorFMode === 'table' && f.factorFTableName) {
            คำนวณจาก "{{ f.factorFTableName }}" ที่ค่างานต้นทุน {{ f.totalCost | money }} บาท
          } @else if (f.factorFMode === 'manual') {
            (กำหนดค่าเอง)
          } @else {
            (ไม่ใช้ Factor F)
          }
        </div>
        <div class="signs">
          <div>ลงชื่อ ............................................ ผู้คำนวณราคา</div>
          <div>ลงชื่อ ............................................ ผู้ตรวจสอบ</div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./print.scss'],
  styles: `
    h1 { font-size: 14pt; text-align: center; margin: 0 0 8pt; }
    .form-no { text-align: right; font-weight: 600; }
    .meta { margin-bottom: 8pt; }
    .f4 { font-size: 9pt; }
    tr.group td { font-weight: 600; background: #f3f3f3; }
    tr.lvl1 td { background: #e9e9e9; }
    tr.total td { font-weight: 700; }
    .note { font-size: 9pt; margin-top: 4pt; }
    .words { text-align: right; margin: 6pt 0; }
    .factor { margin-top: 8pt; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 24pt; margin-top: 36pt; text-align: center; }
    .sheet.landscape { page: wide; }
    @page wide { size: A4 landscape; margin: 10mm; }
    @page { size: A4 portrait; margin: 10mm; }
  `,
})
export class GovFormPage implements OnInit {
  private readonly api = inject(BoqApi);
  private readonly notify = inject(Notify);
  readonly id = input.required<string>();
  readonly form = signal<GovForm | null>(null);
  readonly words = bahtText;

  ngOnInit(): void {
    this.api.govForm(this.id()).subscribe({ next: (f) => this.form.set(f), error: (e) => this.notify.error(e) });
  }

  close(): void {
    window.close();
    history.back();
  }
}
