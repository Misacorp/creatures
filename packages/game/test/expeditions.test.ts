import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STATS,
  EXPEDITION_LENGTHS,
  GOAL_RISKS,
  PARTS_KEYS,
  PART_KINDS,
  RULES,
  MAX_SUPPLY_BLURB,
  SUPPLY_KINDS,
  SUPPLY_TIERS,
  allSpecies,
  closedReasons,
  gearBase,
  tagElement,
  partsBonusBp,
  content,
  createSeededRng,
  deepChanceBp,
  destinationDef,
  expectedTripWorth,
  expeditionContent,
  explorerRank,
  familiarityBonus,
  familiarityStars,
  featuredSpecies,
  foundSupplyId,
  FOUND_SUPPLY_KINDS,
  catchChanceBp,
  catchRollWorth,
  lureEffect,
  goalDef,
  goalOddsBp,
  goalWorks,
  pushWorks,
  goalWorthRatio,
  isNightHour,
  journalChanceBp,
  journalEntry,
  journalPool,
  kitOf,
  kitProblem,
  lengthOpen,
  lengthRules,
  loadExpeditions,
  milestoneBonuses,
  milestoneProgress,
  nextRankXp,
  nextSlot,
  offerChanceBp,
  rankGift,
  rankGiftParts,
  rankGiftsBetween,
  rollRankGiftItem,
  shardOf,
  rankSum,
  rankUnlocks,
  rollJournal,
  rollOdds,
  rollOffer,
  rollWorth,
  rollTripCatch,
  rollTripCatches,
  type TripCatch,
  rollTripLoot,
  shiftOdds,
  slotsFor,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  tripMs,
  tripTicks,
  recallTicks,
  tickChances,
  tripXp,
  mapTicksBp,
  rollMapTicks,
  rollCount,
  kitDeepBp,
  kitDeepBonusBp,
  satchelBonus,
  weeklySpecial,
  type DestinationDef,
  type ExpeditionLength,
  type Rng,
  type SupplyDef,
  type XpBoostPart,
  type TripCatchContext,
} from '../src/index';
import destinationsJson from '../src/content/data/destinations.json';
import goalsJson from '../src/content/data/push-on-goals.json';
import journalJson from '../src/content/data/journal.json';
import specialsJson from '../src/content/data/weekly-specials.json';
import suppliesJson from '../src/content/data/supplies.json';

const BP = 10_000;
const HOUR = 3_600_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The raw shipped pack, for the loader tests to damage one piece of at a time. */
function raw(): Record<string, unknown> & {
  destinations: Record<string, unknown>[];
  supplies: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  journal: { entries: Record<string, unknown>[]; sets: Record<string, unknown>[] };
  specials: Record<string, unknown>;
} {
  return clone({
    destinations: destinationsJson,
    supplies: suppliesJson,
    goals: goalsJson,
    journal: journalJson,
    specials: specialsJson,
  });
}

function scripted(values: number[]): Rng & { drawn: () => number } {
  let i = 0;
  return {
    nextU32() {
      const value = values[i++];
      if (value === undefined) throw new Error('scripted rng exhausted');
      return value;
    },
    drawn: () => i,
  };
}

function dest(id: string): DestinationDef {
  const d = destinationDef(id);
  if (d === undefined) throw new Error(`no destination ${id}`);
  return d;
}

function supply(id: string): SupplyDef {
  const s = supplyDef(id);
  if (s === undefined) throw new Error(`no supply ${id}`);
  return s;
}

/**
 * A lure that makes every catch roll bring a creature (and no more): most of the tests below are about
 * which creature comes, so the roll that decides whether one comes at all is made certain. It draws
 * once, first, so scripted draws start with a 0.
 */
const SURE: SupplyDef = {
  ...(supplyDef('lure-basic') as SupplyDef & { kind: 'lure' }),
  bonusBp: 0,
  catchBp: BP,
  newBp: 0,
};

const ctx = (over: Partial<TripCatchContext> = {}): TripCatchContext => ({
  content,
  destination: dest('tidepools'),
  length: 'short',
  explorer: { element: 'ember', role: 'payoff' },
  stars: 0,
  milestoneRarityBp: 0,
  twist: null,
  ownedLines: new Set(),
  dupeStreak: 0,
  firstExpedition: false,
  ...over,
  kit: [SURE, ...(over.kit ?? [])],
});

type SureRoll = Omit<ReturnType<typeof rollTripCatch>, 'result'> & { result: TripCatch };

/** `rollTripCatch` for a roll that must bring a creature (the tests use `SURE` or the guarantee). */
function rollSure(rng: Rng, c: TripCatchContext): SureRoll {
  const roll = rollTripCatch(rng, c);
  if (roll.result === null) throw new Error('the roll brought nothing');
  return roll as SureRoll;
}

describe('the shipped expedition content', () => {
  const pack = expeditionContent;

  it('has the eight destinations of the spec, each with an element, a banner brief and a flavour line', () => {
    expect(pack.destinations.map((d) => d.id)).toEqual([
      'tidepools',
      'ember-caves',
      'verdant-hollow',
      'storm-ridge',
      'sunken-fen',
      'old-crossroads',
      'moonlit-reef',
      'festival-grounds',
    ]);
    for (const d of pack.destinations) {
      expect(d.banner.palette.length, d.id).toBeGreaterThanOrEqual(3);
      expect(d.banner.details.length, d.id).toBeGreaterThanOrEqual(2);
      expect(d.flavor.length, d.id).toBeGreaterThan(0);
    }
    // The five elemental places are open from the start, the others have a gate.
    for (const id of ['tidepools', 'ember-caves', 'verdant-hollow', 'storm-ridge', 'sunken-fen']) {
      expect(dest(id).access).toEqual({ minRank: 1 });
    }
    expect(dest('old-crossroads').element).toBeNull();
    expect(dest('moonlit-reef').access.night).toBe(true);
    expect(dest('festival-grounds').access.festival).toBe(true);
  });

  it('puts every catchable species in one or two places, and Festival creatures only at the Festival Grounds', () => {
    const places = new Map<string, string[]>();
    for (const d of pack.destinations) {
      for (const id of [...d.species, ...d.deep.species]) {
        places.set(id, [...(places.get(id) ?? []), d.id]);
      }
    }
    for (const s of content.creatures.filter((c) => c.stage === 1 && c.catchable)) {
      const n = places.get(s.id)?.length ?? 0;
      expect(n, s.id).toBeGreaterThanOrEqual(1);
      expect(n, s.id).toBeLessThanOrEqual(2);
    }
    for (const s of content.creatures.filter((c) => c.festival === true)) {
      expect(places.get(s.id), s.id).toEqual(['festival-grounds']);
    }
    // Every place has a deeper area with something in it.
    for (const d of pack.destinations) {
      expect(d.deep.species.length > 0 || d.deep.rarityUpBp > 0, d.id).toBe(true);
    }
  });

  it('only ever catches species that live at the destination, and Festival species only at the Festival Grounds', () => {
    const festival = new Set(content.creatures.filter((c) => c.festival === true).map((c) => c.id));
    expect(festival.size).toBeGreaterThan(0);
    for (const d of pack.destinations) {
      const here = new Set(allSpecies(d));
      for (const stars of [0, 3]) {
        const rng = createSeededRng(`pool-${d.id}-${stars}`);
        const seen = new Set<string>();
        for (let i = 0; i < 300; i++) {
          const roll = rollSure(rng, ctx({ destination: d, length: 'long', stars }));
          seen.add(roll.result.species.id);
        }
        for (const id of seen) {
          expect(here.has(id), `${d.id} (${stars} stars) caught ${id}`).toBe(true);
          if (d.id !== 'festival-grounds') {
            expect(festival.has(id), `${d.id} caught Festival species ${id}`).toBe(false);
          }
        }
      }
    }
  });

  it('describes every supply in a short blurb with no digit and no percent sign', () => {
    for (const s of pack.supplies) {
      expect(s.blurb.length, s.id).toBeGreaterThan(5);
      expect(s.blurb.length, s.id).toBeLessThanOrEqual(MAX_SUPPLY_BLURB);
      expect(s.blurb, s.id).not.toMatch(/[\d%]/);
    }
  });

  it('has a Lure, a Map scrap, a Lantern and a Satchel in three tiers, the best always guaranteeing a choice', () => {
    expect(pack.supplies).toHaveLength(SUPPLY_KINDS.length * SUPPLY_TIERS.length);
    for (const kind of SUPPLY_KINDS) {
      const tiers = pack.supplies.filter((s) => s.kind === kind);
      expect(tiers.map((s) => s.tier)).toEqual([...SUPPLY_TIERS]);
      const [basic, good, great] = tiers as [SupplyDef, SupplyDef, SupplyDef];
      expect(great.offerBp).toBe(BP);
      expect(basic.offerBp).toBeLessThan(good.offerBp);
      expect(good.offerBp).toBeLessThan(great.offerBp);
      // Better tiers are worth more Bait (to the simulator) and need a higher Crafting level.
      expect(basic.worth).toBeLessThan(good.worth);
      expect(good.worth).toBeLessThan(great.worth);
      expect([basic, good, great].map((s) => s.blueprint.craftingLevel)).toEqual([1, 3, 5]);
      for (const s of tiers) {
        expect(s.id).toBe(`${s.kind}-${s.tier}`);
        expect(Object.keys(s.blueprint.parts).length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the parts keys in step with the gear parts', () => {
    expect([...PARTS_KEYS]).toEqual([...PART_KINDS]);
  });

  it('has safe goals that always work and risky goals with an exact chance below 100%', () => {
    for (const g of pack.goals) {
      const odds = Object.values(g.lengths).map((l) => l.oddsBp);
      if (g.risk === 'safe')
        expect(
          odds.every((o) => o === BP),
          g.id,
        ).toBe(true);
      else
        expect(
          odds.every((o) => o < BP && o >= 500),
          g.id,
        ).toBe(true);
    }
    expect(new Set(pack.goals.map((g) => g.risk))).toEqual(new Set(GOAL_RISKS));
    // Risky goals open later than the first safe one, and rare gear comes mostly from risky goals.
    expect(
      Math.min(...pack.goals.filter((g) => g.risk === 'risky').map((g) => g.minRank)),
    ).toBeGreaterThan(1);
    const gearGoals = pack.goals.filter((g) => g.reward.gear !== undefined);
    expect(gearGoals.length).toBeGreaterThan(0);
    expect(gearGoals.every((g) => g.risk === 'risky')).toBe(true);
  });

  it('makes every risky goal a fair gamble: within 10% of coming home, at every length it is offered after', () => {
    for (const g of pack.goals.filter((x) => x.risk === 'risky')) {
      for (const length of EXPEDITION_LENGTHS) {
        if (g.lengths[length] === undefined) continue;
        const ratio = goalWorthRatio(g, length);
        expect(ratio, `${g.id} after ${length}`).toBeGreaterThanOrEqual(0.9);
        expect(ratio, `${g.id} after ${length}`).toBeLessThanOrEqual(1.1);
      }
    }
    // A safe goal always adds something.
    for (const g of pack.goals.filter((x) => x.risk === 'safe')) {
      for (const length of EXPEDITION_LENGTHS) {
        if (g.lengths[length] !== undefined) expect(goalWorthRatio(g, length)).toBeGreaterThan(1);
      }
    }
  });

  it('has about 40 journal entries, grouped by place, with sets, that hint without naming the mechanics', () => {
    const { entries, sets } = pack.journal;
    expect(entries.length).toBeGreaterThanOrEqual(38);
    expect(entries.length).toBeLessThanOrEqual(46);
    for (const d of pack.destinations) {
      expect(entries.filter((e) => e.place === d.id).length, d.id).toBeGreaterThanOrEqual(4);
    }
    expect(entries.filter((e) => e.place === 'any').length).toBeGreaterThanOrEqual(3);
    expect(sets.length).toBeGreaterThanOrEqual(5);
    for (const s of sets) {
      expect(entries.filter((e) => e.set === s.id).length, s.id).toBeGreaterThanOrEqual(3);
    }
    // They are lore: the names of reactions, marks, roles and numbers do not appear in them.
    const named = [
      ...content.reactions.flatMap((r) => [r.name, r.markName]),
      'Setter',
      'Payoff',
      'Guard',
      'Support',
      'crit',
      'Rank',
      'reaction',
    ];
    for (const e of entries) {
      for (const word of named) {
        expect(`${e.title} ${e.text}`.toLowerCase(), `${e.id} names "${word}"`).not.toContain(
          word.toLowerCase(),
        );
      }
    }
  });

  it('rotates a weekly special: a place each week, a different twist, the Festival Grounds in Festival weeks', () => {
    const seen = new Set<string>();
    for (let week = 0; week < 60; week++) {
      const special = weeklySpecial(week);
      expect(weeklySpecial(week)).toEqual(special); // deterministic
      const place = dest(special.destination);
      if (special.festival) {
        expect(week % RULES.progression.seasonWeeks).toBe(RULES.progression.seasonWeeks - 1);
        expect(place.access.festival).toBe(true);
        expect(special.twist.id).toBe(expeditionContent.specials.festival.twist);
      } else {
        expect(place.access.festival).not.toBe(true);
        expect(special.twist.id).not.toBe(expeditionContent.specials.festival.twist);
        seen.add(`${special.destination}:${special.twist.id}`);
      }
    }
    // Every rotation place comes up, with more than one twist.
    for (const id of expeditionContent.specials.rotation) {
      expect(
        [...seen].some((s) => s.startsWith(`${id}:`)),
        id,
      ).toBe(true);
    }
    expect(new Set([...seen].map((s) => s.split(':')[1])).size).toBeGreaterThan(2);
  });
});

describe('the expedition content loader', () => {
  const load = (pack: unknown) => loadExpeditions(pack, content);

  it('accepts the shipped content', () => {
    expect(() => load(raw())).not.toThrow();
  });

  it('rejects a damaged pack, naming the problem', () => {
    const cases: [string, (p: ReturnType<typeof raw>) => void, RegExp][] = [
      [
        'an unknown key',
        (p) => ((p.destinations[0] as Record<string, unknown>)['x'] = 1),
        /schema/,
      ],
      [
        'a duplicate destination',
        (p) => ((p.destinations[1] as Record<string, unknown>)['id'] = 'tidepools'),
        /duplicate destination/,
      ],
      [
        'an unknown species',
        (p) => ((p.destinations[0] as { species: string[] }).species[0] = 'nobody'),
        /unknown species/,
      ],
      [
        'a species in three places',
        (p) =>
          (p.destinations[6] as { species: string[] }).species.push('splashet', 'cindle') &&
          (p.destinations[3] as { species: string[] }).species.push('splashet'),
        /at most 2/,
      ],
      [
        'a Festival species away from the Festival Grounds',
        (p) => (p.destinations[0] as { species: string[] }).species.push('lanternfin'),
        /festival/,
      ],
      [
        'a species nobody can catch',
        (p) => {
          const d = p.destinations[0] as { species: string[]; odds?: unknown };
          d.species = ['splashet'];
          delete d.odds;
        },
        /features rare/,
      ],
      [
        'odds that do not add up',
        (p) =>
          ((p.destinations[6] as { odds: unknown }).odds = {
            common: 5000,
            rare: 5000,
            epic: 5000,
          }),
        /10000/,
      ],
      [
        'an empty deeper area',
        (p) => ((p.destinations[0] as { deep: unknown }).deep = { species: [], rarityUpBp: 0 }),
        /nothing in it/,
      ],
      [
        'a best tier that does not guarantee a choice',
        (p) => ((p.supplies[2] as { offerBp: number }).offerBp = 9000),
        /best tier/,
      ],
      [
        'a basic tier that guarantees a choice',
        (p) => ((p.supplies[0] as { offerBp: number }).offerBp = 10000),
        /must not guarantee|schema/,
      ],
      [
        'a supply with a wrong id',
        (p) => ((p.supplies[0] as { id: string }).id = 'lure-one'),
        /must be called/,
      ],
      ['a missing supply', (p) => p.supplies.pop(), /no supply/],
      [
        'a supply blurb with a number',
        (p) => ((p.supplies[0] as { blurb: string }).blurb = 'Draws 25 rarer creatures'),
        /digits/,
      ],
      [
        'a supply blurb with a percent sign',
        (p) => ((p.supplies[0] as { blurb: string }).blurb = 'Draws rarer creatures, plus %'),
        /digits/,
      ],
      [
        'a supply blurb that is too long',
        (p) => ((p.supplies[0] as { blurb: string }).blurb = 'a'.repeat(MAX_SUPPLY_BLURB + 1)),
        /schema/,
      ],
      [
        'a supply without a blurb',
        (p) => delete (p.supplies[0] as { blurb?: string }).blurb,
        /schema/,
      ],
      [
        'a safe goal that can fail',
        (p) =>
          ((p.goals[0] as { lengths: Record<string, { oddsBp: number }> }).lengths['short'] = {
            oddsBp: 9000,
          }),
        /safe goal/,
      ],
      [
        'a risky goal that cannot fail',
        (p) =>
          ((p.goals[4] as { lengths: Record<string, { oddsBp: number }> }).lengths['medium'] = {
            oddsBp: 10000,
          }),
        /risky goal/,
      ],
      [
        'a goal that gives nothing',
        (p) => ((p.goals[0] as { reward: unknown }).reward = {}),
        /gives nothing/,
      ],
      [
        'a journal entry in an unknown place',
        (p) => ((p.journal.entries[0] as { place: string }).place = 'atlantis'),
        /unknown place/,
      ],
      [
        'a duplicate journal entry',
        (p) =>
          ((p.journal.entries[1] as { id: string }).id = (
            p.journal.entries[0] as { id: string }
          ).id),
        /duplicate journal entry/,
      ],
      [
        'an entry in an unknown set',
        (p) => ((p.journal.entries[0] as { set: string }).set = 'nope'),
        /unknown set/,
      ],
      [
        'a set with fewer than 3 pages',
        (p) => {
          p.journal.entries = p.journal.entries.filter((e) => e['set'] !== 'ash-records').slice();
        },
        /at least 3|no journal entries/,
      ],
      [
        'a rotation with the Festival Grounds',
        (p) => (p.specials['rotation'] as string[]).push('festival-grounds'),
        /festival place/,
      ],
      [
        'a festival special at an ordinary place',
        (p) => ((p.specials['festival'] as { destination: string }).destination = 'tidepools'),
        /festival destination/,
      ],
    ];
    for (const [name, damage, message] of cases) {
      const pack = raw();
      damage(pack);
      expect(() => load(pack), name).toThrow(message);
    }
  });
});

describe('explorer rank, trip length and slots', () => {
  it('turns XP into ranks from the table, from rank 1 to the top', () => {
    const table = RULES.expeditions.rank.xpForRank;
    expect(explorerRank(0)).toBe(1);
    expect(explorerRank(-5)).toBe(1);
    expect(explorerRank(Number.NaN)).toBe(1);
    for (let i = 1; i < table.length; i++) {
      expect(explorerRank((table[i] as number) - 1), `just below rank ${String(i + 1)}`).toBe(i);
      expect(explorerRank(table[i] as number), `rank ${String(i + 1)}`).toBe(i + 1);
    }
    expect(explorerRank(1e9)).toBe(table.length);
    expect(nextRankXp(1)).toBe(table[1]);
    expect(nextRankXp(table.length)).toBeNull();
  });

  it('shortens trips with rank only, by a share per rank', () => {
    const step = RULES.expeditions.rank.speedBpPerRank;
    expect(tripMs('long', 1)).toBe(12 * HOUR);
    expect(tripMs('long', 2)).toBe(Math.floor((12 * HOUR * (BP - step)) / BP));
    expect(tripMs('long', 10)).toBeLessThan(tripMs('long', 5));
    for (const l of EXPEDITION_LENGTHS) expect(tripMs(l, 1)).toBe(lengthRules(l).ms);
  });

  it('has trips of 2, 6 and 12 hours, and 24 hours from explorer rank', () => {
    expect(EXPEDITION_LENGTHS.map((l) => lengthRules(l).ms / HOUR)).toEqual([2, 6, 12, 24]);
    expect(lengthOpen('long', 1)).toBe(true);
    expect(lengthOpen('day', 1)).toBe(false);
    expect(lengthOpen('day', lengthRules('day').minRank)).toBe(true);
  });

  it('pays rewards that grow faster than the hours: a longer trip is worth more per hour', () => {
    const perHour = EXPEDITION_LENGTHS.map(
      (l) => expectedTripWorth(l) / (lengthRules(l).ms / HOUR),
    );
    for (let i = 1; i < perHour.length; i++) {
      expect(perHour[i] as number, EXPEDITION_LENGTHS[i]).toBeGreaterThan(perHour[i - 1] as number);
    }
    // The ticks run ahead of the hours on the longer trips.
    for (let i = 1; i < EXPEDITION_LENGTHS.length; i++) {
      const a = lengthRules(EXPEDITION_LENGTHS[i - 1] as ExpeditionLength);
      const b = lengthRules(EXPEDITION_LENGTHS[i] as ExpeditionLength);
      expect(b.ticks / (b.ms / HOUR)).toBeGreaterThan(a.ticks / (a.ms / HOUR));
    }
    expect(EXPEDITION_LENGTHS.map((l) => lengthRules(l).ticks)).toEqual([2, 7, 15, 32]);
  });

  it('gives a fixed gift at every rank from 2 to the top, growing with rank, and none at rank 1', () => {
    const top = RULES.expeditions.rank.xpForRank.length;
    expect(rankGift(1)).toBeNull();
    expect(rankGift(top + 1)).toBeNull();
    expect(RULES.expeditions.rank.gifts).toHaveLength(top - 1);
    const worth = (rank: number): number => {
      const g = rankGift(rank);
      if (g === null) throw new Error(`no gift at rank ${String(rank)}`);
      return (
        g.bait +
        3 * (g.parts.scrap ?? 0) +
        10 * (g.parts.glimmer ?? 0) +
        g.supplies.reduce((sum, id) => sum + (supplyDef(id)?.worth ?? 0), 0)
      );
    };
    for (let rank = 3; rank <= top; rank++) {
      expect(worth(rank), `rank ${String(rank)}`).toBeGreaterThan(worth(rank - 1));
    }
    // Ranks 7 to 10 are the big ones.
    expect(worth(7)).toBeGreaterThan(2 * worth(4));
    for (let rank = 2; rank <= top; rank++) {
      const g = rankGift(rank);
      expect(g?.bait, `bait at rank ${String(rank)}`).toBeGreaterThan(0);
      expect(Number.isInteger(g?.bait)).toBe(true);
      expect(g?.parts.scrap, `scrap at rank ${String(rank)}`).toBeGreaterThan(0);
      for (const id of g?.supplies ?? []) expect(supplyDef(id), id).toBeDefined();
    }
    // Supplies make the sim's discovery and raid targets drift, so only the high ranks (which the
    // sim's horizon hardly reaches) carry them.
    for (let rank = 2; rank <= 6; rank++) {
      expect(rankGift(rank)?.supplies, `supplies at rank ${String(rank)}`).toEqual([]);
    }
    for (let rank = 7; rank <= top; rank++) {
      expect(rankGift(rank)?.supplies.length, `supplies at rank ${String(rank)}`).toBeGreaterThan(
        0,
      );
    }
  });

  it('adds shards from rank 4 and a gear piece from rank 5, with rising odds', () => {
    const top = RULES.expeditions.rank.xpForRank.length;
    for (let rank = 2; rank <= 3; rank++) {
      expect(rankGift(rank)?.shards).toBe(0);
      expect(rankGift(rank)?.gearOddsBp).toBeNull();
    }
    expect(rankGift(4)?.shards).toBe(2);
    expect(rankGift(4)?.gearOddsBp).toBeNull();
    let lastShards = 0;
    let lastEpic = 0;
    for (let rank = 4; rank <= top; rank++) {
      const g = rankGift(rank);
      expect(g?.shards, `shards at rank ${String(rank)}`).toBeGreaterThan(lastShards);
      lastShards = g?.shards ?? 0;
      if (rank < 5) continue;
      const odds = g?.gearOddsBp;
      if (odds === null || odds === undefined) throw new Error(`no gear at rank ${String(rank)}`);
      expect(odds.common + odds.rare + odds.epic).toBe(10_000);
      expect(odds.epic, `epic at rank ${String(rank)}`).toBeGreaterThanOrEqual(lastEpic);
      lastEpic = odds.epic;
      if (rank >= 6) expect(odds.common).toBe(0);
    }
    expect(rankGift(9)?.gearOddsBp?.epic).toBeGreaterThan(0);
  });

  it('pays the shards in the explorer element and rolls the gear piece for that element', () => {
    const gift = rankGift(5);
    if (gift === null) throw new Error('no gift');
    expect(rankGiftParts(gift, 'ember')).toEqual({
      scrap: gift.parts.scrap,
      [shardOf('ember')]: gift.shards,
    });
    expect(rankGiftParts(rankGift(2) ?? gift, 'tide')[shardOf('tide')]).toBeUndefined();
    expect(rollRankGiftItem(createSeededRng('none'), rankGift(3) ?? gift, 'tide', 3)).toBeNull();
    const rng = createSeededRng('rank-gear');
    for (let i = 0; i < 20; i++) {
      const item = rollRankGiftItem(rng, rankGift(6) ?? gift, 'grove', 6);
      if (item === null) throw new Error('no item');
      expect(item.rarity).not.toBe('common');
      expect(tagElement(gearBase(item.baseId)?.tag ?? 'neutral')).toBe('grove');
    }
  });

  it('lists the gifts of every rank passed, lowest first', () => {
    expect(rankGiftsBetween(2, 2)).toEqual([]);
    expect(rankGiftsBetween(3, 2)).toEqual([]);
    expect(rankGiftsBetween(1, 2).map((g) => g.rank)).toEqual([2]);
    expect(rankGiftsBetween(2, 5).map((g) => g.rank)).toEqual([3, 4, 5]);
    expect(rankGiftsBetween(1, 99).map((g) => g.rank)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('lists what each rank unlocks from the content: places, goals and the 24 h trip', () => {
    const names = (rank: number) => {
      const u = rankUnlocks(rank);
      return {
        places: u.destinations.map((d) => d.id),
        goals: u.goals.map((g) => g.id),
        lengths: u.lengths,
      };
    };
    expect(names(1)).toEqual({ places: [], goals: [], lengths: [] });
    expect(names(2).places).toEqual(['old-crossroads']);
    expect(names(2).goals).toEqual(['scout-ahead']);
    expect(names(3).goals.sort()).toEqual(['lost-cache', 'shortcut']);
    expect(names(4).places).toEqual(['moonlit-reef']);
    expect(names(4).goals.sort()).toEqual(['linger', 'press-deeper']);
    expect(names(lengthRules('day').minRank).lengths).toEqual(['day']);
    expect(names(6).goals).toEqual(['ancient-vault']);
    for (const rank of [7, 8, 9, 10]) {
      expect(names(rank), `rank ${String(rank)}`).toEqual({ places: [], goals: [], lengths: [] });
    }
  });

  it('opens slot 2 after 3 finished trips and the others from the rank sum', () => {
    const { secondAfterTrips, thresholds } = RULES.expeditions.slots;
    expect(secondAfterTrips).toBe(3);
    expect(slotsFor(0, 0)).toBe(1);
    expect(slotsFor(0, secondAfterTrips - 1)).toBe(1);
    expect(slotsFor(0, secondAfterTrips)).toBe(2);
    thresholds.forEach((t, i) => {
      expect(slotsFor(t - 1, 99), `below ${String(t)}`).toBe(2 + i);
      expect(slotsFor(t, 99), `at ${String(t)}`).toBe(3 + i);
    });
    expect(slotsFor(1e6, 99)).toBe(2 + thresholds.length);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
  });

  it('says what opens the next slot', () => {
    const { thresholds } = RULES.expeditions.slots;
    expect(nextSlot(0, 0)).toEqual({ kind: 'trips', at: 3 });
    expect(nextSlot(0, 3)).toEqual({ kind: 'rank_sum', at: thresholds[0] });
    expect(nextSlot(thresholds[0] as number, 3)).toEqual({ kind: 'rank_sum', at: thresholds[1] });
    expect(nextSlot(1e6, 3)).toBeNull();
  });

  it('sums the ranks above 1 of all the creatures', () => {
    expect(rankSum([])).toBe(0);
    expect(rankSum([1, 1, 1])).toBe(0);
    expect(rankSum([1, 2, 5, 10])).toBe(0 + 1 + 4 + 9);
  });

  it('gives a fixed XP for every tick, with the bonuses multiplying the total', () => {
    const xp = RULES.expeditions.tick.xp;
    expect(xp).toBe(20);
    expect(tripXp(0, [])).toBe(0);
    expect(tripXp(lengthRules('short').ticks, [])).toBe(2 * xp);
    expect(tripXp(lengthRules('day').ticks, [])).toBeGreaterThan(
      tripXp(lengthRules('long').ticks, []),
    );
    expect(tripXp(15, [{ source: 'trip', name: 'Milestones', bp: 5_000 }])).toBe(
      Math.floor(15 * xp * 1.5),
    );
  });

  it('multiplies the bonuses: a milestone of +50% and a gear line of +20% make x1.8, not x1.7', () => {
    const parts: XpBoostPart[] = [
      { source: 'trip', name: 'Milestones', bp: 5_000 },
      { source: 'gear', name: 'Trail XP', bp: 2_000 },
    ];
    expect(tripXp(15, parts)).toBe(Math.floor((15 * 20 * 18_000) / 10_000));
    expect(tripXp(15, parts)).toBeGreaterThan(Math.floor((15 * 20 * 17_000) / 10_000));
  });
});

describe('familiarity', () => {
  const tide = dest('tidepools');

  it('gives a star for trips there, one for every species there and one for a shiny', () => {
    const all = [...tide.species, ...tide.deep.species];
    expect(familiarityStars(tide, { trips: 0, found: [], shiny: false })).toBe(0);
    const star1 = RULES.expeditions.familiarity.tripsForStar1;
    expect(familiarityStars(tide, { trips: star1, found: [], shiny: false })).toBe(1);
    expect(familiarityStars(tide, { trips: star1 - 1, found: [], shiny: false })).toBe(0);
    expect(familiarityStars(tide, { trips: 0, found: all, shiny: false })).toBe(1);
    expect(familiarityStars(tide, { trips: 0, found: all.slice(1), shiny: false })).toBe(0);
    expect(familiarityStars(tide, { trips: 0, found: [], shiny: true })).toBe(1);
    expect(familiarityStars(tide, { trips: star1, found: all, shiny: true })).toBe(3);
  });

  it('gives small, growing bonuses and opens the deeper area', () => {
    const b = [0, 1, 2, 3].map(familiarityBonus);
    for (let i = 1; i < b.length; i++) {
      expect((b[i] as { deepChanceBp: number }).deepChanceBp).toBeGreaterThan(
        (b[i - 1] as { deepChanceBp: number }).deepChanceBp,
      );
    }
    expect(b[0]).toEqual({ deepChanceBp: 0, rarityUpBp: 0, partsBp: 0 });
    // Small: at most a few points of rarity and a fifth more parts.
    expect((b[3] as { rarityUpBp: number }).rarityUpBp).toBeLessThanOrEqual(1_000);
    expect((b[3] as { partsBp: number }).partsBp).toBeLessThanOrEqual(2_500);
    expect(deepChanceBp(tide, 0, [])).toBe(0);
    expect(deepChanceBp(tide, 1, [])).toBe(RULES.expeditions.familiarity.deepChanceBp[1]);
    // A lantern opens it without stars, and adds to the chance with them.
    const lantern = supply('lantern-good');
    expect(lantern.kind === 'lantern' && deepChanceBp(tide, 0, [lantern])).toBe(
      lantern.kind === 'lantern' ? lantern.deepBp : -1,
    );
  });
});

describe('where a creature can go', () => {
  const reef = dest('moonlit-reef');
  const grounds = dest('festival-grounds');

  it('counts night from 20:00 to 06:00 of the local time, wrapping at midnight', () => {
    const { fromHour, toHour } = RULES.expeditions.night;
    expect(isNightHour(fromHour)).toBe(true);
    expect(isNightHour(fromHour - 1)).toBe(false);
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(toHour - 1)).toBe(true);
    expect(isNightHour(toHour)).toBe(false);
    expect(isNightHour(12)).toBe(false);
  });

  it('closes a place for the right reason: rank, night or a week that is not a Festival', () => {
    const open = { rank: 9, localHour: 22, festivalWeek: true };
    expect(closedReasons(reef, open)).toEqual([]);
    expect(closedReasons(reef, { ...open, localHour: 13 })).toEqual(['night']);
    expect(closedReasons(reef, { ...open, rank: 1 })).toEqual(['rank']);
    expect(closedReasons(reef, { ...open, rank: 1, localHour: 13 })).toEqual(['night', 'rank']);
    expect(closedReasons(grounds, { rank: 1, localHour: 12, festivalWeek: false })).toEqual([
      'festival',
    ]);
    expect(closedReasons(grounds, { rank: 1, localHour: 12, festivalWeek: true })).toEqual([]);
    expect(
      closedReasons(dest('tidepools'), { rank: 1, localHour: 3, festivalWeek: false }),
    ).toEqual([]);
    expect(
      closedReasons(dest('old-crossroads'), { rank: 1, localHour: 12, festivalWeek: false }),
    ).toEqual(['rank']);
  });
});

describe('supplies and the rolls of a trip', () => {
  it('refuses a kit with an unknown supply, two of a kind or too many', () => {
    expect(kitProblem([])).toBeNull();
    expect(kitProblem(['lure-basic', 'map-scrap-good'])).toBeNull();
    expect(kitProblem(['lure-basic', 'lure-great'])).toBe('same_kind');
    expect(kitProblem(['lure-basic', 'lantern-basic', 'satchel-basic'])).toBe('too_many');
    expect(kitProblem(['lure-basic', 'moon-pie'])).toBe('unknown_supply');
    expect(() => kitOf(['moon-pie'])).toThrow();
  });

  it('fixes the ticks of a trip when it is sent: the length, the twist extra, never the map', () => {
    expect(tripTicks('long', null)).toBe(lengthRules('long').ticks);
    expect(tripTicks('short', { kind: 'rolls', extra: 2 })).toBe(lengthRules('short').ticks + 2);
    expect(tripTicks('short', { kind: 'parts', bp: 5_000 })).toBe(lengthRules('short').ticks);
  });

  it('gives a map a fixed part and a part per tick, and rolls the fraction as a chance', () => {
    expect(mapTicksBp('long', [])).toBe(0);
    const basic = supply('map-scrap-basic');
    if (basic.kind !== 'map-scrap') throw new Error('not a map');
    // Basic: 41% of a tick and 2.83% of the ticks (B-025, then x1.18 for the catch rate 800; a map pays about 1.2 times its cost on a
    // 2 hour trip and 3.5 times on a 24 hour one).
    expect(basic.fixedTicksBp).toBe(4_130);
    expect(basic.perTickBp).toBe(283);
    expect(mapTicksBp('short', [basic])).toBe(4_130 + 283 * 2);
    expect(mapTicksBp('day', [basic])).toBe(4_130 + 283 * 32);
    // Better maps give more, and more on a longer trip.
    const bps = SUPPLY_TIERS.map((t) => mapTicksBp('long', [supply(`map-scrap-${t}`)]));
    expect(bps[0] as number).toBeLessThan(bps[1] as number);
    expect(bps[1] as number).toBeLessThan(bps[2] as number);
    expect(mapTicksBp('short', [basic])).toBeLessThan(mapTicksBp('day', [basic]));
    // The great map on a long trip: 3.28 + 23.6% of 15 = 6.82 ticks: 6 sure and an 82% chance of a 7th.
    const great = supply('map-scrap-great');
    expect(mapTicksBp('long', [great])).toBe(32_804 + 2_360 * 15);
    // A fraction rolls as a chance, never rounded away: 0.4696 ticks for the basic map on a short trip.
    expect(mapTicksBp('short', [basic])).toBe(4_696);
    let extra = 0;
    const rng = createSeededRng('map-fraction');
    for (let i = 0; i < 4_000; i++) extra += rollMapTicks(rng, 'short', [basic]);
    expect(extra / 4_000).toBeGreaterThan(0.41);
    expect(extra / 4_000).toBeLessThan(0.53);
    // Without a map nothing is drawn.
    const none = scripted([]);
    expect(rollMapTicks(none, 'long', [])).toBe(0);
    // With one the whole ticks are sure and the fraction draws once.
    expect(rollMapTicks(scripted([0]), 'long', [great])).toBe(7);
    expect(rollMapTicks(scripted([9_999]), 'long', [great])).toBe(6);
  });

  it('rolls a count from basis points: the sure ones and a chance of one more', () => {
    expect(rollCount(scripted([9_999]), 4_000)).toBe(0);
    expect(rollCount(scripted([0]), 4_000)).toBe(1);
    expect(rollCount(scripted([9_999]), 20_000)).toBe(2);
    expect(rollCount(scripted([0]), 25_000)).toBe(3);
  });

  it('shifts odds from Common without losing or inventing any', () => {
    const base = RULES.expeditions.defaultOddsBp;
    const shifted = shiftOdds(base, 1_000, 300);
    expect(shifted).toEqual({
      common: base.common - 1_300,
      rare: base.rare + 1_000,
      epic: base.epic + 300,
    });
    // Never more than Common has.
    const all = shiftOdds(base, 50_000, 50_000);
    expect(all.common).toBe(0);
    expect(all.common + all.rare + all.epic).toBe(BP);
    expect(shiftOdds(base, -5, -5)).toEqual(base);
  });

  it('shifts the odds with the trip length, familiarity and the deeper area, and uses a place’s own odds', () => {
    const odds = (destination: DestinationDef, length: ExpeditionLength) =>
      rollOdds({ destination, length, stars: 0, milestoneRarityBp: 0, deep: false });
    expect(odds(dest('storm-ridge'), 'short')).toEqual(RULES.expeditions.defaultOddsBp);
    expect(odds(dest('storm-ridge'), 'short').rare).toBeLessThan(
      odds(dest('storm-ridge'), 'day').rare,
    );
    for (const length of EXPEDITION_LENGTHS) {
      const o = odds(dest('storm-ridge'), length);
      expect(o.common + o.rare + o.epic).toBe(BP);
    }
    expect(odds(dest('moonlit-reef'), 'short')).toEqual(dest('moonlit-reef').odds);
  });

  it('makes lures raise the chance of a creature and of a new species, by tier', () => {
    expect(lureEffect([])).toEqual({ bonusBp: 0, catchBp: 0, newBp: 0 });
    const basic = lureEffect([supply('lure-basic')]);
    const good = lureEffect([supply('lure-good')]);
    const great = lureEffect([supply('lure-great')]);
    expect(basic.catchBp).toBeGreaterThan(0);
    expect(good.catchBp).toBeGreaterThan(basic.catchBp);
    expect(great.catchBp).toBeGreaterThan(good.catchBp);
    expect(basic.bonusBp).toBeGreaterThan(0);
    expect(good.bonusBp).toBeGreaterThan(basic.bonusBp);
    expect(great.bonusBp).toBeGreaterThan(good.bonusBp);
    expect(good.newBp).toBeGreaterThan(basic.newBp);
    expect(great.newBp).toBeGreaterThan(good.newBp);
    // Only lures count; the other supplies change nothing here.
    expect(lureEffect([supply('map-scrap-great'), supply('satchel-great')])).toEqual({
      bonusBp: 0,
      catchBp: 0,
      newBp: 0,
    });
    // The tick's own chance (8%), plus the lure's, at most a sure thing.
    expect(catchChanceBp([])).toBe(RULES.expeditions.tick.creatureBp);
    expect(RULES.expeditions.tick.creatureBp).toBe(800);
    expect(catchChanceBp([supply('lure-great')])).toBe(800 + great.catchBp);
    expect(catchChanceBp([SURE])).toBe(BP);
  });

  it('gives a lantern a deeper chance per creature and a fixed chance of a bonus creature from there, and a satchel a fixed part', () => {
    expect(kitDeepBonusBp([])).toBe(0);
    expect(SUPPLY_TIERS.map((t) => kitDeepBonusBp([supply(`lantern-${t}`)]))).toEqual([
      1_040, 2_990, 3_800,
    ]);
    expect(SUPPLY_TIERS.map((t) => kitDeepBp([supply(`lantern-${t}`)]))).toEqual([
      1_040, 2_990, 6_300,
    ]);
    expect(satchelBonus([])).toEqual({
      partsBp: 0,
      supplyBp: 0,
      scrap: 0,
      shardBp: 0,
      glimmerBp: 0,
    });
    const satchels = SUPPLY_TIERS.map((t) => satchelBonus([supply(`satchel-${t}`)]));
    expect(satchels.map((x) => x.scrap)).toEqual([1, 4, 9]);
    expect(satchels.map((x) => x.shardBp)).toEqual([3_500, 10_000, 22_500]);
    expect(satchels.map((x) => x.glimmerBp)).toEqual([0, 600, 2_700]);
    expect(satchels.map((x) => x.partsBp)).toEqual([2_000, 6_600, 14_000]);
  });

  it('chances an end-of-trip choice from the base, the rank and the supplies, the best tier a sure thing', () => {
    const { baseOfferBp, perRankBp } = RULES.expeditions.pushOn;
    expect(offerChanceBp(1, [], 0)).toBe(baseOfferBp);
    expect(offerChanceBp(5, [], 0)).toBe(baseOfferBp + 4 * perRankBp);
    expect(offerChanceBp(1, [], 100)).toBe(baseOfferBp + 100);
    expect(offerChanceBp(1, [supply('lure-great')], 0)).toBe(BP);
    expect(offerChanceBp(10, [supply('satchel-great'), supply('lantern-basic')], 0)).toBe(BP);
    const basic = offerChanceBp(1, [supply('lure-basic')], 0);
    const good = offerChanceBp(1, [supply('lure-good')], 0);
    expect(basic).toBeGreaterThan(baseOfferBp);
    expect(good).toBeGreaterThan(basic);
    expect(good).toBeLessThan(BP);
    // Two supplies together beat either alone, and never reach a sure thing.
    const both = offerChanceBp(1, [supply('lure-good'), supply('map-scrap-good')], 0);
    expect(both).toBeGreaterThan(good);
    expect(both).toBeLessThan(BP);
  });
});

describe('catching at a destination', () => {
  it('draws whether a creature comes, then the rarity, the species and the shiny: 0, 0, 0, 1 is the first common species, not shiny', () => {
    const rng = scripted([0, 0, 0, 1]);
    const roll = rollSure(rng, ctx());
    expect(roll.result.species.id).toBe('splashet');
    expect(roll.result.shiny).toBe(false);
    expect(roll.result.deep).toBe(false);
    expect(rng.drawn()).toBe(4);
    // A shiny one.
    expect(rollSure(scripted([0, 0, 0, 0]), ctx()).result.shiny).toBe(true);
  });

  it('only brings back species that live at the destination, and Festival creatures only at the Festival Grounds', () => {
    const rng = createSeededRng('dest-only');
    for (const d of expeditionContent.destinations) {
      const here = new Set(d.species);
      const festival = d.access.festival === true;
      for (let i = 0; i < 300; i++) {
        const { result } = rollSure(rng, ctx({ destination: d, stars: 0, firstExpedition: false }));
        expect(here.has(result.species.id), `${d.id}: ${result.species.id}`).toBe(true);
        if (result.species.festival === true) expect(festival).toBe(true);
      }
    }
  });

  it('can bring back the Festival creatures at the Festival Grounds', () => {
    const rng = createSeededRng('festival');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(rollSure(rng, ctx({ destination: dest('festival-grounds') })).result.species.id);
    }
    expect(seen.has('lanternfin')).toBe(true);
    expect(seen.has('hearthshell')).toBe(true);
  });

  it('opens the deeper area with a star or a lantern, where the rarest species live', () => {
    const rng = createSeededRng('deep');
    const ember = dest('ember-caves');
    const deepSpecies = new Set(ember.deep.species);
    let deepRolls = 0;
    let none = 0;
    for (let i = 0; i < 4_000; i++) {
      const closed = rollSure(rng, ctx({ destination: ember, stars: 0 })).result;
      if (deepSpecies.has(closed.species.id)) none++;
      expect(closed.deep).toBe(false);
      const open = rollSure(rng, ctx({ destination: ember, stars: 1 })).result;
      if (open.deep) deepRolls++;
    }
    expect(none).toBe(0);
    // About the star's chance of rolls came from the deeper area.
    const expected = RULES.expeditions.familiarity.deepChanceBp[1] as number;
    expect(Math.abs((deepRolls * BP) / 4_000 - expected)).toBeLessThan(300);
    // With a lantern but no stars the deeper area is open too.
    const lantern = supply('lantern-great');
    let lit = 0;
    for (let i = 0; i < 2_000; i++) {
      if (rollSure(rng, ctx({ destination: ember, kit: [lantern] })).result.deep) lit++;
    }
    expect(lit).toBeGreaterThan(0);
  });

  it('has no catch pity: a long run of misses is followed by another miss', () => {
    const plain = { ...ctx(), kit: [] as SupplyDef[] };
    // Every draw misses the 12.5% chance. A hundred ticks bring nothing and draw once each.
    const rng = scripted(Array.from({ length: 100 }, () => BP - 1));
    const out = rollTripCatches(rng, 100, plain, true);
    expect(out.results).toEqual([]);
    expect(out.empty).toBe(100);
    expect(rng.drawn()).toBe(100);
  });

  it('rolls a sure roll without drawing the chance, and a lure’s bonus roll after the ticks', () => {
    // A sure roll brings a creature whatever the chance: rarity, species and shiny only.
    const plain = { ...ctx(), kit: [] as SupplyDef[] };
    const sure = scripted([0, 0, 1]);
    expect(rollTripCatch(sure, { ...plain, sure: true }).result?.species.id).toBe('splashet');
    expect(sure.drawn()).toBe(3);
    // The Plain Lure's 15% bonus: a hit draws first, then the ticks, then the sure roll.
    const lure = supply('lure-basic');
    const out = rollTripCatches(
      scripted([0, 9_999, 0, 9_999, 0, 1]),
      1,
      { ...plain, kit: [lure], ownedLines: new Set() },
      true,
    );
    expect(out.results).toHaveLength(1);
    expect(out.empty).toBe(1);
    // A miss on the bonus chance draws once and adds nothing.
    const none = scripted([9_999, 9_999]);
    expect(rollTripCatches(none, 1, { ...plain, kit: [lure] }, true).results).toEqual([]);
    expect(none.drawn()).toBe(2);
    // A recall (no fixed parts) never rolls the bonus.
    const recall = scripted([9_999]);
    expect(rollTripCatches(recall, 1, { ...plain, kit: [lure] }, false).results).toEqual([]);
    expect(recall.drawn()).toBe(1);
    // A great lure's bonus is 65%: over many trips the bonus roll shows.
    const great = supply('lure-great');
    const rng = createSeededRng('bonus');
    let withBonus = 0;
    let without = 0;
    for (let i = 0; i < 3_000; i++) {
      withBonus += rollTripCatches(rng, 2, { ...plain, kit: [great] }, true).results.length;
      without += rollTripCatches(rng, 2, { ...plain, kit: [great] }, false).results.length;
    }
    expect(withBonus).toBeGreaterThan(without + 3_000 * 0.55);
  });

  it('gives a lantern a chance of one bonus creature from the deeper area, after the ticks, on a finished trip', () => {
    const ember = dest('ember-caves');
    const plain = { ...ctx({ destination: ember }), kit: [] as SupplyDef[] };
    const lantern = supply('lantern-basic');
    const lit = { ...plain, kit: [lantern] };
    // A hit (the basic lantern's chance is a draw under `bonusBp`), then one tick that brings nothing,
    // then the bonus roll: no deeper-area chance is drawn (it is forced), the deeper area's own species
    // comes with `deepFindBp`, its index, and the shiny draw.
    const hit = scripted([0, 9_999, 0, 0, 1]);
    const out = rollTripCatches(hit, 1, lit, true);
    expect(hit.drawn()).toBe(5);
    expect(out.empty).toBe(1);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.deep).toBe(true);
    expect(ember.deep.species).toContain(out.results[0]?.species.id);
    // A miss on the chance draws once and adds nothing.
    const miss = scripted([9_999, 9_999]);
    expect(rollTripCatches(miss, 1, lit, true).results).toEqual([]);
    expect(miss.drawn()).toBe(2);
    // A recall (no fixed parts) never rolls it.
    const recall = scripted([9_999]);
    expect(rollTripCatches(recall, 1, lit, false).results).toEqual([]);
    expect(recall.drawn()).toBe(1);
    // With a lure too: both chances first (lure, lantern), the ticks, the lure's bonus, then the lantern's.
    const both = scripted([0, 0, 9_999, 9_999, 0, 9_999, 0, 1, 0, 0, 1]);
    const lure = supply('lure-basic');
    const two = rollTripCatches(both, 1, { ...plain, kit: [lure, lantern] }, true);
    expect(two.results).toHaveLength(2);
    expect(two.results[0]?.deep).toBe(false);
    expect(two.results[1]?.deep).toBe(true);
  });

  it('draws the lantern bonus only where the deeper area is open, and keeps the rarity shift without deep species', () => {
    const lantern = supply('lantern-great');
    // No deeper content at all: the deeper area stays closed, the chance is not drawn, nothing is added.
    const shut = { ...dest('tidepools'), deep: { species: [], rarityUpBp: 0 } };
    const none = scripted([9_999]);
    const out = rollTripCatches(none, 1, { ...ctx({ destination: shut }), kit: [lantern] }, true);
    expect(out.results).toEqual([]);
    expect(none.drawn()).toBe(1);
    // A deeper area with a rarity push but no species of its own: the bonus creature is a deep roll.
    const rng = createSeededRng('deep-shift');
    const tide = dest('tidepools');
    let deep = 0;
    let all = 0;
    for (let i = 0; i < 400; i++) {
      const r = rollTripCatches(rng, 0, { ...ctx({ destination: tide }), kit: [lantern] }, true);
      all += r.results.length;
      for (const c of r.results) if (c.deep) deep++;
    }
    expect(all).toBeGreaterThan(400 * 0.25);
    expect(deep).toBe(all);
    // The great lantern's chance is its `bonusBp`.
    expect(Math.abs(all / 400 - kitDeepBonusBp([lantern]) / BP)).toBeLessThan(0.08);
  });

  it('falls back to the nearest rarity somebody there has', () => {
    // The Festival Grounds have no Rare species: a Rare roll comes out Common (or Epic), never fails.
    const rng = createSeededRng('fallback');
    for (let i = 0; i < 500; i++) {
      const s = rollSure(
        rng,
        ctx({ destination: dest('festival-grounds'), kit: [supply('lure-great')] }),
      ).result.species;
      expect(s.rarity).not.toBe('rare');
    }
  });

  it('weighs the explorer element 2, and a Setter 3', () => {
    const rng = createSeededRng('affinity');
    const count = (role: 'payoff' | 'setter') => {
      let tide = 0;
      const n = 6_000;
      for (let i = 0; i < n; i++) {
        const s = rollSure(
          rng,
          ctx({ destination: dest('old-crossroads'), explorer: { element: 'tide', role } }),
        ).result.species;
        // Common species of the Old Crossroads: splashet (tide), cindle, sproutle, zipmouse.
        if (s.id === 'splashet') tide++;
      }
      return tide / n;
    };
    const payoff = count('payoff');
    const setter = count('setter');
    expect(setter).toBeGreaterThan(payoff);
    // Of the commons here, Splashet is 2 of 5 for a Payoff and 3 of 6 for a Setter (times the common share).
    const commonShare = RULES.expeditions.defaultOddsBp.common / BP;
    expect(Math.abs(payoff - (2 / 5) * commonShare)).toBeLessThan(0.03);
    expect(Math.abs(setter - (3 / 6) * commonShare)).toBeLessThan(0.03);
  });

  it('weights the species a featured twist names', () => {
    const tidepools = dest('tidepools');
    const byId = new Map(content.creatures.map((c) => [c.id, c]));
    const featured = featuredSpecies(
      tidepools,
      { kind: 'featured', rarity: 'rare', weight: 3 },
      byId,
    );
    expect(featured?.species.id).toBe('coralynx');
    expect(featured?.weight).toBe(3);
    expect(featuredSpecies(tidepools, { kind: 'rolls', extra: 1 }, byId)).toBeNull();
    const rng = createSeededRng('featured');
    const n = 8_000;
    const count = (twist: TripCatchContext['twist']) => {
      let hits = 0;
      for (let i = 0; i < n; i++) {
        if (rollSure(rng, ctx({ destination: tidepools, twist })).result.species.id === 'coralynx')
          hits++;
      }
      return hits;
    };
    // The only Rare there: a Rare roll is Coralynx either way, so the twist changes nothing for it.
    expect(
      Math.abs(count(null) - count({ kind: 'featured', rarity: 'rare', weight: 3 })),
    ).toBeLessThan(n * 0.04);
    // At the Old Crossroads the twist moves weight inside a rarity.
    const crossroads = dest('old-crossroads');
    const first = (twist: TripCatchContext['twist']) => {
      let hits = 0;
      for (let i = 0; i < n; i++) {
        if (rollSure(rng, ctx({ destination: crossroads, twist })).result.species.id === 'stormray')
          hits++;
      }
      return hits;
    };
    expect(first(null)).toBeGreaterThan(0);
  });

  it('keeps the dupe shield and the first-expedition Zipmouse at every destination', () => {
    for (const d of expeditionContent.destinations) {
      const roll = rollSure(
        createSeededRng(`z-${d.id}`),
        ctx({ destination: d, firstExpedition: true }),
      );
      expect(roll.result.species.id).toBe('zipmouse');
      expect(roll.guaranteed).toBe(true);
    }
    // A creature the player owns is not forced again.
    const owned = rollSure(
      scripted([0, 0, 0, 1]),
      ctx({ firstExpedition: true, ownedLines: new Set(['zipmouse']) }),
    );
    expect(owned.guaranteed).toBe(false);
    // With a streak of the shield's length, an unowned species of the rarity is picked when there is one.
    const streak = rollSure(
      scripted([0, 0, 0, 1]),
      ctx({ ownedLines: new Set(['splashet']), dupeStreak: RULES.catching.dupeShieldStreak }),
    );
    expect(streak.result.species.id).toBe('mistnewt');
    const noShield = rollSure(
      scripted([0, 0, 0, 1]),
      ctx({ ownedLines: new Set(['splashet']), dupeStreak: 1 }),
    );
    expect(noShield.result.species.id).toBe('splashet');
    expect(noShield.dupeStreak).toBe(2);
  });

  it('rolls all the catches of a claim, carrying owned lines from roll to roll', () => {
    const rng = createSeededRng('claim');
    const out = rollTripCatches(rng, 6, ctx({ destination: dest('old-crossroads') }), true);
    expect(out.results).toHaveLength(6);
    const owned = new Set<string>();
    let streak = 0;
    for (const r of out.results) {
      expect(r.duplicate).toBe(owned.has(r.species.line));
      streak = r.duplicate ? streak + 1 : 0;
      owned.add(r.species.line);
    }
    expect(out.dupeStreak).toBe(streak);
    expect(() => rollTripCatches(rng, -1, ctx(), true)).toThrow(RangeError);
    expect(rollTripCatches(rng, 0, ctx(), true).results).toEqual([]);
    expect(out.empty).toBe(0);
  });

  it('brings a creature only with the length’s chance: a roll that misses draws once and brings nothing', () => {
    const c = ctx({ kit: [] });
    // `ctx` always adds the sure lure, so build the context without it.
    const plain = { ...c, kit: [] as SupplyDef[] };
    const missed = scripted([BP - 1]);
    const roll = rollTripCatch(missed, plain);
    expect(roll.result).toBeNull();
    expect(roll.dupeStreak).toBe(plain.dupeStreak);
    expect(missed.drawn()).toBe(1);
    // A draw under the chance brings one (rarity, species and shiny follow).
    const hit = scripted([0, 0, 0, 1]);
    expect(rollTripCatch(hit, plain).result?.species.id).toBe('splashet');
    expect(hit.drawn()).toBe(4);
    // The first expedition always brings the Zipmouse, with no chance roll.
    const first = scripted([BP - 1, BP - 1]);
    const guaranteed = rollTripCatch(first, { ...plain, firstExpedition: true });
    expect(guaranteed.result?.species.id).toBe('zipmouse');
    expect(guaranteed.guaranteed).toBe(true);
    expect(first.drawn()).toBe(1);
  });

  it('brings a creature about as often as the length and the lures say, and counts the rolls that did not', () => {
    const n = 4_000;
    const rate = (kit: SupplyDef[], length: ExpeditionLength): number => {
      const rng = createSeededRng(`rate-${length}-${String(kit.length)}`);
      let got = 0;
      for (let i = 0; i < n; i++) {
        const base = ctx({ destination: dest('old-crossroads'), length });
        if (rollTripCatch(rng, { ...base, kit }).result !== null) got++;
      }
      return (got * BP) / n;
    };
    for (const length of EXPEDITION_LENGTHS) {
      expect(Math.abs(rate([], length) - catchChanceBp([]))).toBeLessThan(300);
    }
    expect(rate([supply('lure-great')], 'short')).toBeGreaterThan(rate([], 'short') + 150);
    const out = rollTripCatches(
      createSeededRng('empties'),
      40,
      { ...ctx(), kit: [], destination: dest('old-crossroads') },
      true,
    );
    expect(out.results.length + out.empty).toBe(40);
    expect(out.empty).toBeGreaterThan(10);
  });

  it('lets a lure turn the roll towards a species the player lacks', () => {
    const owned = new Set(['splashet', 'cindle', 'sproutle']);
    const freshShare = (kit: SupplyDef[]): number => {
      const rng = createSeededRng(`new-${kit.map((k) => k.id).join('+')}`);
      let fresh = 0;
      const n = 4_000;
      for (let i = 0; i < n; i++) {
        const c = ctx({ destination: dest('old-crossroads'), ownedLines: owned });
        const roll = rollTripCatch(rng, { ...c, kit: [SURE, ...kit] });
        if (roll.result !== null && !roll.result.duplicate) fresh++;
      }
      return fresh / n;
    };
    const none = freshShare([]);
    const basic = freshShare([supply('lure-basic')]);
    const great = freshShare([supply('lure-great')]);
    expect(basic).toBeGreaterThan(none);
    expect(great).toBeGreaterThan(basic);
  });
});

describe('trip loot', () => {
  const base = {
    ticks: 15,
    fixedParts: true,
    place: { element: 'tide' as const, crossroads: false },
    role: 'payoff' as const,
    kit: [] as SupplyDef[],
    stars: 0,
    milestonePartsBp: 0,
    twist: null,
    rank: 1,
  };
  type LootCtx = Parameters<typeof rollTripLoot>[1];
  /** Everything a lot of ticks bring, summed (the same seed for every variant). */
  const sum = (ticks: number, extra: Partial<LootCtx> = {}, seed = 'sum') => {
    const total = {
      scrap: 0,
      shards: 0,
      glimmer: 0,
      blueprints: 0,
      supplies: 0,
      gear: 0,
      rarity: { common: 0, rare: 0, epic: 0 },
    };
    const rng = createSeededRng(seed);
    const loot = rollTripLoot(rng, { ...base, ...extra, fixedParts: false, ticks });
    total.scrap = loot.parts.scrap ?? 0;
    total.shards = loot.parts['tide-shard'] ?? 0;
    total.glimmer = loot.parts.glimmer ?? 0;
    total.blueprints = loot.blueprints.length;
    total.supplies = loot.supplies.length;
    total.gear = loot.gear.length;
    for (const g of loot.gear) total.rarity[g.rarity] += 1;
    return total;
  };

  it('rolls every table once per tick at its own chance, and nothing without ticks', () => {
    const t = RULES.expeditions.tick;
    const n = 40_000;
    const total = sum(n);
    const near = (got: number, bp: number, label: string): void => {
      const want = (n * bp) / BP;
      expect(Math.abs(got - want), `${label}: ${String(got)} of ${String(want)}`).toBeLessThan(
        Math.max(40, want * 0.08),
      );
    };
    near(total.scrap, t.scrapBp, 'scrap');
    near(total.shards, t.shardBp, 'shards');
    near(total.gear, t.gearBp, 'gear');
    near(total.glimmer, t.glimmerBp, 'glimmer');
    near(total.blueprints, t.blueprintBp, 'blueprints');
    near(total.supplies, t.supplyBp, 'supplies');
    // A 2 hour trip (2 ticks) has about a 10% chance of at least one gear piece.
    expect(1 - (1 - t.gearBp / BP) ** 2).toBeGreaterThan(0.099);
    expect(1 - (1 - t.gearBp / BP) ** 2).toBeLessThan(0.102);
    const nothing = rollTripLoot(scripted([]), { ...base, ticks: 0, fixedParts: false });
    expect(nothing).toEqual({ parts: {}, blueprints: [], supplies: [], gear: [] });
    expect(() => rollTripLoot(scripted([]), { ...base, ticks: -1 })).toThrow(RangeError);
  });

  it('rolls a gear piece like a push-on drop: the place’s tag, the rarity from the odds, item level the rank (times RULES.gear.itemLevel.expeditionPerRank)', () => {
    const rng = createSeededRng('gear-ticks');
    const loot = rollTripLoot(rng, { ...base, ticks: 6_000, rank: 3, fixedParts: false });
    expect(loot.gear.length).toBeGreaterThan(200);
    const shares = { common: 0, rare: 0, epic: 0 };
    for (const g of loot.gear) {
      expect(g.itemLevel).toBe(3);
      shares[g.rarity] += 1;
    }
    const odds = RULES.expeditions.tick.gearOdds;
    expect(odds.common + odds.rare + odds.epic).toBe(BP);
    expect(shares.common / loot.gear.length).toBeGreaterThan(0.78);
    expect(shares.rare).toBeGreaterThan(shares.epic);
    expect(shares.rare).toBeGreaterThan(0);
  });

  it('brings shards of the place’s element, never the explorer’s, and any element from a place without one', () => {
    const shardsOf = (parts: Record<string, number | undefined>) =>
      Object.entries(parts).filter(([k]) => k.endsWith('-shard'));
    // An Ember place: every shard (the ticks' and the satchel's) is an Ember shard.
    const ember = rollTripLoot(createSeededRng('ember'), {
      ...base,
      ticks: 3_000,
      kit: [supply('satchel-great')],
      place: { element: 'ember', crossroads: false },
    });
    expect(shardsOf(ember.parts).map(([k]) => k)).toEqual(['ember-shard']);
    expect(ember.parts['ember-shard'] ?? 0).toBeGreaterThan(100);
    // A neutral place (the Old Crossroads, the Festival Grounds): each shard draws its element evenly of five.
    const neutral = rollTripLoot(createSeededRng('neutral'), {
      ...base,
      ticks: 20_000,
      place: { element: null, crossroads: false },
    });
    const kinds = shardsOf(neutral.parts);
    expect(kinds.map(([k]) => k).sort()).toEqual([
      'ember-shard',
      'grove-shard',
      'mire-shard',
      'spark-shard',
      'tide-shard',
    ]);
    const total = kinds.reduce((n, [, v]) => n + (v ?? 0), 0);
    for (const [k, v] of kinds) expect(Math.abs((v ?? 0) / total - 0.2), k).toBeLessThan(0.05);
    // One draw of five for each shard, right after its count: a count of 1 then element 3 (Spark).
    const order = RULES.expeditions.tick;
    expect(order.shardBp).toBeLessThan(BP);
    const drawn = rollTripLoot(scripted([9_999, 0, 3, 9_999, 9_999, 9_999, 9_999, 9_999, 9_999]), {
      ...base,
      ticks: 1,
      place: { element: null, crossroads: false },
    });
    expect(drawn.parts).toEqual({ 'spark-shard': 1 });
  });

  it('is deterministic for a seed, in a fixed draw order', () => {
    const a = rollTripLoot(createSeededRng('order'), base);
    const b = rollTripLoot(createSeededRng('order'), base);
    expect(a).toEqual(b);
  });

  it('puts no cap on a lucky trip: with sure chances every tick pays', () => {
    const t = RULES.expeditions.tick;
    expect(t.scrapBp).toBeLessThan(BP);
    // A parts bonus of +100% makes the scrap chance 100%: a sure scrap on every tick (and no cap on top).
    const lucky = rollTripLoot(createSeededRng('lucky'), {
      ...base,
      ticks: 20,
      fixedParts: false,
      milestonePartsBp: 10_000,
    });
    expect(lucky.parts.scrap ?? 0).toBeGreaterThanOrEqual(20);
  });

  it('adds a satchel’s fixed part on a finished trip only: scrap, shards and glimmer, whatever the length', () => {
    const at = (id: string, draws: number[]) =>
      rollTripLoot(scripted(draws), { ...base, ticks: 0, kit: [supply(id)] }).parts;
    // Draws: the shard count, then the glimmer chance (only for a satchel that has one).
    expect(at('satchel-great', [0, 0])).toEqual({ scrap: 9, 'tide-shard': 3, glimmer: 1 });
    expect(at('satchel-great', [9_999, 9_999])).toEqual({ scrap: 9, 'tide-shard': 2 });
    expect(at('satchel-good', [0, 0])).toEqual({ scrap: 4, 'tide-shard': 1, glimmer: 1 });
    expect(at('satchel-good', [9_999, 9_999])).toEqual({ scrap: 4, 'tide-shard': 1 });
    expect(at('satchel-basic', [0])).toEqual({ scrap: 1, 'tide-shard': 1 });
    expect(at('satchel-basic', [9_999])).toEqual({ scrap: 1 });
    // A recall brings the ticks only.
    const recall = rollTripLoot(scripted([]), {
      ...base,
      ticks: 0,
      fixedParts: false,
      kit: [supply('satchel-great')],
    });
    expect(recall.parts).toEqual({});
  });

  it('gear: Keen nose adds to the parts bonus and Packer grows the supply find chance by its share', () => {
    const plainCtx = {
      role: base.role,
      kit: base.kit,
      stars: base.stars,
      milestonePartsBp: base.milestonePartsBp,
      twist: base.twist,
    };
    expect(partsBonusBp({ ...plainCtx, gearPartsBp: 1_500 })).toBe(partsBonusBp(plainCtx) + 1_500);
    expect(partsBonusBp({ ...plainCtx, gearPartsBp: 0 })).toBe(partsBonusBp(plainCtx));
    const t = RULES.expeditions.tick;
    expect(tickChances({ ...plainCtx }).supplyBp).toBe(t.supplyBp);
    expect(tickChances({ ...plainCtx, gearSupplyBp: 5_000 }).supplyBp).toBe(
      Math.floor((t.supplyBp * 15_000) / BP),
    );
    // Over many ticks the supplies found follow the chance and grow with Packer.
    const n = 40_000;
    const plain = sum(n).supplies;
    const packer = sum(n, { gearSupplyBp: 5_000 }).supplies;
    expect(packer).toBeGreaterThan(plain * 1.3);
    expect(packer).toBeLessThan(plain * 1.7);
  });

  it('scales every table of a tick with its modifiers: the parts bonus, shards, glimmer and the weather', () => {
    const n = 20_000;
    const plain = sum(n);
    expect(sum(n, { gearPartsBp: 10_000 }).scrap).toBeGreaterThan(plain.scrap * 1.8);
    expect(sum(n, { gearPartsBp: 10_000 }).shards).toBeGreaterThan(plain.shards * 1.7);
    expect(sum(n, { gearGlimmerBp: 10_000 }).glimmer).toBeGreaterThan(plain.glimmer * 1.7);
    expect(sum(n, { weatherShardsBp: 10_000 }).shards).toBeGreaterThan(plain.shards * 1.7);
    expect(sum(n, { weatherShardsBp: -10_000 }).shards).toBe(0);
    expect(sum(n, { weatherSupplyBp: 10_000 }).supplies).toBeGreaterThan(plain.supplies * 1.7);
    expect(sum(n, { weatherPartsBp: -10_000 }).scrap).toBe(0);
  });

  it('brings more for a Guard, a satchel, stars, milestones and a twist', () => {
    const total = (extra: Partial<LootCtx>): number => {
      const x = sum(6_000, extra, 'more');
      return x.scrap + x.shards;
    };
    const plain = total({});
    const guard = total({ role: 'guard' });
    const satchel = total({ kit: [supply('satchel-great')] });
    const twist = total({ twist: { kind: 'parts', bp: 5_000 } });
    const stars = total({ stars: 3 });
    const milestone = total({ milestonePartsBp: 5_000 });
    for (const more of [guard, satchel, twist, stars, milestone])
      expect(more).toBeGreaterThan(plain);
    expect(partsBonusBp({ ...base, role: 'guard' as const })).toBe(
      RULES.expeditions.roles.guardPartsBp,
    );
  });

  it('finds supplies of the explorer’s tier: plain, good from rank 4, great from rank 7, and never a lure', () => {
    const { good, great } = RULES.expeditions.foundTier;
    const tier = (rank: number) => foundSupplyId(scripted([0]), rank);
    expect(FOUND_SUPPLY_KINDS).not.toContain('lure');
    expect(FOUND_SUPPLY_KINDS).toHaveLength(SUPPLY_KINDS.length - 1);
    const first = FOUND_SUPPLY_KINDS[0] as string;
    expect(tier(1)).toBe(`${first}-basic`);
    expect(tier(good - 1)).toBe(`${first}-basic`);
    expect(tier(good)).toBe(`${first}-good`);
    expect(tier(great - 1)).toBe(`${first}-good`);
    expect(tier(great)).toBe(`${first}-great`);
    expect(foundSupplyId(scripted([FOUND_SUPPLY_KINDS.length - 1]), 1)).toBe(
      `${FOUND_SUPPLY_KINDS.at(-1) as string}-basic`,
    );
    const rng = createSeededRng('found-kinds');
    for (let i = 0; i < 300; i++) expect(foundSupplyId(rng, 9)).not.toMatch(/^lure-/);
  });

  it('grows the chance of a glimmer with the explorer’s glimmer-finding talents', () => {
    const n = 60_000;
    expect(sum(n, { gearGlimmerBp: 5_000 }).glimmer).toBeGreaterThan(sum(n).glimmer);
  });

  it('values a creature roll by the tick’s chance', () => {
    const odds = RULES.expeditions.defaultOddsBp;
    const worth = catchRollWorth(odds);
    expect(worth).toBeGreaterThan(0);
    expect(worth).toBeCloseTo((rollWorth(odds) * RULES.expeditions.tick.creatureBp) / BP, 9);
  });
});

describe('a recall', () => {
  const start = 1_000_000;
  const end = start + 12 * HOUR;
  const at = (hours: number): number => start + hours * HOUR;

  it('pays the ticks of the whole hours already spent, never the length’s bonus ticks', () => {
    expect(recallTicks('long', start, end, start)).toBe(0);
    expect(recallTicks('long', start, end, at(0.99))).toBe(0);
    expect(recallTicks('long', start, end, at(1))).toBe(1);
    expect(recallTicks('long', start, end, at(5.9))).toBe(5);
    expect(recallTicks('long', start, end, at(12) - 1)).toBe(11);
    // At the end it is the hours (12), not the 15 ticks a finished trip pays.
    expect(recallTicks('long', start, end, end)).toBe(12);
    expect(recallTicks('long', start, end, end + HOUR)).toBe(12);
    expect(recallTicks('long', start, end, start - HOUR)).toBe(0);
    expect(recallTicks('short', start, start + 2 * HOUR, at(1.5))).toBe(1);
  });

  it('counts nominal hours: a faster explorer’s trip still pays a tick per nominal hour', () => {
    // A rank that cut the 12 hour trip to 10 hours: halfway (5 real hours) is 6 nominal hours.
    const quick = start + 10 * HOUR;
    expect(recallTicks('long', start, quick, at(5))).toBe(6);
    expect(recallTicks('long', start, quick, at(5) - 1)).toBe(5);
  });

  it('refuses a trip that does not end after it starts', () => {
    expect(() => recallTicks('long', start, start, start)).toThrow(RangeError);
  });
});

describe('the end-of-trip choice', () => {
  const goals = expeditionContent.goals;
  const offerWith = (
    rng: Rng,
    rank: number,
    length: ExpeditionLength = 'long',
    kit: SupplyDef[] = [],
  ) => rollOffer(rng, { goals, length, rank, kit, milestoneOfferBp: 0 });

  it('offers nothing when the chance misses, and a safe goal alone before a risky goal is open', () => {
    expect(offerWith(scripted([BP - 1]), 1)).toEqual([]);
    // A draw of 0 always hits; then one pick per goal.
    const lowRank = offerWith(scripted([0, 0]), 1);
    expect(lowRank).toHaveLength(1);
    expect(goalDef(lowRank[0] as string)?.risk).toBe('safe');
    const minRisky = Math.min(...goals.filter((g) => g.risk === 'risky').map((g) => g.minRank));
    const high = offerWith(scripted([0, 0, 0]), minRisky);
    expect(high.map((id) => goalDef(id)?.risk)).toEqual(['safe', 'risky']);
  });

  it('only offers goals open to the rank and the length', () => {
    const rng = createSeededRng('offers');
    for (let i = 0; i < 400; i++) {
      for (const length of EXPEDITION_LENGTHS) {
        const rank = 1 + (i % 10);
        const offered = offerWith(rng, rank, length, [supply('lure-great')]);
        expect(offered.length).toBeLessThanOrEqual(RULES.expeditions.pushOn.maxGoals);
        for (const id of offered) {
          const g = goalDef(id);
          expect(g?.minRank ?? 99).toBeLessThanOrEqual(rank);
          expect(goalOddsBp(g as NonNullable<typeof g>, length)).toBeDefined();
        }
      }
    }
  });

  it('is a sure thing with the best supplies', () => {
    const rng = createSeededRng('sure');
    for (let i = 0; i < 200; i++) {
      expect(offerWith(rng, 1, 'short', [supply('map-scrap-great')]).length).toBeGreaterThan(0);
    }
  });

  it('works out a safe goal without drawing, and a risky one at its exact chance', () => {
    const safe = goals.find((g) => g.risk === 'safe') as NonNullable<ReturnType<typeof goalDef>>;
    const rng = scripted([]);
    expect(goalWorks(rng, safe, 'long')).toBe(true);
    expect(rng.drawn()).toBe(0);
    const risky = goals.find(
      (g) => g.risk === 'risky' && g.lengths.long !== undefined,
    ) as NonNullable<ReturnType<typeof goalDef>>;
    const odds = goalOddsBp(risky, 'long') as number;
    const draws = createSeededRng('risky');
    let worked = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (goalWorks(draws, risky, 'long')) worked++;
    expect(Math.abs((worked * BP) / n - odds)).toBeLessThan(150);
    expect(goalWorks(scripted([odds - 1]), risky, 'long')).toBe(true);
    expect(goalWorks(scripted([odds]), risky, 'long')).toBe(false);
    expect(() => goalWorks(scripted([0]), risky, 'short')).toThrow(RangeError);
  });

  it('rolls a push-on from the stored odds alone', () => {
    const rng = scripted([]);
    expect(pushWorks(rng, 'safe', 100)).toBe(true);
    expect(pushWorks(rng, 'risky', 10_000)).toBe(true);
    expect(rng.drawn()).toBe(0);
    expect(pushWorks(scripted([4_999]), 'risky', 5_000)).toBe(true);
    expect(pushWorks(scripted([5_000]), 'risky', 5_000)).toBe(false);
  });
});

describe('the journal', () => {
  const entries = expeditionContent.journal.entries;

  it('picks a page of the place first, then the pages any trip can find, never one twice, and then nothing', () => {
    const rng = createSeededRng('journal');
    const found = new Set<string>();
    const own = entries.filter((e) => e.place === 'tidepools').length;
    const anyCount = entries.filter((e) => e.place === 'any').length;
    const order: string[] = [];
    for (;;) {
      const id = rollJournal(rng, entries, 'tidepools', found);
      if (id === null) break;
      expect(found.has(id), 'a page twice').toBe(false);
      found.add(id);
      order.push(id);
    }
    expect(order).toHaveLength(own + anyCount);
    // The place's own pages all come before the pages of `any`.
    expect(order.slice(0, own).every((id) => journalEntry(id)?.place === 'tidepools')).toBe(true);
    expect(order.slice(own).every((id) => journalEntry(id)?.place === 'any')).toBe(true);
    // Run out: no page and no draw.
    const empty = scripted([]);
    expect(rollJournal(empty, entries, 'tidepools', found)).toBeNull();
    expect(empty.drawn()).toBe(0);
    expect(journalPool(entries, 'tidepools', found)).toEqual([]);
    // Another place still has its own pages.
    expect(journalPool(entries, 'storm-ridge', found).every((e) => e.place === 'storm-ridge')).toBe(
      true,
    );
  });

  it('chances a page on every tick, more with a twist', () => {
    expect(journalChanceBp(null)).toBe(RULES.expeditions.tick.journalBp);
    expect(journalChanceBp({ kind: 'journal', bp: 10_000 })).toBe(
      RULES.expeditions.tick.journalBp * 2,
    );
    expect(journalChanceBp({ kind: 'journal', bp: 300_000 })).toBeLessThanOrEqual(BP);
    expect(journalChanceBp(null, -10_000)).toBe(0);
    // About a tenth of a page for a 12 hour trip, as before the ticks.
    const perTrip = (lengthRules('long').ticks * RULES.expeditions.tick.journalBp) / BP;
    expect(perTrip).toBeGreaterThan(0.08);
    expect(perTrip).toBeLessThan(0.13);
  });
});

describe('account stats and milestones', () => {
  it('has a very small bonus for each milestone, and none before it is reached', () => {
    expect(milestoneBonuses({})).toEqual({ rarityBp: 0, partsBp: 0, offerBp: 0, xpBp: 0 });
    for (const m of RULES.expeditions.milestones) {
      expect(ACCOUNT_STATS as readonly string[]).toContain(m.stat);
      expect(m.bonus.bp, m.id).toBeLessThanOrEqual(200);
    }
    // Even with everything reached the total stays small: a few points.
    const all = Object.fromEntries(ACCOUNT_STATS.map((s) => [s, 1_000_000]));
    const b = milestoneBonuses(all);
    expect(b.rarityBp).toBeLessThanOrEqual(400);
    expect(b.partsBp).toBeLessThanOrEqual(300);
    expect(b.offerBp).toBeLessThanOrEqual(400);
    expect(b.xpBp).toBeLessThanOrEqual(500);
  });

  it('reaches a milestone exactly at its number', () => {
    const first = RULES.expeditions.milestones[0];
    if (first === undefined) throw new Error('no milestones');
    const below = milestoneProgress({ [first.stat]: first.at - 1 }).find((m) => m.id === first.id);
    const at = milestoneProgress({ [first.stat]: first.at }).find((m) => m.id === first.id);
    expect(below?.reached).toBe(false);
    expect(at?.reached).toBe(true);
    expect(milestoneBonuses({ [first.stat]: first.at })[`${first.bonus.kind}Bp`]).toBe(
      first.bonus.bp,
    );
  });

  it('has an XP and rolls rule for crafting supplies by tier', () => {
    const basic = supply('lure-basic');
    const great = supply('lure-great');
    expect(supplyJobXp(basic)).toBe(basic.blueprint.hours * RULES.gear.skill.xpPerHour);
    expect(supplyJobMs(basic, 1)).toBe(basic.blueprint.hours * HOUR);
    expect(supplyJobMs(great, 10)).toBeLessThan(great.blueprint.hours * HOUR);
    expect(supplyJobMs(great, 10)).toBe(
      Math.floor(
        (great.blueprint.hours * HOUR * (BP - RULES.gear.skill.timeReductionBpPerLevel * 9)) / BP,
      ),
    );
  });
});
