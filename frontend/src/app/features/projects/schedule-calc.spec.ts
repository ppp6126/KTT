import { describe, expect, it } from 'vitest';
import { CalcTask, actual, planned, rollup } from './schedule-calc';

// ชุดเดียวกับ ScheduleCalculatorTest ฝั่ง Java
const D1 = '2026-01-01';
const tasks: CalcTask[] = [
  { key: 'A', parentKey: null, weight: 99, progress: 0, plannedStart: null, plannedEnd: null },
  { key: 'A1', parentKey: 'A', weight: 30, progress: 100, plannedStart: D1, plannedEnd: '2026-01-10' },
  { key: 'A2', parentKey: 'A', weight: 20, progress: 50, plannedStart: '2026-01-11', plannedEnd: '2026-01-20' },
  { key: 'B', parentKey: null, weight: 50, progress: 10, plannedStart: '2026-01-11', plannedEnd: '2026-01-30' },
];

describe('schedule-calc', () => {
  it('actual is weighted average of leaves', () => {
    expect(actual(tasks)).toBe(45);
  });

  it('planned is linear within the task window', () => {
    expect(planned(tasks, '2026-01-05')).toBe(15);
    expect(planned(tasks, '2025-12-31')).toBe(0);
    expect(planned(tasks, '2026-02-10')).toBe(100);
  });

  it('rolls up categories', () => {
    const r = rollup(tasks, '2026-01-15').get('A')!;
    expect(r.actualPct).toBe(80);
    expect(r.plannedPct).toBe(80);
    expect(r.weight).toBe(50);
  });
});
