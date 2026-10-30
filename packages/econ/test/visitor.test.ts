/** The weekly visitor (V-VIS) and the minimal modifier lines (V-GEAR-12): the window, the price, the policies and the lines. */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bestPiece, hasFourOfFive, rollLines, tiersAt, topCount, wornPieces } from '../src/lines';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { runServer } from '../src/sim';
import { ALL_SERVERS } from '../src/servers';
import { R } from '../src/types';
import { rerollPrice, visitVisitor, visitorHere } from '../src/visitor';
import { addCreature, createPlayer, createServer, creditShard } from '../src/world';

const THURSDAY = 3 * 24;
const SUNDAY_EVENING = 6 * 24 + 20;

const setup = (policy: 'setAndForget' | 'optimiser', visitor = true) => {
  const p = createPlayer(RULES, 'visitor', 1, 0, { ...profileById('daily'), policy }, 4);
  for (let s = 0; s < 4; s++) addCreature(p, s);
  const server = createServer(
    'visitor',
    1,
    { bossKills: 'half', communalSeats: true, shardExchange: true, visitor },
    RULES,
  );
  p.stock[R.acorns] = 100_000;
  p.stock[R.scrap] = 100_000;
  creditShard(p, 0, RULES.visitor.blueprintShards * 0.6, 'test');
  creditShard(p, 1, RULES.visitor.blueprintShards * 0.6, 'test');
  return { p, server };
};

/** Puts a worn piece in a slot of a creature, with chosen lines. */
const wear = (
  p: ReturnType<typeof setup>['p'],
  creature: number,
  slot: number,
  ilvl: number,
  rarity: number,
  lines: number[],
): void => {
  const c = p.creatures[creature]!;
  c.gear[slot] = ilvl;
  c.gearRarity[slot] = rarity;
  c.gearLines[slot] = lines;
};

describe('the window', () => {
  it('opens on Thursday 00:00 and closes at the raid finale on Sunday evening', () => {
    expect(visitorHere(RULES, THURSDAY - 1)).toBe(false);
    expect(visitorHere(RULES, THURSDAY)).toBe(true);
    expect(visitorHere(RULES, SUNDAY_EVENING)).toBe(true);
    expect(visitorHere(RULES, 6 * 24 + 23)).toBe(false);
    expect(visitorHere(RULES, 168 + 24)).toBe(false);
    expect(visitorHere(RULES, 168 + THURSDAY)).toBe(true);
  });

  it('is not met on a visit outside it, or when the server has no visitor', () => {
    const a = setup('optimiser');
    wear(a.p, 0, 0, 40, 2, [1, 1, 1, 1, 1]);
    visitVisitor(a.p, a.server, 24);
    expect(a.p.wk.rerolls).toBe(0);
    const b = setup('optimiser', false);
    wear(b.p, 0, 0, 40, 2, [1, 1, 1, 1, 1]);
    visitVisitor(b.p, b.server, THURSDAY + 20);
    expect(b.p.wk.rerolls).toBe(0);
    expect(b.p.wk.visitorMet).toBe(0);
  });
});

describe('the price', () => {
  it('is linear in item level and rises 1.5 times for each reroll in the week', () => {
    const [a10, s10] = rerollPrice(RULES, 10, 0);
    expect(a10).toBe(RULES.visitor.acorns);
    expect(s10).toBe(RULES.visitor.scrap);
    expect(rerollPrice(RULES, 40, 0)).toEqual([a10 * 4, s10 * 4]);
    expect(rerollPrice(RULES, 10, 2)[0]).toBe(Math.round(a10 * RULES.visitor.growth ** 2));
  });
});

describe('the lines', () => {
  it('count 1, 3 and 5 by rarity, and never pass the tier the item level allows', () => {
    const rng = createSeededRng('lines');
    for (const [rarity, n] of [
      [0, 1],
      [1, 3],
      [2, 5],
    ] as const)
      for (const ilvl of [5, 12, 30, 60, 90]) {
        const lines = rollLines(rng, RULES, rarity, ilvl);
        expect(lines).toHaveLength(n);
        for (const l of lines) {
          expect(l).toBeGreaterThanOrEqual(1);
          expect(l).toBeLessThanOrEqual(tiersAt(RULES, ilvl));
        }
      }
    expect([5, 10, 25, 50, 80, 99].map((l) => tiersAt(RULES, l))).toEqual([1, 2, 3, 4, 5, 5]);
  });

  it('are the top pip with the stated chance', () => {
    const rng = createSeededRng('top');
    let top = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) top += topCount(RULES, 60, rollLines(rng, RULES, 0, 60));
    expect(top / n).toBeGreaterThan(RULES.gear.topPipChance - 0.04);
    expect(top / n).toBeLessThan(RULES.gear.topPipChance + 0.04);
    // Below the first threshold there is no "top" line.
    expect(topCount(RULES, 5, [1, 1, 1])).toBe(0);
  });

  it('are found on a worn piece, the best piece and a 4-of-5 epic are read from them', () => {
    const { p } = setup('optimiser');
    wear(p, 0, 0, 40, 2, [4, 4, 4, 4, 1]);
    wear(p, 1, 0, 40, 1, [4, 4, 4]);
    expect(wornPieces(p)).toHaveLength(2);
    expect(hasFourOfFive(p)).toBe(false);
    // ilvl 40 allows 3 pips (25 up), so a "top" line is 3.
    wear(p, 0, 0, 40, 2, [3, 3, 3, 3, 1]);
    expect(hasFourOfFive(p)).toBe(true);
    expect(bestPiece(p).pips).toBe(13);
  });
});

describe('a visit that meets him', () => {
  it('lets a set-and-forget player reroll once a week, on the best epic it wears', () => {
    const { p, server } = setup('setAndForget');
    wear(p, 0, 0, 30, 2, [1, 1, 1, 1, 1]);
    wear(p, 1, 0, 45, 2, [1, 1, 1, 1, 1]);
    wear(p, 2, 0, 60, 1, [1, 1, 1]);
    const before = [p.stock[R.acorns]!, p.stock[R.scrap]!];
    visitVisitor(p, server, THURSDAY + 20);
    visitVisitor(p, server, THURSDAY + 24 + 20);
    expect(p.wk.rerolls).toBe(1);
    const [acorns, scrap] = rerollPrice(RULES, 45, 0);
    // The blueprint is paid in Acorns and shards, never scrap.
    expect(before[0]! - p.stock[R.acorns]!).toBe(acorns + RULES.visitor.blueprintAcorns);
    expect(before[1]! - p.stock[R.scrap]!).toBe(scrap);
    // The best epic (ilvl 45) was the one redrawn; the lower epic and the rare were not.
    expect(p.creatures[0]!.gearLines[0]).toEqual([1, 1, 1, 1, 1]);
    // Next week it can do it again (the count resets).
    visitVisitor(p, server, 168 + THURSDAY + 20);
    expect(p.wk.rerolls).toBe(2);
  });

  it('has an optimiser reroll until its reserves, each price dearer, and never below the reserves', () => {
    const { p, server } = setup('optimiser');
    for (let c = 0; c < 4; c++) wear(p, c, 0, 40, 2, [1, 1, 1, 1, 1]);
    // Enough for a few rerolls only: the reserves hold.
    p.stock[R.acorns] = RULES.visitor.reserveAcorns + 1200;
    p.stock[R.scrap] = 100_000;
    visitVisitor(p, server, THURSDAY + 20);
    expect(p.wk.rerolls).toBeGreaterThan(1);
    expect(p.wk.rerolls).toBeLessThanOrEqual(RULES.visitor.maxRerolls);
    expect(p.stock[R.acorns]).toBeGreaterThanOrEqual(RULES.visitor.reserveAcorns - 1e-9);
    // The next reroll would have passed the reserve.
    const [next] = rerollPrice(RULES, 40, p.rerollsThisWeek);
    expect(p.stock[R.acorns]! - next).toBeLessThan(RULES.visitor.reserveAcorns);
  });

  it('leaves a good epic alone (4 of 5 lines at the top pip)', () => {
    const { p, server } = setup('optimiser');
    wear(p, 0, 0, 40, 2, [3, 3, 3, 3, 1]);
    visitVisitor(p, server, THURSDAY + 20);
    expect(p.wk.rerolls).toBe(0);
  });

  it('pays the blueprint in shards of any element, from the most-stocked first', () => {
    const { p, server } = setup('setAndForget');
    visitVisitor(p, server, THURSDAY + 20);
    expect(p.wk.visitorBlueprints).toBe(1);
    // 0.6 and 0.6 of the price held: the first pile goes first, then the rest comes from the other.
    const price = RULES.visitor.blueprintShards;
    expect(p.shards[0]).toBeCloseTo(0, 9);
    expect(p.shards[1]).toBeCloseTo(0.2 * price, 9);
    expect(p.stock[R.shards]).toBeCloseTo(0.2 * price, 9);
    expect(p.wk.visitorShards).toBe(RULES.visitor.blueprintShards);
  });

  it('cannot buy the blueprint without the shards, and then keeps its Acorns', () => {
    const { p, server } = setup('setAndForget');
    p.shards.fill(0);
    p.stock[R.shards] = 0;
    const acorns = p.stock[R.acorns]!;
    visitVisitor(p, server, THURSDAY + 20);
    expect(p.wk.visitorBlueprints).toBe(0);
    expect(p.stock[R.acorns]).toBe(acorns);
  });

  it('sells the week once: one blueprint, until the pool is known', () => {
    const { p, server } = setup('optimiser');
    const known = p.blueprints;
    visitVisitor(p, server, THURSDAY + 20);
    visitVisitor(p, server, THURSDAY + 44);
    expect(p.blueprints).toBe(known + 1);
    expect(p.wk.visitorBlueprints).toBe(1);
  });
});

describe('in a run', () => {
  it('rerolls only inside the window, never goes negative, and the same server without him makes none', () => {
    const config = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
    const on = runServer({ ...config, weeks: 12 }, 3);
    const off = runServer({ ...config, visitor: false }, 3);
    const total = (run: typeof on): number =>
      run.players.reduce((n, p) => n + p.weeks.reduce((m, w) => m + w.rerolls, 0), 0);
    expect(total(on)).toBeGreaterThan(0);
    expect(total(off)).toBe(0);
    for (const p of on.players)
      for (const w of p.weeks) for (const s of w.stock) expect(s).toBeGreaterThanOrEqual(0);
  });

  it('draws lines from a stream of its own, so rerolls leave the other random draws alone', () => {
    const a = setup('optimiser');
    const b = setup('optimiser');
    for (const x of [a, b]) wear(x.p, 0, 0, 40, 2, [1, 1, 1, 1, 1]);
    visitVisitor(a.p, a.server, THURSDAY + 20);
    expect(a.p.wk.rerolls).toBeGreaterThan(0);
    expect(a.p.rng.nextU32()).toBe(b.p.rng.nextU32());
  });
});
