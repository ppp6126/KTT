import { bahtText, round2 } from './money';

describe('bahtText', () => {
  it('อ่านตัวเลขตามตัวอย่างใบเสนอราคาของบริษัท', () => {
    expect(bahtText(911100)).toBe('เก้าแสนหนึ่งหมื่นหนึ่งพันหนึ่งร้อยบาทถ้วน');
  });

  it('เอ็ด ยี่ และสตางค์', () => {
    expect(bahtText(21)).toBe('ยี่สิบเอ็ดบาทถ้วน');
    expect(bahtText(11)).toBe('สิบเอ็ดบาทถ้วน');
    expect(bahtText(101)).toBe('หนึ่งร้อยเอ็ดบาทถ้วน');
    expect(bahtText(1)).toBe('หนึ่งบาทถ้วน');
    expect(bahtText(10)).toBe('สิบบาทถ้วน');
    expect(bahtText(1234.5)).toBe('หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์');
    expect(bahtText(0.25)).toBe('ยี่สิบห้าสตางค์');
  });

  it('หลักล้าน', () => {
    expect(bahtText(1_000_000)).toBe('หนึ่งล้านบาทถ้วน');
    expect(bahtText(21_000_001)).toBe('ยี่สิบเอ็ดล้านหนึ่งบาทถ้วน');
    expect(bahtText(911205.82)).toBe('เก้าแสนหนึ่งหมื่นหนึ่งพันสองร้อยห้าบาทแปดสิบสองสตางค์');
  });

  it('round2 แบบ HALF_UP', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(84392.22)).toBe(84392.22);
  });
});
