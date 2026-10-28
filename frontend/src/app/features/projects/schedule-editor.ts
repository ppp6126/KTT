import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { addDaysIso, daysBetween, thDateShort, todayIso } from '../../core/util/format';
import { Lookups } from '../../shared/lookups';
import { Notify } from '../../shared/notify.service';
import { Schedule, TaskInput, ProjectsApi } from './projects.api';
import { CalcTask, rollup } from './schedule-calc';

interface Row {
  key: string;
  id: string | null;
  parentKey: string | null;
  predecessorKey: string | null;
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  weight: number;
  progressPct: number;
  assigneeId: string | null;
  isMilestone: boolean;
}

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * แผนงานแบบ Gantt: ตารางแก้ไขได้ทางซ้าย แถบเวลาทางขวา
 * งานที่มีงานย่อยเป็น "หมวด" วันที่และ % คำนวณจากงานย่อยอัตโนมัติ
 */
@Component({
  selector: 'app-schedule-editor',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatCheckboxModule],
  template: `
    <div class="bar">
      @if (canEdit()) {
        <button mat-stroked-button (click)="addRoot()"><mat-icon>add</mat-icon> เพิ่มหมวด/งาน</button>
        <button mat-button [matMenuTriggerFor]="tools"><mat-icon>tune</mat-icon> เครื่องมือ</button>
        <mat-menu #tools="matMenu">
          <button mat-menu-item (click)="weightByDays()"><mat-icon>balance</mat-icon>น้ำหนักงาน = จำนวนวัน</button>
          <button mat-menu-item (click)="chainDates()"><mat-icon>link</mat-icon>เลื่อนวันตามงานก่อนหน้า</button>
        </mat-menu>
        <span class="grow"></span>
        @if (dirty()) {
          <span class="muted small">ยังไม่ได้บันทึก</span>
          <button mat-button (click)="reset()">ยกเลิก</button>
        }
        <button mat-flat-button (click)="save()" [disabled]="!dirty() || busy()">บันทึกแผนงาน</button>
      } @else {
        <span class="muted small">ดูอย่างเดียว ผู้จัดการโครงการเป็นผู้แก้แผนงาน</span>
      }
    </div>

    <div class="scroll">
      <table class="gantt">
        <thead>
          <tr>
            <th class="c-no">#</th>
            <th class="c-name">งาน</th>
            <th class="c-date">เริ่ม</th>
            <th class="c-date">เสร็จ</th>
            <th class="c-days num">วัน</th>
            <th class="c-w num" matTooltip="น้ำหนักงานใช้คิด % ความคืบหน้ารวม">น้ำหนัก</th>
            <th class="c-p num">% จริง</th>
            <th class="c-p num">% แผน</th>
            <th class="c-act"></th>
            <th class="c-tl">
              <div class="months">
                @for (m of months(); track m.left) {
                  <span [style.left.%]="m.left">{{ m.label }}</span>
                }
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          @for (r of view(); track r.key; let i = $index) {
            <tr [class.group]="!r.leaf" [class.late]="r.late">
              <td class="c-no muted">{{ r.wbs }}</td>
              <td class="c-name">
                <div class="name" [style.padding-left.px]="r.depth * 18">
                  @if (r.isMilestone) {
                    <mat-icon class="ms" matTooltip="หมุดหมาย">flag</mat-icon>
                  }
                  <input [(ngModel)]="r.src.name" (ngModelChange)="touch()" [disabled]="!canEdit()" aria-label="ชื่องาน" />
                </div>
              </td>
              @if (r.leaf) {
                <td class="c-date"><input type="date" [(ngModel)]="r.src.plannedStart" (ngModelChange)="touch()" [disabled]="!canEdit()" aria-label="วันเริ่ม" /></td>
                <td class="c-date"><input type="date" [(ngModel)]="r.src.plannedEnd" (ngModelChange)="touch()" [disabled]="!canEdit()" aria-label="วันเสร็จ" /></td>
                <td class="c-days num">{{ r.days ?? '' }}</td>
                <td class="c-w"><input type="number" min="0" step="any" [(ngModel)]="r.src.weight" (ngModelChange)="touch()" [disabled]="!canEdit()" aria-label="น้ำหนัก" /></td>
                <td class="c-p"><input type="number" min="0" max="100" [(ngModel)]="r.src.progressPct" (ngModelChange)="touch()" [disabled]="!canEdit()" aria-label="% จริง" /></td>
              } @else {
                <td class="c-date muted small">{{ short(r.start) }}</td>
                <td class="c-date muted small">{{ short(r.end) }}</td>
                <td class="c-days num muted">{{ r.days ?? '' }}</td>
                <td class="c-w num muted">{{ r.weight }}</td>
                <td class="c-p num strong">{{ r.actual }}</td>
              }
              <td class="c-p num muted">{{ r.planned }}</td>
              <td class="c-act">
                @if (canEdit()) {
                  <button mat-icon-button [matMenuTriggerFor]="rowMenu" aria-label="จัดการงาน"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #rowMenu="matMenu">
                    <button mat-menu-item (click)="addChild(r.key)"><mat-icon>subdirectory_arrow_right</mat-icon>เพิ่มงานย่อย</button>
                    <button mat-menu-item (click)="addBelow(r.key)"><mat-icon>add</mat-icon>เพิ่มงานถัดไป</button>
                    <button mat-menu-item (click)="move(r.key, -1)"><mat-icon>arrow_upward</mat-icon>เลื่อนขึ้น</button>
                    <button mat-menu-item (click)="move(r.key, 1)"><mat-icon>arrow_downward</mat-icon>เลื่อนลง</button>
                    <button mat-menu-item (click)="indent(r.key)"><mat-icon>format_indent_increase</mat-icon>ย้ายเข้าเป็นงานย่อย</button>
                    <button mat-menu-item (click)="outdent(r.key)" [disabled]="!r.src.parentKey"><mat-icon>format_indent_decrease</mat-icon>ย้ายออกหนึ่งระดับ</button>
                    <button mat-menu-item (click)="r.src.isMilestone = !r.src.isMilestone; touch()"><mat-icon>flag</mat-icon>{{ r.isMilestone ? 'ไม่ใช่หมุดหมาย' : 'ตั้งเป็นหมุดหมาย' }}</button>
                    <button mat-menu-item [matMenuTriggerFor]="pre"><mat-icon>link</mat-icon>งานก่อนหน้า</button>
                    <button mat-menu-item [matMenuTriggerFor]="who"><mat-icon>person</mat-icon>ผู้รับผิดชอบ</button>
                    <button mat-menu-item (click)="remove(r.key)"><mat-icon>delete</mat-icon>ลบงาน</button>
                  </mat-menu>
                  <mat-menu #pre="matMenu">
                    <button mat-menu-item (click)="r.src.predecessorKey = null; touch()">ไม่มี</button>
                    @for (o of view(); track o.key) {
                      @if (o.key !== r.key && o.leaf) {
                        <button mat-menu-item (click)="r.src.predecessorKey = o.key; touch()">
                          {{ o.wbs }} {{ o.src.name }} @if (r.src.predecessorKey === o.key) { ✓ }
                        </button>
                      }
                    }
                  </mat-menu>
                  <mat-menu #who="matMenu">
                    <button mat-menu-item (click)="r.src.assigneeId = null; touch()">ไม่ระบุ</button>
                    @for (u of users(); track u.id) {
                      <button mat-menu-item (click)="r.src.assigneeId = u.id; touch()">{{ u.name }} @if (r.src.assigneeId === u.id) { ✓ }</button>
                    }
                  </mat-menu>
                }
              </td>
              <td class="c-tl">
                <div class="lane">
                  @if (todayLeft() !== null) {
                    <div class="today" [style.left.%]="todayLeft()"></div>
                  }
                  @if (r.barLeft !== null) {
                    @if (r.isMilestone && r.leaf) {
                      <div class="diamond" [style.left.%]="r.barLeft + r.barWidth" [matTooltip]="r.src.name + ' ' + short(r.end)"></div>
                    } @else {
                      <div class="gbar" [class.parent]="!r.leaf" [style.left.%]="r.barLeft" [style.width.%]="r.barWidth"
                           [matTooltip]="r.src.name + ': ' + short(r.start) + ' – ' + short(r.end) + ', จริง ' + r.actual + '%'">
                        <div class="done" [style.width.%]="r.actual"></div>
                      </div>
                    }
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="10" class="empty muted">ยังไม่มีแผนงาน เริ่มจากเพิ่มหมวดงาน เช่น งานฐานราก งานโครงสร้าง งานหลังคา</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (assigneeHint()) {
      <p class="muted small hint">{{ assigneeHint() }}</p>
    }
  `,
  styles: `
    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .grow { flex: 1; }
    .small { font-size: 0.85rem; }
    .scroll { overflow-x: auto; border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-s); }
    .gantt { border-collapse: collapse; min-width: 1180px; width: 100%; font-size: 0.9rem; }
    th { position: sticky; top: 0; background: #f1f3f2; color: var(--ktt-steel); font-weight: 500; text-align: left; padding: 6px; white-space: nowrap; border-bottom: 1px solid var(--ktt-line); z-index: 1; }
    td { padding: 1px 6px; border-bottom: 1px solid #eceeed; height: 34px; vertical-align: middle; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    input { width: 100%; height: 28px; padding: 0 4px; border: 1px solid transparent; border-radius: 4px; background: transparent; font: inherit; color: inherit; }
    input:hover:not(:disabled) { border-color: var(--ktt-line); }
    input:focus { outline: none; border-color: var(--ktt-ink-2); background: #fff; }
    input[type='number'] { text-align: right; }
    input:disabled { color: inherit; }
    tr.group td { background: #f4f6f5; }
    tr.group .name input { font-weight: 600; }
    tr.late .c-name input { color: var(--ktt-danger); }
    .strong { font-weight: 600; }
    .c-no { width: 44px; font-variant-numeric: tabular-nums; }
    .c-name { min-width: 220px; }
    .name { display: flex; align-items: center; gap: 2px; }
    .ms { font-size: 16px; width: 16px; height: 16px; color: var(--ktt-ink-2); }
    .c-date { width: 128px; }
    .c-days { width: 44px; }
    .c-w { width: 76px; }
    .c-p { width: 76px; }
    .c-act { width: 40px; padding: 0; }
    .c-tl { width: 420px; min-width: 420px; padding: 0 8px; }
    .months { position: relative; height: 16px; }
    .months span { position: absolute; font-size: 0.75rem; transform: translateX(2px); border-left: 1px solid #cfd5d3; padding-left: 3px; }
    .lane { position: relative; height: 20px; }
    .today { position: absolute; top: -8px; bottom: -8px; width: 0; border-left: 1px dashed var(--ktt-ink); }
    .gbar { position: absolute; top: 4px; height: 12px; min-width: 3px; background: #cfe0f4; border-radius: 3px; overflow: hidden; }
    .gbar .done { height: 100%; background: #2a78d6; }
    .gbar.parent { top: 7px; height: 6px; background: #c9cfcd; }
    .gbar.parent .done { background: var(--ktt-ink); }
    .diamond { position: absolute; top: 3px; width: 12px; height: 12px; background: var(--ktt-ink); transform: translateX(-6px) rotate(45deg); }
    .empty { text-align: center; padding: 28px; }
    .hint { margin-top: 6px; }
  `,
})
export class ScheduleEditor {
  private readonly api = inject(ProjectsApi);
  private readonly notify = inject(Notify);
  readonly users = toSignal(inject(Lookups).users(), { initialValue: [] });

  readonly projectId = input.required<string>();
  readonly schedule = input<Schedule | null>(null);
  readonly canEdit = input(false);
  readonly saved = output<Schedule>();

  readonly rows = signal<Row[]>([]);
  readonly version = signal(0);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly today = todayIso();

  constructor() {
    effect(() => {
      const s = this.schedule();
      if (s) this.load(s);
    });
  }

  private load(s: Schedule): void {
    const keyOf = new Map(s.tasks.map((t) => [t.id, t.id]));
    this.rows.set(
      s.tasks.map((t) => ({
        key: t.id,
        id: t.id,
        parentKey: t.parentId ? (keyOf.get(t.parentId) ?? null) : null,
        predecessorKey: t.predecessorId ? (keyOf.get(t.predecessorId) ?? null) : null,
        name: t.name,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        actualStart: t.actualStart,
        actualEnd: t.actualEnd,
        weight: t.leaf ? t.weight : 1,
        progressPct: t.progressPct,
        assigneeId: t.assigneeId,
        isMilestone: t.isMilestone,
      })),
    );
    this.dirty.set(false);
    this.version.update((v) => v + 1);
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((v) => v + 1);
  }

  reset(): void {
    const s = this.schedule();
    if (s) this.load(s);
  }

  // ---------------------------------------------------------------- derived view

  /** เรียงตามต้นไม้ พร้อมเลข WBS ค่ารวม และตำแหน่งแถบ */
  readonly view = computed(() => {
    this.version();
    const rows = this.rows();
    const kids = new Map<string | null, Row[]>();
    for (const r of rows) {
      const list = kids.get(r.parentKey) ?? [];
      list.push(r);
      kids.set(r.parentKey, list);
    }
    const calc: CalcTask[] = rows.map((r) => ({
      key: r.key,
      parentKey: r.parentKey,
      weight: Number(r.weight) || 0,
      progress: Number(r.progressPct) || 0,
      plannedStart: r.plannedStart || null,
      plannedEnd: r.plannedEnd || null,
    }));
    const roll = rollup(calc, this.today);
    const range = (r: Row): [string | null, string | null] => {
      const ks = kids.get(r.key);
      if (!ks?.length) return [r.plannedStart || null, r.plannedEnd || null];
      let s: string | null = null;
      let e: string | null = null;
      for (const k of ks) {
        const [a, b] = range(k);
        if (a && (!s || a < s)) s = a;
        if (b && (!e || b > e)) e = b;
      }
      return [s, e];
    };
    const [p0, p1] = this.span();
    const total = p0 && p1 ? Math.max(1, daysBetween(p0, p1) + 1) : 0;
    const out: {
      key: string;
      src: Row;
      depth: number;
      wbs: string;
      leaf: boolean;
      start: string | null;
      end: string | null;
      days: number | null;
      weight: number;
      actual: number;
      planned: number;
      late: boolean;
      isMilestone: boolean;
      barLeft: number | null;
      barWidth: number;
    }[] = [];
    const walk = (parent: string | null, depth: number, prefix: string) => {
      (kids.get(parent) ?? []).forEach((r, i) => {
        const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        const leaf = !(kids.get(r.key)?.length);
        const [s, e] = range(r);
        const ro = roll.get(r.key)!;
        const days = s && e ? daysBetween(s, e) + 1 : null;
        const barLeft = s && e && total ? (daysBetween(p0!, s) / total) * 100 : null;
        const barWidth = s && e && total ? ((daysBetween(s, e) + 1) / total) * 100 : 0;
        out.push({
          key: r.key,
          src: r,
          depth,
          wbs,
          leaf,
          start: s,
          end: e,
          days,
          weight: Math.round(ro.weight * 1000) / 1000,
          actual: ro.actualPct,
          planned: ro.plannedPct,
          late: !!e && e < this.today && ro.actualPct < 100,
          isMilestone: r.isMilestone,
          barLeft,
          barWidth,
        });
        walk(r.key, depth + 1, wbs);
      });
    };
    walk(null, 0, '');
    return out;
  });

  /** ช่วงวันที่ของแถบเวลา: ต้นเดือนแรกถึงปลายเดือนสุดท้าย */
  readonly span = computed((): [string | null, string | null] => {
    this.version();
    let s: string | null = null;
    let e: string | null = null;
    for (const r of this.rows()) {
      if (r.plannedStart && (!s || r.plannedStart < s)) s = r.plannedStart;
      if (r.plannedEnd && (!e || r.plannedEnd > e)) e = r.plannedEnd;
    }
    if (!s || !e) return [null, null];
    const start = `${s.slice(0, 7)}-01`;
    const ed = new Date(`${e.slice(0, 7)}-01T00:00:00`);
    ed.setMonth(ed.getMonth() + 1);
    ed.setDate(0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [start, `${ed.getFullYear()}-${pad(ed.getMonth() + 1)}-${pad(ed.getDate())}`];
  });

  readonly months = computed(() => {
    const [s, e] = this.span();
    if (!s || !e) return [];
    const total = daysBetween(s, e) + 1;
    const out: { left: number; label: string }[] = [];
    const d = new Date(`${s}T00:00:00`);
    while (true) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
      if (iso > e) break;
      out.push({ left: (daysBetween(s, iso) / total) * 100, label: `${MONTHS[d.getMonth()]} ${String((d.getFullYear() + 543) % 100)}` });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  });

  readonly todayLeft = computed(() => {
    const [s, e] = this.span();
    if (!s || !e || this.today < s || this.today > e) return null;
    return (daysBetween(s, this.today) / (daysBetween(s, e) + 1)) * 100;
  });

  readonly assigneeHint = computed(() => {
    const names = new Map(this.users().map((u) => [u.id, u.name]));
    const list = this.view().filter((r) => r.src.assigneeId).map((r) => `${r.wbs} ${names.get(r.src.assigneeId!) ?? ''}`);
    return list.length ? `ผู้รับผิดชอบ: ${list.join(', ')}` : '';
  });

  short(d: string | null): string {
    return d ? thDateShort(d) : '–';
  }

  // ---------------------------------------------------------------- editing

  private blank(parentKey: string | null): Row {
    const ref = this.span()[1] ?? this.today;
    const start = this.rows().length ? ref : this.today;
    return {
      key: newKey(),
      id: null,
      parentKey,
      predecessorKey: null,
      name: '',
      plannedStart: start,
      plannedEnd: addDaysIso(start, 6),
      actualStart: null,
      actualEnd: null,
      weight: 1,
      progressPct: 0,
      assigneeId: null,
      isMilestone: false,
    };
  }

  /** index ถัดจากงานและงานย่อยทั้งหมดของ key */
  private endOfSubtree(rows: Row[], key: string): number {
    const desc = this.descendants(rows, key);
    let last = rows.findIndex((r) => r.key === key);
    rows.forEach((r, i) => {
      if (desc.has(r.key)) last = Math.max(last, i);
    });
    return last + 1;
  }

  private descendants(rows: Row[], key: string): Set<string> {
    const out = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of rows) {
        if (r.parentKey && (r.parentKey === key || out.has(r.parentKey)) && !out.has(r.key)) {
          out.add(r.key);
          grew = true;
        }
      }
    }
    return out;
  }

  addRoot(): void {
    this.rows.update((rows) => [...rows, this.blank(null)]);
    this.touch();
  }

  addChild(key: string): void {
    const rows = [...this.rows()];
    const parent = rows.find((r) => r.key === key)!;
    const child = this.blank(key);
    if (parent.plannedStart) {
      child.plannedStart = parent.plannedStart;
      child.plannedEnd = parent.plannedEnd ?? addDaysIso(parent.plannedStart, 6);
    }
    rows.splice(this.endOfSubtree(rows, key), 0, child);
    this.rows.set(rows);
    this.touch();
  }

  addBelow(key: string): void {
    const rows = [...this.rows()];
    const r = rows.find((x) => x.key === key)!;
    const n = this.blank(r.parentKey);
    if (r.plannedEnd) {
      n.plannedStart = addDaysIso(r.plannedEnd, 1);
      n.plannedEnd = addDaysIso(r.plannedEnd, 7);
      n.predecessorKey = r.key;
    }
    rows.splice(this.endOfSubtree(rows, key), 0, n);
    this.rows.set(rows);
    this.touch();
  }

  remove(key: string): void {
    const desc = this.descendants(this.rows(), key);
    if (desc.size && !confirm(`ลบงานนี้พร้อมงานย่อยอีก ${desc.size} งาน`)) return;
    this.rows.update((rows) =>
      rows
        .filter((r) => r.key !== key && !desc.has(r.key))
        .map((r) => (r.predecessorKey === key || (r.predecessorKey && desc.has(r.predecessorKey)) ? { ...r, predecessorKey: null } : r)),
    );
    this.touch();
  }

  /** สลับกับพี่น้องที่อยู่ติดกัน (ย้ายทั้งกิ่ง) */
  move(key: string, dir: -1 | 1): void {
    const rows = this.rows();
    const me = rows.find((r) => r.key === key)!;
    const siblings = rows.filter((r) => r.parentKey === me.parentKey);
    const idx = siblings.indexOf(me);
    const other = siblings[idx + dir];
    if (!other) return;
    const [first, second] = dir < 0 ? [other, me] : [me, other];
    const blockA = this.block(rows, first.key);
    const blockB = this.block(rows, second.key);
    const start = rows.indexOf(rows.find((r) => blockA.has(r.key))!);
    const a = rows.filter((r) => blockA.has(r.key));
    const b = rows.filter((r) => blockB.has(r.key));
    const rest = rows.filter((r) => !blockA.has(r.key) && !blockB.has(r.key));
    rest.splice(start, 0, ...b, ...a);
    this.rows.set(rest);
    this.touch();
  }

  private block(rows: Row[], key: string): Set<string> {
    const s = this.descendants(rows, key);
    s.add(key);
    return s;
  }

  /** ให้เป็นงานย่อยของพี่น้องตัวก่อนหน้า */
  indent(key: string): void {
    const rows = this.rows();
    const me = rows.find((r) => r.key === key)!;
    const siblings = rows.filter((r) => r.parentKey === me.parentKey);
    const prev = siblings[siblings.indexOf(me) - 1];
    if (!prev) {
      this.notify.ok('ไม่มีงานก่อนหน้าในระดับเดียวกันให้ย้ายเข้าไป');
      return;
    }
    this.rows.set(rows.map((r) => (r.key === key ? { ...r, parentKey: prev.key } : r)));
    this.touch();
  }

  outdent(key: string): void {
    const rows = [...this.rows()];
    const me = rows.find((r) => r.key === key)!;
    if (!me.parentKey) return;
    const parent = rows.find((r) => r.key === me.parentKey)!;
    // ย้ายกิ่งไปไว้หลังกิ่งของแม่เดิม
    const block = this.block(rows, key);
    const moving = rows.filter((r) => block.has(r.key)).map((r) => (r.key === key ? { ...r, parentKey: parent.parentKey } : r));
    const rest = rows.filter((r) => !block.has(r.key));
    rest.splice(this.endOfSubtree(rest, parent.key), 0, ...moving);
    this.rows.set(rest);
    this.touch();
  }

  weightByDays(): void {
    const parents = new Set(this.rows().map((r) => r.parentKey));
    this.rows.update((rows) =>
      rows.map((r) =>
        !parents.has(r.key) && r.plannedStart && r.plannedEnd ? { ...r, weight: daysBetween(r.plannedStart, r.plannedEnd) + 1 } : r,
      ),
    );
    this.touch();
  }

  /** งานที่มีงานก่อนหน้า: เริ่มวันถัดจากงานก่อนหน้าเสร็จ (คงจำนวนวันเดิม) */
  chainDates(): void {
    const rows = this.rows().map((r) => ({ ...r }));
    const by = new Map(rows.map((r) => [r.key, r]));
    for (let pass = 0; pass < rows.length; pass++) {
      let changed = false;
      for (const r of rows) {
        const p = r.predecessorKey ? by.get(r.predecessorKey) : null;
        if (!p?.plannedEnd || !r.plannedStart || !r.plannedEnd) continue;
        const want = addDaysIso(p.plannedEnd, 1);
        if (r.plannedStart < want) {
          const len = daysBetween(r.plannedStart, r.plannedEnd);
          r.plannedStart = want;
          r.plannedEnd = addDaysIso(want, len);
          changed = true;
        }
      }
      if (!changed) break;
    }
    this.rows.set(rows);
    this.touch();
  }

  save(): void {
    const view = this.view();
    const bad = view.find((r) => !r.src.name.trim());
    if (bad) {
      this.notify.error(null, `กรุณากรอกชื่องานแถว ${bad.wbs}`);
      return;
    }
    const wrong = view.find((r) => r.leaf && r.src.plannedStart && r.src.plannedEnd && r.src.plannedEnd < r.src.plannedStart);
    if (wrong) {
      this.notify.error(null, `งาน ${wrong.wbs} วันเสร็จก่อนวันเริ่ม`);
      return;
    }
    const tasks: TaskInput[] = view.map((r) => ({
      id: r.src.id,
      key: r.key,
      parentKey: r.src.parentKey,
      predecessorKey: r.src.predecessorKey,
      name: r.src.name.trim(),
      plannedStart: r.leaf ? r.src.plannedStart || null : r.start,
      plannedEnd: r.leaf ? r.src.plannedEnd || null : r.end,
      actualStart: r.src.actualStart,
      actualEnd: r.src.actualEnd,
      weight: r.leaf ? Number(r.src.weight) || 0 : 1,
      progressPct: r.leaf ? Math.min(100, Math.max(0, Number(r.src.progressPct) || 0)) : r.actual,
      assigneeId: r.src.assigneeId,
      isMilestone: r.src.isMilestone,
    }));
    this.busy.set(true);
    this.api.saveSchedule(this.projectId(), tasks).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแผนงานแล้ว');
        this.saved.emit(s);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
