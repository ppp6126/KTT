import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { thDateShort } from '../../core/util/format';
import { MoneyPipe, QtyPipe, bahtText } from '../../core/util/money';
import { FileService } from '../../shared/files';
import { Notify } from '../../shared/notify.service';
import { Quotation, QuotationsApi } from '../quotations/quotations.api';
import { PrintToolbar } from './print-toolbar';

export interface CompanyProfile {
  nameTh: string;
  nameEn: string;
  taxId: string;
  branchNo: string;
  address: string;
  phone: string;
  email: string;
  signerName: string;
  signerTitle: string;
  bankName: string;
  bankBranch: string;
  bankAccountName: string;
  bankAccountNo: string;
}

export interface CompanyHeader {
  company: CompanyProfile;
  hasLogo: boolean;
  hasSignature: boolean;
}

/** ใบเสนอราคาตามแบบฟอร์มของบริษัท (A4) */
@Component({
  selector: 'app-quotation-print-page',
  imports: [PrintToolbar, MoneyPipe, QtyPipe],
  templateUrl: './quotation-print.page.html',
  styleUrls: ['./print.scss', './quotation-print.page.scss'],
})
export class QuotationPrintPage implements OnInit {
  private readonly api = inject(QuotationsApi);
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileService);
  private readonly notify = inject(Notify);

  readonly id = input.required<string>();
  readonly q = signal<Quotation | null>(null);
  readonly header = signal<CompanyHeader | null>(null);
  readonly logo = signal<string | null>(null);
  readonly signature = signal<string | null>(null);
  readonly copy = signal<'original' | 'copy'>('original');
  readonly draft = computed(() => ['draft', 'pending_approval'].includes(this.q()?.status ?? ''));
  readonly date = thDateShort;
  readonly words = bahtText;
  /** แถวว่างเติมให้ตารางสูงเท่าแบบฟอร์มเดิมเมื่อรายการน้อย */
  readonly fillers = computed(() => Array.from({ length: Math.max(0, 14 - (this.q()?.items.length ?? 0)) }, (_, i) => i));

  ngOnInit(): void {
    this.api.get(this.id()).subscribe({ next: (q) => this.q.set(q), error: (e) => this.notify.error(e) });
    this.http.get<CompanyHeader>('/api/settings/company').subscribe((h) => {
      this.header.set(h);
      if (h.hasLogo) this.files.objectUrl('/api/settings/company/logo').subscribe((u) => this.logo.set(u));
      if (h.hasSignature) this.files.objectUrl('/api/settings/company/signature').subscribe((u) => this.signature.set(u));
    });
  }

  itemNo(index: number): number {
    const list = this.q()?.items ?? [];
    let n = 0;
    for (let i = 0; i <= index; i++) if (list[i].itemType === 'item') n++;
    return n;
  }

  onPrint(): void {
    this.api.printed(this.id()).subscribe({ error: () => undefined });
  }

  close(): void {
    window.close();
    history.back();
  }
}
