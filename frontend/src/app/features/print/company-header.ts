import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { FileService } from '../../shared/files';
import { CompanyHeader } from './quotation-print.page';

/** โหลดหัวกระดาษบริษัท โลโก้ และลายเซ็น สำหรับหน้าพิมพ์ทุกชนิด (สร้างใหม่ต่อหน้า) */
@Injectable()
export class CompanyHeaderStore {
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileService);
  readonly header = signal<CompanyHeader | null>(null);
  readonly logo = signal<string | null>(null);
  readonly signature = signal<string | null>(null);

  load(): void {
    this.http.get<CompanyHeader>('/api/settings/company').subscribe((h) => {
      this.header.set(h);
      if (h.hasLogo) this.files.objectUrl('/api/settings/company/logo').subscribe((u) => this.logo.set(u));
      if (h.hasSignature) this.files.objectUrl('/api/settings/company/signature').subscribe((u) => this.signature.set(u));
    });
  }
}
