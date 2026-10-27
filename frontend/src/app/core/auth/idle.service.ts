import { DestroyRef, Injectable, NgZone, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

/** ไม่มีการใช้งาน 30 นาที → ออกจากระบบ (ตรงกับ idle timeout ของ refresh token ฝั่ง backend) */
@Injectable({ providedIn: 'root' })
export class IdleService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private lastActivity = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly onActivity = () => {
    this.lastActivity = Date.now();
  };

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.start();
      } else {
        this.stop();
      }
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    if (this.timer) return;
    this.lastActivity = Date.now();
    this.zone.runOutsideAngular(() => {
      EVENTS.forEach((e) => window.addEventListener(e, this.onActivity, { passive: true }));
      this.timer = setInterval(() => {
        if (Date.now() - this.lastActivity > IDLE_LIMIT_MS) {
          this.zone.run(() => this.auth.logout('ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 30 นาที'));
        }
      }, 30_000);
    });
  }

  private stop(): void {
    EVENTS.forEach((e) => window.removeEventListener(e, this.onActivity));
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
