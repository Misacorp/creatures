/** The CPU measure (`src/cpuMeasure.ts`, `packages/engine/scripts/v2-cpu.mjs`): the statistics, and that every case runs with a fake clock. */
import { describe, expect, it } from 'vitest';
import { cpuReport, cpuTable, quantile } from '../src/cpuMeasure';

describe('the CPU measure', () => {
  it('takes the median and the 95th percentile by nearest rank', () => {
    const samples = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(quantile(samples, 0.5)).toBe(10);
    expect(quantile(samples, 0.95)).toBe(19);
    expect(quantile([7], 0.95)).toBe(7);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('runs every case once and prints a table with a line each', () => {
    let t = 0;
    // A clock that moves 1 ms each time it is read: every run measures 1 ms.
    const rows = cpuReport({ now: () => ++t, runs: 1, warmup: 0 });
    const labels = rows.map((r) => r.label);
    expect(labels.some((l) => l.startsWith('raid stage, 15 columns x 3 rows'))).toBe(true);
    expect(labels.some((l) => l.startsWith('dungeon room'))).toBe(true);
    expect(labels.some((l) => l.startsWith('live finale replay to round 6'))).toBe(true);
    expect(labels.some((l) => l.startsWith('live finale replay to the last round'))).toBe(true);
    for (const row of rows) {
      expect(row.medianMs).toBe(1);
      expect(row.p95Ms).toBe(1);
    }
    expect(cpuTable(rows).split('\n')).toHaveLength(rows.length + 1);
  });
});
