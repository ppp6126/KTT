import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { SurveyDialog } from './service-dialogs';
import { ServiceApi, WARRANTY_STATE, WarrantyRow } from './service.api';

@Component({
  selector: 'app-warranty-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, ThDatePipe, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>รับประกันผลงาน</h1>
          <p>โครงการที่ส่งมอบแล้ว: วันสิ้นสุดรับประกัน = วันส่งมอบจริง + ระยะรับประกันในสัญญา (แก้เป็นรายโครงการได้)</p>
        </div>
      </div>
      <div class="panel">
        <div class="filters">
          <mat-button-toggle-group [(ngModel)]="state" (change)="load()" hideSingleSelectionIndicator aria-label="สถานะ">
            <mat-button-toggle value="">ทั้งหมด</mat-button-toggle>
            <mat-button-toggle value="active">อยู่ในประกัน</mat-button-toggle>
            <mat-button-toggle value="expiring">ใกล้หมด (30 วัน)</mat-button-toggle>
            <mat-button-toggle value="expired">หมดประกัน</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead><tr><th>โครงการ</th><th>ลูกค้า</th><th>ส่งมอบ</th><th>ระยะประกัน</th><th>สิ้นสุด</th><th class="num">เหลือ</th><th>สถานะ</th><th class="num">แจ้งซ่อม (ค้าง/ทั้งหมด)</th><th class="num">ค่าซ่อมในประกัน</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.projectId) {
                <tr>
                  <td><a [routerLink]="['/projects', r.projectId]" class="no">{{ r.code }}</a> {{ r.name }}</td>
                  <td class="small">{{ r.customerName }}</td>
                  <td class="small">{{ r.handoverDate | thDate }}</td>
                  <td class="small">{{ r.overridden ? 'กำหนดเอง' : r.contractMonths ? r.contractMonths + ' เดือน' : 'ค่าตั้งต้น' }}</td>
                  <td class="small">{{ r.warrantyEnd | thDate }}</td>
                  <td class="num">{{ r.daysLeft === null ? '–' : r.daysLeft < 0 ? '–' : r.daysLeft + ' วัน' }}</td>
                  <td><span class="chip" [class]="ws[r.state].tone">{{ ws[r.state].label }}</span></td>
                  <td class="num"><a [routerLink]="['/service/tickets']" [class.bad]="r.openTickets">{{ r.openTickets }}</a> / {{ r.totalTickets }}</td>
                  <td class="num">{{ r.warrantyCost | money }}</td>
                  <td class="nowrap">
                    @if (canWrite) {
                      <button mat-button (click)="survey(r)">สอบถามความพึงพอใจ</button>
                      <button mat-icon-button (click)="override(r)" aria-label="กำหนดวันสิ้นสุดเอง"><mat-icon>edit_calendar</mat-icon></button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty muted">ยังไม่มีโครงการที่ส่งมอบ (บันทึกวันเสร็จจริงในหน้าโครงการ)</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `.nowrap { white-space: nowrap; }`,
})
export class WarrantyPage implements OnInit {
  private readonly api = inject(ServiceApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  readonly canWrite = inject(AuthService).can(Perm.SERVICE_WRITE);
  readonly ws = WARRANTY_STATE;
  readonly rows = signal<WarrantyRow[]>([]);
  state = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.warranties(this.state || undefined).subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  override(r: WarrantyRow): void {
    prompt(this.dialog, {
      title: `วันสิ้นสุดรับประกัน ${r.code}`,
      message: 'รูปแบบ ปปปป-ดด-วว (ค.ศ.) เว้นว่างเพื่อกลับไปคำนวณจากสัญญา',
      label: 'วันสิ้นสุด',
      value: r.overridden ? (r.warrantyEnd ?? '') : '',
      confirmText: 'บันทึก',
    }).subscribe((v) => {
      if (v === undefined) return;
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        this.notify.error('รูปแบบวันที่ไม่ถูกต้อง ใช้ ปปปป-ดด-วว');
        return;
      }
      this.api.setWarranty(r.projectId, v.trim() || null).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
    });
  }

  survey(r: WarrantyRow): void {
    this.dialog
      .open(SurveyDialog, { data: { projectId: r.projectId, label: `${r.code} ${r.name} · ${r.customerName}` }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((s) => s && this.notify.ok('บันทึกความพึงพอใจแล้ว'));
  }
}
