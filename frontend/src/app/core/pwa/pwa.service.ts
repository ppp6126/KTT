import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * ติดตั้งเป็นแอปบนมือถือ/คอม (PWA), แจ้งเมื่อมีเวอร์ชันใหม่, และบอกสถานะออฟไลน์
 * service worker แคชเฉพาะไฟล์ตัวแอป ไม่แคชข้อมูลจาก API เพื่อไม่ให้ข้อมูลบริษัทค้างในมือถือที่หายได้
 * (ยกเว้นร่างรายงานประจำวันที่ยังไม่ได้บันทึก ซึ่งลบทิ้งทันทีเมื่อบันทึกสำเร็จ)
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly snack = inject(MatSnackBar);
  private readonly sw = inject(SwUpdate);
  private deferred: InstallPromptEvent | null = null;

  readonly canInstall = signal(false);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    const destroy = inject(DestroyRef);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as InstallPromptEvent;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
    });
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));

    if (this.sw.isEnabled) {
      this.sw.versionUpdates
        .pipe(
          filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
          takeUntilDestroyed(destroy),
        )
        .subscribe(() => {
          this.snack
            .open('มีระบบเวอร์ชันใหม่', 'โหลดใหม่', { duration: 0 })
            .onAction()
            .subscribe(() => document.location.reload());
        });
      this.sw.unrecoverable.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
        this.snack.open('ไฟล์ของแอปเสียหาย กรุณาโหลดหน้าใหม่', 'โหลดใหม่', { duration: 0 }).onAction().subscribe(() => document.location.reload());
      });
      // ตรวจเวอร์ชันใหม่ทุก 30 นาทีระหว่างเปิดใช้งาน
      setInterval(() => this.sw.checkForUpdate().catch(() => undefined), 30 * 60 * 1000);
    }
  }

  async install(): Promise<void> {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canInstall.set(false);
  }
}
