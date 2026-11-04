/** The journey on the game's raid rules: seats follow the piece, the lock sets the HP, replacements come from the player's own spares. */
import { describe, expect, it } from 'vitest';
import { RULES } from '@creatures/game';
import { partyBossOf, wideBoss, type Placement } from '@creatures/engine/v2';
import {
  HABITS,
  HABITS_FIRST_KNACK,
  REPLACE_CHANCE,
  finaleActions,
  withTalentPolicy,
  type Habits,
} from '../src/habits';
import { FORM_KNACKS } from '../src/knacks';
import { talentSlotsAt } from '../src/roster';
import { LINE_POOLS, lineOfForm } from '../src/talents';
import {
  JOURNEY_SERVERS,
  LIVE10,
  NEW_PLAYER_JOIN_WEEK,
  coverageServer,
  journeyOf,
  journeyWeekend,
  playJourneyWeekend,
  presentIn,
  seatsOf,
  smallParty,
} from '../src/journey';
import { DEDICATED, MIXED } from '../src/path';
import { TRACK_ORDER, slotBoss } from '../src/track';

const slotOf = (bossId: string): number => TRACK_ORDER.indexOf(bossId) + 1;

describe('the seats of a piece', () => {
  it('each player brings as many creatures as the piece has seats (Storm Sovereign 2, Cinder Wyrm 4)', () => {
    for (const [boss, seats] of [
      ['storm-sovereign', 2],
      ['cinder-wyrm', 4],
      ['tidal-colossus', 3],
    ] as const) {
      const slot = slotOf(boss);
      expect(seatsOf(slot)).toBe(seats);
      const w = journeyWeekend(DEDICATED, slot, 12, 'expected', 'seats');
      expect(w.seats).toBe(seats);
      expect(w.players).toHaveLength(4);
      for (const p of w.players) {
        expect(p.team).toHaveLength(seats);
        expect(p.team.map((c) => c.row)).toEqual(Array.from({ length: seats }, (_, r) => r));
        expect(p.team.every((c) => c.owner === p.owner)).toBe(true);
      }
    }
  });

  it('the spares are the ranks after the seats, in rank order, and the owner’s own', () => {
    const w = journeyWeekend(DEDICATED, slotOf('cinder-wyrm'), 16, 'expected', 'spares');
    for (const p of w.players) {
      expect(p.spares.length).toBeGreaterThan(0);
      expect(p.spares.every((s) => s.owner === p.owner)).toBe(true);
      // Next-strongest first: the spares step in in the order of the roster's ranks, so their levels never rise.
      const levels = p.spares.map((s) => s.level);
      expect(levels).toEqual([...levels].sort((a, b) => b - a));
    }
  });
});

describe('the stage 1 lock', () => {
  it('the weekend HP is the boss widened for the players at stage 1', () => {
    const server = coverageServer(8);
    const slot = slotOf('tidal-colossus');
    const base = slotBoss(slot);
    const before = journeyWeekend(server, slot, NEW_PLAYER_JOIN_WEEK - 1, 'expected', 'lock');
    const after = journeyWeekend(server, slot, NEW_PLAYER_JOIN_WEEK, 'expected', 'lock');
    expect(before.party).toBe(7);
    expect(after.party).toBe(8);
    expect(before.boss.hp).toBe(wideBoss(base, 7).hp);
    expect(after.boss.hp).toBe(wideBoss(base, 8).hp);
    expect(after.boss.hp).toBeGreaterThan(before.boss.hp);
    expect(after.boss.cols).toBe(8);
  });

  it('four players fight the slot’s own boss, and every stage starts from the HP the last left', () => {
    const slot = slotOf('tidal-colossus');
    const w = journeyWeekend(DEDICATED, slot, 8, 'slow', 'lock4');
    expect(w.boss.hp).toBe(slotBoss(slot).hp);
    const r = playJourneyWeekend(w, 'lock4');
    expect(r.stages.length).toBeGreaterThan(0);
    let left = w.boss.hp;
    for (const s of r.stages) {
      expect(s.bossHpLeft).toBeLessThanOrEqual(left);
      left = s.bossHpLeft;
    }
  });
});

describe('replacements from the player’s own spares', () => {
  // A hard boss at an early week for a slow server: creatures fall.
  const w = journeyWeekend(DEDICATED, slotOf('thornmother'), 4, 'slow', 'replace');
  const r = playJourneyWeekend(w, 'replace');

  it('a weekend with knockouts brings spares, each owner’s own, each once, in order', () => {
    expect(r.replacements).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const stage of r.stages)
      for (const f of stage.fighters) {
        const m = /^(p\d+):spare(\d+)$/.exec(f.uid);
        if (!m || seen.has(f.uid)) continue;
        expect(f.owner).toBe(m[1]);
        // The spare steps in once, at the next number for its owner; later stages it fights on as the same creature.
        expect(Number(m[2])).toBe([...seen].filter((k) => k.startsWith(`${m[1]}:`)).length);
        seen.add(f.uid);
      }
    expect(seen.size).toBe(r.replacements);
  });

  it('nobody who was knocked out fights again, and no player brings more than their seats', () => {
    const out = new Set<string>();
    for (const stage of r.stages) {
      const perOwner = new Map<string, number>();
      for (const f of stage.fighters) {
        expect(out.has(f.uid)).toBe(false);
        perOwner.set(f.owner, (perOwner.get(f.owner) ?? 0) + 1);
      }
      for (const n of perOwner.values()) expect(n).toBeLessThanOrEqual(w.seats);
      for (const f of stage.fighters) if (f.hp <= 0) out.add(f.uid);
    }
  });

  it('a creature keeps the Knack and talents it fought with', () => {
    const first = new Map<string, { knack: unknown; talents: readonly string[] }>();
    for (const stage of r.stages)
      for (const f of stage.fighters) {
        const was = first.get(f.uid);
        if (was) {
          expect(f.knack).toBe(was.knack);
          expect(f.talents).toEqual(was.talents);
        } else first.set(f.uid, { knack: f.knack, talents: f.talents });
      }
    expect(first.size).toBeGreaterThan(w.seats);
  });
});

describe('the servers', () => {
  it('a new player is not there before their week', () => {
    const s = coverageServer(5);
    expect(presentIn(s, 1).players).toHaveLength(4);
    expect(presentIn(s, NEW_PLAYER_JOIN_WEEK).players).toHaveLength(5);
    expect(JOURNEY_SERVERS.map((x) => x.id)).toEqual([
      'dedicated',
      'mixed',
      'builders',
      'mixed5',
      'mixed8',
      'mixed15',
      'small1',
      'small2',
      'small3',
      'live10',
    ]);
    expect(
      [coverageServer(5), coverageServer(8), coverageServer(15)].map((x) => x.players.length),
    ).toEqual([5, 8, 15]);
    expect([1, 2, 3].map((n) => smallParty(n as 1 | 2 | 3).players.length)).toEqual([1, 2, 3]);
  });

  it('a path on the game’s rules is a whole 24-week walk and the same for the same seed', () => {
    const a = journeyOf(MIXED, 'expected', 0, undefined, { determination: 'off' });
    const b = journeyOf(MIXED, 'expected', 0, undefined, { determination: 'off' });
    expect(a).toEqual(b);
    expect(a.fought).toHaveLength(24);
    expect(a.reached[0]).toBe(1);
  });
});

describe('player habits', () => {
  const hard = () => journeyWeekend(DEDICATED, slotOf('thornmother'), 4, 'slow', 'replace');
  const withChance = (w: ReturnType<typeof hard>, replaceChance: number) => ({
    ...w,
    players: w.players.map((p) => ({ ...p, replaceChance })),
  });

  it('weekly players replace less than daily players, by roster kind', () => {
    const server = coverageServer(8);
    const slot = slotOf('thornmother');
    const w = journeyWeekend(server, slot, 8, 'expected', 'kinds', undefined, {}, HABITS);
    const chance = (kind: string) =>
      w.players.filter((p) => p.roster === kind).map((p) => p.replaceChance);
    expect(new Set(chance('daily'))).toEqual(new Set([REPLACE_CHANCE.daily]));
    expect(new Set(chance('weekly'))).toEqual(new Set([REPLACE_CHANCE.weekly]));
    expect(REPLACE_CHANCE.weekly).toBeLessThan(REPLACE_CHANCE.daily);
    // Step 1's players all replace.
    const one = journeyWeekend(server, slot, 8, 'expected', 'kinds');
    expect(one.players.every((p) => p.replaceChance === 1)).toBe(true);
  });

  it('a chance of 0 never replaces, 1 always when there is a spare, and a chance in between is seeded', () => {
    const w = hard();
    const never = playJourneyWeekend(withChance(w, 0), 'replace');
    const always = playJourneyWeekend(withChance(w, 1), 'replace');
    expect(never.replacements).toBe(0);
    expect(always.replacements).toBeGreaterThan(0);
    expect(playJourneyWeekend(withChance(w, 1), 'replace')).toEqual(always);
    const salts = [0, 1, 2, 3, 4, 5];
    const total = (c: number) =>
      salts
        .map((i) => playJourneyWeekend(withChance(w, c), `replace${i}`).replacements)
        .reduce((a, b) => a + b, 0);
    expect(total(0.3)).toBe(total(0.3));
    expect(total(0.3)).toBeLessThan(total(1));
    expect(total(0.3)).toBeGreaterThanOrEqual(total(0));
  });

  it('talents are drawn from the creature’s line pool, within its slots, golden among them', () => {
    const slot = slotOf('tidal-colossus');
    const w = journeyWeekend(MIXED, slot, 20, 'expected', 'pools', undefined, {}, HABITS);
    let rolled = 0;
    for (const p of w.players)
      for (const c of [...p.team, ...p.spares]) {
        const talents = c.talents ?? [];
        rolled += talents.length;
        expect(talents.length).toBeLessThanOrEqual(talentSlotsAt(c.level));
        for (const t of talents) expect(LINE_POOLS[lineOfForm(c.formId)]).toContain(t);
        expect(new Set(talents).size).toBe(talents.length);
        for (const g of c.goldenTalents ?? []) expect(talents).toContain(g);
      }
    expect(rolled).toBeGreaterThan(0);
  });

  it('golden talents are marked at the given chance and never at none', () => {
    const base: Placement = {
      owner: 'p1',
      formId: 'cindle',
      level: 25,
      knack: 'none',
      row: 0,
      col: 0,
    };
    const goldenCount = (golden: Habits['golden']) =>
      Array.from({ length: 600 }, (_, i) =>
        withTalentPolicy(base, 'pools', 1, golden, `g${i}`),
      ).filter((p) => (p.goldenTalents ?? []).length > 0).length;
    expect(goldenCount(null)).toBe(0);
    expect(goldenCount({ numerator: 0, denominator: 20 })).toBe(0);
    expect(goldenCount({ numerator: 20, denominator: 20 })).toBe(600);
    const share = goldenCount(RULES.talents.golden) / 600;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.09);
    // A creature keeps the talents it rolled as slots open.
    const one = withTalentPolicy(base, 'pools', 1, null, 'keep').talents ?? [];
    const three = withTalentPolicy(base, 'pools', 3, null, 'keep').talents ?? [];
    expect(three.slice(0, 1)).toEqual(one);
  });

  it('casual players stand in random rows and the Knack policy is explicit per role', () => {
    const server = coverageServer(8);
    const slot = slotOf('tidal-colossus');
    const plain = journeyWeekend(server, slot, 10, 'expected', 'rows');
    const habit = journeyWeekend(server, slot, 10, 'expected', 'rows', undefined, {}, HABITS);
    const forms = (w: typeof plain, i: number) => (w.players[i]?.team ?? []).map((c) => c.formId);
    let moved = 0;
    server.players.forEach((p, i) => {
      if (p.role !== 'casual') expect(forms(habit, i)).toEqual(forms(plain, i));
      else if (forms(habit, i).join() !== forms(plain, i).join()) moved++;
      expect([...forms(habit, i)].sort()).toEqual([...forms(plain, i)].sort());
    });
    expect(moved).toBeGreaterThan(0);
    const first = journeyWeekend(
      server,
      slot,
      10,
      'expected',
      'rows',
      undefined,
      {},
      HABITS_FIRST_KNACK,
    );
    server.players.forEach((p, i) => {
      for (const c of habit.players[i]?.team ?? [])
        if (p.role === 'casual') expect(c.knack).toBe('none');
      for (const c of first.players[i]?.team ?? [])
        if (p.role === 'casual') expect(c.knack).toBe(FORM_KNACKS[c.formId]?.[0] ?? 'none');
    });
  });

  it('the finale plays each player’s ability at its default round, dealt rally, shield wall, purge in turn', () => {
    const acts = finaleActions(
      Array.from({ length: 4 }, () => ({ kind: 'auto' }) as const),
      8,
      (i) => `p${i + 1}`,
    );
    expect(acts.map((a) => a.kind)).toEqual(['rally', 'shieldWall', 'purge', 'rally']);
    expect(acts.every((a) => a.round >= 1 && a.round <= 8)).toBe(true);
    expect(acts.find((a) => a.kind === 'shieldWall')?.row).toBe(0);
    expect(finaleActions([{ kind: 'none' }], 8, () => 'p1')).toEqual([]);
    expect(finaleActions([{ kind: 'fixed', ability: 'purge' }], 8, () => 'p1')[0]?.kind).toBe(
      'purge',
    );
    // In a weekend that reaches stage 3 the actions are the stage's inputs; with no policy there are none.
    const w = hard();
    const auto = playJourneyWeekend(
      { ...w, players: w.players.map((p) => ({ ...p, finale: { kind: 'auto' } as const })) },
      'finale',
    );
    expect(auto.stages).toHaveLength(3);
    expect(auto.finale.map((a) => a.by)).toEqual(w.players.map((p) => p.owner));
    expect(playJourneyWeekend(w, 'finale').finale).toEqual([]);
  });
});

describe("Misa's live server", () => {
  it('is ten players: 3 try-hard (prepared, daily), 3 daily (builders), 4 semi-weekly (casual, weekly)', () => {
    const count = (role: string, roster: string) =>
      LIVE10.players.filter((p) => p.role === role && p.roster === roster).length;
    expect(LIVE10.players).toHaveLength(10);
    expect(count('prepared', 'daily')).toBe(3);
    expect(count('builder', 'daily')).toBe(3);
    expect(count('casual', 'weekly')).toBe(4);
    expect(LIVE10.players.every((p) => p.joinWeek === undefined)).toBe(true);
  });
});

describe('small parties', () => {
  it('a party of one to three fights a smaller boss than four players do', () => {
    const slot = slotOf('tidal-colossus');
    const four = journeyWeekend(DEDICATED, slot, 12, 'expected', 'small').boss;
    const hps = [1, 2, 3].map((n) => {
      const w = journeyWeekend(smallParty(n as 1 | 2 | 3), slot, 12, 'expected', 'small');
      expect(w.party).toBe(n);
      expect(w.boss.cols).toBe(n);
      expect(w.boss.atk).toBeLessThan(four.atk);
      return w.boss.hp;
    });
    expect(hps[0]).toBeLessThan(hps[1] as number);
    expect(hps[1]).toBeLessThan(hps[2] as number);
    expect(hps[2]).toBeLessThan(four.hp);
    expect(hps[0]).toBe(partyBossOf(slotBoss(slot), 1).hp);
    expect(hps[0]).toBe(Math.round(slotBoss(slot).hp / 4));
  });
});
