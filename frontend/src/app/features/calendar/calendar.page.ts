import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { addDaysIso, thDateLong, todayIso } from '../../core/util/format';
import { MoneyPipe } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { fromLocalInput, toLocalInput } from '../service/service-dialogs';
import { CAL_SOURCES, CalEvent, CalEventSave, CalItem, CalendarApi, EVENT_KIND } from './calendar.api';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

// ======================================================================= นัดหมาย

@Component({
  selector: 'app-event-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ e?.id ? 'แก้ไขนัดหมาย' : 'นัดหมายใหม่' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <mat-form-field class="full"><mat-label>หัวข้อ</mat-label><input matInput [(ngModel)]="m.title" required [disabled]="readonly" /></mat-form-field>
      <div class="two">
        <mat-form-field>
          <mat-label>ประเภท</mat-label>
          <mat-select [(ngModel)]="m.kind" [disabled]="readonly">
            @for (k of kinds; track k[0]) {
              <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>โครงการ</mat-label>
          <mat-select [(ngModel)]="m.projectId" [disabled]="readonly">
            <mat-option [value]="null">–</mat-option>
            @for (p of projects(); track p.id) {
              <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (m.allDay) {
          <mat-form-field><mat-label>วันที่</mat-label><input matInput type="date" [(ngModel)]="day" [disabled]="readonly" /></mat-form-field>
          <mat-form-field><mat-label>ถึงวันที่</mat-label><input matInput type="date" [(ngModel)]="dayEnd" [disabled]="readonly" /></mat-form-field>
        } @else {
          <mat-form-field><mat-label>เริ่ม</mat-label><input matInput type="datetime-local" [(ngModel)]="start" [disabled]="readonly" /></mat-form-field>
          <mat-form-field><mat-label>ถึง</mat-label><input matInput type="datetime-local" [(ngModel)]="end" [disabled]="readonly" /></mat-form-field>
        }
      </div>
      <div class="checks">
        <mat-checkbox [(ngModel)]="m.allDay" [disabled]="readonly">ทั้งวัน</mat-checkbox>
        <mat-checkbox [(ngModel)]="m.isPrivate" [disabled]="readonly">เห็นเฉพาะฉัน</mat-checkbox>
      </div>
      <mat-form-field class="full"><mat-label>สถานที่</mat-label><input matInput [(ngModel)]="m.location" [disabled]="readonly" /></mat-form-field>
      <mat-form-field class="full"><mat-label>รายละเอียด</mat-label><textarea matInput rows="3" [(ngModel)]="m.notes" [disabled]="readonly"></textarea></mat-form-field>
      @if (e?.createdByName) {
        <p class="muted small">สร้างโดย {{ e!.createdByName }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (e?.id && !readonly) {
        <button mat-button class="danger-text" (click)="remove()">ลบ</button>
      }
      <span class="grow"></span>
      <button mat-button mat-dialog-close>{{ readonly ? 'ปิด' : 'ยกเลิก' }}</button>
      @if (!readonly) {
        <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title">บันทึก</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(520px, 90vw); }
    .full { width: 100%; }
    .two { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    .checks { display: flex; gap: 16px; margin-bottom: 8px; }
    .grow { flex: 1; }
    .danger-text { color: var(--ktt-danger); }
    .err { color: var(--ktt-danger); }
  `,
})
export class EventDialog {
  private readonly api = inject(CalendarApi);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<EventDialog, boolean>);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly data = inject<{ event?: CalEvent; date?: string }>(MAT_DIALOG_DATA);
  readonly e = this.data.event ?? null;
  readonly readonly = !!this.e && !this.e.editable;
  readonly kinds = Object.entries(EVENT_KIND);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m: CalEventSave = {
    title: this.e?.title ?? '',
    kind: this.e?.kind ?? 'meeting',
    startsAt: this.e?.startsAt ?? '',
    endsAt: this.e?.endsAt ?? null,
    allDay: this.e?.allDay ?? false,
    location: this.e?.location ?? null,
    projectId: this.e?.projectId ?? null,
    isPrivate: this.e?.isPrivate ?? false,
    notes: this.e?.notes ?? null,
  };
  start = this.e ? toLocalInput(this.e.startsAt) : `${this.data.date ?? todayIso()}T09:00`;
  end = this.e?.endsAt ? toLocalInput(this.e.endsAt) : `${this.data.date ?? todayIso()}T10:00`;
  day = this.start.slice(0, 10);
  dayEnd = this.end.slice(0, 10);

  save(): void {
    let startsAt: string | null;
    let endsAt: string | null;
    if (this.m.allDay) {
      startsAt = fromLocalInput(`${this.day}T00:00`);
      endsAt = fromLocalInput(`${this.dayEnd || this.day}T23:59`);
    } else {
      startsAt = fromLocalInput(this.start);
      endsAt = fromLocalInput(this.end);
    }
    if (!startsAt) {
      this.error.set('กรุณาระบุวันเวลา');
      return;
    }
    this.busy.set(true);
    this.api.save(this.e?.id ?? null, { ...this.m, startsAt, endsAt, location: this.m.location || null, notes: this.m.notes || null }).subscribe({
      next: () => this.ref.close(true),
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  remove(): void {
    confirmAction(this.dialog, { title: 'ลบนัดหมาย', message: `ลบ "${this.e!.title}"?`, confirmText: 'ลบ', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.remove(this.e!.id).subscribe({ next: () => this.ref.close(true), error: (err) => this.error.set(errorMessage(err)) });
    });
  }
}

// ======================================================================= ปฏิทิน

interface Day {
  iso: string;
  num: number;
  inMonth: boolean;
  today: boolean;
  weekend: boolean;
  items: CalItem[];
}

@Component({
  selector: 'app-calendar-page',
  imports: [FormsModule, NgTemplateOutlet, MatButtonModule, MatButtonToggleModule, MatIconModule, MoneyPipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ปฏิทิน</h1>
          <p>นัดหมาย แผนโครงการ ติดตามลูกค้า งวดเงิน เจ้าหนี้ ของเข้า ใบอนุญาตหมดอายุ และนัดซ่อม ในที่เดียว (แสดงเฉพาะที่คุณมีสิทธิ์ดู)</p>
        </div>
        <button mat-flat-button class="btn-primary" (click)="newEvent(selected())"><mat-icon>add</mat-icon> นัดหมาย</button>
      </div>

      <div class="panel">
        <div class="toolbar">
          <button mat-icon-button (click)="shift(-1)" aria-label="เดือนก่อน"><mat-icon>chevron_left</mat-icon></button>
          <h2>{{ title() }}</h2>
          <button mat-icon-button (click)="shift(1)" aria-label="เดือนถัดไป"><mat-icon>chevron_right</mat-icon></button>
          <button mat-stroked-button (click)="goToday()">วันนี้</button>
          <span class="grow"></span>
          <mat-button-toggle-group [ngModel]="view()" (ngModelChange)="view.set($event)" hideSingleSelectionIndicator aria-label="มุมมอง">
            <mat-button-toggle value="month">เดือน</mat-button-toggle>
            <mat-button-toggle value="agenda">รายการ</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <div class="legend" role="group" aria-label="แหล่งข้อมูล">
          @for (s of sources; track s.key) {
            <button class="src" [class.off]="hidden().has(s.key)" (click)="toggle(s.key)" [attr.aria-pressed]="!hidden().has(s.key)">
              <i [style.background]="s.color"></i>{{ s.label }} <span class="muted">{{ countBy()[s.key] ?? 0 }}</span>
            </button>
          }
        </div>

        @if (view() === 'month') {
          <div class="month" role="grid" [attr.aria-label]="title()">
            @for (d of dow; track d) {
              <div class="dow" role="columnheader">{{ d }}</div>
            }
            @for (d of days(); track d.iso) {
              <div class="cell" role="gridcell" [class.out]="!d.inMonth" [class.today]="d.today" [class.weekend]="d.weekend" [class.sel]="d.iso === selected()" (click)="selected.set(d.iso)" tabindex="0" (keydown.enter)="selected.set(d.iso)">
                <div class="num">{{ d.num }}</div>
                @for (it of d.items.slice(0, 3); track it.id) {
                  <button class="item" (click)="$event.stopPropagation(); openItem(it)" [title]="it.title + (it.subtitle ? ' · ' + it.subtitle : '')">
                    <i [style.background]="color(it.source)"></i>
                    @if (!it.allDay && it.startsAt) {
                      <span class="t">{{ time(it.startsAt) }}</span>
                    }
                    <span class="txt">{{ it.title }}</span>
                  </button>
                }
                @if (d.items.length > 3) {
                  <button class="more" (click)="$event.stopPropagation(); selected.set(d.iso)">+{{ d.items.length - 3 }} รายการ</button>
                }
              </div>
            }
          </div>
          <section class="day-panel">
            <div class="day-head">
              <h3>{{ long(selected()) }}</h3>
              <button mat-button (click)="newEvent(selected())"><mat-icon>add</mat-icon> นัดหมายวันนี้</button>
            </div>
            @for (it of dayItems(); track it.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: it }" />
            } @empty {
              <p class="muted">ไม่มีรายการ</p>
            }
          </section>
        } @else {
          <div class="agenda">
            @for (g of agenda(); track g.iso) {
              <div class="ag-day" [class.today]="g.iso === today">
                <h3>{{ long(g.iso) }}</h3>
                @for (it of g.items; track it.id) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: it }" />
                }
              </div>
            } @empty {
              <p class="muted pad">ไม่มีรายการในเดือนนี้</p>
            }
          </div>
        }
      </div>
    </div>

    <ng-template #row let-it>
      <button class="ag-item" (click)="openItem(it)">
        <i [style.background]="color(it.source)"></i>
        <span class="when">{{ it.allDay || !it.startsAt ? 'ทั้งวัน' : time(it.startsAt) }}</span>
        <span class="what">
          <b>{{ it.title }}</b>
          <span class="muted small">{{ srcLabel(it.source) }}{{ it.subtitle ? ' · ' + it.subtitle : '' }}{{ it.projectCode && it.source === 'event' ? ' · ' + it.projectCode : '' }}</span>
        </span>
        @if (it.amount !== null) {
          <span class="amt">{{ it.amount | money }}</span>
        }
      </button>
    </ng-template>
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `
    .toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px 4px; flex-wrap: wrap; }
    .toolbar h2 { margin: 0; min-width: 170px; text-align: center; }
    .legend { display: flex; gap: 6px; flex-wrap: wrap; padding: 4px 16px 12px; }
    .src { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ktt-line); background: #fff; border-radius: 16px; padding: 4px 10px; font: inherit; font-size: 0.85rem; cursor: pointer; }
    .src.off { opacity: 0.45; text-decoration: line-through; }
    i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; flex: none; }
    .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid var(--ktt-line); }
    .dow { padding: 6px 8px; font-size: 0.8rem; color: var(--ktt-steel); background: #f6f7f6; border-bottom: 1px solid var(--ktt-line); }
    .cell { min-height: 112px; border-right: 1px solid #eceeed; border-bottom: 1px solid #eceeed; padding: 4px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .cell:nth-child(7n + 7) { border-right: 0; }
    .cell.out { background: #fafbfa; color: #a0a6a4; }
    .cell.weekend:not(.out) { background: #fcfcfb; }
    .cell.sel { outline: 2px solid var(--ktt-ink-2); outline-offset: -2px; }
    .cell .num { font-size: 0.85rem; font-weight: 600; padding: 0 2px; }
    .cell.today .num { display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: var(--ktt-ink-2); color: #fff; }
    .item { display: flex; align-items: center; gap: 4px; border: 0; background: none; padding: 1px 2px; font: inherit; font-size: 0.78rem; text-align: left; cursor: pointer; border-radius: 3px; min-width: 0; color: inherit; }
    .item:hover { background: #eef2f5; }
    .item .t { color: var(--ktt-steel); flex: none; }
    .item .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more { border: 0; background: none; font: inherit; font-size: 0.75rem; color: var(--ktt-steel); text-align: left; cursor: pointer; padding: 0 2px; }
    .day-panel { padding: 12px 16px 16px; border-top: 1px solid var(--ktt-line); }
    .day-head { display: flex; align-items: center; justify-content: space-between; }
    h3 { margin: 6px 0; font-size: 1rem; }
    .ag-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-bottom: 1px solid #eceeed; background: none; padding: 8px 4px; font: inherit; text-align: left; cursor: pointer; color: inherit; }
    .ag-item:hover { background: #f3f6f8; }
    .ag-item i { width: 10px; height: 10px; }
    .ag-item .when { width: 56px; flex: none; color: var(--ktt-steel); font-size: 0.85rem; }
    .ag-item .what { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ag-item .amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .agenda { padding: 0 16px 16px; }
    .ag-day { padding-top: 6px; }
    .ag-day.today h3 { color: var(--ktt-ink-2); }
    .pad { padding: 16px; }
    .grow { flex: 1; }
    @media (max-width: 700px) {
      .cell { min-height: 56px; }
      .item .txt, .item .t, .more { display: none; }
      .item { padding: 0; }
      .cell { flex-direction: row; flex-wrap: wrap; align-content: flex-start; }
      .cell .num { width: 100%; }
    }
  `,
})
export class CalendarPage implements OnInit {
  private readonly api = inject(CalendarApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  readonly sources = CAL_SOURCES;
  readonly dow = DOW;
  readonly today = todayIso();
  readonly month = signal(todayIso().slice(0, 7));
  readonly selected = signal(todayIso());
  readonly view = signal<'month' | 'agenda'>(window.innerWidth < 700 ? 'agenda' : 'month');
  readonly items = signal<CalItem[]>([]);
  readonly hidden = signal(new Set<string>());

  readonly visible = computed(() => this.items().filter((i) => !this.hidden().has(i.source)));
  readonly countBy = computed(() => {
    const c: Record<string, number> = {};
    for (const i of this.items()) c[i.source] = (c[i.source] ?? 0) + 1;
    return c;
  });
  readonly title = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return `${TH_MONTH[m - 1]} ${y + 543}`;
  });
  private readonly range = computed(() => {
    const first = this.month() + '-01';
    const d = new Date(first + 'T00:00:00');
    const back = (d.getDay() + 6) % 7;
    const start = addDaysIso(first, -back);
    return { start, end: addDaysIso(start, 41) };
  });
  readonly days = computed<Day[]>(() => {
    const { start } = this.range();
    const byDay = new Map<string, CalItem[]>();
    for (const it of this.visible()) {
      const list = byDay.get(it.date) ?? [];
      list.push(it);
      byDay.set(it.date, list);
    }
    return Array.from({ length: 42 }, (_, i) => {
      const iso = addDaysIso(start, i);
      const g = new Date(iso + 'T00:00:00').getDay();
      return { iso, num: Number(iso.slice(8)), inMonth: iso.startsWith(this.month()), today: iso === this.today, weekend: g === 0 || g === 6, items: byDay.get(iso) ?? [] };
    });
  });
  readonly dayItems = computed(() => this.visible().filter((i) => i.date === this.selected()));
  readonly agenda = computed(() => {
    const out: { iso: string; items: CalItem[] }[] = [];
    for (const it of this.visible()) {
      if (!it.date.startsWith(this.month())) continue;
      const last = out[out.length - 1];
      if (last?.iso === it.date) last.items.push(it);
      else out.push({ iso: it.date, items: [it] });
    }
    return out;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const { start, end } = this.range();
    this.api.items(start, end).subscribe({ next: (r) => this.items.set(r), error: (e) => this.notify.error(e) });
  }

  shift(n: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    this.month.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    this.selected.set(this.month() === this.today.slice(0, 7) ? this.today : this.month() + '-01');
    this.load();
  }

  goToday(): void {
    this.month.set(this.today.slice(0, 7));
    this.selected.set(this.today);
    this.load();
  }

  toggle(key: string): void {
    const s = new Set(this.hidden());
    if (s.has(key)) s.delete(key);
    else s.add(key);
    this.hidden.set(s);
  }

  color(source: string): string {
    return CAL_SOURCES.find((s) => s.key === source)?.color ?? '#888';
  }

  srcLabel(source: string): string {
    return CAL_SOURCES.find((s) => s.key === source)?.label ?? '';
  }

  time(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  long(iso: string): string {
    return thDateLong(iso);
  }

  openItem(it: CalItem): void {
    if (it.source === 'event') {
      this.api.event(it.id.slice(3)).subscribe({
        next: (e) =>
          this.dialog
            .open(EventDialog, { data: { event: e }, maxWidth: '96vw' })
            .afterClosed()
            .subscribe((r) => r && this.load()),
        error: (e) => this.notify.error(e),
      });
    } else if (it.link) {
      this.router.navigateByUrl(it.link);
    }
  }

  newEvent(date: string): void {
    this.dialog
      .open(EventDialog, { data: { date }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.load());
  }
}
