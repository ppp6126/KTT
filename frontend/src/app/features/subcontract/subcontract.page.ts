import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ThDatePipe, todayIso } from '../../core/util/format';
import { MoneyPipe, round2 } from '../../core/util/money';
import { AttachmentPanel } from '../../shared/attachment-panel';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { Options } from '../../shared/options';
import { prompt } from '../../shared/prompt-dialog';
import { BILL_STATUS } from '../ap/ap.api';
import { PurchaseApi } from '../purchase/purchase.api';
import { CLAIM_STATUS, SC_STATUS, Sc, ScRow, ScSave, SubcontractApi } from './subcontract.api';

// ======================================================================= ฟอร์มสัญญาจ้างช่วง

@Component({
  selector: 'app-sc-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ sc ? 'แก้ไขสัญญาจ้างช่วง' : 'สัญญาจ้างช่วงใหม่' }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="grid">
        <mat-form-field class="span">
          <mat-label>ชื่องาน</mat-label>
          <input matInput [(ngModel)]="m.title" required placeholder="เช่น งานระบบไฟฟ้าทั้งหลัง" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>โครงการ</mat-label>
          <mat-select [(ngModel)]="m.projectId" required>
            @for (p of projects(); track p.id) {
              <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ผู้รับเหมาช่วง</mat-label>
          <mat-select [(ngModel)]="m.supplierId" required>
            @for (s of subs(); track s.id) {
              <mat-option [value]="s.id">{{ s.code }} {{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>มูลค่าสัญญา (ก่อน VAT)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.amount" />
        </mat-form-field>
        <div class="chk"><mat-checkbox [(ngModel)]="m.vatEnabled">คิด VAT 7%</mat-checkbox></div>
        <mat-form-field>
          <mat-label>หักประกันผลงาน (%)</mat-label>
          <input matInput type="number" min="0" max="20" [(ngModel)]="m.retentionPct" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>หัก ณ ที่จ่าย (%)</mat-label>
          <mat-select [(ngModel)]="m.whtPct">
            <mat-option [value]="0">ไม่หัก</mat-option>
            <mat-option [value]="1">1% (ค่าขนส่ง)</mat-option>
            <mat-option [value]="3">3% (ค่าจ้างทำของ)</mat-option>
            <mat-option [value]="5">5% (ค่าเช่า)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>เริ่มงาน</mat-label>
          <input matInput type="date" [(ngModel)]="m.startDate" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>กำหนดเสร็จ</mat-label>
          <input matInput type="date" [(ngModel)]="m.endDate" />
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>ขอบเขตงาน</mat-label>
          <textarea matInput rows="3" [(ngModel)]="m.scope"></textarea>
        </mat-form-field>
        <mat-form-field class="span">
          <mat-label>หมายเหตุ</mat-label>
          <input matInput [(ngModel)]="m.notes" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.title || !m.projectId || !m.supplierId">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(640px, 90vw); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
    .span { grid-column: 1 / -1; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .chk { display: flex; align-items: center; min-height: 56px; }
    .err { color: var(--ktt-danger); }
  `,
})
export class ScDialog {
  private readonly api = inject(SubcontractApi);
  private readonly ref = inject(MatDialogRef<ScDialog, Sc>);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly subs = toSignal(inject(PurchaseApi).supplierOptions('subcontractor'), { initialValue: [] });
  readonly data = inject<{ sc?: Sc; projectId?: string } | null>(MAT_DIALOG_DATA);
  readonly sc = this.data?.sc ?? null;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m: ScSave = {
    projectId: this.sc?.projectId ?? this.data?.projectId ?? '',
    supplierId: this.sc?.supplierId ?? '',
    title: this.sc?.title ?? '',
    scope: this.sc?.scope ?? null,
    amount: this.sc?.amount ?? 0,
    vatEnabled: this.sc?.vatEnabled ?? true,
    retentionPct: this.sc?.retentionPct ?? 5,
    whtPct: this.sc?.whtPct ?? 3,
    startDate: this.sc?.startDate ?? todayIso(),
    endDate: this.sc?.endDate ?? null,
    notes: this.sc?.notes ?? null,
  };

  save(): void {
    this.busy.set(true);
    this.api.save(this.sc?.id ?? null, { ...this.m, amount: Number(this.m.amount) || 0, retentionPct: Number(this.m.retentionPct) || 0, endDate: this.m.endDate || null, scope: this.m.scope || null, notes: this.m.notes || null }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= รายการ

@Component({
  selector: 'app-subcontract-list',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MoneyPipe, ThDatePipe],
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>ผู้รับเหมาช่วง</h1>
          <p>สัญญาจ้างช่วง เบิกงวดตามผลงาน หักประกันผลงานและภาษี ณ ที่จ่าย แล้วตั้งหนี้ให้อัตโนมัติ</p>
        </div>
        @if (canWrite) {
          <button mat-flat-button class="btn-primary" (click)="create()"><mat-icon>add</mat-icon> สัญญาจ้างช่วง</button>
        }
      </div>
      <div class="panel">
        <div class="filters">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>โครงการ</mat-label>
            <mat-select [(ngModel)]="projectId" (selectionChange)="load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @for (p of projects(); track p.id) {
                <mat-option [value]="p.id">{{ p.code }} {{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="status" (selectionChange)="load()">
              <mat-option value="">ทั้งหมด</mat-option>
              @for (s of statuses; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1].label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="grid">
            <thead><tr><th>เลขที่</th><th>งาน</th><th>ผู้รับเหมาช่วง</th><th>โครงการ</th><th>กำหนดเสร็จ</th><th class="num">มูลค่า</th><th class="num">เบิกแล้ว</th><th>สถานะ</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="clickable" (click)="open(r)" tabindex="0" (keydown.enter)="open(r)">
                  <td class="no">{{ r.docNo }}</td>
                  <td>{{ r.title }}</td>
                  <td>{{ r.supplierName }}</td>
                  <td class="small">{{ r.projectCode }}</td>
                  <td class="small">{{ r.endDate | thDate }}</td>
                  <td class="num">{{ r.amount | money }}</td>
                  <td class="num">{{ r.claimed | money }} <span class="muted small">({{ r.claimedPct }}%)</span></td>
                  <td><span class="chip" [class]="st[r.status].tone">{{ st[r.status].label }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty muted">ยังไม่มีสัญญาจ้างช่วง</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../../shared/doc.scss',
})
export class SubcontractList implements OnInit {
  private readonly api = inject(SubcontractApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly canWrite = inject(AuthService).can(Perm.SUBCONTRACT_WRITE);
  readonly projects = toSignal(inject(Options).projects(), { initialValue: [] });
  readonly rows = signal<ScRow[]>([]);
  readonly st = SC_STATUS;
  readonly statuses = Object.entries(SC_STATUS);
  projectId = '';
  status = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.list(this.projectId || undefined, this.status || undefined).subscribe({ next: (r) => this.rows.set(r), error: (e) => this.notify.error(e) });
  }

  open(r: ScRow): void {
    this.router.navigate(['/subcontracts', r.id]);
  }

  create(): void {
    this.dialog
      .open(ScDialog, { data: { projectId: this.projectId || undefined }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.router.navigate(['/subcontracts', r.id]));
  }
}

// ======================================================================= เบิกงวด

@Component({
  selector: 'app-claim-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MoneyPipe],
  template: `
    <h2 mat-dialog-title>เบิกงวด {{ sc.title }}</h2>
    <mat-dialog-content class="content">
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <p class="muted">มูลค่าสัญญา {{ sc.amount | money }} เบิกแล้ว {{ sc.claimed | money }} คงเหลือ {{ remaining | money }}</p>
      <mat-form-field class="full">
        <mat-label>วันที่ตรวจรับ</mat-label>
        <input matInput type="date" [(ngModel)]="m.claimDate" />
      </mat-form-field>
      <mat-form-field class="full">
        <mat-label>รายละเอียดผลงาน</mat-label>
        <input matInput [(ngModel)]="m.description" placeholder="เช่น เดินท่อร้อยสายชั้น 1 แล้วเสร็จ" />
      </mat-form-field>
      <div class="two">
        <mat-form-field>
          <mat-label>ผลงานสะสม (%)</mat-label>
          <input matInput type="number" min="0" max="100" [(ngModel)]="m.progressPct" (ngModelChange)="fromPct()" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>ยอดเบิกงวดนี้ (ก่อน VAT)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.amount" />
        </mat-form-field>
      </div>
      <dl class="calc">
        <div><dt>หักประกันผลงาน {{ sc.retentionPct }}%</dt><dd>{{ ret() | money }}</dd></div>
        <div><dt>หัก ณ ที่จ่าย {{ sc.whtPct }}%</dt><dd>{{ wht() | money }}</dd></div>
        @if (sc.vatEnabled) {
          <div><dt>VAT {{ sc.vatPct }}%</dt><dd>{{ vat() | money }}</dd></div>
        }
        <div class="grand"><dt>จ่ายสุทธิ</dt><dd>{{ net() | money }}</dd></div>
      </dl>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button (click)="save()" [disabled]="busy() || !m.description || !(m.amount > 0)">บันทึก</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { width: min(480px, 90vw); }
    .full { width: 100%; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .err { color: var(--ktt-danger); }
    .calc { margin: 0; }
    .calc > div { display: flex; justify-content: space-between; padding: 3px 0; }
    .calc dt { color: var(--ktt-steel); }
    .calc dd { margin: 0; font-variant-numeric: tabular-nums; }
    .calc .grand { border-top: 1px solid var(--ktt-line); font-weight: 600; padding-top: 6px; }
  `,
})
export class ClaimDialog {
  private readonly api = inject(SubcontractApi);
  private readonly ref = inject(MatDialogRef<ClaimDialog, Sc>);
  readonly sc = inject<Sc>(MAT_DIALOG_DATA);
  readonly remaining = round2(this.sc.amount - this.sc.claimed);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  m = { claimDate: todayIso(), description: '', progressPct: null as number | null, amount: 0 };

  fromPct(): void {
    const p = Number(this.m.progressPct);
    if (p > 0) this.m.amount = Math.max(0, round2((this.sc.amount * p) / 100 - this.sc.claimed));
  }

  ret = () => round2((Number(this.m.amount) * this.sc.retentionPct) / 100);
  wht = () => round2((Number(this.m.amount) * this.sc.whtPct) / 100);
  vat = () => (this.sc.vatEnabled ? round2((Number(this.m.amount) * this.sc.vatPct) / 100) : 0);
  net = () => round2(Number(this.m.amount) + this.vat() - this.ret() - this.wht());

  save(): void {
    this.busy.set(true);
    this.api.addClaim(this.sc.id, { ...this.m, amount: Number(this.m.amount), progressPct: this.m.progressPct === null || (this.m.progressPct as unknown) === '' ? null : Number(this.m.progressPct) }).subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}

// ======================================================================= หน้าสัญญา

@Component({
  selector: 'app-subcontract-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MoneyPipe, ThDatePipe, AttachmentPanel],
  template: `
    @if (sc(); as s) {
      <div class="page wide">
        <a routerLink="/subcontracts" class="back"><mat-icon>arrow_back</mat-icon> ผู้รับเหมาช่วง</a>
        <div class="page-head">
          <div>
            <h1>{{ s.docNo }} {{ s.title }} <span class="chip" [class]="st[s.status].tone">{{ st[s.status].label }}</span></h1>
            <p>{{ s.supplierName }} · <a [routerLink]="['/projects', s.projectId]">{{ s.projectCode }} {{ s.projectName }}</a></p>
          </div>
          @if (canWrite) {
            <div class="actions">
              @if (s.status === 'draft') {
                <button mat-stroked-button (click)="edit(s)"><mat-icon>edit</mat-icon> แก้ไข</button>
                <button mat-flat-button class="btn-primary" (click)="setStatus('active')"><mat-icon>play_arrow</mat-icon> เริ่มงาน</button>
              }
              @if (s.status === 'active') {
                <button mat-flat-button class="btn-primary" (click)="claim(s)"><mat-icon>add</mat-icon> เบิกงวด</button>
              }
              <button mat-icon-button [matMenuTriggerFor]="more" aria-label="เพิ่มเติม"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #more="matMenu">
                @if (s.status === 'active') {
                  <button mat-menu-item (click)="setStatus('completed')"><mat-icon>task_alt</mat-icon>ปิดงาน</button>
                }
                @if (s.retentionHeld - s.retentionReleased > 0) {
                  <button mat-menu-item (click)="release(s)"><mat-icon>lock_open</mat-icon>คืนเงินประกันผลงาน</button>
                }
                @if (s.status === 'draft' || s.status === 'active') {
                  <button mat-menu-item (click)="setStatus('cancelled')"><mat-icon>block</mat-icon>ยกเลิกสัญญา</button>
                }
              </mat-menu>
            </div>
          }
        </div>

        <div class="kpis">
          <div class="kpi"><span class="label">มูลค่าสัญญา</span><strong>{{ s.amount | money }}</strong></div>
          <div class="kpi"><span class="label">เบิกแล้ว ({{ s.claimedPct }}%)</span><strong>{{ s.claimed | money }}</strong></div>
          <div class="kpi"><span class="label">คงเหลือ</span><strong>{{ s.amount - s.claimed | money }}</strong></div>
          <div class="kpi"><span class="label">ประกันผลงานค้างคืน</span><strong>{{ s.retentionHeld - s.retentionReleased | money }}</strong></div>
          <div class="kpi"><span class="label">จ่ายแล้ว</span><strong>{{ s.paid | money }}</strong></div>
        </div>

        <section class="panel panel-pad">
          <div class="facts">
            <div><span class="label">ระยะเวลา</span>{{ s.startDate | thDate }} – {{ s.endDate | thDate }}</div>
            <div><span class="label">VAT</span>{{ s.vatEnabled ? s.vatPct + '%' : 'ไม่คิด' }}</div>
            <div><span class="label">หักประกันผลงาน</span>{{ s.retentionPct }}%</div>
            <div><span class="label">หัก ณ ที่จ่าย</span>{{ s.whtPct }}%</div>
            <div><span class="label">เลขผู้เสียภาษี</span>{{ s.supplierTaxId || '–' }}</div>
            @if (s.scope) {
              <div class="wide-cell"><span class="label">ขอบเขตงาน</span><span class="pre">{{ s.scope }}</span></div>
            }
          </div>
        </section>

        <section class="panel">
          <div class="sec-head"><h2>งวดเบิก</h2></div>
          <div class="scroll">
            <table class="grid">
              <thead><tr><th>งวด</th><th>วันที่</th><th>ผลงาน</th><th class="num">%สะสม</th><th class="num">ยอดเบิก</th><th class="num">หักประกัน</th><th class="num">หัก ณ ที่จ่าย</th><th class="num">สุทธิ</th><th>สถานะ</th><th>ใบตั้งหนี้</th><th></th></tr></thead>
              <tbody>
                @for (c of s.claims; track c.id) {
                  <tr>
                    <td>{{ c.claimNo }}</td>
                    <td class="small">{{ c.claimDate | thDate }}</td>
                    <td>{{ c.description }}</td>
                    <td class="num">{{ c.progressPct === null ? '–' : c.progressPct + '%' }}</td>
                    <td class="num">{{ c.amount | money }}</td>
                    <td class="num">{{ c.retention | money }}</td>
                    <td class="num">{{ c.wht | money }}</td>
                    <td class="num">{{ c.net | money }}</td>
                    <td><span class="chip" [class]="cst[c.status].tone">{{ cst[c.status].label }}</span></td>
                    <td class="small">
                      @if (c.apBillId) {
                        <a [routerLink]="['/ap/bills', c.apBillId]">{{ c.apBillNo }}</a> {{ c.apBillStatus ? bst[c.apBillStatus].label : '' }}
                      }
                    </td>
                    <td class="nowrap">
                      @if (c.status === 'draft' && canWrite) {
                        <button mat-button (click)="approve(c.id)">ตรวจรับ</button>
                        <button mat-icon-button (click)="removeClaim(c.id)" aria-label="ลบงวด"><mat-icon>delete</mat-icon></button>
                      }
                      @if (c.status === 'approved' && !c.apBillId && canWrite) {
                        <button mat-button (click)="approve(c.id)">ตั้งหนี้ใหม่</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="11" class="empty muted">ยังไม่มีการเบิกงวด</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel panel-pad">
          <h2>ไฟล์แนบ</h2>
          <app-attachment-panel ownerType="subcontract" [ownerId]="s.id" [canWrite]="canWrite" defaultCategory="contract" />
        </section>
      </div>
    }
  `,
  styleUrl: '../../shared/doc.scss',
  styles: `.nowrap { white-space: nowrap; }`,
})
export class SubcontractPage implements OnInit {
  private readonly api = inject(SubcontractApi);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  readonly canWrite = inject(AuthService).can(Perm.SUBCONTRACT_WRITE);
  readonly id = input.required<string>();
  readonly sc = signal<Sc | null>(null);
  readonly st = SC_STATUS;
  readonly cst = CLAIM_STATUS;
  readonly bst = BILL_STATUS;
  readonly title = computed(() => this.sc()?.title ?? '');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.get(this.id()).subscribe({ next: (s) => this.sc.set(s), error: (e) => this.notify.error(e) });
  }

  private apply = {
    next: (s: Sc) => this.sc.set(s),
    error: (e: unknown) => this.notify.error(e),
  };

  edit(s: Sc): void {
    this.dialog
      .open(ScDialog, { data: { sc: s }, maxWidth: '96vw' })
      .afterClosed()
      .subscribe((r) => r && this.sc.set(r));
  }

  setStatus(status: string): void {
    const labels: Record<string, string> = { active: 'เริ่มงาน', completed: 'ปิดงาน', cancelled: 'ยกเลิกสัญญา' };
    confirmAction(this.dialog, { title: labels[status], message: `ยืนยัน${labels[status]} ${this.sc()!.docNo}?`, confirmText: labels[status], danger: status === 'cancelled' }).subscribe(
      (ok) => ok && this.api.status(this.id(), status).subscribe(this.apply),
    );
  }

  claim(s: Sc): void {
    this.dialog
      .open(ClaimDialog, { data: s })
      .afterClosed()
      .subscribe((r) => r && this.sc.set(r));
  }

  approve(claimId: string): void {
    confirmAction(this.dialog, { title: 'ตรวจรับงาน', message: 'ยืนยันตรวจรับงวดนี้ ระบบจะตั้งหนี้ให้ฝ่ายบัญชีและบันทึกเป็นต้นทุนโครงการ', confirmText: 'ตรวจรับ' }).subscribe((ok) => {
      if (!ok) return;
      this.api.approveClaim(this.id(), claimId).subscribe({
        next: (s) => {
          this.sc.set(s);
          this.notify.ok('ตรวจรับและตั้งหนี้แล้ว');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  removeClaim(claimId: string): void {
    confirmAction(this.dialog, { title: 'ลบงวดเบิก', message: 'ลบงวดที่ยังไม่ตรวจรับนี้?', confirmText: 'ลบ', danger: true }).subscribe(
      (ok) => ok && this.api.deleteClaim(this.id(), claimId).subscribe(this.apply),
    );
  }

  release(s: Sc): void {
    const left = round2(s.retentionHeld - s.retentionReleased);
    prompt(this.dialog, { title: 'คืนเงินประกันผลงาน', message: `ค้างคืน ${left.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท ระบบจะตั้งหนี้ยอดที่คืน`, label: 'จำนวนเงิน', value: String(left), confirmText: 'คืนเงิน' }).subscribe((v) => {
      if (v === undefined) return;
      this.api.releaseRetention(this.id(), Number(v)).subscribe({
        next: (r) => {
          this.sc.set(r);
          this.notify.ok('ตั้งหนี้คืนเงินประกันแล้ว');
        },
        error: (e) => this.notify.error(e),
      });
    });
  }
}
