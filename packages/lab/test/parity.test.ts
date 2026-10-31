/**
 * The parity digest (docs/design/combat/engine-port.md, section 4): the fixed corpus of fights and weekends must reproduce the
 * committed digest exactly. A failure names the cases that moved. A change that claims to change no rule must not touch the
 * digest; one that changes a rule re-writes it (`node scripts/parity.mjs --write`) and says in the PR what moved and why.
 */
import { describe, expect, it } from 'vitest';
import digestFile from '../data/parity/digest.json';
import {
  canonical,
  computeDigest,
  digestDiff,
  parityCases,
  type ParityDigest,
} from '../src/parity';

const committed = digestFile as ParityDigest;

describe('the parity digest', () => {
  it('reproduces the committed digest, case by case and overall', () => {
    const got = computeDigest();
    expect(digestDiff(committed, got)).toEqual([]);
    expect(got.overall).toBe(committed.overall);
  });

  it('the corpus is large enough to mean something and every case has a distinct name', () => {
    const names = parityCases().map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(500);
  });

  it('the canonical form does not depend on key order and keeps Maps and Sets', () => {
    expect(canonical({ b: 1, a: { d: 2, c: undefined } })).toBe(canonical({ a: { d: 2 }, b: 1 }));
    expect(
      canonical(
        new Map([
          ['b', 1],
          ['a', 2],
        ]),
      ),
    ).toBe(
      canonical(
        new Map([
          ['a', 2],
          ['b', 1],
        ]),
      ),
    );
    expect(canonical(new Map([['a', 1]]))).not.toBe(canonical(new Map([['a', 2]])));
    expect(canonical(new Set(['b', 'a']))).toBe(canonical(new Set(['a', 'b'])));
  });
});
