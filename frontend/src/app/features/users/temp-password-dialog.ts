import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

/** แสดงรหัสผ่านชั่วคราวครั้งเดียว ให้ผู้ดูแลส่งต่อพนักงานทางช่องทางที่ปลอดภัย */
@Component({
  selector: 'app-temp-password-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>รหัสผ่านชั่วคราวของ {{ data.name }}</h2>
    <mat-dialog-content>
      <p class="pw mono-code">{{ data.password }}</p>
      <p>แจ้งรหัสนี้ให้ผู้ใช้โดยตรง ระบบจะแสดงครั้งเดียว ผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าสู่ระบบครั้งแรก</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="copy()">{{ copied() ? 'คัดลอกแล้ว' : 'คัดลอก' }}</button>
      <button mat-flat-button mat-dialog-close>เสร็จสิ้น</button>
    </mat-dialog-actions>
  `,
  styles: `
    .pw {
      font-size: 1.4rem;
      padding: 12px 16px;
      background: #f4f6f5;
      border: 1px dashed var(--ktt-line);
      border-radius: var(--ktt-radius-s);
      user-select: all;
    }
  `,
})
export class TempPasswordDialog {
  readonly data = inject<{ name: string; password: string }>(MAT_DIALOG_DATA);
  readonly copied = signal(false);

  copy(): void {
    navigator.clipboard?.writeText(this.data.password).then(() => this.copied.set(true));
  }
}
