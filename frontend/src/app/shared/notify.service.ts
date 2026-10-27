import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorMessage } from '../core/api/api-error';

@Injectable({ providedIn: 'root' })
export class Notify {
  private readonly snack = inject(MatSnackBar);

  ok(message: string): void {
    this.snack.open(message, 'ปิด', { duration: 3500 });
  }

  error(err: unknown, fallback?: string): void {
    this.snack.open(errorMessage(err, fallback), 'ปิด', { duration: 6000, politeness: 'assertive' });
  }
}
