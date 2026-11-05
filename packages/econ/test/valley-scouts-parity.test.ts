/**
 * Live parity for scouts (phase 5 step 2): what the server computes for a scout (`seatRates`, `settle` with seats and `pickSpecies` of
 * `@creatures/game`, wrapped by `apps/worker/src/valley-settle.ts` and `valley-finds.ts`) against the lab's hour by hour model
 * (`scouts.ts`), on the lab's own schedules and rules, seeded.
 *
 * Three groups:
 * - finds per scout-day by place profile: for each of the lab's six destinations, with and without kit, a second scout and mastery,
 *   the scrap and shards the lab's `collectSeat` credits for a full store equal the server's rate times the hours (they are expected
 *   values in both); the creature, blueprint and page counts the lab draws have the server's means (by many seeded draws);
 * - hours picked up, a day at a time: the pass (one game day at a time, the visits as events, the store collected at each visit)
 *   equals the lab's `accrueSeats` replayed hour by hour, for a daily, a weekend-off and a weekly player, and a weekly player's finds
 *   are about 41% of a daily player's (the plan's number);
 * - kinds owned by day 28: the server's draws (Poisson counts, the weighted species pick, the seat counts the lab's player had each
 *   week) leave a daily player with a number of kinds inside the lab's 10th to 90th percentile over seeded lab runs.
 */
import {
  VALLEY_RULES,
  createSeededRng,
  pickSpecies,
  placeProfile,
  poissonDraw,
  seatRates,
  settle,
  type FindableSpecies,
  type SettleEvent,
  type SettleSeat,
  type SettleState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { awayShare } from '../src/curves';
import { profileById } from '../src/profiles';
import { RULES, type KitName, type Rules } from '../src/rules';
import { accrueSeats, collectSeat } from '../src/scouts';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import { R, HOURS_PER_WEEK } from '../src/types';
import {
  buildSchedule,
  createPlayer,
  createServer,
  speciesAvailable,
  speciesElements,
  speciesRarities,
} from '../src/world';

const H = 3_600_000;
const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!config) throw new Error('no mixed8 server');
/** The lab with fit switched off or fully on, so the average fit share of its set-and-forget player is not in the way. */
const withFit = (share: number): Rules => ({
  ...RULES,
  posts: { ...RULES.posts, fitShare: { setAndForget: share, optimiser: share } },
});
const world = { night: false, festival: false, special: null } as const;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** A lab player with seats at `dest` (a second one when `second`), the store full, the kit set, for `collectSeat`. */
function labSeat(
  rules: Rules,
  seed: number,
  dest: number,
  options: { kit: KitName | null; second: boolean; mastery: number; hours: number },
) {
  const p = createPlayer(rules, 'parity', seed, 0, profileById('daily'), 4);
  const server = createServer('parity', seed, config, rules);
  p.scoutKit = options.kit;
  const seats = [];
  if (options.second) seats.push({ dest, store: 0, wasted: 0, mastery: 0 });
  seats.push({ dest, store: options.hours, wasted: 0, mastery: options.mastery });
  p.seats = seats;
  collectSeat(p, seats.length - 1, server, 0);
  return p;
}

describe('finds per scout-day by place profile', () => {
  const places = RULES.scouts.destinations;
  const combos: { kit: KitName | null; second: boolean; mastery: number; fit: boolean }[] = [
    { kit: null, second: false, mastery: 0, fit: false },
    { kit: 'satchel', second: false, mastery: 60, fit: true },
    { kit: 'lure', second: true, mastery: 200, fit: false },
    { kit: 'lantern', second: false, mastery: 600, fit: true },
  ];

  for (const [index, place] of places.entries()) {
    it(`gives the lab's scrap and shards at ${place.id} (${place.rich})`, () => {
      for (const combo of combos) {
        const hours = 72;
        // The draws are switched off in the lab here: a duplicate creature or blueprint pays scrap of its own, which is not the rate.
        const quiet = withFit(combo.fit ? 1 : 0);
        const p = labSeat(
          {
            ...quiet,
            scouts: {
              ...quiet.scouts,
              perHour: {
                ...quiet.scouts.perHour,
                creatures: 0,
                gear: 0,
                blueprints: 0,
                pages: 0,
                rareFinds: 0,
              },
            },
          },
          1,
          index,
          { ...combo, hours },
        );
        const rates = seatRates(VALLEY_RULES, {
          place: placeProfile(VALLEY_RULES, place.id)!,
          fit: combo.fit,
          masteryHours: combo.mastery,
          kit:
            combo.kit === 'lure' || combo.kit === 'lantern' || combo.kit === 'satchel'
              ? combo.kit
              : null,
          second: combo.second,
          world,
        });
        const label = `${place.id} ${JSON.stringify(combo)}`;
        expect(p.stock[R.scrap], `scrap ${label}`).toBeCloseTo(hours * rates.scrap, 6);
        expect(sum(p.shards), `shards ${label}`).toBeCloseTo(hours * rates.shards, 6);
      }
    });
  }

  it('draws creatures, blueprints and pages with the server means (seeded draws, a lure at the creature place and a lantern at the rare one)', () => {
    const trials = 1500;
    const cases = [
      { dest: 'verdant-hollow', kit: 'lure' as const },
      { dest: 'storm-ridge', kit: 'lantern' as const },
    ];
    for (const c of cases) {
      const index = places.findIndex((d) => d.id === c.dest);
      let arrivals = 0;
      let blueprints = 0;
      let pages = 0;
      for (let seed = 0; seed < trials; seed++) {
        const p = labSeat(withFit(0), seed, index, {
          kit: c.kit,
          second: false,
          mastery: 0,
          hours: 72,
        });
        arrivals += p.wk.arrivals;
        blueprints += p.wk.blueprints;
        pages += p.wk.pages;
      }
      const rates = seatRates(VALLEY_RULES, {
        place: placeProfile(VALLEY_RULES, c.dest)!,
        fit: false,
        masteryHours: 0,
        kit: c.kit,
        second: false,
        world,
      });
      // The lab's blueprint finds count the new ones only (a known one found again is scrap): the pool is 30 and the player holds 1.
      const newShare = 1 - 1 / RULES.scouts.blueprintPool;
      expect(arrivals / trials, `${c.dest} creatures`).toBeGreaterThan(72 * rates.creatures * 0.93);
      expect(arrivals / trials, `${c.dest} creatures`).toBeLessThan(72 * rates.creatures * 1.07);
      expect(blueprints / trials, `${c.dest} blueprints`).toBeGreaterThan(
        72 * rates.blueprints * newShare * 0.85,
      );
      expect(blueprints / trials, `${c.dest} blueprints`).toBeLessThan(
        72 * rates.blueprints * 1.15,
      );
      expect(pages / trials, `${c.dest} pages`).toBeGreaterThan(72 * rates.pages * 0.85);
      expect(pages / trials, `${c.dest} pages`).toBeLessThan(72 * rates.pages * 1.15);
    }
  });
});

describe('hours picked up, a day at a time', () => {
  const WEEKS = 5;
  const day = (n: number): number => n * 24 * H;

  /** The lab's own hour: the visit comes first (the store comes home), then the hour accrues at the share counted from the last visit. */
  function labCollected(visitAt: Uint8Array): number[] {
    const p = createPlayer(RULES, 'parity', 1, 0, profileById('daily'), WEEKS);
    p.seats = [{ dest: 0, store: 0, wasted: 0, mastery: 0 }];
    const out: number[] = [];
    let lastVisit = 0;
    let collected = 0;
    for (let h = 0; h < visitAt.length; h++) {
      if (visitAt[h] === 1 || h === 0) {
        collected += p.seats[0]!.store;
        p.seats[0]!.store = 0;
        lastVisit = h;
      }
      accrueSeats(p, awayShare(RULES, 'B', h - lastVisit), 1);
      if ((h + 1) % 24 === 0) out.push(collected + p.seats[0]!.store);
    }
    return out;
  }

  /** The pass, one game day at a time, the visits as events, the store collected at each visit (as the server does at an arrival). */
  function passCollected(visitAt: Uint8Array): number[] {
    const visits: number[] = [0];
    visitAt.forEach((flag, hour) => {
      if (flag === 1 && hour > 0) visits.push(hour * H);
    });
    const seat: SettleSeat = {
      id: 's',
      creature: 0,
      destination: 'tidepools',
      kit: null,
      fit: false,
      second: false,
      storeHours: 0,
      scrap: 0,
      scrapCarry: 0,
      shards: 0,
      shardCarry: 0,
    };
    let state: SettleState = {
      settledAt: 0,
      lastVisitAt: 0,
      hearth: 1,
      creatures: [{ xp: 0, carry: 0, capXp: Infinity, scoutHours: 0 }],
      seats: [seat],
    };
    const events: SettleEvent[] = visits.map((at) => ({ at, kind: 'visit' as const }));
    const out: number[] = [];
    let collected = 0;
    for (let d = 0; d < WEEKS * 7; d++) {
      const stops = visits.filter((at) => at > day(d) && at <= day(d + 1));
      for (const to of [...stops, day(d + 1)]) {
        if (to <= state.settledAt) continue;
        state = settle(state, state.settledAt, to, events);
        if (visits.includes(to) && state.seats) {
          collected += state.seats[0]!.storeHours;
          state = { ...state, seats: [{ ...state.seats[0]!, storeHours: 0 }] };
        }
      }
      out.push(collected + (state.seats?.[0]?.storeHours ?? 0));
    }
    return out;
  }

  const totals: Record<string, number> = {};
  for (const profile of ['daily', 'weekend-off', 'weekly']) {
    it(`picks up what the lab's scout picks up, for a ${profile} player`, () => {
      const index = config.players.findIndex((p) => p.profile === profile);
      const visitAt = buildSchedule(profileById(profile), index, WEEKS);
      const lab = labCollected(visitAt);
      const pass = passCollected(visitAt);
      for (let d = 0; d < WEEKS * 7; d++)
        expect(pass[d], `${profile} day ${d + 1}`).toBeCloseTo(lab[d] ?? NaN, 6);
      totals[profile] = pass.at(-1) ?? 0;
      expect(totals[profile]).toBeGreaterThan(0);
    });
  }

  it("shows a weekly player's finds at about 41% of a daily player's", () => {
    const ratio = (totals['weekly'] ?? 0) / (totals['daily'] ?? 1);
    expect(ratio).toBeGreaterThan(0.38);
    expect(ratio).toBeLessThan(0.44);
    // A weekend off costs next to nothing: the pack of three days holds the weekend.
    expect((totals['weekend-off'] ?? 0) / (totals['daily'] ?? 1)).toBeGreaterThan(0.93);
  });
});

describe('kinds owned by day 28', () => {
  const SEEDS = 20;
  const WEEKS = 4;
  const index = config.players.findIndex((p) => p.profile === 'daily');
  const quantile = (xs: number[], q: number): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 1e-9))] ?? 0;
  };

  it("leaves a daily player with a number of kinds inside the lab's 10th to 90th percentile", () => {
    const labKinds: number[] = [];
    const seatsByWeek: number[][] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const run = runServer({ ...config, weeks: WEEKS }, seed, RULES);
      const weeks = run.players[index]?.weeks ?? [];
      labKinds.push(weeks[WEEKS - 1]?.species ?? NaN);
      seatsByWeek.push(weeks.map((w) => w.scoutSeats));
    }
    const lo = quantile(labKinds, 0.1);
    const hi = quantile(labKinds, 0.9);

    // The server's side: the lab's lines as findable species, the seats the lab's player had each week, one visit each evening.
    const elements = speciesElements(RULES);
    const rarities = speciesRarities(RULES);
    const destinations = RULES.scouts.destinations;
    const visitAt = buildSchedule(profileById('daily'), index, WEEKS);
    const kinds: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rng = createSeededRng(`kinds|${seed}`);
      const owned = new Set<number>();
      // Three starters: common lines of the launch pool, as the lab joins its players.
      for (const [line, r] of rarities.slice(0, RULES.scouts.species.start).entries()) {
        if (owned.size >= RULES.acorns.starterCreatures) break;
        if (r === 0) owned.add(line);
      }
      const seatsAt = (week: number): number => {
        const counts = seatsByWeek.map((s) => s[week] ?? 1).sort((a, b) => a - b);
        return counts[Math.floor(counts.length / 2)] ?? 1;
      };
      const seat = (id: number): SettleSeat => ({
        id: `s${id}`,
        creature: 0,
        destination: destinations[id % destinations.length]!.id,
        kit: null,
        fit: false,
        second: false,
        storeHours: 0,
        scrap: 0,
        scrapCarry: 0,
        shards: 0,
        shardCarry: 0,
      });
      let state: SettleState = {
        settledAt: 0,
        lastVisitAt: 0,
        hearth: 1,
        creatures: [{ xp: 0, carry: 0, capXp: Infinity, scoutHours: 0 }],
        seats: [seat(0)],
      };
      const visits: number[] = [];
      visitAt.forEach((flag, hour) => {
        if (flag === 1) visits.push(hour);
      });
      for (const hour of visits) {
        const to = hour * H;
        if (to <= state.settledAt) continue;
        // Seats grow with the weeks (the lab buys them with Acorns): a new one starts empty.
        const want = seatsAt(Math.floor(hour / HOURS_PER_WEEK));
        const current = state.seats ?? [];
        const seats = [...current];
        for (let id = seats.length; id < want; id++) seats.push(seat(id));
        state = settle({ ...state, seats }, state.settledAt, to, [{ at: to, kind: 'visit' }]);
        const available = speciesAvailable(RULES, hour);
        const candidates: FindableSpecies[] = Array.from({ length: available }, (_, line) => ({
          id: String(line),
          element: (['tide', 'ember', 'grove', 'spark', 'mire'] as const)[elements[line] ?? 0]!,
          rarity: (rarities[line] ?? 0) as 0 | 1 | 2,
          owned: owned.has(line),
          resident: false,
        }));
        // The same fit share the lab's set-and-forget player has: a third of the posts match.
        for (const stretch of state.stretches ?? []) {
          const fitScale = 1 + RULES.posts.fitBonus * RULES.posts.fitShare.setAndForget;
          const arrivals = poissonDraw(rng, stretch.hours * stretch.rates.creatures * fitScale);
          for (let n = 0; n < arrivals; n++) {
            const pick = pickSpecies(rng, VALLEY_RULES, candidates, stretch.place, {
              lure: false,
              special: null,
            });
            owned.add(pick);
            const c = candidates[pick];
            if (c !== undefined) candidates[pick] = { ...c, owned: true };
          }
        }
        // The store comes home at the visit.
        state = {
          ...state,
          seats: (state.seats ?? []).map((s) => ({ ...s, storeHours: 0 })),
        };
      }
      kinds.push(owned.size);
    }
    const median = quantile(kinds, 0.5);
    expect(lo, 'lab p10').toBeGreaterThan(RULES.acorns.starterCreatures);
    expect(
      median,
      `server median ${String(median)} against the lab's ${String(lo)}..${String(hi)}`,
    ).toBeGreaterThanOrEqual(lo);
    expect(
      median,
      `server median ${String(median)} against the lab's ${String(lo)}..${String(hi)}`,
    ).toBeLessThanOrEqual(hi);
  }, 120_000);
});
