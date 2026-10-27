import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';

export interface PromptData {
  title: string;
  message?: string;
  label: string;
  confirmText: string;
  required?: boolean;
  value?: string;
  multiline?: boolean;
}

/** ถามข้อความหนึ่งช่อง เช่น เหตุผลที่ไม่ได้งาน, ชื่อสำเนา */
@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p>{{ data.message }}</p>
      }
      <mat-form-field class="w-full">
        <mat-label>{{ data.label }}</mat-label>
        @if (data.multiline) {
          <textarea matInput rows="3" [(ngModel)]="value" cdkFocusInitial></textarea>
        } @else {
          <input matInput [(ngModel)]="value" cdkFocusInitial (keydown.enter)="value.trim() && ref.close(value.trim())" />
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="data.required && !value.trim()" (click)="ref.close(value.trim())">{{ data.confirmText }}</button>
    </mat-dialog-actions>
  `,
  styles: `.w-full { width: min(440px, 76vw); }`,
})
export class PromptDialog {
  readonly data = inject<PromptData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PromptDialog, string>);
  value = this.data.value ?? '';
}

export function prompt(dialog: MatDialog, data: PromptData): Observable<string | undefined> {
  return dialog.open(PromptDialog, { data }).afterClosed();
}
