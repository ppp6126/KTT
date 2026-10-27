import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { forkJoin } from 'rxjs';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { PermissionDto, RoleDto, UsersApi } from './users.api';

const MODULE_LABEL: Record<string, string> = {
  user: 'ผู้ใช้งาน',
  role: 'บทบาท',
  audit: 'ประวัติการใช้งาน',
  settings: 'ตั้งค่าระบบ',
  customer: 'ลูกค้า',
  lead: 'ลีด',
  pricing: 'ฐานราคากลาง',
  boq: 'BOQ',
  quotation: 'ใบเสนอราคา',
  cost: 'ต้นทุนและกำไร',
  attachment: 'ไฟล์แนบ',
};

interface Draft {
  id: string | null;
  code: string;
  name: string;
  description: string;
  system: boolean;
  permissions: Set<string>;
}

@Component({
  selector: 'app-roles-page',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './roles.page.html',
  styleUrl: './roles.page.scss',
})
export class RolesPage implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);

  readonly roles = signal<RoleDto[]>([]);
  readonly permissions = signal<PermissionDto[]>([]);
  readonly draft = signal<Draft | null>(null);
  readonly busy = signal(false);

  readonly groups = computed(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of this.permissions()) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()].map(([module, perms]) => ({ module, label: MODULE_LABEL[module] ?? module, perms }));
  });

  readonly isOwner = computed(() => this.draft()?.code === 'owner');

  ngOnInit(): void {
    forkJoin([this.api.roles(), this.api.permissions()]).subscribe({
      next: ([roles, perms]) => {
        this.roles.set(roles);
        this.permissions.set(perms);
        if (roles.length) this.select(roles[0]);
      },
      error: (e) => this.notify.error(e),
    });
  }

  select(r: RoleDto): void {
    this.draft.set({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? '',
      system: r.system,
      permissions: new Set(r.permissions),
    });
  }

  newRole(): void {
    this.draft.set({ id: null, code: '', name: '', description: '', system: false, permissions: new Set() });
  }

  toggle(code: string, checked: boolean): void {
    const d = this.draft();
    if (!d) return;
    const next = new Set(d.permissions);
    if (checked) next.add(code);
    else next.delete(code);
    this.draft.set({ ...d, permissions: next });
  }

  save(): void {
    const d = this.draft();
    if (!d || !d.name.trim() || !d.code.trim()) {
      this.notify.error(null, 'กรุณากรอกรหัสและชื่อบทบาท');
      return;
    }
    const input = { code: d.code, name: d.name, description: d.description || null, permissions: [...d.permissions] };
    this.busy.set(true);
    const req = d.id ? this.api.updateRole(d.id, input) : this.api.createRole(input);
    req.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.notify.ok('บันทึกบทบาทแล้ว ผู้ใช้จะได้สิทธิ์ใหม่ภายใน 15 นาที');
        this.api.roles().subscribe((roles) => {
          this.roles.set(roles);
          this.select(roles.find((r) => r.id === saved.id) ?? saved);
        });
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  remove(): void {
    const d = this.draft();
    if (!d?.id) return;
    confirmAction(this.dialog, {
      title: 'ลบบทบาท',
      message: `ลบบทบาท "${d.name}" (ต้องไม่มีผู้ใช้อยู่ในบทบาทนี้)`,
      confirmText: 'ลบบทบาท',
      danger: true,
    }).subscribe((ok) => {
      if (!ok || !d.id) return;
      this.api.deleteRole(d.id).subscribe({
        next: () => {
          this.notify.ok('ลบบทบาทแล้ว');
          this.ngOnInit();
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  updateField(field: 'code' | 'name' | 'description', value: string): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, [field]: value });
  }
}
