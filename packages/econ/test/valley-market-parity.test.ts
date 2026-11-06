/**
 * Live parity for the Market (phase 5 step 7): the broker the server runs (`settle` with a broker seat, `forge.ts` of `@creatures/game`)
 * against the lab's V-FORGE-11 (the Market as a project, then a broker that tops up the shelf every hour), seeded.
 *
 * The lab's finding to hold: "shard waits fall once built". On `mixed8-market` the Market is built in the first week or two (the
 * anvils spend 15% of a week waiting for a shard); once it is built the share of anvil time waiting for a shard falls to a fraction of the
 * same weeks of a server with no broker at all (`mixed8-nobroker`). The server's pass has to show the same shape on
 * one player's anvils: the same shelf, the same orders, the share of effective anvil hours spent waiting for a shard (`forgeHours`),
 * with no broker and with one. Both are compared as the share of waiting that is left (with / without), and the pass must remove at
 * least as much of the waiting as the lab's median does, less 15 points (the pass keeps a stock for three pieces ahead and the lab
 * trades hour by hour).
 *
 * Never loosen a number here to make it pass: a miss is a finding for the lead.
 */
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  createSeededRng,
  settle,
  type SettleForge,
  type SettleOrder,
  type SettleState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';

const H = 3_600_000;
const SEEDS = [1, 2, 3];
const WEEKS = 14;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};
const config = (id: string) => {
  const found = ALL_SERVERS.find((s) => s.id === id);
  if (!found) throw new Error(`no server ${id}`);
  return found;
};

/** The lab: by seed, the server's shard stall in the weeks after the Market was built, and in the same weeks with no broker at all. */
function lab(seed: number) {
  const market = runServer({ ...config('mixed8-market'), weeks: WEEKS }, seed);
  const none = runServer({ ...config('mixed8-nobroker'), weeks: WEEKS }, seed);
  const built = market.log.findIndex((w) => w.market === 2);
  if (built < 0) return null;
  // Skip the week it was built in (the stall is a week's mean).
  const after = market.log.slice(built + 1);
  return {
    builtWeek: built + 1,
    after: median(after.map((w) => w.shardStall)),
    noBrokerSameWeeks: median(none.log.slice(built + 1).map((w) => w.shardStall)),
    weeksAfter: after.length,
  };
}

/** The server's pass on one player's anvils: the share of anvil hours waiting for a shard, over `days` days with a shelf rich in one other element. */
function pass(seed: number, withBroker: boolean, days: number) {
  const N = VALLEY_ELEMENTS.length;
  const order = (id: string, element: number): SettleOrder => ({
    id,
    blueprint: 'tide-hat',
    element,
    count: 999,
    made: 0,
    reach: 'none',
    forTeam: false,
    stepUp: 0,
  });
  const anvils = [0, 1].map((i) => ({
    id: `a${String(i)}`,
    creature: i,
    kit: null,
    orders: [order(`o${String(i)}`, i)],
    piece: null,
    floor: 0,
  }));
  // The scouts bring mire and spark; the orders are for tide and ember: every shard the orders need is bought from the others.
  const shards = new Array<number>(N).fill(0);
  const shelf = (hours: number): number[] => {
    const s = [...shards];
    s[VALLEY_ELEMENTS.indexOf('mire')] = Math.round(hours * 0.4);
    s[VALLEY_ELEMENTS.indexOf('spark')] = Math.round(hours * 0.4);
    return s;
  };
  const forge: SettleForge = {
    anvils,
    shelf: { scrap: 100_000, shards: shelf(days * 24), essence: 0 },
    scrapCarry: 0,
    weak: new Array<number>(N).fill(0),
    pending: new Array<number>(N).fill(0),
    fireLevel: 1,
  };
  const state: SettleState = {
    settledAt: 0,
    lastVisitAt: 0,
    hearth: 1,
    creatures: [0, 1, 2].map(() => ({ xp: 0, carry: 0, capXp: Infinity })),
    forge,
    ...(withBroker ? { broker: { id: 'b', creature: 2, toward: -1, credit: 0 } } : {}),
  };
  // A daily player: a visit every day, so the away share stays high.
  const events = Array.from({ length: days }, (_, d) => ({
    at: (d + 1) * 24 * H,
    kind: 'visit' as const,
  }));
  const rng = createSeededRng(`market-parity-${String(seed)}`);
  const after = settle(state, 0, days * 24 * H, events, { rng });
  const hours = after.forgeHours;
  if (hours === undefined) throw new Error('no forge hours');
  const all = hours.work + hours.scrap + hours.shard + hours.essence + hours.floor + hours.idle;
  return { waiting: hours.shard / all, made: after.made?.length ?? 0 };
}

describe('the Market against the lab (V-FORGE-11)', () => {
  const labs = SEEDS.map((s) => lab(s));

  it('the lab: shard waits fall once the Market is built, below what they were and below a server with no broker', () => {
    const built = labs.filter((l) => l !== null);
    expect(
      built.length,
      'the Market was built in at least two of the three seeds',
    ).toBeGreaterThanOrEqual(2);
    for (const l of built) {
      expect(l.weeksAfter).toBeGreaterThan(2);
      // Less than half of what a server with no broker waits (the lab's medians: about 0.04 against 0.27).
      expect(l.after, `built in week ${String(l.builtWeek)}`).toBeLessThan(
        0.5 * l.noBrokerSameWeeks,
      );
    }
  });

  it('the pass: a broker removes as much of the shard waiting as the lab does, within 15 points', () => {
    const built = labs.filter((l) => l !== null);
    // The lab's share of waiting that is left once built, against the weeks before it (open) and against no broker.
    const labLeft = median(built.map((l) => l.after / Math.max(1e-9, l.noBrokerSameWeeks)));
    const days = 14;
    const without = SEEDS.map((s) => pass(s, false, days));
    const withIt = SEEDS.map((s) => pass(s, true, days));
    const passLeft = median(
      SEEDS.map((_, i) => (withIt[i]?.waiting ?? 0) / Math.max(1e-9, without[i]?.waiting ?? 1)),
    );
    // Report, never silent: the numbers are in the failure message.
    const note = `lab left ${labLeft.toFixed(2)} of the no-broker waiting; pass left ${passLeft.toFixed(2)} (without ${median(without.map((w) => w.waiting)).toFixed(2)}, with ${median(withIt.map((w) => w.waiting)).toFixed(2)})`;
    expect(
      without.every((w) => w.waiting > 0.5),
      note,
    ).toBe(true);
    expect(
      withIt.every((w, i) => w.made > (without[i]?.made ?? 0)),
      note,
    ).toBe(true);
    expect(passLeft, note).toBeLessThanOrEqual(labLeft + 0.15);
    // The same rules: the broker's rate and crits are the lab's tiers.
    expect(VALLEY_RULES.broker.tiers).toHaveLength(4);
  });
});
