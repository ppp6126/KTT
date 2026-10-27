import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { ThDatePipe } from '../core/util/format';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** กระดิ่งแจ้งเตือน: ตรวจทุก 1 นาที */
@Component({
  selector: 'app-notification-bell',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatBadgeModule, ThDatePipe],
  template: `
    <button
      mat-icon-button
      [matMenuTriggerFor]="menu"
      (menuOpened)="loadList()"
      [attr.aria-label]="'การแจ้งเตือน ' + unread() + ' รายการที่ยังไม่อ่าน'"
    >
      <mat-icon [matBadge]="unread() || null" matBadgeSize="small" matBadgeColor="warn" aria-hidden="false">notifications</mat-icon>
    </button>
    <mat-menu #menu="matMenu" xPosition="before" class="notif-menu">
      <div class="head" (click)="$event.stopPropagation()">
        <b>การแจ้งเตือน</b>
        @if (unread()) {
          <button mat-button (click)="readAll()">อ่านทั้งหมด</button>
        }
      </div>
      @for (n of items(); track n.id) {
        <button mat-menu-item class="item" [class.unread]="!n.readAt" (click)="open(n)">
          <div class="t">{{ n.title }}</div>
          @if (n.body) {
            <div class="b">{{ n.body }}</div>
          }
          <div class="d">{{ n.createdAt | thDate: true }}</div>
        </button>
      } @empty {
        <div class="empty">ไม่มีการแจ้งเตือน</div>
      }
    </mat-menu>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; padding: 4px 16px; min-width: 300px; }
    .item { height: auto !important; min-height: 56px; padding-top: 8px !important; padding-bottom: 8px !important; line-height: 1.35; white-space: normal; }
    .item.unread { background: #eef3f6; }
    .t { font-weight: 500; }
    .b, .d { font-size: 0.8rem; color: var(--ktt-steel); }
    .empty { padding: 16px; color: var(--ktt-steel); text-align: center; }
  `,
})
export class NotificationBell implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly unread = signal(0);
  readonly items = signal<Notification[]>([]);

  constructor() {
    const t = setInterval(() => this.loadCount(), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  ngOnInit(): void {
    this.loadCount();
  }

  loadCount(): void {
    if (document.hidden) return;
    this.http.get<{ unread: number }>('/api/notifications/count').subscribe({ next: (r) => this.unread.set(r.unread), error: () => undefined });
  }

  loadList(): void {
    this.http.get<Notification[]>('/api/notifications', { params: { limit: 15 } }).subscribe((r) => this.items.set(r));
  }

  open(n: Notification): void {
    if (!n.readAt) {
      this.http.post(`/api/notifications/${n.id}/read`, {}).subscribe(() => this.loadCount());
    }
    if (n.link) this.router.navigateByUrl(n.link);
  }

  readAll(): void {
    this.http.post('/api/notifications/read-all', {}).subscribe(() => {
      this.unread.set(0);
      this.loadList();
    });
  }
}
