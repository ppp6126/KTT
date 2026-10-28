import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ThDatePipe } from '../core/util/format';
import { confirmAction } from './confirm-dialog';
import { FileService, fileSize } from './files';
import { Notify } from './notify.service';

export interface AttachmentItem {
  id: string;
  fileName: string;
  mime: string;
  category: string;
  sizeBytes: number;
  image: boolean;
  createdAt: string;
}

export const ATTACHMENT_CATEGORIES: Record<string, string> = {
  plan: 'แบบแปลน',
  site_photo: 'รูปหน้างาน',
  deed: 'โฉนด',
  permit: 'ใบอนุญาต',
  contract: 'สัญญา',
  invoice: 'ใบแจ้งหนี้',
  receipt: 'ใบเสร็จ',
  certificate: 'ใบรับรอง',
  drawing: 'แบบก่อสร้าง',
  report: 'รายงาน',
  correspondence: 'หนังสือโต้ตอบ',
  before: 'รูปก่อนแก้ไข',
  after: 'รูปหลังแก้ไข',
  other: 'อื่น ๆ',
};

/** รายการไฟล์แนบของข้อมูลใดๆ + อัปโหลด (ลากวางได้) */
@Component({
  selector: 'app-attachment-panel',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatSelectModule, MatProgressBarModule, ThDatePipe],
  template: `
    @if (canWrite()) {
      <div
        class="drop"
        [class.over]="dragOver()"
        (dragover)="$event.preventDefault(); dragOver.set(true)"
        (dragleave)="dragOver.set(false)"
        (drop)="onDrop($event)"
      >
        <mat-icon>upload_file</mat-icon>
        <span>ลากไฟล์มาวาง หรือ</span>
        <button mat-stroked-button type="button" (click)="picker.click()">เลือกไฟล์</button>
        <mat-select class="cat" [(ngModel)]="category" aria-label="ประเภทไฟล์">
          @for (c of categories; track c[0]) {
            <mat-option [value]="c[0]">{{ c[1] }}</mat-option>
          }
        </mat-select>
        @if (camera()) {
          <button mat-stroked-button type="button" (click)="cam.click()"><mat-icon>photo_camera</mat-icon> ถ่ายรูป</button>
          <input #cam type="file" accept="image/*" capture="environment" hidden (change)="onPick(cam)" />
        }
        <input #picker type="file" multiple hidden [attr.accept]="accept() || null" (change)="onPick(picker)" />
      </div>
      @if (uploading()) {
        <mat-progress-bar mode="indeterminate" />
      }
    }

    @if (images().length) {
      <div class="gallery">
        @for (a of images(); track a.id) {
          <figure>
            <button type="button" class="thumb" (click)="files.open(url(a))" [attr.aria-label]="'เปิด ' + a.fileName">
              @if (thumbs()[a.id]; as src) {
                <img [src]="src" [alt]="a.fileName" loading="lazy" />
              }
            </button>
            <figcaption>
              <span class="muted">{{ catLabel[a.category] }}</span>
              @if (canWrite()) {
                <button mat-icon-button type="button" (click)="remove(a)" aria-label="ลบไฟล์"><mat-icon>delete</mat-icon></button>
              }
            </figcaption>
          </figure>
        }
      </div>
    }

    <ul class="files">
      @for (a of docs(); track a.id) {
        <li>
          <mat-icon class="muted">{{ a.mime === 'application/pdf' ? 'picture_as_pdf' : 'description' }}</mat-icon>
          <button type="button" class="link" (click)="files.open(url(a))">{{ a.fileName }}</button>
          <span class="muted small">{{ catLabel[a.category] }}, {{ size(a.sizeBytes) }}, {{ a.createdAt | thDate }}</span>
          <span class="grow"></span>
          <button mat-icon-button type="button" (click)="files.download(url(a, true), a.fileName)" aria-label="ดาวน์โหลด">
            <mat-icon>download</mat-icon>
          </button>
          @if (canWrite()) {
            <button mat-icon-button type="button" (click)="remove(a)" aria-label="ลบไฟล์"><mat-icon>delete</mat-icon></button>
          }
        </li>
      }
    </ul>
    @if (!items().length && !uploading()) {
      <p class="muted">ยังไม่มีไฟล์แนบ</p>
    }
  `,
  styles: `
    .drop {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 14px 16px; margin-bottom: 12px;
      border: 1.5px dashed var(--ktt-line); border-radius: var(--ktt-radius-m);
      color: var(--ktt-steel);
      &.over { border-color: var(--ktt-ink-2); background: #eef3f6; }
    }
    .cat { width: 140px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 12px; }
    figure { margin: 0; }
    .thumb { display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 1px solid var(--ktt-line); border-radius: var(--ktt-radius-s); overflow: hidden; background: #f2f4f3; cursor: zoom-in; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    figcaption { display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; }
    .files { list-style: none; margin: 0; padding: 0; }
    .files li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--ktt-line); flex-wrap: wrap; }
    .files li:first-child { border-top: none; }
    .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ktt-ink-2); text-decoration: underline; cursor: pointer; text-align: left; }
    .small { font-size: 0.82rem; }
    .grow { flex: 1; }
  `,
})
export class AttachmentPanel implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  readonly files = inject(FileService);

  readonly ownerType = input.required<string>();
  readonly ownerId = input.required<string>();
  readonly canWrite = input(false);
  readonly defaultCategory = input('other');
  /** จำกัดชนิดไฟล์ เช่น image/* */
  readonly accept = input('');
  /** แสดงปุ่มถ่ายรูปด้วยกล้องมือถือ */
  readonly camera = input(false);

  readonly items = signal<AttachmentItem[]>([]);
  readonly thumbs = signal<Record<string, string>>({});
  readonly uploading = signal(false);
  readonly dragOver = signal(false);
  readonly images = computed(() => this.items().filter((a) => a.image));
  readonly docs = computed(() => this.items().filter((a) => !a.image));
  readonly categories = Object.entries(ATTACHMENT_CATEGORIES);
  readonly catLabel = ATTACHMENT_CATEGORIES;
  readonly size = fileSize;
  category = 'other';

  constructor() {
    effect(() => {
      const id = this.ownerId();
      const type = this.ownerType();
      this.category = this.defaultCategory();
      if (id && type) this.load();
    });
  }

  url(a: AttachmentItem, download = false): string {
    return `/api/attachments/${a.id}/file${download ? '?download=true' : ''}`;
  }

  load(): void {
    const params = new HttpParams().set('ownerType', this.ownerType()).set('ownerId', this.ownerId());
    this.http.get<AttachmentItem[]>('/api/attachments', { params }).subscribe({
      next: (list) => {
        this.items.set(list);
        list.filter((a) => a.image && !this.thumbs()[a.id]).forEach((a) =>
          this.files.objectUrl(this.url(a)).subscribe((u) => this.thumbs.update((t) => ({ ...t, [a.id]: u }))),
        );
      },
      error: (e) => this.notify.error(e),
    });
  }

  onPick(input: HTMLInputElement): void {
    if (input.files) this.upload(Array.from(input.files));
    input.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    if (e.dataTransfer?.files) this.upload(Array.from(e.dataTransfer.files));
  }

  private upload(files: File[]): void {
    if (!files.length) return;
    this.uploading.set(true);
    let pending = files.length;
    for (const f of files) {
      const form = new FormData();
      form.append('ownerType', this.ownerType());
      form.append('ownerId', this.ownerId());
      form.append('category', f.type.startsWith('image/') && this.category === 'other' ? 'site_photo' : this.category);
      form.append('file', f, f.name);
      this.http.post('/api/attachments', form).subscribe({
        error: (e) => this.notify.error(e, `อัปโหลด ${f.name} ไม่สำเร็จ`),
        complete: () => undefined,
      }).add(() => {
        pending--;
        if (pending === 0) {
          this.uploading.set(false);
          this.load();
        }
      });
    }
  }

  remove(a: AttachmentItem): void {
    confirmAction(this.dialog, {
      title: 'ลบไฟล์',
      message: `ลบ "${a.fileName}"`,
      confirmText: 'ลบไฟล์',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.http.delete(`/api/attachments/${a.id}`).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
    });
  }

  ngOnDestroy(): void {
    Object.values(this.thumbs()).forEach((u) => URL.revokeObjectURL(u));
  }
}
