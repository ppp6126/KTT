import { Pipe, PipeTransform } from '@angular/core';

const MONEY = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '–';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? MONEY.format(n) : '–';
}

export function qty(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? QTY.format(n) : '';
}

/** 1,234.50 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(v: number | string | null | undefined): string {
    return money(v);
  }
}

@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(v: number | string | null | undefined): string {
    return qty(v);
  }
}

/** ปัดเศษ 2 ตำแหน่งแบบเดียวกับ backend (HALF_UP) */
export function round2(n: number): number {
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readGroup(n: number): string {
  // n < 1,000,000
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 2) out += 'ยี่';
    else if (pos === 1 && d === 1) out += '';
    else out += DIGITS[d];
    out += POSITIONS[pos];
  }
  return out;
}

function readNumber(n: number): string {
  if (n === 0) return 'ศูนย์';
  let out = '';
  const millions: number[] = [];
  let x = n;
  while (x > 0) {
    millions.unshift(x % 1_000_000);
    x = Math.floor(x / 1_000_000);
  }
  millions.forEach((g, idx) => {
    if (g > 0) out += readGroup(g);
    if (idx < millions.length - 1) out += 'ล้าน';
  });
  return out;
}

/** จำนวนเงินเป็นตัวอักษรไทย เช่น 911100 → "เก้าแสนหนึ่งหมื่นหนึ่งพันหนึ่งร้อยบาทถ้วน" */
export function bahtText(amount: number): string {
  const neg = amount < 0;
  const total = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(total / 100);
  const satang = total % 100;
  let out = '';
  if (baht > 0 || satang === 0) out += readNumber(baht) + 'บาท';
  out += satang === 0 ? 'ถ้วน' : readNumber(satang) + 'สตางค์';
  return (neg ? 'ลบ' : '') + out;
}
