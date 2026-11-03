/**
 * The parity digest (docs/design/combat/engine-port.md, section 4): the fixed corpus of fights and weekends must reproduce the
 * committed digest exactly. A failure names the cases that moved. A change that claims to change no rule must not touch the
 * digest; one that changes a rule re-writes it (`node scripts/parity.mjs --write`) and says in the PR what moved and why.
 */
import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import digestFile from '../data/parity/digest.json';
import { CARDS } from '../src/cards';
import { fight } from '../src/fight';
import { raidMode } from '../src/bosses';
import { toPlacements } from '../src/search';
import { slotAnswersOf, slotBoss } from '../src/track';
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

// ---------- names never matter, rules do ----------

/** A small sub-corpus (a few seconds): fights with the log on, a boss with moves, a foe, a Knack sweep, a talent sweep, a weekend. */
const SUB = [
  /^gauntlet-log:/,
  /^gauntlet:carry#/,
  /^cull:3000#/,
  /^sweep-knack-mid:[^:]+:[^:]+#0$/,
  /^sweep-talent-log:[^:]+#0$/,
  /^foe:[^:]+:7#0$/,
  /^fight-log:slot(1|4|9|13)#0$/,
  /^weekend-log:slot(1|4|9|13)#0$/,
  /^potential-casual:slot(4|9)#0$/,
];

/** The sub-corpus, built and played now: the cases read the catalogue when they are built and when they run. */
function subDigest(): ParityDigest {
  const seen = new Map<RegExp, number>();
  const cases = parityCases().filter((c) => {
    const rx = SUB.find((r) => r.test(c.name));
    if (!rx) return false;
    // A few of each kind keep it fast.
    const n = (seen.get(rx) ?? 0) + 1;
    seen.set(rx, n);
    return n <= 8;
  });
  expect(cases.length).toBeGreaterThan(30);
  return computeDigest(cases);
}

/** Sets every `name` equal to `from` to `to`, anywhere under `roots` (the catalogue holds a name where it is used, not by reference). */
function renameEverywhere(roots: readonly unknown[], from: string, to: string): () => void {
  const undo: (() => void)[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const rec = node as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (key === 'name' && rec[key] === from) {
        rec[key] = to;
        undo.push(() => {
          rec[key] = from;
        });
      } else walk(rec[key]);
    }
  };
  for (const r of roots) walk(r);
  return () => undo.forEach((u) => u());
}

describe('the parity digest is about rules, not names', () => {
  const base = subDigest();

  it('a temporary rename of a Knack, a talent, a card and a move leaves the digest as it was', () => {
    const boss = slotBoss(4);
    const move = boss.moves[0]?.name ?? '';
    const knack = Object.values(combatV2.knacks)[0]?.name ?? '';
    const talent = Object.values(combatV2.talents)[0]?.name ?? '';
    const cardName = CARDS.find((c) => !c.raidOnly)?.name ?? '';
    for (const n of [move, knack, talent, cardName]) expect(n).not.toBe('');
    const names = [move, knack, talent, cardName, boss.name, boss.escalation?.phase?.name ?? ''];
    const roots = [combatV2, CARDS];
    const undo = names.map((n, i) => renameEverywhere(roots, n, `Renamed Number ${i + 1}`));
    try {
      // The rename took: the log of a fight names the move by its new name.
      const renamed = slotBoss(4);
      const mode = raidMode(renamed);
      const result = fight(renamed, toPlacements(slotAnswersOf(4)[0]?.line ?? [], mode), {
        rng: createSeededRng('parity:rename'),
        log: true,
      });
      const texts = result.events.map((e) => e.text).join('\n');
      expect(texts).toContain('Renamed Number 1');
      expect(texts).not.toContain(move);
      expect(subDigest()).toEqual(base);
    } finally {
      undo.reverse().forEach((u) => u());
    }
    expect(subDigest()).toEqual(base);
  });

  it('a one-number rule change (payoffMultBp) still changes it', () => {
    const rules = combatV2.rules as { payoffMultBp: number };
    const was = rules.payoffMultBp;
    rules.payoffMultBp = was + 100;
    try {
      const got = subDigest();
      expect(got.overall).not.toBe(base.overall);
      expect(digestDiff(base, got).length).toBeGreaterThan(0);
    } finally {
      rules.payoffMultBp = was;
    }
    expect(subDigest()).toEqual(base);
  });
});
