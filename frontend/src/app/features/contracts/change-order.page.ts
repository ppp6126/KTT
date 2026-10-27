import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { prompt } from '../../shared/prompt-dialog';
import { Contract, ContractsApi, VO_STATUS, Vo, VoItem, VoSave } from './contracts.api';

/** งานเพิ่ม-ลด: รายการติดลบได้ (งานลด) ; ส่งขออนุมัติ → ผู้มีสิทธิ์ contract.approve อนุมัติ */
@Component({
  selector: 'app-change-order-page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MoneyPipe, ThDatePipe],
  template: `
    @if (ready()) {
      <div class="page">
        <a [routerLink]="['/contracts', contractId()]" class="back"><mat-icon>arrow_back</mat-icon> สัญญา {{ contractNo() }}</a>
        <div class="page-head">
          <div>
            <h1>
              {{ vo()?.docNo ?? 'งานเพิ่ม-ลดใหม่' }}
              @if (vo(); as v) {
                <span class="chip" [class]="st[v.status].tone">{{ st[v.status].label }}</span>
              }
            </h1>
            <p>{{ projectName() }}</p>
          </div>
          <div class="actions">
            @if (vo(); as v) {
              <a mat-stroked-button [routerLink]="['/print/change-orders', v.id]" target="_blank"><mat-icon>print</mat-icon> พิมพ์</a>
              @if (v.editable) {
                <button mat-button (click)="cancelVo()">ยกเลิก VO</button>
                <button mat-flat-button class="btn-primary" (click)="submit()" [disabled]="dirty()"><mat-icon>send</mat-icon> ส่งขออนุมัติ</button>
              }
              @if (v.status === 'pending_approval' && v.canApprove) {
                <button mat-stroked-button (click)="decide(false)">ไม่อนุมัติ</button>
                <button mat-flat-button class="btn-primary" (click)="decide(true)"><mat-icon>check</mat-icon> อนุมัติ</button>
              }
              @if (v.status === 'pending_approval' && !v.canApprove && auth.can(Perm.CONTRACT_WRITE)) {
                <button mat-button (click)="cancelVo()">ถอนคำขอ</button>
              }
            }
          </div>
        </div>

        @if (vo()?.status === 'approved') {
          <p class="notice ok">อนุมัติโดย {{ vo()!.decidedByName }} {{ vo()!.decidedAt | thDate: true }} มูลค่าสัญญาและระยะเวลาปรับตามแล้ว {{ vo()!.decisionComment ? '(' + vo()!.decisionComment + ')' : '' }}</p>
        } @else if (vo()?.status === 'rejected') {
          <p class="notice danger">ไม่อนุมัติโดย {{ vo()!.decidedByName }}: {{ vo()!.decisionComment || '–' }}</p>
        }

        <section class="panel panel-pad">
          <div class="form-grid">
            <mat-form-field class="span-2">
              <mat-label>หัวข้องานเพิ่ม-ลด</mat-label>
              <input matInput [(ngModel)]="m.title" (ngModelChange)="touch()" [disabled]="!editable()" required placeholder="เช่น เพิ่มหลังคาโรงจอดรถ" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>วันที่</mat-label>
              <input matInput type="date" [(ngModel)]="m.issueDate" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>ขยายเวลา (วัน)</mat-label>
              <input matInput type="number" [(ngModel)]="m.daysExtension" (ngModelChange)="touch()" [disabled]="!editable()" />
              <mat-hint>ติดลบได้ถ้าลดระยะเวลา</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>ลูกค้าเซ็นยืนยันเมื่อ</mat-label>
              <input matInput type="date" [(ngModel)]="m.customerApprovedAt" (ngModelChange)="touch()" [disabled]="!editable()" />
            </mat-form-field>
            <div class="chk"><mat-checkbox [(ngModel)]="m.requestedByCustomer" (ngModelChange)="touch()" [disabled]="!editable()">ลูกค้าเป็นผู้ขอเปลี่ยน</mat-checkbox></div>
            <mat-form-field class="span-all">
              <mat-label>เหตุผล / รายละเอียด</mat-label>
              <textarea matInput rows="2" [(ngModel)]="m.reason" (ngModelChange)="touch()" [disabled]="!editable()"></textarea>
            </mat-form-field>
          </div>
        </section>

        <section class="panel">
          <div class="scroll">
            <table class="items">
              <thead>
                <tr>
                  <th class="c-no">#</th><th>รายการ</th><th class="c-qty num">จำนวน</th><th class="c-unit">หน่วย</th><th class="c-money num">ราคา/หน่วย</th>
                  @if (canCost) {
                    <th class="c-money num cost">ต้นทุน/หน่วย</th>
                  }
                  <th class="c-money num">จำนวนเงิน</th><th class="c-act"></th>
                </tr>
              </thead>
              <tbody>
                @for (it of m.items; track $index; let i = $index) {
                  <tr>
                    <td class="c-no">{{ i + 1 }}</td>
                    <td><input [(ngModel)]="it.description" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="รายการ" /></td>
                    <td><input type="number" min="0" step="any" [(ngModel)]="it.quantity" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="จำนวน" /></td>
                    <td><input [(ngModel)]="it.unit" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="หน่วย" /></td>
                    <td><input type="number" step="any" [(ngModel)]="it.unitPrice" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="ราคาต่อหน่วย" /></td>
                    @if (canCost) {
                      <td class="cost"><input type="number" step="any" [(ngModel)]="it.unitCost" (ngModelChange)="touch()" [disabled]="!editable()" aria-label="ต้นทุนต่อหน่วย" /></td>
                    }
                    <td class="num" [class.neg]="line(it) < 0">{{ line(it) | money }}</td>
                    <td class="c-act">
                      @if (editable()) {
                        <button mat-icon-button (click)="m.items.splice(i, 1); touch()" aria-label="ลบแถว"><mat-icon>close</mat-icon></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="foot">
            @if (editable()) {
              <button mat-button (click)="m.items.push({ description: '', quantity: 1, unit: 'งาน', unitPrice: 0, unitCost: null }); touch()"><mat-icon>add</mat-icon> เพิ่มรายการ</button>
              <span class="muted small">งานลดให้ใส่ราคาติดลบ</span>
            }
            <span class="grow"></span>
            <dl>
              <div><dt>มูลค่า (ก่อน VAT)</dt><dd [class.neg]="total() < 0">{{ total() | money }}</dd></div>
              @if (vo(); as v) {
                <div><dt>VAT</dt><dd>{{ v.vatAmount | money }}</dd></div>
                <div class="grand"><dt>รวม</dt><dd>{{ v.total | money }}</dd></div>
              }
              @if (canCost && costTotal() !== null) {
                <div><dt>ต้นทุน</dt><dd>{{ costTotal() | money }}</dd></div>
              }
            </dl>
          </div>
          @if (editable()) {
            <div class="save">
              <button mat-flat-button (click)="save()" [disabled]="busy() || !dirty()">บันทึกร่าง</button>
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 12px; color: var(--ktt-steel); text-decoration: none; }
    h1 .chip { font-size: 0.8rem; vertical-align: middle; margin-left: 8px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .notice { padding: 10px 14px; border-left: 3px solid; border-radius: 4px; margin-bottom: 14px; }
    .notice.ok { border-color: var(--ktt-ok); background: #e5f2ea; }
    .notice.danger { border-color: var(--ktt-danger); background: #fbe9e7; }
    section.panel { margin-bottom: 14px; }
    .chk { display: flex; align-items: center; min-height: 56px; }
    .scroll { overflow-x: auto; }
    .items { width: 100%; min-width: 760px; border-collapse: collapse; }
    .items th { background: #f1f3f2; color: var(--ktt-steel); font-weight: 500; text-align: left; padding: 8px 6px; }
    .items td { padding: 2px 6px; border-bottom: 1px solid #eceeed; height: 38px; }
    .items input { width: 100%; height: 32px; padding: 0 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; font: inherit; color: inherit; box-sizing: border-box; }
    .items input:hover:not(:disabled) { border-color: var(--ktt-line); }
    .items input:focus { outline: none; border-color: var(--ktt-ink-2); background: #fff; }
    .items input[type='number'] { text-align: right; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .c-no { width: 40px; text-align: center; color: var(--ktt-steel); }
    .c-qty { width: 84px; }
    .c-unit { width: 80px; }
    .c-money { width: 120px; }
    .c-act { width: 44px; }
    .cost { background: #fbf7f1; }
    .neg { color: var(--ktt-danger); }
    .foot { display: flex; align-items: flex-start; gap: 8px; padding: 12px 16px; flex-wrap: wrap; }
    .grow { flex: 1; }
    .small { font-size: 0.85rem; }
    dl { margin: 0; min-width: 260px; }
    dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
    dt { color: var(--ktt-steel); }
    dd { margin: 0; font-variant-numeric: tabular-nums; }
    .grand { border-top: 1px solid var(--ktt-line); font-weight: 600; padding-top: 6px; }
    .save { display: flex; justify-content: flex-end; padding: 0 16px 14px; }
  `,
})
export class ChangeOrderPage implements OnInit {
  private readonly api = inject(ContractsApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly Perm = Perm;
  readonly canCost = this.auth.can(Perm.COST_VIEW);

  readonly id = input<string>();
  /** ?contract= สำหรับ VO ใหม่ */
  readonly contract = input<string>();

  readonly vo = signal<Vo | null>(null);
  readonly contractInfo = signal<Contract | null>(null);
  readonly ready = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly version = signal(0);
  readonly st = VO_STATUS;

  m: VoSave = {
    title: '',
    reason: '',
    requestedByCustomer: true,
    issueDate: todayIso(),
    daysExtension: 0,
    customerApprovedAt: '',
    items: [{ description: '', quantity: 1, unit: 'งาน', unitPrice: 0, unitCost: null }],
  };

  readonly editable = computed(() => (this.vo() ? this.vo()!.editable : this.auth.can(Perm.CONTRACT_WRITE)));
  readonly contractId = computed(() => this.vo()?.contractId ?? this.contract() ?? '');
  readonly contractNo = computed(() => this.vo()?.contractNo ?? this.contractInfo()?.docNo ?? '');
  readonly projectName = computed(() => this.vo()?.projectName ?? this.contractInfo()?.projectName ?? '');
  readonly total = computed(() => {
    this.version();
    return round2(this.m.items.reduce((s, it) => s + this.line(it), 0));
  });
  readonly costTotal = computed(() => {
    this.version();
    const withCost = this.m.items.filter((i) => i.unitCost !== null && (i.unitCost as unknown) !== '');
    return withCost.length ? round2(withCost.reduce((s, i) => s + round2((Number(i.quantity) || 0) * (Number(i.unitCost) || 0)), 0)) : null;
  });

  ngOnInit(): void {
    if (this.id() && this.id() !== 'new') {
      this.api.vo(this.id()!).subscribe({ next: (v) => this.apply(v), error: (e) => this.notify.error(e) });
    } else if (this.contract()) {
      this.api.get(this.contract()!).subscribe({
        next: (c) => {
          this.contractInfo.set(c);
          this.ready.set(true);
        },
        error: (e) => this.notify.error(e),
      });
    }
  }

  private apply(v: Vo): void {
    this.vo.set(v);
    this.m = {
      title: v.title,
      reason: v.reason ?? '',
      requestedByCustomer: v.requestedByCustomer,
      issueDate: v.issueDate,
      daysExtension: v.daysExtension,
      customerApprovedAt: v.customerApprovedAt ?? '',
      items: v.items.map((i) => ({ ...i })),
    };
    this.dirty.set(false);
    this.version.update((x) => x + 1);
    this.ready.set(true);
  }

  line(it: VoItem): number {
    return round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
  }

  touch(): void {
    this.dirty.set(true);
    this.version.update((x) => x + 1);
  }

  save(): void {
    const items = this.m.items.filter((i) => i.description.trim());
    if (!this.m.title.trim() || !items.length) {
      this.notify.error(null, 'กรุณากรอกหัวข้อและอย่างน้อย 1 รายการ');
      return;
    }
    const body: VoSave = {
      ...this.m,
      title: this.m.title.trim(),
      reason: this.m.reason || null,
      daysExtension: Number(this.m.daysExtension) || 0,
      customerApprovedAt: this.m.customerApprovedAt || null,
      items: items.map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || null,
        unitPrice: Number(i.unitPrice) || 0,
        unitCost: i.unitCost === null || (i.unitCost as unknown) === '' ? null : Number(i.unitCost),
      })),
    };
    this.busy.set(true);
    const v = this.vo();
    (v ? this.api.updateVo(v.id, body) : this.api.createVo(this.contract()!, body)).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.ok('บันทึกแล้ว');
        if (!v) this.router.navigate(['/change-orders', r.id], { replaceUrl: true });
        this.apply(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  submit(): void {
    this.api.voAction(this.vo()!.id, 'submit').subscribe({
      next: (v) => {
        this.apply(v);
        this.notify.ok('ส่งขออนุมัติแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  decide(approve: boolean): void {
    prompt(this.dialog, {
      title: approve ? 'อนุมัติงานเพิ่ม-ลด' : 'ไม่อนุมัติงานเพิ่ม-ลด',
      message: approve ? 'มูลค่าสัญญาจะปรับตาม และถ้าเป็นงานเพิ่มจะสร้างงวดเรียกเก็บเงินให้อัตโนมัติ' : undefined,
      label: 'ความเห็น',
      confirmText: approve ? 'อนุมัติ' : 'ไม่อนุมัติ',
      required: !approve,
      multiline: true,
    }).subscribe((comment) => {
      if (comment === undefined) return;
      this.api.voAction(this.vo()!.id, approve ? 'approve' : 'reject', { comment, createMilestone: true }).subscribe({
        next: (v) => this.apply(v),
        error: (e) => this.notify.error(e),
      });
    });
  }

  cancelVo(): void {
    confirmAction(this.dialog, { title: 'ยกเลิกงานเพิ่ม-ลด', message: `ยกเลิก ${this.vo()!.docNo}`, confirmText: 'ยกเลิก VO', danger: true }).subscribe((ok) => {
      if (!ok) return;
      this.api.voAction(this.vo()!.id, 'cancel').subscribe({ next: (v) => this.apply(v), error: (e) => this.notify.error(e) });
    });
  }
}
