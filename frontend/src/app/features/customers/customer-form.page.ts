import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { errorCode, fieldErrors } from '../../core/api/api-error';
import { Perm } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { SOURCE_LABEL, ThDatePipe } from '../../core/util/format';
import { confirmAction } from '../../shared/confirm-dialog';
import { Notify } from '../../shared/notify.service';
import { Customer, CustomerInput, CustomerSource, CustomerType, CustomersApi, isValidThaiTaxId } from './customers.api';

function taxIdValidator(c: AbstractControl): ValidationErrors | null {
  const v = (c.value as string)?.replace(/\D/g, '') ?? '';
  if (!v) return null;
  return isValidThaiTaxId(v) ? null : { taxId: true };
}

@Component({
  selector: 'app-customer-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    ThDatePipe,
  ],
  templateUrl: './customer-form.page.html',
  styleUrl: './customer-form.page.scss',
})
export class CustomerFormPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  /** จาก route customers/:id (ไม่มี = เพิ่มใหม่) */
  readonly id = input<string>();

  readonly sources = Object.entries(SOURCE_LABEL);
  readonly customer = signal<Customer | null>(null);
  readonly busy = signal(false);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly duplicateOf = signal<string | null>(null);
  readonly isNew = computed(() => !this.id());
  readonly canWrite = computed(() => this.auth.can(Perm.CUSTOMER_WRITE));
  readonly canDelete = computed(() => this.auth.can(Perm.CUSTOMER_DELETE));

  readonly form = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<CustomerType>('person'),
    name: ['', [Validators.required, Validators.maxLength(255)]],
    taxId: ['', [taxIdValidator]],
    branchNo: ['00000', [Validators.pattern(/^\d{5}$/)]],
    phone: [''],
    email: ['', [Validators.email]],
    lineId: [''],
    billingAddress: [''],
    source: this.fb.nonNullable.control<CustomerSource>('other'),
    note: [''],
    pdpaConsent: [false],
    contacts: this.fb.array<ReturnType<CustomerFormPage['contactGroup']>>([]),
  });

  get contacts(): FormArray {
    return this.form.controls.contacts;
  }

  ngOnInit(): void {
    const id = this.id();
    if (id) {
      this.api.get(id).subscribe({
        next: (c) => this.fill(c),
        error: (e) => {
          this.notify.error(e);
          this.router.navigate(['/customers']);
        },
      });
    }
    if (!this.canWrite()) {
      this.form.disable();
    }
  }

  contactGroup(c?: { id: string | null; name: string; position: string | null; phone: string | null; email: string | null }) {
    return this.fb.nonNullable.group({
      id: this.fb.control<string | null>(c?.id ?? null),
      name: [c?.name ?? '', Validators.required],
      position: [c?.position ?? ''],
      phone: [c?.phone ?? ''],
      email: [c?.email ?? '', Validators.email],
    });
  }

  addContact(): void {
    this.contacts.push(this.contactGroup());
  }

  removeContact(i: number): void {
    this.contacts.removeAt(i);
    this.form.markAsDirty();
  }

  save(): void {
    this.serverErrors.set({});
    this.duplicateOf.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input: CustomerInput = {
      type: v.type,
      name: v.name.trim(),
      taxId: v.taxId.replace(/\D/g, '') || null,
      branchNo: v.type === 'company' ? v.branchNo || '00000' : null,
      phone: v.phone || null,
      email: v.email || null,
      lineId: v.lineId || null,
      billingAddress: v.billingAddress || null,
      source: v.source,
      note: v.note || null,
      pdpaConsent: v.pdpaConsent,
      contacts: v.contacts.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        position: c.position || null,
        phone: c.phone || null,
        email: c.email || null,
      })),
    };
    this.busy.set(true);
    const id = this.id();
    const req = id ? this.api.update(id, input) : this.api.create(input);
    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.notify.ok(id ? 'บันทึกข้อมูลลูกค้าแล้ว' : 'เพิ่มลูกค้าแล้ว');
        if (id) {
          this.fill(c);
        } else {
          this.router.navigate(['/customers', c.id], { replaceUrl: true });
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.serverErrors.set(fieldErrors(e));
        if (errorCode(e) === 'duplicate_tax_id') {
          const details = (e.error?.details ?? {}) as { customerId?: string };
          this.duplicateOf.set(details.customerId ?? null);
        }
        this.notify.error(e);
      },
    });
  }

  remove(): void {
    const c = this.customer();
    if (!c) return;
    confirmAction(this.dialog, {
      title: 'ลบลูกค้า',
      message: `ลบ "${c.name}" ออกจากทะเบียน ลบได้เฉพาะลูกค้าที่ยังไม่มีลีดหรืองาน`,
      confirmText: 'ลบลูกค้า',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(c.id).subscribe({
        next: () => {
          this.notify.ok('ลบลูกค้าแล้ว');
          this.router.navigate(['/customers']);
        },
        error: (e) => this.notify.error(e),
      });
    });
  }

  private fill(c: Customer): void {
    this.customer.set(c);
    this.contacts.clear();
    c.contacts.forEach((ct) => this.contacts.push(this.contactGroup(ct)));
    this.form.patchValue({
      type: c.type,
      name: c.name,
      taxId: c.taxId ?? '',
      branchNo: c.branchNo ?? '00000',
      phone: c.phone ?? '',
      email: c.email ?? '',
      lineId: c.lineId ?? '',
      billingAddress: c.billingAddress ?? '',
      source: c.source,
      note: c.note ?? '',
      pdpaConsent: !!c.pdpaConsentAt,
    });
    if (!this.canWrite()) {
      this.form.disable();
    }
    this.form.markAsPristine();
  }
}
