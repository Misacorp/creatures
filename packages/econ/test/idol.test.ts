/** The idol (`rules.idol`, a voluntary placeholder scrap sink): what players offer, in what batches, the switch, and the whole run. */
import { describe, expect, it } from 'vitest';
import { ledgerOf } from '../src/analysis';
import { idolOf } from '../src/idolData';
import { idolReserve, offerToIdol } from '../src/idol';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { RulesSchema } from '../src/schema';
import { playersOf, runScenario } from '../src/scenarios';
import { ALL_SERVERS, idolOffId, idolVariantId } from '../src/servers';
import { R } from '../src/types';
import { blankWeek, createPlayer, createServer } from '../src/world';
import * as v from 'valibot';

const setup = (idol = true) => {
  const p = createPlayer(RULES, 'idol', 1, 0, profileById('daily'), 4);
  const server = createServer(
    'idol',
    1,
    { bossKills: 'half', communalSeats: true, shardExchange: true, visitor: true, idol },
    RULES,
  );
  return { p, server };
};

const finishedWeek = (p: ReturnType<typeof setup>['p'], week: number, out: number, idol = 0) => {
  const w = blankWeek(week);
  w.out[R.scrap] = out;
  w.idolScrap = idol;
  p.weeks.push(w);
};

describe('the reserve', () => {
  it('is the floor with no history, and never under it', () => {
    const { p } = setup();
    expect(idolReserve(p)).toBe(RULES.idol.minReserve);
    finishedWeek(p, 1, 10);
    expect(idolReserve(p)).toBe(RULES.idol.minReserve);
  });

  it('is the set weeks of the last weeks of spending, without what was offered to the idol', () => {
    const { p } = setup();
    for (let w = 1; w <= 6; w++) finishedWeek(p, w, 2000 + 1000, 1000);
    // Only the last `lookbackWeeks` count, and the idol's own offers are left out: 2000 a week.
    expect(idolReserve(p)).toBe(RULES.idol.reserveWeeks * 2000);
  });
});

describe('the offering', () => {
  it('is whole batches of 100 from the scrap above the reserve, and nothing below it', () => {
    const { p, server } = setup();
    p.stock[R.scrap] = RULES.idol.minReserve + 350.7;
    expect(offerToIdol(p, server)).toBe(300);
    expect(p.stock[R.scrap]).toBeCloseTo(RULES.idol.minReserve + 50.7);
    expect(p.wk.idolScrap).toBe(300);
    expect(p.wk.idolBatches).toBe(3);
    // Less than a batch is left above the reserve: a second offering at the same visit changes nothing.
    expect(offerToIdol(p, server)).toBe(0);
    p.stock[R.scrap] = RULES.idol.minReserve - 1;
    expect(offerToIdol(p, server)).toBe(0);
  });

  it('is at most so many batches a visit, an optimiser tapping more than a set-and-forget player', () => {
    const a = setup();
    a.p.stock[R.scrap] = 1_000_000;
    expect(offerToIdol(a.p, a.server)).toBe(RULES.idol.maxBatches.setAndForget * RULES.idol.batch);
    const b = setup();
    b.p.policy = 'optimiser';
    b.p.stock[R.scrap] = 1_000_000;
    expect(offerToIdol(b.p, b.server)).toBe(RULES.idol.maxBatches.optimiser * RULES.idol.batch);
    expect(RULES.idol.maxBatches.optimiser).toBeGreaterThan(RULES.idol.maxBatches.setAndForget);
  });

  it('is a sink in the ledger, counted as scrap out', () => {
    const { p, server } = setup();
    p.stock[R.scrap] = 10_000;
    const out = p.wk.out[R.scrap] ?? 0;
    offerToIdol(p, server);
    expect((p.wk.out[R.scrap] ?? 0) - out).toBe(p.wk.idolScrap);
    expect(p.sources.get(`out:${R.scrap}:idol`)).toBe(p.wk.idolScrap);
  });

  it('does nothing when the idol is switched off', () => {
    const { p, server } = setup(false);
    p.stock[R.scrap] = 100_000;
    expect(offerToIdol(p, server)).toBe(0);
    expect(p.stock[R.scrap]).toBe(100_000);
  });
});

describe('the rules', () => {
  it('pass the schema, and the idol is on by default (Misa 2026-11-01)', () => {
    expect(() => v.parse(RulesSchema, RULES)).not.toThrow();
    expect(RULES.idol.on).toBe(true);
  });
});

describe('the whole run', () => {
  const config = ALL_SERVERS.find((s) => s.id === 'mixed8')!;
  const on = runScenario({ ...config, idol: true }, 3);
  const off = runScenario({ ...config, idol: false }, 3);

  it('has no offerings with the idol off, and keeps a daily player clear of the dead pile with it on', () => {
    const offered = (r: typeof on): number =>
      playersOf(r, 'daily').reduce((n, p) => n + p.weeks.reduce((a, w) => a + w.idolScrap, 0), 0);
    expect(offered(off)).toBe(0);
    expect(offered(on)).toBeGreaterThan(0);
    const scrapDead = (r: typeof on): number =>
      ledgerOf(playersOf(r, 'daily')).filter((l) => l.resource === 'scrap' && l.dead !== null)
        .length;
    expect(scrapDead(on)).toBe(0);
    expect(scrapDead(off)).toBe(1);
  });

  it('leaves what pieces, gifts and the visitor take about as it was', () => {
    const perWeek = (r: typeof on, key: string): number => {
      const players = playersOf(r, 'daily');
      return (
        players.reduce((n, p) => n + (p.sources[`out:${R.scrap}:${key}`] ?? 0), 0) / players.length
      );
    };
    for (const key of ['visitor', 'gifts']) {
      const a = perWeek(on, key);
      const b = perWeek(off, key);
      expect(Math.abs(a - b)).toBeLessThan(0.1 * b);
    }
  });

  it('has a variant with the other switch, and the report data pairs it with the default', () => {
    const variant = ALL_SERVERS.find((s) => s.id === idolVariantId('mixed8'));
    expect(variant?.idol).toBe(!RULES.idol.on);
    expect(ALL_SERVERS.find((s) => s.id === idolOffId('mixed8'))?.idol ?? false).toBe(false);
    const results = {
      mixed8: runScenario(config, 1),
      [idolVariantId('mixed8')]: runScenario(variant!, 1),
    };
    const data = idolOf(results, RULES);
    expect(data?.defaultOn).toBe(true);
    expect(data?.profiles.find((r) => r.profile === 'daily')?.late).toBeGreaterThan(0);
  });
});
