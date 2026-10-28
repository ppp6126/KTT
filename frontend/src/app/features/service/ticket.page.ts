import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ComponentType } from '@angular/cdk/portal';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { ResolveDialog, ScheduleDialog, SurveyDialog, TicketDialog } from './service-dialogs';
import { SURVEY_METHOD, ServiceApi, TICKET_CATEGORY, TICKET_CHANNEL, TICKET_PRIORITY, TICKET_STATUS, Ticket } from './service.api';

@Component({
  selector: 'app-ticket-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MoneyPipe, ThDatePipe, AttachmentPanel],
  template: `
    @if (t(); as t) {
      <div class="page wide">
        <a routerLink="/service/tickets" class="back"><mat-icon>arrow_back</mat-icon> งานแจ้งซ่อม</a>
        <div class="page-head">
          <div>
            <h1>{{ t.docNo }} {{ t.title }} <span class="chip" [class]="st[t.status].tone">{{ st[t.status].label }}</span></h1>
            <p>
              {{ t.customerName }}
              @if (t.projectId) {
                · <a [routerLink]="['/projects', t.projectId]">{{ t.projectCode }} {{ t.projectName }}</a>
              }
            </p>
          </div>
          @if (canWrite) {
            <div class="actions">
              @if (active(t.status)) {
                <button mat-stroked-button (click)="schedule(t)"><mat-icon>event</mat-icon> นัดหมาย</button>
                @if (t.status !== 'in_progress') {
                  <button mat-stroked-button (click)="act('start')"><mat-icon>construction</mat-icon> เริ่มซ่อม</button>
                }
                <button mat-flat-button class="btn-primary" (click)="resolve(t)"><mat-icon>task_alt</mat-icon> ซ่อมเสร็จ</button>
              }
              @if (t.status === 'resolved') {
                <button mat-flat-button class="btn-primary" (click)="act('close')"><mat-icon>verified</mat-icon> ลูกค้ายืนยัน ปิดงาน</button>
              }
              @if (t.status === 'resolved' || t.status === 'closed') {
                <button mat-stroked-button (click)="survey(t)"><mat-icon>sentiment_satisfied</mat-icon> บันทึกความพึงพอใจ</button>
              }
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                <button mat-menu-item (click)="note()"><mat-icon>chat</mat-icon>เพิ่มบันทึก</button>
                @if (active(t.status)) {
                  <button mat-menu-item (click)="edit(t)"><mat-icon>edit</mat-icon>แก้ไขรายละเอียด</button>
                  <button mat-menu-item (click)="reject()"><mat-icon>block</mat-icon>ไม่รับซ่อม</button>
                } @else {
                  <button mat-menu-item (click)="reopen()"><mat-icon>replay</mat-icon>เปิดงานใหม่</button>
                }
                @if (t.status === 'open') {
                  <button mat-menu-item (click)="remove()"><mat-icon>delete</mat-icon>ลบ (บันทึกผิด)</button>
                }
              </mat-menu>
            </div>
          }
        </div>

        <p class="notice" [class.ok]="t.inWarranty" [class.warn]="!t.inWarranty">
          @if (t.inWarranty) {
            อยู่ในระยะรับประกัน (ถึง {{ t.warrantyEnd | thDate }}) ไม่เรียกเก็บค่าซ่อม ต้นทุนเป็นค่าใช้จ่ายรับประกันของโครงการ
          } @else if (t.warrantyEnd) {
            พ้นระยะรับประกันแล้ว (สิ้นสุด {{ t.warrantyEnd | thDate }}) แจ้งลูกค้าเรื่องค่าใช้จ่ายก่อนเข้าซ่อม
          } @else {
            ไม่อยู่ในระยะรับประกัน (ไม่ได้ผูกกับโครงการที่ส่งมอบแล้ว)
          }
        </p>

        <div class="two">
          <section class="panel panel-pad">
            <div class="facts">
              <div><span class="label">หมวด</span>{{ cat[t.category] }}</div>
              <div><span class="label">ความเร่งด่วน</span><span><span class="chip" [class]="pri[t.priority].tone">{{ pri[t.priority].label }}</span></span></div>
              <div><span class="label">แจ้งเมื่อ</span>{{ t.reportedAt | thDate: true }} ({{ channel[t.channel] }})</div>
              <div><span class="label">ผู้แจ้ง</span>{{ t.reporterName || '–' }} {{ t.reporterPhone || t.customerPhone || '' }}</div>
              <div><span class="label">นัดเข้าซ่อม</span>{{ t.appointmentAt ? (t.appointmentAt | thDate: true) : '–' }}</div>
              <div><span class="label">ช่าง/ผู้รับผิดชอบ</span>{{ t.assigneeName || '–' }}</div>
              <div class="wide-cell"><span class="label">สถานที่</span>{{ t.siteAddress || '–' }}</div>
              @if (t.description) {
                <div class="wide-cell"><span class="label">รายละเอียด</span><span class="pre">{{ t.description }}</span></div>
              }
              @if (t.resolution) {
                <div class="wide-cell"><span class="label">การแก้ไข</span><span class="pre">{{ t.resolution }}</span></div>
                <div><span class="label">ต้นทุนค่าแรง</span>{{ t.laborCost | money }}</div>
                <div><span class="label">ต้นทุนวัสดุ</span>{{ t.materialCost | money }}</div>
                <div><span class="label">เรียกเก็บลูกค้า</span>{{ t.chargeAmount | money }}</div>
              }
            </div>
          </section>

          <section class="panel panel-pad">
            <h2>ความเคลื่อนไหว</h2>
            <ol class="timeline">
              @for (l of t.logs; track $index) {
                <li>
                  <div class="when">{{ l.at | thDate: true }} · {{ l.byName || 'ระบบ' }}</div>
                  @if (l.status) {
                    <span class="chip" [class]="st[l.status].tone">{{ st[l.status].label }}</span>
                  }
                  <span class="pre">{{ l.note }}</span>
                </li>
              }
            </ol>
          </section>
        </div>

        @if (t.surveys.length) {
          <section class="panel panel-pad">
            <h2>ความพึงพอใจหลังซ่อม</h2>
            @for (s of t.surveys; track s.id) {
              <p><b>{{ s.overall }}/5</b> · {{ method[s.method] }} {{ s.surveyDate | thDate }} {{ s.respondent ? '(' + s.respondent + ')' : '' }}{{ s.comment ? ' — ' + s.comment : '' }}</p>
            }
          </section>
        }

        <section class="panel panel-pad">
          <h2>รูปก่อน/หลังซ่อม และเอกสาร</h2>
          <app-attachment-panel ownerType="service_ticket" [ownerId]="t.id" [canWrite]="canWrite" [defaultCategory]="active(t.status) ? 'before' : 'after'" accept="image/*,.pdf" [camera]="true" />
        </section>
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .two { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 960px) { .two { grid-template-columns: 1fr; } }
    .two .panel { margin: 0; }
    h2 { margin: 0 0 10px; }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--ktt-line); }
    .timeline li { position: relative; padding: 0 0 12px 10px; }
    .timeline li::before { content: ''; position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--ktt-ink-2); border: 2px solid #fff; }
    .timeline .when { font-size: 0.8rem; color: var(--ktt-steel); }
    .timeline .chip { margin-right: 6px; font-size: 0.75rem; }
  `,
})
export class TicketPage implements OnInit {
  private readonly api = inject(ServiceApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly canWrite = inject(AuthService).can(Perm.SERVICE_WRITE);
  readonly id = input.required<string>();
  readonly t = signal<Ticket | null>(null);
  readonly st = TICKET_STATUS;
  readonly pri = TICKET_PRIORITY;
  readonly cat = TICKET_CATEGORY;
  readonly channel = TICKET_CHANNEL;
  readonly method = SURVEY_METHOD;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.ticket(this.id()).subscribe({
      next: (t) => this.t.set(t),
      error: (e) => {
        this.notify.error(e);
        this.router.navigateByUrl('/service/tickets');
      },
    });
  }

  active(s: string): boolean {
    return s === 'open' || s === 'scheduled' || s === 'in_progress';
  }

  private apply = { next: (t: Ticket) => this.t.set(t), error: (e: unknown) => this.notify.error(e) };

  private dlg<C>(c: ComponentType<C>, data: unknown): void {
    this.dialog
      .open(c, { data, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }

  edit(t: Ticket): void {
    this.dlg(TicketDialog, t);
  }

  schedule(t: Ticket): void {
    this.dlg(ScheduleDialog, t);
  }

  resolve(t: Ticket): void {
    this.dlg(ResolveDialog, t);
  }

  survey(t: Ticket): void {
    this.dlg(SurveyDialog, { ticketId: t.id, label: `${t.docNo} ${t.title} · ${t.customerName}` });
  }

  act(action: 'start' | 'close'): void {
    this.api.action(this.id(), action).subscribe(this.apply);
  }

  note(): void {
    prompt(this.dialog, { title: 'เพิ่มบันทึก', label: 'บันทึก', confirmText: 'บันทึก', required: true, multiline: true }).subscribe(
      (v) => v && this.api.action(this.id(), 'note', v).subscribe(this.apply),
    );
  }

  reject(): void {
    prompt(this.dialog, { title: 'ไม่รับซ่อม', message: 'เช่น เกิดจากการใช้งานผิดวิธี หรือไม่ใช่งานของบริษัท', label: 'เหตุผล', confirmText: 'ยืนยัน', required: true }).subscribe(
      (v) => v && this.api.action(this.id(), 'reject', v).subscribe(this.apply),
    );
  }

  reopen(): void {
    prompt(this.dialog, { title: 'เปิดงานใหม่', label: 'เหตุผล (เช่น ปัญหาเดิมกลับมาอีก)', confirmText: 'เปิดงาน', required: true }).subscribe(
      (v) => v && this.api.action(this.id(), 'reopen', v).subscribe(this.apply),
    );
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบงานแจ้งซ่อม', message: 'ใช้กรณีบันทึกผิดเท่านั้น', confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.remove(this.id()).subscribe({ next: () => this.router.navigateByUrl('/service/tickets'), error: (e) => this.notify.error(e) }),
    );
  }
}
