import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, MatButtonModule],
  template: `
    <div class="page">
      <div class="panel empty-state">
        <h1>ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
        <p>บทบาทของคุณยังไม่ได้รับสิทธิ์นี้ ถ้าต้องใช้งาน ให้ติดต่อผู้ดูแลระบบเพื่อเพิ่มสิทธิ์</p>
        <a mat-stroked-button routerLink="/">กลับหน้าแรก</a>
      </div>
    </div>
  `,
})
export class ForbiddenPage {}
