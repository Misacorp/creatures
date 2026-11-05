/** Tempering at the Forge (`rules.tempering`): the price, who tempers what, the reserves, the order at a visit, and the whole run. */
import { describe, expect, it } from 'vitest';
import { collectFloor } from '../src/forge';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { RulesSchema } from '../src/schema';
import { playersOf, runScenario } from '../src/scenarios';
import { ALL_SERVERS, temperingVariantId } from '../src/servers';
import { runServer } from '../src/sim';
import { scrapReserve, temperAtVisit, temperPrice } from '../src/tempering';
import { R } from '../src/types';
import { visitVisitor } from '../src/visitor';
import { addCreature, createPlayer, createServer } from '../src/world';
import * as v from 'valibot';

const setup = (policy: 'setAndForget' | 'optimiser', tempering = true, fire = 50) => {
  const p = createPlayer(RULES, 'temper', 1, 0, { ...profileById('daily'), policy }, 4);
  for (let s = 0; s < 4; s++) addCreature(p, s);
  p.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
  const server = createServer(
    'temper',
    1,
    { bossKills: 'half', communalSeats: true, shardExchange: true, visitor: true, tempering },
    RULES,
  );
  server.fire = fire;
  p.stock[R.acorns] = 10_000;
  p.stock[R.scrap] = 100_000;
  return { p, server };
};

const wear = (
  p: ReturnType<typeof setup>['p'],
  creature: number,
  slot: number,
  ilvl: number,
  rarity: number,
  lines: number[] = [1, 2, 3],
): void => {
  const c = p.creatures[creature]!;
  c.gear[slot] = ilvl;
  c.gearRarity[slot] = rarity;
  c.gearLines[slot] = lines;
};

describe('the price', () => {
  it('is linear in the gap, grows with the level the piece rises to, and is dearer for an epic', () => {
    const [, rare10] = temperPrice(RULES, 1, 40, 50)!;
    const [, rare20] = temperPrice(RULES, 1, 30, 50)!;
    expect(rare20).toBe(rare10 * 2);
    // The same gap at a higher level costs more.
    expect(temperPrice(RULES, 1, 50, 60)![1]).toBeGreaterThan(temperPrice(RULES, 1, 30, 40)![1]);
    expect(temperPrice(RULES, 2, 40, 50)![1]).toBe(
      rare10 * (RULES.tempering.rarityFactor[2]! / RULES.tempering.rarityFactor[1]!),
    );
    // Mostly scrap, a small Acorn part.
    const [acorns, scrap] = temperPrice(RULES, 1, 40, 50)!;
    expect(acorns).toBe(Math.round(scrap * RULES.tempering.acornShare));
    expect(acorns).toBeLessThan(scrap / 10);
  });

  it('is nothing for a common (never tempered) or a piece that is not behind', () => {
    expect(temperPrice(RULES, 0, 10, 50)).toBeNull();
    expect(temperPrice(RULES, 1, 50, 50)).toBeNull();
    expect(temperPrice(RULES, 2, 60, 50)).toBeNull();
  });
});

describe('who tempers what', () => {
  it('raises a rare to the fire, keeps its lines and pays scrap and a few Acorns', () => {
    const { p, server } = setup('setAndForget');
    wear(p, 0, 0, 40, 1, [1, 2, 3]);
    const before = [p.stock[R.acorns]!, p.stock[R.scrap]!];
    expect(temperAtVisit(p, server)).toBe(1);
    expect(p.creatures[0]!.gear[0]).toBe(50);
    expect(p.creatures[0]!.gearLines[0]).toEqual([1, 2, 3]);
    expect(p.creatures[0]!.gearRarity[0]).toBe(1);
    const [acorns, scrap] = temperPrice(RULES, 1, 40, 50)!;
    expect(before[0]! - p.stock[R.acorns]!).toBe(acorns);
    expect(before[1]! - p.stock[R.scrap]!).toBe(scrap);
    expect(p.wk.tempered).toBe(1);
    expect(p.wk.temperScrap).toBe(scrap);
    // Nothing is left to temper: a second visit changes nothing.
    expect(temperAtVisit(p, server)).toBe(0);
  });

  it('leaves commons, pieces closer than the gap and a switched-off server alone', () => {
    const a = setup('setAndForget');
    wear(a.p, 0, 0, 10, 0);
    wear(a.p, 1, 0, 48, 2);
    wear(a.p, 2, 0, 46, 1);
    expect(temperAtVisit(a.p, a.server)).toBe(0);
    const b = setup('setAndForget', false);
    wear(b.p, 0, 0, 30, 2);
    expect(temperAtVisit(b.p, b.server)).toBe(0);
    expect(b.p.creatures[0]!.gear[0]).toBe(30);
  });

  it('has an optimiser start sooner than a set-and-forget player', () => {
    const gap = RULES.tempering.minGap.optimiser;
    expect(gap).toBeLessThan(RULES.tempering.minGap.setAndForget);
    const a = setup('optimiser');
    wear(a.p, 0, 0, 50 - gap, 2);
    expect(temperAtVisit(a.p, a.server)).toBe(1);
    const b = setup('setAndForget');
    wear(b.p, 0, 0, 50 - gap, 2);
    expect(temperAtVisit(b.p, b.server)).toBe(0);
    wear(b.p, 0, 0, 50 - RULES.tempering.minGap.setAndForget, 2);
    expect(temperAtVisit(b.p, b.server)).toBe(1);
  });

  it('does the epics first, then the rares, up to the most a visit', () => {
    const { p, server } = setup('setAndForget');
    const most = RULES.tempering.perVisit.setAndForget;
    wear(p, 0, 0, 40, 1);
    wear(p, 1, 0, 40, 1);
    wear(p, 2, 0, 40, 1);
    wear(p, 3, 0, 40, 2);
    expect(temperAtVisit(p, server)).toBe(most);
    expect(p.creatures[3]!.gear[0]).toBe(50);
    expect(p.creatures.slice(0, 3).filter((c) => c.gear[0] === 50)).toHaveLength(most - 1);
    // An optimiser does more in a visit.
    const o = setup('optimiser');
    for (let c = 0; c < 4; c++) for (let s = 0; s < 3; s++) wear(o.p, c, s, 40, 1);
    expect(temperAtVisit(o.p, o.server)).toBe(RULES.tempering.perVisit.optimiser);
  });

  it('protects a piece rerolled at the visitor before one that was not', () => {
    const { p, server } = setup('setAndForget');
    wear(p, 0, 0, 40, 1);
    wear(p, 1, 0, 40, 1);
    wear(p, 2, 0, 40, 1);
    p.creatures[2]!.gearRerolls[0] = 1;
    p.stock[R.scrap] = scrapReserve(p, server) + temperPrice(RULES, 1, 40, 50)![1] + 1;
    expect(temperAtVisit(p, server)).toBe(1);
    expect(p.creatures[2]!.gear[0]).toBe(50);
    expect(p.wk.temperedRerolled).toBe(1);
  });

  it('counts a visitor reroll on the piece, and a new piece starts with none', () => {
    const { p, server } = setup('setAndForget');
    wear(p, 0, 0, 30, 2, [1, 1, 1, 1, 1]);
    p.stock[R.acorns] = 100_000;
    visitVisitor(p, server, 3 * 24 + 20);
    expect(p.creatures[0]!.gearRerolls[0]).toBe(1);
    // A crafted piece that takes the slot is a fresh piece.
    server.fire = 80;
    for (const [ci, c] of p.creatures.entries())
      for (let s = 0; s < c.gear.length; s++) if (ci > 0 || s > 0) c.gear[s] = 79;
    p.floor.push({ ilvl: 80, rarity: 0, element: p.creatures[0]!.element });
    collectFloor(p, server);
    expect(p.creatures[0]!.gear[0]).toBe(80);
    expect(p.creatures[0]!.gearRerolls[0]).toBe(0);
  });
});

describe('what a player keeps', () => {
  it('never tempers below the scrap reserve (the visitor, the Forge) or the Acorn reserve', () => {
    const { p, server } = setup('setAndForget');
    wear(p, 0, 0, 40, 1);
    const price = temperPrice(RULES, 1, 40, 50)!;
    const reserve = scrapReserve(p, server);
    p.stock[R.scrap] = reserve + price[1] - 1;
    expect(temperAtVisit(p, server)).toBe(0);
    p.stock[R.scrap] = reserve + price[1];
    p.stock[R.acorns] = RULES.tempering.reserveAcorns + price[0] - 1;
    expect(temperAtVisit(p, server)).toBe(0);
    p.stock[R.acorns] = RULES.tempering.reserveAcorns + price[0];
    expect(temperAtVisit(p, server)).toBe(1);
    expect(p.stock[R.scrap]).toBe(reserve);
  });

  it('keeps back a reroll of the piece the visitor would reroll next, and a week of the anvils', () => {
    const { p, server } = setup('setAndForget');
    const plain = scrapReserve(p, server);
    const week =
      (168 / RULES.forge.pieceHours) *
      RULES.forge.scrap *
      p.anvils.length *
      RULES.tempering.reserveForgeWeeks;
    expect(plain).toBe(RULES.tempering.reserveScrap + week);
    wear(p, 0, 0, 40, 2, [1, 1, 1, 1, 1]);
    expect(scrapReserve(p, server)).toBeGreaterThan(plain);
    // With no visitor on the server the reroll is not kept for.
    const none = createServer(
      'temper',
      1,
      {
        bossKills: 'half',
        communalSeats: true,
        shardExchange: true,
        visitor: false,
        tempering: true,
      },
      RULES,
    );
    expect(scrapReserve(p, none)).toBe(plain);
  });

  it('lets go of a piece whose price is over what a replacement is worth', () => {
    const { p, server } = setup('setAndForget', true, 80);
    const worth = RULES.tempering.worthInCrafts[1]! * RULES.forge.scrap;
    wear(p, 0, 0, 10, 1);
    expect(temperPrice(RULES, 1, 10, 80)![1]).toBeGreaterThan(worth);
    expect(temperAtVisit(p, server)).toBe(0);
  });
});

describe('the order at a visit', () => {
  it('is before the floor comes home, so a crafted piece cannot take the slot of a piece worth keeping', () => {
    const { p, server } = setup('setAndForget');
    // The creature's weakest slot is a good rare, and a fresh piece of its element waits on the floor.
    const c = p.creatures[0]!;
    wear(p, 0, 0, 40, 1, [3, 3, 3]);
    wear(p, 0, 1, 45, 0, [1]);
    wear(p, 0, 2, 45, 0, [1]);
    p.floor.push({ ilvl: 50, rarity: 0, element: c.element });
    temperAtVisit(p, server);
    collectFloor(p, server);
    // The rare was raised to the fire and kept its lines; the new piece did not replace it (it went to the bag).
    expect(c.gearLines[0]).toEqual([3, 3, 3]);
    expect(c.gearRarity[0]).toBe(1);
    expect(c.gear[0]).toBe(50);
    expect(p.floor).toHaveLength(0);
    // Without tempering first, the crafted common takes that weakest slot and the rare and its lines are gone.
    const other = setup('setAndForget');
    const d = other.p.creatures[0]!;
    wear(other.p, 0, 0, 40, 1, [3, 3, 3]);
    wear(other.p, 0, 1, 45, 0, [1]);
    wear(other.p, 0, 2, 45, 0, [1]);
    other.p.floor.push({ ilvl: 50, rarity: 0, element: d.element });
    collectFloor(other.p, other.server);
    expect(d.gearRarity[0]).toBe(0);
  });
});

describe('the switch and the rules', () => {
  it('is in the rules schema, and the default value is the one the report runs the other way beside it', () => {
    expect(v.safeParse(RulesSchema, RULES).success).toBe(true);
    expect(
      v.safeParse(RulesSchema, { ...RULES, tempering: { ...RULES.tempering, extra: 1 } }).success,
    ).toBe(false);
    const id = temperingVariantId('mixed8');
    const config = ALL_SERVERS.find((s) => s.id === id);
    expect(config?.tempering).toBe(!RULES.tempering.on);
    expect(config?.seedKey).toBe('mixed8');
  });

  it('gives the same run twice, and a run with tempering pays scrap for it while one without pays none', () => {
    const base = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
    const on = { ...base, tempering: true };
    const off = { ...base, tempering: false };
    const a = runServer(on, 3);
    const b = runServer(on, 3);
    expect(JSON.stringify(a.players.map((p) => p.sources))).toBe(
      JSON.stringify(b.players.map((p) => p.sources)),
    );
    const key = `out:${R.scrap}:tempering`;
    const spent = (run: typeof a): number =>
      run.players.reduce((n, p) => n + (p.sources[key] ?? 0), 0);
    expect(spent(a)).toBeGreaterThan(0);
    expect(spent(runServer(off, 3))).toBe(0);
  });

  it('empties the late scrap pile of a daily player (the point of it): lower stock at week 24 than without', () => {
    // The study's setting (report: "Tempering at the Forge"): the idol, a second scrap sink, is out of the way, and the stock is the median
    // over a few seeds. One seed of a server with two or three daily players is luck: the pile swings by thousands from one draw to the next
    // (combat v2's talent pools moved one draw and the single-seed check flipped, with the design's claim intact).
    const base = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
    const stock = (tempering: boolean): number => {
      const piles = [1, 2, 3, 4, 5].flatMap((seed) =>
        playersOf(runScenario({ ...base, tempering, idol: false }, seed), 'daily').map(
          (p) => p.weeks[23]?.stock[R.scrap] ?? 0,
        ),
      );
      return [...piles].sort((x, y) => x - y)[Math.floor(piles.length / 2)] ?? 0;
    };
    expect(stock(true)).toBeLessThan(stock(false) * 0.6);
  });
});
