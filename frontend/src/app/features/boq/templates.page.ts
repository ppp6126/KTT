import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe } from '../../core/util/format';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { JOB_TYPES } from '../leads/leads.api';
import { BoqApi, TemplateSummary } from './boq.api';

@Component({
  selector: 'app-templates-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, ThDatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>แม่แบบ BOQ</h1>
          <p>ชุดงานสำเร็จรูป เช่น งานฐานราก งานผนังก่ออิฐ งานฝ้า ใช้เริ่ม BOQ ใหม่หรือแทรกเข้า BOQ ที่ทำอยู่</p>
        </div>
        @if (canWrite()) {
          <a mat-flat-button class="btn-primary" routerLink="/boq-templates/new"><mat-icon>add</mat-icon> สร้างแม่แบบ</a>
        }
      </div>
      <div class="panel">
        <ul class="list">
          @for (t of items(); track t.id) {
            <li>
              <div class="grow">
                <a [routerLink]="['/boq-templates', t.id]" class="name">{{ t.name }}</a>
                <div class="muted small">
                  {{ t.jobType ? jobTypes[t.jobType] + ', ' : '' }}{{ t.itemCount }} แถว, แก้ไขล่าสุด {{ t.updatedAt | thDate }}
                </div>
                @if (t.description) {
                  <div class="small">{{ t.description }}</div>
                }
              </div>
              @if (canWrite()) {
                <button mat-icon-button (click)="remove(t)" aria-label="ลบแม่แบบ"><mat-icon>delete</mat-icon></button>
              }
            </li>
          } @empty {
            <li class="empty-state"><p>ยังไม่มีแม่แบบ สร้างใหม่ หรือเปิด BOQ ที่ทำไว้แล้วเลือก "บันทึกเป็นแม่แบบ"</p></li>
          }
        </ul>
      </div>
    </div>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { display: flex; gap: 12px; align-items: center; padding: 12px 20px; border-top: 1px solid var(--ktt-line); }
    .list li:first-child { border-top: none; }
    .name { font-weight: 600; }
    .grow { flex: 1; }
    .small { font-size: 0.85rem; }
  `,
})
export class TemplatesPage implements OnInit {
  private readonly api = inject(BoqApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly auth = inject(AuthService);
  readonly items = signal<TemplateSummary[]>([]);
  readonly jobTypes = JOB_TYPES;
  readonly canWrite = computed(() => this.auth.can(Perm.BOQ_WRITE));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.templates().subscribe({ next: (t) => this.items.set(t), error: (e) => this.notify.error(e) });
  }

  remove(t: TemplateSummary): void {
    confirmAction(this.dialog, { title: 'ลบแม่แบบ', message: `ลบ "${t.name}" (BOQ ที่สร้างไปแล้วไม่เปลี่ยน)`, confirmText: 'ลบ', danger: true })
      .subscribe((ok) => ok && this.api.deleteTemplate(t.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }));
  }
}
