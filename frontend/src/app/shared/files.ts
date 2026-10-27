import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/**
 * ไฟล์จาก API ต้องแนบ access token (อยู่ใน memory) จึงโหลดเป็น blob ผ่าน HttpClient
 * แทนการใช้ <a href> หรือ <img src> ตรงๆ
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly http = inject(HttpClient);

  blob(url: string): Observable<Blob> {
    return this.http.get(url, { responseType: 'blob' });
  }

  objectUrl(url: string): Observable<string> {
    return this.blob(url).pipe(map((b) => URL.createObjectURL(b)));
  }

  open(url: string): void {
    // เปิดแท็บก่อน (กัน popup blocker) แล้วค่อยใส่ URL เมื่อโหลดเสร็จ
    const win = window.open('', '_blank');
    this.blob(url).subscribe({
      next: (b) => {
        const u = URL.createObjectURL(b);
        if (win) win.location.href = u;
        else window.location.href = u;
        setTimeout(() => URL.revokeObjectURL(u), 60_000);
      },
      error: () => win?.close(),
    });
  }

  download(url: string, fileName: string): void {
    this.blob(url).subscribe((b) => saveBlob(b, fileName));
  }
}

export function saveBlob(blob: Blob, fileName: string): void {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10_000);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
