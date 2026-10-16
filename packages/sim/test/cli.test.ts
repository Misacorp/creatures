import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { main, parseCli, type Io } from '../src/cli';
import { applyOverrides } from '../src/tune';

const dir = mkdtempSync(join(tmpdir(), 'sim-cli-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('CLI arguments', () => {
  it('has defaults', () => {
    const o = parseCli([]);
    expect(o.settings.seed).toBe('leet');
    expect(o.settings.mode).toBe('full');
    expect(o.settings.weeks).toBe(12);
    expect(o.settings.runsPerCell).toBe(200);
    expect(o.out).toBe('sim-out');
    expect(o.failOnViolations).toBe(false);
  });

  it('reads every flag', () => {
    const o = parseCli([
      '--seed',
      'abc',
      '--quick',
      '--weeks',
      '9',
      '--out',
      'x',
      '--fail-on-violations',
    ]);
    expect(o.settings.seed).toBe('abc');
    expect(o.settings.mode).toBe('quick');
    expect(o.settings.runsPerCell).toBe(20);
    expect(o.settings.weeks).toBe(9);
    expect(o.out).toBe('x');
    expect(o.failOnViolations).toBe(true);
  });

  it('rejects bad input', () => {
    expect(() => parseCli(['--weeks', '0'])).toThrow();
    expect(() => parseCli(['--weeks', 'abc'])).toThrow();
    expect(() => parseCli(['--weeks', '500'])).toThrow();
    expect(() => parseCli(['--seed', ''])).toThrow();
    expect(() => parseCli(['--nope'])).toThrow();
    expect(() => parseCli(['stray'])).toThrow();
  });
});

/**
 * Runs `body` with bosses nobody can beat, so a target is certain to fail (the shipped numbers pass
 * every target, which is the point of the balance passes, so a failing run has to be made).
 */
function withUnbeatableBosses<T>(body: () => T): T {
  const restore = applyOverrides(content.bosses.map((b) => `boss.${b.id}.baseHp=900000`).join(','));
  try {
    return body();
  } finally {
    restore();
  }
}

describe('CLI run', () => {
  it('writes the reports, prints a summary, and exits 0 without --fail-on-violations', () => {
    const { io, out } = capture();
    const code = withUnbeatableBosses(() => main(['--quick', '--weeks', '5', '--out', dir], io));
    expect(code).toBe(0);
    expect(out[0]).toMatch(/passed, \d+ failed, \d+ not measured/);
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toContain('# Balance simulator report');
    const json = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as {
      summary: { fail: number };
    };
    expect(json.summary.fail).toBeGreaterThan(0);
  }, 300_000);

  it('exits 1 with --fail-on-violations when a target fails', () => {
    const { io } = capture();
    expect(
      withUnbeatableBosses(() =>
        main(['--quick', '--weeks', '5', '--out', dir, '--fail-on-violations'], io),
      ),
    ).toBe(1);
  }, 300_000);

  it('exits non-zero on bad arguments', () => {
    const { io, err } = capture();
    expect(main(['--weeks', '0'], io)).not.toBe(0);
    expect(err.length).toBeGreaterThan(0);
  });
});
