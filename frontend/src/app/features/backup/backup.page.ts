import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ThDatePipe } from '../../core/util/format';
import { confirmAction } from '../../shared/confirm-dialog';
import { FileService, fileSize } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { BackupApi, BackupRun, BackupSettings } from './backup.api';

@Component({
  selector: 'app-backup-page',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>สำรองและส่งออกข้อมูล</h1>
          <p>ส่งออกข้อมูลทุกตารางเป็นไฟล์ ZIP (CSV เปิดด้วย Excel ได้) ไม่รวมรหัสผ่านและข้อมูลเข้าสู่ระบบ</p>
        </div>
      </div>

      <div class="cols">
        <section class="panel panel-pad">
          <h2>สำรองตอนนี้</h2>
          <mat-checkbox [(ngModel)]="includeFiles">รวมไฟล์แนบทั้งหมด (รูปหน้างาน แบบ เอกสาร) ไฟล์จะใหญ่และใช้เวลานาน</mat-checkbox>
          <div class="row">
            <button mat-flat-button class="btn-primary" (click)="run()" [disabled]="busy()"><mat-icon>backup</mat-icon> สำรองข้อมูล</button>
          </div>
          @if (busy()) {
            <mat-progress-bar mode="indeterminate" />
            <p class="muted small">กำลังสำรอง อย่าปิดหน้านี้</p>
          }
        </section>

        <section class="panel panel-pad">
          <h2>สำรองอัตโนมัติ</h2>
          @if (settings(); as s) {
            <mat-checkbox [(ngModel)]="s.scheduled">สำรองทุกคืน 02:00 (ไม่รวมไฟล์แนบ)</mat-checkbox>
            <div class="row">
              <mat-form-field subscriptSizing="dynamic"><mat-label>เก็บไฟล์อัตโนมัติ (วัน)</mat-label><input matInput type="number" min="1" max="3650" [(ngModel)]="s.keepDays" /></mat-form-field>
              <button mat-stroked-button (click)="saveSettings(s)">บันทึก</button>
            </div>
            <p class="muted small">ไฟล์เก็บที่เซิร์ฟเวอร์: <code>{{ s.directory }}</code> ควรคัดลอกไปเก็บนอกเครื่อง (เช่น ฮาร์ดดิสก์สำรองหรือคลาวด์ของบริษัท) เป็นประจำ</p>
          }
        </section>
      </div>

      <p class="notice">ไฟล์ ZIP นี้ใช้ส่งต่อข้อมูลหรือเก็บเป็นหลักฐาน การกู้คืนทั้งระบบให้ใช้ไฟล์ pg_dump ตามคู่มือใน README (ผู้ดูแลเซิร์ฟเวอร์)</p>

      <section class="panel">
        <div class="sec-head"><h2>ประวัติการสำรอง</h2></div>
        <div class="scroll">
          <table class="grid">
            <thead><tr><th>เริ่ม</th><th>ประเภท</th><th>สถานะ</th><th>ไฟล์</th><th class="num">ขนาด</th><th class="num">ตาราง</th><th class="num">แถว</th><th>โดย</th><th></th></tr></thead>
            <tbody>
              @for (r of runs(); track r.id) {
                <tr>
                  <td class="small">{{ r.startedAt | thDate: true }}</td>
                  <td class="small">{{ r.kind === 'manual' ? 'กดสำรอง' : 'อัตโนมัติ' }}</td>
                  <td>
                    <span class="chip" [class]="r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'danger' : 'warn'">{{ r.status === 'ok' ? 'สำเร็จ' : r.status === 'failed' ? 'ล้มเหลว' : 'กำลังทำ' }}</span>
                    @if (r.error) {
                      <div class="small bad">{{ r.error }}</div>
                    }
                  </td>
                  <td class="small">{{ r.fileName || '–' }}</td>
                  <td class="num">{{ r.sizeBytes === null ? '–' : size(r.sizeBytes) }}</td>
                  <td class="num">{{ r.tableCount ?? '–' }}</td>
                  <td class="num">{{ r.rowCount === null ? '–' : r.rowCount.toLocaleString('th-TH') }}</td>
                  <td class="small">{{ r.createdByName || 'ระบบ' }}</td>
                  <td class="nowrap">
                    @if (r.fileAvailable) {
                      <button mat-button (click)="download(r)"><mat-icon>download</mat-icon> ดาวน์โหลด</button>
                    }
                    <button mat-icon-button (click)="remove(r)" aria-label="ลบ"><mat-icon>delete</mat-icon></button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="empty muted">ยังไม่เคยสำรองข้อมูล</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
    .cols .panel { margin: 0; }
    h2 { margin: 0 0 10px; }
    .row { display: flex; gap: 12px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
    .nowrap { white-space: nowrap; }
    code { font-size: 0.8rem; background: #f1f3f2; padding: 1px 4px; border-radius: 3px; }
  `,
})
export class BackupPage implements OnInit {
  private readonly api = inject(BackupApi);
  private readonly files = inject(FileService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly runs = signal<BackupRun[]>([]);
  readonly settings = signal<BackupSettings | null>(null);
  readonly busy = signal(false);
  readonly size = fileSize;
  includeFiles = false;

  ngOnInit(): void {
    this.load();
    this.api.settings().subscribe((s) => this.settings.set(s));
  }

  load(): void {
    this.api.runs().subscribe({ next: (r) => this.runs.set(r), error: (e) => this.notify.error(e) });
  }

  run(): void {
    this.busy.set(true);
    this.api.run(this.includeFiles).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.load();
        if (r.status === 'ok') this.notify.ok(`สำรองแล้ว ${r.tableCount} ตาราง ${r.rowCount?.toLocaleString('th-TH')} แถว`);
        else this.notify.error(r.error ?? 'สำรองไม่สำเร็จ');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  saveSettings(s: BackupSettings): void {
    this.api.saveSettings(s.scheduled, Number(s.keepDays) || 30).subscribe({
      next: (r) => {
        this.settings.set(r);
        this.notify.ok('บันทึกแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  download(r: BackupRun): void {
    this.files.download(`/api/backups/${r.id}/file`, r.fileName ?? 'ktt-backup.zip');
  }

  remove(r: BackupRun): void {
    confirmAction(this.dialog, { title: 'ลบไฟล์สำรอง', message: `ลบ ${r.fileName ?? 'รายการนี้'}? ลบแล้วกู้คืนไม่ได้`, confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.remove(r.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }),
    );
  }
}
