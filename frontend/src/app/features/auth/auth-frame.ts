import { Component, input } from '@angular/core';

/**
 * กรอบหน้าก่อน login: ซ้ายเป็นแผ่นพิมพ์เขียวพร้อมเส้นบอกระยะ ขวาเป็นฟอร์ม
 */
@Component({
  selector: 'app-auth-frame',
  template: `
    <div class="frame">
      <section class="blueprint" aria-hidden="true">
        <div class="sheet">
          <p class="project">KTT ระบบหลังบ้านงานรับเหมาก่อสร้าง</p>
          <div class="headline">
            <div class="dim">
              <span class="dim-text">4,500</span>
            </div>
            <p class="title">ถอดแบบ คิดราคา<br />ออกใบเสนอราคา<br />จบในระบบเดียว</p>
          </div>
          <dl class="titleblock">
            <div><dt>แบบเลขที่</dt><dd>A-101</dd></div>
            <div><dt>มาตราส่วน</dt><dd>1:100</dd></div>
            <div><dt>หน่วย</dt><dd>มม.</dd></div>
          </dl>
        </div>
      </section>
      <section class="form-side">
        <div class="form-box">
          <h1>{{ heading() }}</h1>
          @if (subheading()) {
            <p class="sub">{{ subheading() }}</p>
          }
          <ng-content />
        </div>
      </section>
    </div>
  `,
  styles: `
    .frame {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(360px, 1fr);
      min-height: 100vh;
      background: var(--ktt-paper);
    }

    .blueprint {
      position: relative;
      background-color: var(--ktt-ink);
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.09) 1px, transparent 1px),
        linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 96px 96px, 96px 96px, 16px 16px, 16px 16px;
      color: #dfe8ee;
      padding: 40px;
      display: flex;
    }

    .sheet {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid rgba(255, 255, 255, 0.35);
      padding: 32px;
    }

    .project {
      margin: 0;
      font-size: 0.9rem;
      color: #a9bccb;
    }

    .headline {
      max-width: 560px;
    }

    /* เส้นบอกระยะ: ขีดหัวท้าย + เส้นกลาง + ตัวเลขกำกับ */
    .dim {
      position: relative;
      height: 28px;
      margin-bottom: 18px;
      border-left: 1px solid var(--ktt-safety);
      border-right: 1px solid var(--ktt-safety);

      &::before {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 6px;
        border-top: 1px solid var(--ktt-safety);
      }
    }

    .dim-text {
      position: absolute;
      left: 50%;
      bottom: 9px;
      transform: translateX(-50%);
      padding: 0 8px;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      color: var(--ktt-safety);
    }

    .title {
      margin: 0;
      font-size: clamp(2rem, 3.4vw, 3rem);
      line-height: 1.2;
      font-weight: 600;
      color: #fff;
    }

    .titleblock {
      display: flex;
      align-self: flex-end;
      margin: 0;
      border: 1px solid rgba(255, 255, 255, 0.35);

      div {
        padding: 8px 16px;
        border-left: 1px solid rgba(255, 255, 255, 0.35);

        &:first-child {
          border-left: none;
        }
      }

      dt {
        font-size: 0.72rem;
        color: #8fa5b5;
      }

      dd {
        margin: 0;
        font-size: 0.95rem;
        color: #fff;
      }
    }

    .form-side {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
    }

    .form-box {
      width: 100%;
      max-width: 380px;

      h1 {
        font-size: 1.6rem;
        margin-bottom: 6px;
      }
    }

    .sub {
      margin: 0 0 24px;
      color: var(--ktt-steel);
    }

    @media (max-width: 860px) {
      .frame {
        grid-template-columns: 1fr;
      }

      .blueprint {
        padding: 16px;
        min-height: 0;
      }

      .sheet {
        padding: 20px;
        gap: 20px;
      }

      .title {
        font-size: 1.6rem;
      }

      .titleblock {
        display: none;
      }
    }
  `,
})
export class AuthFrame {
  readonly heading = input.required<string>();
  readonly subheading = input<string>();
}
