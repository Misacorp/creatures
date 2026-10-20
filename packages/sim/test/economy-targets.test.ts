/**
 * The economy targets (B-025, docs/design/balance-targets.md "Expedition economy"): exact expected values of
 * trips and supplies stay inside their bands, so a new currency, supply kind or modifier cannot move the
 * expedition and crafting economy by accident. Pure arithmetic over the shipped rules: no sampling.
 */
import { describe, expect, it } from 'vitest';
import { PART_KINDS, RULES, SUPPLY_KINDS, expeditionContent } from '@creatures/game';
import { ECONOMY_TARGETS as T } from '../src/economy-targets';
import {
  LENGTHS,
  SCENARIOS,
  baseRows,
  pairRows,
  singleRows,
  tierSteps,
} from '../src/economy-study';
import { PART_WORTH, WORTH_GROUPS, supplyCost, tripEv } from '../src/trip-ev';

const inBand = (x: number, band: { min: number; max: number }): boolean =>
  x >= band.min && x <= band.max;

describe('the unsupplied trip', () => {
  const base = baseRows({});
  const perHour = (pick: (r: (typeof base)[number]) => number): number[] =>
    base.map((r) => pick(r) / r.hours);

  it('pays more per hour the longer it is, in worth and in every kind of find', () => {
    const picks: Record<string, (r: (typeof base)[number]) => number> = {
      worth: (r) => r.total,
      creatures: (r) => r.ev.creatures,
      scrap: (r) => r.ev.scrap,
      shards: (r) => r.ev.shards,
      gear: (r) => r.ev.gearTotal,
      xp: (r) => r.ev.xp,
    };
    expect(LENGTHS).toEqual(['short', 'medium', 'long', 'day']);
    for (const [name, pick] of Object.entries(picks)) {
      const rates = perHour(pick);
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i] as number, `${name} per hour, ${LENGTHS[i]}`).toBeGreaterThan(
          rates[i - 1] as number,
        );
      }
    }
  });

  it('brings, in 12 hours, about one creature, a craft of parts and under one gear piece', () => {
    const ev = tripEv('long', []);
    expect(inBand(ev.creatures, T.long.creatures)).toBe(true);
    const crafts =
      (ev.scrap * PART_WORTH.scrap + ev.shards * RULES.expeditions.worth.shard) /
      (T.craft.scrap * PART_WORTH.scrap + T.craft.shards * RULES.expeditions.worth.shard);
    expect(inBand(crafts, T.long.crafts), `crafts ${crafts}`).toBe(true);
    expect(inBand(ev.gearTotal, T.long.gear)).toBe(true);
  });

  it('gives a 2 hour trip about a one in ten chance of a gear piece', () => {
    expect(inBand(tripEv('short', []).gearAtLeastOne, T.shortGearChance)).toBe(true);
  });
});

describe('every supply, on every trip length, with and without the common modifiers', () => {
  for (const scenario of SCENARIOS) {
    const singles = singleRows(scenario.mods);

    it(`${scenario.id}: pays between ${T.roi.min} and ${T.roi.max} times its cost`, () => {
      expect(singles).toHaveLength(LENGTHS.length * expeditionContent.supplies.length);
      for (const r of singles) {
        expect(r.roi, `${r.id} on ${r.length}`).toBeGreaterThanOrEqual(T.roi.min);
        expect(r.roi, `${r.id} on ${r.length}`).toBeLessThanOrEqual(T.roi.max);
      }
    });

    it(`${scenario.id}: each tier gains more, in Bait, than the one below`, () => {
      expect(tierSteps()).toHaveLength(SUPPLY_KINDS.length * 2);
      for (const length of LENGTHS) {
        for (const [lower, upper] of tierSteps()) {
          const a = singles.find((r) => r.length === length && r.id === lower);
          const b = singles.find((r) => r.length === length && r.id === upper);
          expect(b?.gain, `${upper} over ${lower} on ${length}`).toBeGreaterThan(a?.gain ?? 0);
        }
      }
    });

    it(`${scenario.id}: a supply is worth more the longer the trip`, () => {
      for (const def of expeditionContent.supplies) {
        const gains = LENGTHS.map(
          (l) => singles.find((r) => r.length === l && r.id === def.id)?.roi ?? 0,
        );
        for (let i = 1; i < gains.length; i++) {
          expect(gains[i] as number, `${def.id} ROI on ${LENGTHS[i]}`).toBeGreaterThan(
            gains[i - 1] as number,
          );
        }
      }
    });
  }

  it('pays about twice its cost on a 12 hour trip', () => {
    for (const r of singleRows({}).filter((x) => x.length === 'long')) {
      expect(inBand(r.roi, T.roiLong), `${r.id}: ${r.roi.toFixed(2)}`).toBe(true);
    }
  });

  it('pairs: the second supply still pays, and synergy stays modest', () => {
    for (const scenario of SCENARIOS) {
      for (const r of pairRows(scenario.mods)) {
        for (const [added, given, roi] of [
          [r.second, r.first, r.roiSecond],
          [r.first, r.second, r.roiFirst],
        ] as const) {
          expect(roi, `${added} given ${given} on ${r.length}`).toBeGreaterThanOrEqual(
            T.pairRoi.min,
          );
          expect(roi, `${added} given ${given} on ${r.length}`).toBeLessThanOrEqual(T.pairRoi.max);
        }
      }
    }
  });
});

describe('the worth table covers every currency and supply', () => {
  it('prices every kind of part', () => {
    for (const kind of PART_KINDS) {
      expect(PART_WORTH[kind], kind).toBeGreaterThan(0);
    }
    expect(Object.keys(PART_WORTH).sort()).toEqual([...PART_KINDS].sort());
  });

  it('prices every supply and models every supply kind', () => {
    for (const def of expeditionContent.supplies) {
      expect(supplyCost(def), def.id).toBeGreaterThan(0);
    }
    for (const kind of SUPPLY_KINDS) {
      const best = expeditionContent.supplies.filter((s) => s.kind === kind).at(-1);
      expect(best, kind).toBeDefined();
      // A kind the expected-value model does not know adds nothing to a long trip: it must fail here.
      const gain = tripEv('long', [best?.id as string]).total - tripEv('long', []).total;
      expect(gain, `${kind} adds nothing to the model`).toBeGreaterThan(1);
    }
  });

  it('values every kind of find in the trip total', () => {
    const w = tripEv('day', ['lure-great', 'lantern-great']).worth;
    for (const group of WORTH_GROUPS) expect(w[group], group).toBeGreaterThan(0);
  });
});
