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
  rankGiftsBetween,
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
  tripRolls,
  tripXp,
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
          // Every other roll is the pity's "new species" roll (the owned lines are empty either way).
          const roll = rollSure(
            rng,
            ctx({
              destination: d,
              length: 'long',
              stars,
              pity: { sinceNew: i % 2 === 0 ? RULES.catching.pity.newAfter : 0, sinceCreature: 0 },
            }),
          );
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
    // XP and the loot chances rise with the length too.
    for (let i = 1; i < EXPEDITION_LENGTHS.length; i++) {
      const a = lengthRules(EXPEDITION_LENGTHS[i - 1] as ExpeditionLength);
      const b = lengthRules(EXPEDITION_LENGTHS[i] as ExpeditionLength);
      expect(b.xp / (b.ms / HOUR)).toBeGreaterThan(a.xp / (a.ms / HOUR));
      expect(b.loot.scrap).toBeGreaterThanOrEqual(a.loot.scrap);
      expect(b.loot.blueprintBp).toBeGreaterThan(a.loot.blueprintBp);
    }
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

  it('gives XP that grows with the length, with the bonuses on top', () => {
    expect(tripXp('short', [])).toBe(lengthRules('short').xp);
    expect(tripXp('day', [])).toBeGreaterThan(tripXp('long', []));
    expect(tripXp('long', [{ source: 'trip', name: 'Milestones', bp: 5_000 }])).toBe(
      Math.floor(lengthRules('long').xp * 1.5),
    );
  });

  it('multiplies the bonuses: a milestone of +50% and a gear line of +20% make x1.8, not x1.7', () => {
    const parts: XpBoostPart[] = [
      { source: 'trip', name: 'Milestones', bp: 5_000 },
      { source: 'gear', name: 'Trail XP', bp: 2_000 },
    ];
    expect(tripXp('long', parts)).toBe(Math.floor((lengthRules('long').xp * 18_000) / 10_000));
    expect(tripXp('long', parts)).toBeGreaterThan(
      Math.floor((lengthRules('long').xp * 17_000) / 10_000),
    );
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

  it('adds the map scrap share of the rolls (at least one) and the twist extra', () => {
    const base = lengthRules('long').rolls;
    expect(tripRolls('long', [], null)).toBe(base);
    for (const tier of SUPPLY_TIERS) {
      const s = supply(`map-scrap-${tier}`);
      if (s.kind !== 'map-scrap') throw new Error('not a map scrap');
      expect(tripRolls('long', [s], null)).toBe(
        base + Math.max(1, Math.floor((base * s.rollsBp) / BP)),
      );
    }
    expect(tripRolls('short', [], { kind: 'rolls', extra: 2 })).toBe(
      lengthRules('short').rolls + 2,
    );
    expect(tripRolls('short', [], { kind: 'parts', bp: 5_000 })).toBe(lengthRules('short').rolls);
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
    expect(lureEffect([])).toEqual({ catchBp: 0, newBp: 0 });
    const basic = lureEffect([supply('lure-basic')]);
    const good = lureEffect([supply('lure-good')]);
    const great = lureEffect([supply('lure-great')]);
    expect(basic.catchBp).toBeGreaterThan(0);
    expect(good.catchBp).toBeGreaterThan(basic.catchBp);
    expect(great.catchBp).toBeGreaterThan(good.catchBp);
    expect(good.newBp).toBeGreaterThan(basic.newBp);
    expect(great.newBp).toBeGreaterThan(good.newBp);
    // Only lures count; the other supplies change nothing here.
    expect(lureEffect([supply('map-scrap-great'), supply('satchel-great')])).toEqual({
      catchBp: 0,
      newBp: 0,
    });
    // The trip length's own chance, plus the lure's, at most a sure thing.
    for (const length of EXPEDITION_LENGTHS) {
      expect(catchChanceBp(length, [])).toBe(lengthRules(length).catchBp);
      expect(catchChanceBp(length, [supply('lure-great')])).toBe(
        Math.min(BP, lengthRules(length).catchBp + great.catchBp),
      );
    }
    expect(catchChanceBp('day', [SURE])).toBe(BP);
    // Longer trips bring a creature more often than short ones.
    expect(lengthRules('short').catchBp).toBeLessThan(lengthRules('medium').catchBp);
    expect(lengthRules('medium').catchBp).toBeLessThan(lengthRules('long').catchBp);
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
    const out = rollTripCatches(rng, 6, ctx({ destination: dest('old-crossroads') }));
    expect(out.results).toHaveLength(6);
    const owned = new Set<string>();
    let streak = 0;
    for (const r of out.results) {
      expect(r.duplicate).toBe(owned.has(r.species.line));
      streak = r.duplicate ? streak + 1 : 0;
      owned.add(r.species.line);
    }
    expect(out.dupeStreak).toBe(streak);
    expect(() => rollTripCatches(rng, -1, ctx())).toThrow(RangeError);
    expect(rollTripCatches(rng, 0, ctx()).results).toEqual([]);
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
      expect(Math.abs(rate([], length) - catchChanceBp(length, []))).toBeLessThan(300);
    }
    expect(rate([supply('lure-great')], 'short')).toBeGreaterThan(rate([], 'short') + 1_000);
    const out = rollTripCatches(createSeededRng('empties'), 40, {
      ...ctx(),
      kit: [],
      destination: dest('old-crossroads'),
    });
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
    length: 'long' as ExpeditionLength,
    shardElement: 'tide' as const,
    role: 'payoff' as const,
    kit: [] as SupplyDef[],
    stars: 0,
    milestonePartsBp: 0,
    twist: null,
    rank: 1,
  };
  const done = { completed: true, caught: 1, rolls: 1 };

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
    // A day trip at rank 1: the supply find chance is 4500 basis points, with Packer +50% it is 6750.
    const found = (gearSupplyBp: number): number => {
      let n = 0;
      for (let i = 0; i < 4_000; i++) {
        const loot = rollTripLoot(
          createSeededRng(`packer-${String(i)}`),
          { ...base, length: 'day', gearSupplyBp },
          done,
        );
        n += loot.supplies.length;
      }
      return n / 4_000;
    };
    const chance = lengthRules('day').loot.supplyBp / 10_000;
    expect(found(0)).toBeGreaterThan(chance - 0.04);
    expect(found(0)).toBeLessThan(chance + 0.04);
    expect(found(5_000)).toBeGreaterThan(chance * 1.5 - 0.04);
    expect(found(5_000)).toBeLessThan(chance * 1.5 + 0.04);
    // The same seed finds a supply with Packer whenever it found one without.
    expect(
      rollTripLoot(createSeededRng('same'), { ...base, length: 'day', gearSupplyBp: 5_000 }, done)
        .parts,
    ).toEqual(rollTripLoot(createSeededRng('same'), { ...base, length: 'day' }, done).parts);
  });

  it('pays scrap by length, and a recall only the share that was caught', () => {
    for (const length of EXPEDITION_LENGTHS) {
      const loot = rollTripLoot(createSeededRng('scrap'), { ...base, length }, done);
      expect(loot.parts.scrap ?? 0).toBe(lengthRules(length).loot.scrap);
    }
    const recall = rollTripLoot(scripted([]), base, { completed: false, caught: 1, rolls: 4 });
    const share = Math.floor(lengthRules('long').loot.scrap / 4);
    expect(recall).toEqual({
      parts: share > 0 ? { scrap: share } : {},
      blueprint: null,
      supplies: [],
    });
    expect(
      rollTripLoot(scripted([]), base, { completed: false, caught: 0, rolls: 4 }).parts,
    ).toEqual({});
  });

  it('draws a fixed number of times for a finished trip, and always a shard of the place’s element on a sure chance', () => {
    const rng = scripted([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const loot = rollTripLoot(rng, { ...base, length: 'day' }, done);
    // Day trips give a good chance of a shard (the scripted draw is a hit).
    expect(loot.parts['tide-shard']).toBe(1);
    expect(loot.parts.glimmer).toBe(1);
    expect(loot.blueprint).not.toBeNull();
    expect(loot.supplies).toEqual(['map-scrap-basic']);
    // Five chances, then the blueprint (a set piece or an ordinary base, then which one).
    expect(rng.drawn()).toBe(7);
  });

  it('brings more for a Guard, a satchel, stars, milestones and a twist', () => {
    // Parts (scrap and shards) over many trips of the longest length, the same seeds for every variant.
    const total = (extra: Partial<Parameters<typeof rollTripLoot>[1]>): number => {
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const parts = rollTripLoot(
          createSeededRng(`p${String(i)}`),
          { ...base, length: 'day', ...extra },
          done,
        ).parts;
        sum += (parts.scrap ?? 0) + (parts['tide-shard'] ?? 0);
      }
      return sum;
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

  it('pays a small find of scrap for every roll that brought no creature, and nothing for a recall', () => {
    for (const length of EXPEDITION_LENGTHS) {
      const plain = rollTripLoot(createSeededRng('find'), { ...base, length }, done);
      const finds = rollTripLoot(createSeededRng('find'), { ...base, length, emptyRolls: 3 }, done);
      expect((finds.parts.scrap ?? 0) - (plain.parts.scrap ?? 0)).toBe(
        3 * lengthRules(length).findScrap,
      );
    }
    const recall = rollTripLoot(
      scripted([]),
      { ...base, emptyRolls: 3 },
      { completed: false, caught: 1, rolls: 4 },
    );
    expect(recall.parts.scrap ?? 0).toBe(Math.floor(lengthRules('long').loot.scrap / 4));
    // It does not use any draw: the same seed gives the same shards and glimmer.
    const a = rollTripLoot(createSeededRng('same-draws'), { ...base, length: 'day' }, done);
    const b = rollTripLoot(
      createSeededRng('same-draws'),
      { ...base, length: 'day', emptyRolls: 5 },
      done,
    );
    expect({ ...b.parts, scrap: 0 }).toEqual({ ...a.parts, scrap: 0 });
  });

  it('grows the chance of a glimmer with the explorer’s glimmer-finding talents', () => {
    const found = (gearGlimmerBp: number): number => {
      let n = 0;
      for (let i = 0; i < 6_000; i++) {
        const loot = rollTripLoot(
          createSeededRng(`glim-${String(i)}`),
          { ...base, length: 'day', gearGlimmerBp },
          done,
        );
        n += loot.parts.glimmer ?? 0;
      }
      return n;
    };
    expect(found(5_000)).toBeGreaterThan(found(0));
    expect(found(0)).toBeGreaterThan(6_000 * 0.06);
  });

  it('values a catch roll by its chance, with the scrap find when it brings nothing', () => {
    const odds = RULES.expeditions.defaultOddsBp;
    for (const length of EXPEDITION_LENGTHS) {
      const worth = catchRollWorth(length, odds);
      expect(worth).toBeGreaterThan(0);
      expect(worth).toBeLessThan(
        rollWorth(odds) * 1.0 + lengthRules(length).findScrap * RULES.expeditions.worth.scrap,
      );
    }
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

  it('chances a page by the length, more with a twist', () => {
    const chances = EXPEDITION_LENGTHS.map((l) => journalChanceBp(l, null));
    expect([...chances].sort((a, b) => a - b)).toEqual(chances);
    expect(journalChanceBp('short', { kind: 'journal', bp: 10_000 })).toBe(chances[0]! * 2);
    expect(journalChanceBp('day', { kind: 'journal', bp: 30_000 })).toBeLessThanOrEqual(BP);
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
