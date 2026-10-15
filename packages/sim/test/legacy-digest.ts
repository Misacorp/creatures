import { scaleMix, DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import { runSimulation } from '../src/run';
import { TINY } from './helpers';

/**
 * A fingerprint of today's simulator results, used to prove that the journey work (profiles, income
 * models) leaves the existing `pnpm sim` numbers as they were. The digests in
 * `fixtures/legacy-digest.json` were taken from the code before profiles existed (commit 3f31620), when
 * the only income was the leet pay: every run here asks for the `current` income model, which is no
 * longer the default.
 * Fields that only exist since (a player's `profile`) are left out of the fingerprint.
 */

/** cyrb53: a small, well-spread 53-bit string hash (this is a fingerprint, not security). */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const withoutNewFields = (key: string, value: unknown): unknown =>
  key === 'profile' ? undefined : value;

export interface DigestEntry {
  hash: string;
  /** A few readable numbers, so a changed hash can be read at a glance. */
  headline: Record<string, number>;
}

function entryOf(value: unknown, headline: Record<string, number>): DigestEntry {
  return { hash: hash53(JSON.stringify(value, withoutNewFields)), headline };
}

export function legacyDigest(): Record<string, DigestEntry> {
  const out: Record<string, DigestEntry> = {};
  const configs = [
    {
      id: 'default-8w',
      seed: 'golden-a',
      weeks: 8,
      mix: DEFAULT_MIX,
      income: 'current' as const,
      snapshotWeeks: [4, 8],
    },
    {
      id: 'five-nogear',
      seed: 'golden-b',
      weeks: 6,
      mix: scaleMix(5),
      income: 'current' as const,
      snapshotWeeks: [],
      gear: false,
    },
    {
      id: 'behaviour',
      seed: 'golden-c',
      weeks: 5,
      mix: DEFAULT_MIX,
      income: 'current' as const,
      snapshotWeeks: [3],
      behaviour: {
        tripPercent: 60,
        dungeonPercent: 70,
        signUpPercent: 80,
        leetDaysPerWeek: { casual: 3 },
      },
    },
    {
      id: 'fifteen-nodungeon',
      seed: 'golden-d',
      weeks: 6,
      mix: scaleMix(15),
      income: 'current' as const,
      snapshotWeeks: [],
      dungeon: false,
    },
  ];
  for (const { id, ...options } of configs) {
    const result = runEconomy(options);
    const last = result.players[0]?.weeks.at(-1);
    out[id] = entryOf(result, {
      raidsWon: result.raids.filter((r) => r.summary.finaleWon).length,
      firstPlayerTop3Power: last?.top3Power ?? 0,
      firstPlayerBaitEarned: result.players[0]?.weeks.reduce((n, w) => n + w.baitEarned, 0) ?? 0,
    });
  }
  const run = runSimulation({ ...TINY, income: 'current' });
  out['run-tiny'] = entryOf(
    { evaluation: run.evaluation, metrics: run.analysis.metrics },
    { targets: run.evaluation.length },
  );
  return out;
}
