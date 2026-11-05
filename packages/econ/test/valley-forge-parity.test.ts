/**
 * Live parity for the Forge (phase 5 step 3): what the server computes for an anvil (`settle` with anvils, `forge.ts` of `@creatures/game`,
 * wrapped by `apps/worker/src/valley-forge.ts`) against the lab's hour by hour model (`forge.ts`), on the lab's own rules, seeded.
 *
 * - pieces a day per anvil (about 1.5, forge.md): one and two busy anvils over four weeks, plain, with tongs, with the loupe and with a
 *   Reach order, the pieces the lab makes against the pieces the pass makes. The lab works in whole hours (a piece that needs 15.2 hours
 *   takes 16, and the next starts the hour after), the pass in continuous time, so the pass is a little faster with mastery: the test
 *   holds them within 6% and the plain pace to the lab's exactly;
 * - T-4, the share of anvil-hours spent tinkering because an input was short: a shelf with scrap for some pieces and shards for fewer,
 *   the share of hours the lab puts in each bucket (work, scrap, shard) against the pass's `forgeHours`, within 2 points;
 * - the rarity odds of a piece are the lab's (`pieceOdds` with no marks against the lab's rarity roll), by many seeded draws.
 */
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  createSeededRng,
  pieceOdds,
  rollRarity,
  settle,
  type SettleForge,
  type SettleOrder,
  type SettleState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { stepAnvils } from '../src/forge';
import { profileById } from '../src/profiles';
import { RULES, type Rules } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { R } from '../src/types';
import { addCreature, createPlayer, createServer } from '../src/world';

const H = 3_600_000;
const found = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!found) throw new Error('no mixed8 server');
const ELEMENTS = VALLEY_ELEMENTS.length;

/** The lab with a floor that never fills and plain odds for the pieces (so only the pace is compared). */
const open: Rules = { ...RULES, forge: { ...RULES.forge, floorPiecesPerAnvil: 100_000 } };

interface Shelf {
  scrap: number;
  shards: number;
}

/** The lab: `anvils` anvils each with a smith, hour by hour for `days` days, making tide pieces for as long as the shelf allows. */
function lab(
  rules: Rules,
  seed: number,
  anvils: number,
  days: number,
  shelf: Shelf,
  kit: 'tongs' | 'loupe' | null,
  reach: 'none' | 'rare' | 'epic' = 'none',
) {
  const p = createPlayer(rules, 'forge-parity', seed, 0, profileById('daily'), 4);
  const server = createServer('forge-parity', seed, found as never, rules);
  for (let i = 0; i < anvils; i++) {
    addCreature(p, i);
    p.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
    p.anvilOcc.push(i);
  }
  p.stock[R.scrap] = shelf.scrap;
  p.stock[R.essence] = reach === 'none' ? 0 : 1_000_000;
  p.shards[0] = shelf.shards;
  p.stock[R.shards] = shelf.shards;
  p.weakByElement[0] = 1_000_000;
  p.anvilKit = kit;
  // An optimiser reaches with spare Essence: the reserve is lowered so that it does.
  p.policy = reach === 'none' ? 'setAndForget' : 'optimiser';
  const lowered: Rules =
    reach === 'none'
      ? rules
      : {
          ...rules,
          forge: {
            ...rules.forge,
            reachReserveEssence: 0,
            // The lab's optimiser reaches as high as its Essence allows: an Epic it cannot afford leaves it the Rare this case asks for.
            reach: { ...rules.forge.reach, epic: { ...rules.forge.reach.epic, essence: 1e12 } },
          },
        };
  p.rules = lowered;
  for (let h = 0; h < days * 24; h++) stepAnvils(p, 1, anvils, server);
  return p;
}

/** The pass: the same anvils, orders for tide pieces, a visit every day (the full away share, as the lab's hours). */
function pass(
  seed: string,
  anvils: number,
  days: number,
  shelf: Shelf,
  kit: 'tongs' | 'loupe' | null,
  reach: 'none' | 'rare' | 'epic' = 'none',
) {
  const order = (i: number): SettleOrder => ({
    id: `o${String(i)}`,
    blueprint: 'kelp-cap',
    element: 0,
    count: 1_000_000,
    made: 0,
    reach,
    forTeam: false,
    stepUp: 0,
  });
  const forge: SettleForge = {
    anvils: Array.from({ length: anvils }, (_, i) => ({
      id: `a${String(i)}`,
      creature: i,
      kit,
      orders: [order(i)],
      piece: null,
      floor: 0,
    })),
    shelf: {
      scrap: shelf.scrap,
      shards: [shelf.shards, 0, 0, 0, 0],
      essence: reach === 'none' ? 0 : 1_000_000,
    },
    scrapCarry: 0,
    weak: new Array<number>(ELEMENTS).fill(0),
    pending: new Array<number>(ELEMENTS).fill(0),
    fireLevel: 1,
  };
  const state: SettleState = {
    settledAt: 0,
    lastVisitAt: 0,
    hearth: 1,
    creatures: Array.from({ length: anvils }, () => ({
      xp: 0,
      carry: 0,
      capXp: Infinity,
      smithHours: 0,
    })),
    forge: {
      ...forge,
      anvils: forge.anvils.map((a) => ({ ...a, floor: 0 })),
    },
  };
  // A floor that never fills: the cap is read from the rules, so the pass runs on a copy with the lab's large one.
  const rules = { ...VALLEY_RULES, forge: { ...VALLEY_RULES.forge, floorPiecesPerAnvil: 100_000 } };
  const visits = Array.from({ length: days }, (_, d) => ({
    at: d * 24 * H,
    kind: 'visit' as const,
  }));
  return settle(state, 0, days * 24 * H, visits, { rules, rng: createSeededRng(seed) });
}

describe('pieces a day per anvil (forge.md: about 1.5)', () => {
  const rich: Shelf = { scrap: 1_000_000, shards: 1_000_000 };
  const cases: {
    name: string;
    anvils: number;
    kit: 'tongs' | 'loupe' | null;
    reach: 'none' | 'rare' | 'epic';
  }[] = [
    { name: 'one anvil', anvils: 1, kit: null, reach: 'none' },
    { name: 'two anvils', anvils: 2, kit: null, reach: 'none' },
    { name: 'tongs', anvils: 1, kit: 'tongs', reach: 'none' },
    { name: 'the loupe', anvils: 1, kit: 'loupe', reach: 'none' },
    { name: 'a Reach for Rare', anvils: 1, kit: null, reach: 'rare' },
  ];
  for (const c of cases) {
    it(`gives the lab's pieces with ${c.name}, over 28 days`, () => {
      const days = 28;
      const l = lab(open, 3, c.anvils, days, rich, c.kit, c.reach);
      const s = pass(`forge-${c.name}`, c.anvils, days, rich, c.kit, c.reach);
      const labMade = l.wk.piecesMade;
      const passMade = s.made?.length ?? 0;
      // The pass runs continuous time, the lab whole hours: the pass is never slower and at most a few percent faster.
      expect(passMade).toBeGreaterThanOrEqual(labMade);
      expect(passMade / labMade).toBeLessThan(1.06);
      // Pieces a day per anvil.
      const perDay = passMade / (days * c.anvils);
      if (c.name === 'one anvil' || c.name === 'two anvils') {
        expect(perDay).toBeGreaterThan(1.4);
        expect(perDay).toBeLessThan(1.65);
      }
    });
  }

  it('is the lab exactly while mastery has not stepped up (the first two days: 16-hour pieces, whole hours)', () => {
    const l = lab(open, 1, 1, 2, { scrap: 1_000_000, shards: 1_000_000 }, null);
    const s = pass('forge-plain-2d', 1, 2, { scrap: 1_000_000, shards: 1_000_000 }, null);
    expect(s.made?.length).toBe(l.wk.piecesMade);
    expect(s.made?.length).toBe(3);
  });
});

describe('T-4: the share of anvil-hours spent tinkering because an input was short', () => {
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

  it('puts the hours in the lab buckets (work, scrap, shard) within 2 points', () => {
    // Scrap for six pieces and shards for five, and the 1-in-12 trickle of tinkering scrap meanwhile: four weeks of one anvil
    // makes five pieces (80 hours of work), then waits on a shard for the rest of the time.
    const shelf: Shelf = { scrap: 6 * VALLEY_RULES.forge.scrap, shards: 5 };
    const days = 28;
    const l = lab(open, 5, 1, days, shelf, null);
    const s = pass('forge-t4', 1, days, shelf, null);
    const total = sum(l.wk.forge);
    expect(total).toBe(days * 24);
    const labShare = {
      work: (l.wk.forge[0] ?? 0) / total,
      scrap: (l.wk.forge[1] ?? 0) / total,
      shard: (l.wk.forge[2] ?? 0) / total,
    };
    const hours = s.forgeHours;
    expect(hours).toBeDefined();
    const passTotal =
      (hours?.work ?? 0) +
      (hours?.scrap ?? 0) +
      (hours?.shard ?? 0) +
      (hours?.idle ?? 0) +
      (hours?.floor ?? 0);
    expect(passTotal).toBeCloseTo(days * 24, 6);
    expect(Math.abs((hours?.work ?? 0) / passTotal - labShare.work)).toBeLessThan(0.02);
    expect(Math.abs((hours?.scrap ?? 0) / passTotal - labShare.scrap)).toBeLessThan(0.02);
    expect(Math.abs((hours?.shard ?? 0) / passTotal - labShare.shard)).toBeLessThan(0.02);
    // Most of the time is the shard wait: the shelf had shards for five pieces only.
    expect(labShare.shard).toBeGreaterThan(0.8);
    expect(s.made?.length).toBe(l.wk.piecesMade);
  });

  it('puts the hours of a scrap wait in the lab buckets too: the trickle restarts the order by itself', () => {
    const shelf: Shelf = { scrap: VALLEY_RULES.forge.scrap + 20, shards: 1_000 };
    const days = 28;
    const l = lab(open, 7, 1, days, shelf, null);
    const s = pass('forge-t4-scrap', 1, days, shelf, null);
    const total = sum(l.wk.forge);
    const hours = s.forgeHours;
    const passTotal =
      (hours?.work ?? 0) +
      (hours?.scrap ?? 0) +
      (hours?.shard ?? 0) +
      (hours?.idle ?? 0) +
      (hours?.floor ?? 0);
    expect(Math.abs((hours?.work ?? 0) / passTotal - (l.wk.forge[0] ?? 0) / total)).toBeLessThan(
      0.02,
    );
    expect(Math.abs((hours?.scrap ?? 0) / passTotal - (l.wk.forge[1] ?? 0) / total)).toBeLessThan(
      0.02,
    );
    // The wait is real: some piece waited for scrap.
    expect(hours?.scrap ?? 0).toBeGreaterThan(24);
  });
});

describe('the odds of a piece', () => {
  it('are the lab rarity roll: the plain odds, a Reach and a loupe, by many seeded draws', () => {
    const n = 40_000;
    const draw = (reach: 'none' | 'rare' | 'epic', loupe: boolean, seed: string): number[] => {
      const rng = createSeededRng(seed);
      const seen = [0, 0, 0];
      const odds = pieceOdds(VALLEY_RULES, reach, loupe, 0);
      for (let i = 0; i < n; i++) seen[rollRarity(rng, odds)]! += 1;
      return seen.map((x) => x / n);
    };
    const plain = draw('none', false, 'odds-1');
    for (const [i, share] of plain.entries()) {
      expect(Math.abs(share - (VALLEY_RULES.forge.baseOdds[i] as number))).toBeLessThan(0.01);
    }
    const epic = draw('epic', false, 'odds-2');
    expect(Math.abs((epic[2] ?? 0) - 0.3)).toBeLessThan(0.01);
    const loupe = draw('none', true, 'odds-3');
    expect(loupe[1] ?? 0).toBeGreaterThan(plain[1] ?? 1);
    expect(
      Math.abs(
        (loupe[1] ?? 0) -
          (VALLEY_RULES.forge.baseOdds[1] as number) * VALLEY_RULES.kit.loupe.rarityOdds,
      ),
    ).toBeLessThan(0.01);
  });
});
