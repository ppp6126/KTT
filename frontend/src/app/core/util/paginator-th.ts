import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

@Injectable()
export class ThaiPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'แสดงต่อหน้า';
  override nextPageLabel = 'หน้าถัดไป';
  override previousPageLabel = 'หน้าก่อน';
  override firstPageLabel = 'หน้าแรก';
  override lastPageLabel = 'หน้าสุดท้าย';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) return 'ไม่มีรายการ';
    const start = page * pageSize + 1;
    const end = Math.min(length, (page + 1) * pageSize);
    return `${start.toLocaleString('th-TH')}–${end.toLocaleString('th-TH')} จาก ${length.toLocaleString('th-TH')}`;
  };
}
