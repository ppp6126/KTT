import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';

/**
 * แสดง element เฉพาะผู้ที่มีสิทธิ์: <button *appCan="'customer.write'">
 * (เป็นแค่การซ่อนปุ่ม การตรวจสิทธิ์จริงอยู่ที่ backend)
 */
@Directive({ selector: '[appCan]' })
export class CanDirective {
  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private shown = false;

  readonly appCan = input.required<string | string[]>();

  constructor() {
    effect(() => {
      const perms = this.appCan();
      const ok = this.auth.canAny(...(Array.isArray(perms) ? perms : [perms]));
      if (ok && !this.shown) {
        this.vcr.createEmbeddedView(this.tpl);
        this.shown = true;
      } else if (!ok && this.shown) {
        this.vcr.clear();
        this.shown = false;
      }
    });
  }
}
