/**
 * Live parity for the commons (phase 5 step 6): the rules the server runs (`commons.ts` and `settle.ts` of `@creatures/game`: project
 * sizes by the active weight, the three parts, the guided start, the build days, the fire's warmth, communal seats) against the lab's
 * T-3 (the first level-up about day 7 on a server of 8), the fire by day 28 and the communal seats' share of progress.
 *
 * Method: the lab runs `mixed8` (seeded). The server's rules are then REPLAYED day by day from the lab's own inputs: the Acorns' worth
 * the lab's players gave each week (spread over its days, in the project's own proportions), the weight the lab measured each week, and
 * the communal seats' hours from the real pass (`settle` with a communal seat for each player on the profile's own visit schedule).
 * What is compared is what the commons rules make of those inputs: the day of the first level-up, the level-ups and the fire by day
 * 28, the build days between levels, and the share of progress the communal seats make.
 *
 * Never loosen a number here to make it pass: a miss is a finding for the lead.
 */
import {
  VALLEY_RULES,
  activeWeightOf,
  communalValue,
  fireLevelOf,
  fireStartMilli,
  mayOpenProject,
  partNeeds,
  projectDone,
  projectProgress,
  projectSize,
  settle,
  valueToUnits,
  warmthMilli,
  type SettleState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { activeWeight, openMarket, refreshProjects } from '../src/commons';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import { R } from '../src/types';
import { buildSchedule, createPlayer, createServer } from '../src/world';
import { profileById } from '../src/profiles';

const H = 3_600_000;
const DAY = 24 * H;
const SEEDS = [1, 2, 3];
const DAYS = 28;

const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!config) throw new Error('no mixed8 server');
const rules = VALLEY_RULES;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

interface Replay {
  firstLevelDay: number | null;
  levelUps: number;
  fire: number;
  /** Progress made by communal seats over progress made by communal seats and gifts, up to day 28. */
  communalShare: number;
  /** Build days between a finished level and the next project opening, in days. */
  buildDays: number[];
}

/** The server's commons rules, driven by the lab's own weekly inputs. */
function replay(seed: number): { lab: ReturnType<typeof runServer>; mine: Replay } {
  const lab = runServer({ ...config!, weeks: 4 }, seed, RULES);
  // What the lab's players gave, by part: the shards a server has to give are what bound its level-ups, so the replay keeps the lab's mix.
  const givenUnits = [R.acorns, R.scrap, R.shards].map((r) =>
    lab.players.reduce((n, p) => n + (p.sources[`out:${String(r)}:gifts`] ?? 0), 0),
  );
  const parts = ['acorns', 'scrap', 'shards'] as const;
  const worth = parts.map((part, k) => (givenUnits[k] ?? 0) * rules.commons.giftValue[part]);
  const worthTotal = Math.max(
    1e-9,
    worth.reduce((a, b) => a + b, 0),
  );
  const mix = worth.map((w) => w / worthTotal);
  // Per place: level, open project (size and parts), when it may open.
  // The mixed8 lab has no Market (a one-shot place the lab adds only in its "market" variant, tested in valley-market-parity).
  const places = rules.commons.places
    .filter((id) => rules.commons.oneShot[id] === undefined)
    .map((id) => ({
      id,
      level: 1,
      size: 0,
      have: { acorns: 0, scrap: 0, shards: 0 },
      opensAt: 0,
    }));
  const level = (id: string): number => places.find((p) => p.id === id)?.level ?? 1;
  let fireMilli = fireStartMilli(rules);
  const levelUps: number[] = [];
  const buildDays: number[] = [];
  let communal = 0;
  let gifted = 0;
  // The communal seats' hours per day, from the real pass: one seat for each player on their own visit schedule.
  const players = config!.players.map((p, i) => ({ profile: profileById(p.profile), id: i }));
  const communalHoursPerDay = (): number[] => {
    const perDay = new Array<number>(DAYS).fill(0);
    for (const p of players) {
      const visitAt = buildSchedule(p.profile, p.id, 5);
      const join = (p.profile.joinWeek - 1) * 7 * DAY;
      let state: SettleState = {
        settledAt: join,
        lastVisitAt: join,
        hearth: 1,
        creatures: [{ xp: 0, carry: 0, capXp: Infinity }],
        communal: [{ id: 'c', creature: 0, storeHours: 0 }],
      };
      for (let h = Math.floor(join / H) + 1; h <= DAYS * 24; h++) {
        if (visitAt[h] !== 1) continue;
        const to = h * H;
        state = settle(state, state.settledAt, to, [{ at: to, kind: 'visit' }]);
        const hours = state.communal?.[0]?.storeHours ?? 0;
        // Credited at the visit (the store empties).
        perDay[Math.min(DAYS - 1, Math.floor(h / 24))]! += hours;
        state = { ...state, communal: [{ id: 'c', creature: 0, storeHours: 0 }] };
      }
    }
    return perDay;
  };
  const hours = communalHoursPerDay();
  const total = (value: number, trickleValue: number, day: number): void => {
    // Each day: spread over the places that have an open project, by the lab's weights; one level per place per project.
    const now = day * DAY;
    const week = Math.min(lab.log.length, Math.floor(day / 7) + 1);
    const weight = lab.log[week - 1]?.weight ?? 1;
    for (const place of places) {
      if (place.size === 0 && place.opensAt <= now && mayOpenProject(rules, place.id, level)) {
        place.size = projectSize(rules, place.level, weight);
        place.have = { acorns: 0, scrap: 0, shards: 0 };
        if (place.opensAt > 0) buildDays.push((now - place.opensAt) / DAY);
      }
    }
    const open = places.filter((p) => p.size > 0);
    const wsum = open.reduce((n, p) => n + (rules.commons.placeWeights[p.id] ?? 1), 0);
    for (const place of open) {
      const share = ((rules.commons.placeWeights[place.id] ?? 1) / wsum) * value;
      const before = projectProgress(rules, place.size, place.have);
      const trickleShare = (trickleValue / Math.max(1e-9, value)) * share;
      const units = valueToUnits(rules, trickleShare);
      parts.forEach((part, k) => {
        units[part] += ((share - trickleShare) * (mix[k] ?? 0)) / rules.commons.giftValue[part];
      });
      for (const part of parts) {
        const room = Math.max(0, partNeeds(rules, place.size)[part] - place.have[part]);
        place.have[part] += Math.min(room, units[part]);
      }
      gifted += projectProgress(rules, place.size, place.have) - before;
      if (projectDone(rules, place.size, place.have)) {
        const cosmetic = place.level >= rules.commons.maxLevel;
        if (!cosmetic) place.level += 1;
        fireMilli += warmthMilli(
          rules,
          cosmetic ? 'cosmetic' : place.id === 'forge' ? 'forge' : 'place',
        );
        levelUps.push(now / DAY);
        place.size = 0;
        place.opensAt = now + rules.commons.buildHours * H;
      }
    }
  };
  for (let day = 0; day < DAYS; day++) {
    const week = Math.min(lab.log.length, Math.floor(day / 7) + 1);
    const weekGifts = lab.log[week - 1]?.gifts ?? 0;
    // The lab's gifts are net of its communal seats' work (those are in `communal`); the replay adds the communal value itself.
    const own = weekGifts / 7;
    const trickle = communalValue(rules, hours[day] ?? 0);
    communal += trickle;
    total(own + trickle, trickle, day);
  }
  const share = communal / Math.max(1e-9, communal + gifted);
  return {
    lab,
    mine: {
      firstLevelDay: levelUps[0] ?? null,
      levelUps: levelUps.length,
      fire: fireLevelOf(fireMilli),
      communalShare: share,
      buildDays,
    },
  };
}

const runs = SEEDS.map((seed) => replay(seed));
const labFirst = median(runs.map((r) => (r.lab.levelUps[0]?.hour ?? Infinity) / 24));
const labLevelUps = median(
  runs.map((r) => r.lab.levelUps.filter((u) => u.hour < DAYS * 24).length),
);
const labFire = median(runs.map((r) => r.lab.log[3]?.fire ?? 0));
const labShare = median(
  runs.map((r) => {
    const w = r.lab.log[3];
    return (w?.communal ?? 0) / Math.max(1e-9, (w?.communal ?? 0) + (w?.gifts ?? 0) * 4);
  }),
);

describe('the commons rules against the lab (mixed8, seeded)', () => {
  it('T-3: the first level-up is about day 7 in the lab, and in the server rules within 3 days of it', () => {
    expect(labFirst).toBeGreaterThanOrEqual(4);
    expect(labFirst).toBeLessThanOrEqual(10);
    const mine = median(runs.map((r) => r.mine.firstLevelDay ?? Infinity));
    expect(Math.abs(mine - labFirst)).toBeLessThanOrEqual(3);
  });

  it('level-ups by day 28 are within 2 of the lab (the replay runs ahead: it spreads shards over the open places, the lab gives them by element)', () => {
    const mine = median(runs.map((r) => r.mine.levelUps));
    expect(
      Math.abs(mine - labLevelUps),
      `level-ups: replay ${String(mine)}, lab ${String(labLevelUps)}`,
    ).toBeLessThanOrEqual(2);
  });

  it("the fire by day 28: the server's warmth steps on the lab's own level-ups and collections, plus what the lab's Masters and bosses add, reach the lab's fire", () => {
    for (const run of runs) {
      let milli = fireStartMilli(rules);
      for (const up of run.lab.levelUps.filter((u) => u.hour < DAYS * 24)) {
        milli += warmthMilli(rules, up.place === 'forge' ? 'forge' : 'place');
      }
      const week = run.lab.log[3]?.warmth ?? {};
      milli += Math.round((week['collections'] ?? 0) * 1000);
      const built = fireLevelOf(milli);
      // The Master titles and boss kills warm the lab's fire too; the server builds them with their systems (not in this step), so the
      // fire the server rules make from the rest is the lab's minus at most those two.
      const others = (week['masters'] ?? 0) + (week['bosses'] ?? 0);
      const labFireLevel = Math.floor((run.lab.log[3]?.fire ?? 0) + 1e-9);
      expect(built).toBeGreaterThanOrEqual(rules.fire.start);
      expect(built + Math.ceil(others)).toBeGreaterThanOrEqual(labFireLevel);
      expect(built).toBeLessThanOrEqual(labFireLevel);
    }
    expect(labFire).toBeGreaterThan(rules.fire.start);
    // The steps are the lab's warmth numbers.
    expect(warmthMilli(rules, 'place')).toBe(Math.round(RULES.fire.warmth.placeLevel * 1000));
    expect(warmthMilli(rules, 'forge')).toBe(Math.round(RULES.fire.warmth.forgeLevel * 1000));
    expect(warmthMilli(rules, 'collection')).toBe(Math.round(RULES.fire.warmth.collection * 1000));
    expect(warmthMilli(rules, 'cosmetic')).toBe(Math.round(RULES.fire.warmth.cosmetic * 1000));
  });

  it("communal seats' share of progress is within 10 points of the lab's", () => {
    const share = median(runs.map((r) => r.mine.communalShare));
    expect(share).toBeGreaterThan(0);
    expect(Math.abs(share - labShare)).toBeLessThanOrEqual(0.1);
  });

  it("a level builds for the lab's three days before the next project opens", () => {
    for (const run of runs) {
      for (const days of run.mine.buildDays) expect(days).toBeLessThan(1.0001 + 0);
    }
    expect(rules.commons.buildHours).toBe(72);
  });
});

describe('the pure rules agree with the lab', () => {
  it("a player's active weight is the lab's for each count of visit days", () => {
    for (const visitDays of [0, 1, 2, 3, 4, 5, 7]) {
      const p = createPlayer(RULES, 'x', 1, 0, profileById('daily'), 2);
      p.visitDays = [0, 0, 0, 0, 0, 0, 0].map((_, i) => (i < visitDays ? 1 : 0));
      p.joinHour = 0;
      expect(activeWeightOf(rules, visitDays, 7)).toBeCloseTo(activeWeight(RULES, p, 24 * 7), 9);
    }
    // A player who has just joined counts fully.
    expect(activeWeightOf(rules, 0, 0)).toBe(1);
  });

  it('a project is sized as the lab sizes it, level by level and weight by weight', () => {
    const expected = (level: number, weight: number): number => {
      const c = RULES.commons;
      const factor =
        level >= c.maxLevel
          ? c.cosmeticFactor
          : (c.levelFactor[level - 1] ?? c.levelFactor.at(-1) ?? 1);
      return (
        c.baseSize * factor * Math.pow(Math.max(weight, 1) / c.referenceWeight, c.sizeExponent)
      );
    };
    for (const level of [1, 2, 3, 4, 5]) {
      for (const weight of [1, 4, 8, 12]) {
        expect(projectSize(rules, level, weight)).toBeCloseTo(expected(level, weight), 6);
      }
    }
  });

  it('the guided start (Q48) opens the hearth, then the Market alone, then the Forge, then the rest: the lab opens what the server rule opens', () => {
    const config = ALL_SERVERS.find((x) => x.id === 'mixed8-market')!;
    // Each state: the levels of the hearth, the Forge and the rest; whether the Market is built.
    const states = [
      { bonfire: 1, forge: 1, rest: 1, built: false },
      { bonfire: 2, forge: 1, rest: 1, built: false },
      { bonfire: 2, forge: 1, rest: 1, built: true },
      { bonfire: 2, forge: 2, rest: 1, built: true },
      { bonfire: 1, forge: 1, rest: 1, built: true },
    ];
    const expected = [
      ['bonfire'],
      ['bonfire', 'market'],
      ['bonfire', 'forge'],
      ['bonfire', 'forge', 'signpost', 'paddock', 'school'],
      ['bonfire'],
    ];
    states.forEach((st, k) => {
      const server = createServer('guided', 1, { ...config }, RULES);
      for (const place of server.places)
        place.level =
          place.id === 'bonfire' ? st.bonfire : place.id === 'forge' ? st.forge : st.rest;
      if (st.built) {
        openMarket(server, 0);
        server.marketDoneHour = 0;
        server.places.at(-1)!.opensAt = Infinity;
      }
      refreshProjects(server, 1000, RULES);
      const labOpen = server.places.filter((p) => p.open).map((p) => p.id);
      const level = (id: string): number =>
        id === 'market' ? (st.built ? 2 : 1) : (server.places.find((p) => p.id === id)?.level ?? 1);
      const ruleOpen = rules.commons.places.filter((id) => mayOpenProject(rules, id, level));
      expect(labOpen.sort()).toEqual(expected[k]!.slice().sort());
      expect(ruleOpen.sort()).toEqual(labOpen);
    });
  });
});
