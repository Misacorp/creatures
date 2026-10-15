import { describe, expect, it } from 'vitest';
import { main } from '../src/reflect-study';

function capture(): {
  io: { out(t: string): void; err(t: string): void };
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('Cinder Wyrm reflect study', () => {
  it('rejects bad arguments', () => {
    for (const args of [
      ['--runs', '0'],
      ['--runs', 'many'],
      ['--econ', '99'],
      ['--cap', '0'],
      ['--nope'],
    ]) {
      const c = capture();
      expect(main(args, c.io), args.join(' ')).toBe(2);
      expect(c.err.length).toBeGreaterThan(0);
    }
  });

  it('refuses to report when the engine was not patched by the study loader', () => {
    // Under a plain loader (as in this test) the study switch is not read, so every variant equals the
    // shipped rule; the study must say so instead of reporting three copies of one number.
    const c = capture();
    expect(main(['--runs', '2', '--econ', '1'], c.io)).toBe(1);
    expect(c.out).toEqual([]);
    expect(c.err.join('\n')).toMatch(/changed nothing/);
  });
});
