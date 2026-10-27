import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { FileService } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { CompanyHeader, CompanyProfile } from '../print/quotation-print.page';
import { ROUNDING } from '../quotations/quotations.api';

interface QuotationSettings {
  docPrefix: string;
  discountApprovalThresholdPct: number;
  defaultValidityDays: number;
  defaultOverheadPct: number;
  defaultVatEnabled: boolean;
  defaultRounding: string;
  defaultPaymentCondition: string;
  defaultWarranty: string;
  expiryNoticeDays: number;
}

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule, MatIconModule],
  templateUrl: './settings.page.html',
  styles: `
    .section { margin-bottom: 16px; }
    .section h2 { margin-bottom: 12px; }
    .images { display: flex; gap: 24px; flex-wrap: wrap; margin: 8px 0 16px; }
    .img-box { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .preview { width: 160px; height: 110px; border: 1px dashed var(--ktt-line); border-radius: var(--ktt-radius-s); display: grid; place-items: center; background: #fafafa; }
    .preview img { max-width: 150px; max-height: 100px; object-fit: contain; }
    .links { display: flex; gap: 12px; flex-wrap: wrap; }
    .actions { margin-top: 8px; }
  `,
})
export class SettingsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileService);
  private readonly notify = inject(Notify);
  private readonly auth = inject(AuthService);

  readonly canManage = computed(() => this.auth.can(Perm.SETTINGS_MANAGE));
  readonly canBoq = computed(() => this.auth.can(Perm.BOQ_READ));
  readonly company = signal<CompanyProfile | null>(null);
  readonly quotation = signal<QuotationSettings | null>(null);
  readonly images = signal<Record<string, string | null>>({ logo: null, signature: null });
  readonly rounding = Object.entries(ROUNDING);
  readonly thresholds = Array.from({ length: 15 }, (_, i) => i + 1);

  ngOnInit(): void {
    this.http.get<CompanyHeader>('/api/settings/company').subscribe((h) => {
      this.company.set({ ...h.company });
      if (h.hasLogo) this.loadImage('logo');
      if (h.hasSignature) this.loadImage('signature');
    });
    this.http.get<QuotationSettings>('/api/settings/quotation').subscribe((q) => this.quotation.set({ ...q }));
  }

  private loadImage(kind: 'logo' | 'signature'): void {
    this.files.objectUrl(`/api/settings/company/${kind}?t=${Date.now()}`).subscribe((u) => this.images.update((m) => ({ ...m, [kind]: u })));
  }

  saveCompany(): void {
    const c = this.company();
    if (!c) return;
    this.http.put<CompanyProfile>('/api/settings/company', c).subscribe({
      next: () => this.notify.ok('บันทึกข้อมูลบริษัทแล้ว'),
      error: (e) => this.notify.error(e),
    });
  }

  saveQuotation(): void {
    const q = this.quotation();
    if (!q) return;
    this.http.put<QuotationSettings>('/api/settings/quotation', { ...q, defaultOverheadPct: Number(q.defaultOverheadPct) || 0 }).subscribe({
      next: (r) => {
        this.quotation.set({ ...r });
        this.notify.ok('บันทึกค่าตั้งต้นใบเสนอราคาแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  upload(kind: 'logo' | 'signature', input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const form = new FormData();
    form.append('file', f, f.name);
    this.http.post(`/api/settings/company/${kind}`, form).subscribe({
      next: () => {
        this.loadImage(kind);
        this.notify.ok('อัปโหลดแล้ว');
      },
      error: (e) => this.notify.error(e),
    });
  }

  removeImage(kind: 'logo' | 'signature'): void {
    this.http.delete(`/api/settings/company/${kind}`).subscribe({
      next: () => this.images.update((m) => ({ ...m, [kind]: null })),
      error: (e) => this.notify.error(e),
    });
  }
}
