import { describe, expect, it } from 'vitest';
import {
  PART_KINDS,
  RULES,
  content,
  craftCost,
  createSeededRng,
  droppableBases,
  rollGear,
  type CreatureSpecies,
} from '@creatures/game';
import { speciesOf, type OwnedCreature, type SimItem } from '../src/data';
import { runEconomy, type DayInfo, type EconomyObserver } from '../src/economy';
import {
  JourneyRecorder,
  WaitTracker,
  bindingLimit,
  gearLimit,
  milestoneCatalogue,
  powerSplit,
  reachedMilestones,
} from '../src/journey';
import { PRESETS, type PlayerProfile } from '../src/profiles';
import { createPlayer, type SimPlayer } from '../src/state';

function owned(player: string, line: string, level: number, speciesId = line): OwnedCreature {
  return { id: `${player}/${line}`, line, speciesId, level, fusionCount: 0 };
}

/** A player holding three stage-1 creatures at the given levels. */
function stageOne(levels: [number, number, number], profile?: PlayerProfile): SimPlayer {
  const p = createPlayer('p01', 'P', 'daily', 1, profile);
  p.joined = true;
  p.creatures.push(
    owned('p01', 'cindle', levels[0]),
    owned('p01', 'sproutle', levels[1]),
    owned('p01', 'splashet', levels[2]),
  );
  return p;
}

/** A player holding three stage-2 creatures at their level cap. */
function finalStage(): SimPlayer {
  const p = createPlayer('p01', 'P', 'daily', 1);
  p.joined = true;
  const seen = new Set<string>();
  const stage2: CreatureSpecies[] = content.creatures.filter(
    (s) => s.stage === 2 && !seen.has(s.line) && seen.add(s.line),
  );
  for (const s of stage2.slice(0, 3)) {
    p.creatures.push(owned('p01', s.line, s.levelCap, s.id));
  }
  return p;
}

function item(): SimItem {
  const base = droppableBases()[0];
  if (base === undefined) throw new Error('no gear bases');
  return {
    uid: 1,
    baseId: base.id,
    rarity: 'common',
    level: 0,
    rolls: rollGear(createSeededRng('item'), base.id, 'common'),
    enchantId: null,
    improves: 0,
  };
}

describe('the binding limit', () => {
  it('the evolution level of every starter species is its stage-1 cap (the walls the tests build)', () => {
    for (const line of ['cindle', 'sproutle', 'splashet']) {
      const s = speciesOf(line);
      expect(s.evolvesTo?.level).toBe(s.levelCap);
    }
  });

  it('Bait to train: a trainable team and not enough Bait', () => {
    const p = stageOne([10, 10, 10]);
    p.bait = 0;
    expect(bindingLimit(p, 10)).toMatchObject({
      primary: 'bait_to_train',
      blocked: ['bait_to_train'],
    });
  });

  it('next check-in: the Bait is there but not spent yet', () => {
    const p = stageOne([10, 10, 10]);
    p.bait = 10_000;
    expect(bindingLimit(p, 10).primary).toBe('next_check_in');
  });

  it('Essence to evolve: a team creature at its evolution level, the rest still trainable', () => {
    const p = stageOne([15, 10, 10]);
    p.bait = 0;
    p.essence = 0;
    const limit = bindingLimit(p, 10);
    expect(limit.primary).toBe('essence_to_evolve');
    expect(limit.blocked).toContain('essence_to_evolve');
  });

  it('level cap waiting on evolution: every team creature is held at the stage-1 cap', () => {
    const p = stageOne([15, 15, 15]);
    p.essence = RULES.fusion.maxFusions; // a few Essence, not the 20 an evolution costs
    expect(bindingLimit(p, 15).primary).toBe('level_cap_waiting_evolution');
    // With the Essence in hand the evolution is only waiting for the next check-in.
    p.essence = 1000;
    expect(bindingLimit(p, 15).primary).toBe('next_check_in');
  });

  it('nothing worth buying: the whole team at the final cap, fusion not maxed, no gear to work on', () => {
    const p = finalStage();
    expect(p.creatures).toHaveLength(3);
    p.bait = 500;
    p.essence = 500;
    expect(bindingLimit(p, 30)).toMatchObject({ primary: 'nothing_worth_buying', gear: null });
  });

  it('max fusion: the same team, fully fused', () => {
    const p = finalStage();
    for (const c of p.creatures) c.fusionCount = RULES.fusion.maxFusions;
    expect(bindingLimit(p, 30).primary).toBe('max_fusion');
  });

  it('scrap, then Essence, for a gear upgrade', () => {
    const p = finalStage();
    const worn = p.creatures[0] as OwnedCreature;
    worn.item = item();
    p.essence = 1000;
    p.gear.parts.scrap = 0;
    expect(gearLimit(p)).toBe('scrap_for_gear');
    expect(bindingLimit(p, 30)).toMatchObject({
      primary: 'scrap_for_gear',
      gear: 'scrap_for_gear',
    });
    p.gear.parts.scrap = 1000;
    p.essence = 0;
    expect(gearLimit(p)).toBe('essence_for_gear');
    expect(bindingLimit(p, 30).primary).toBe('essence_for_gear');
    p.essence = 1000;
    expect(gearLimit(p)).toBeNull(); // affordable: the next check-in upgrades it
  });

  it('a craft timer when a job is running and nothing is worn', () => {
    const p = finalStage();
    p.gear.jobs.push({
      kind: 'craft',
      creatureId: (p.creatures[0] as OwnedCreature).id,
      rarity: 'common',
      endsAtHour: 1_000,
      baseId: 'x',
    });
    expect(bindingLimit(p, 30).primary).toBe('craft_timer');
  });

  it('glimmer, then shards, for a craft the player knows a blueprint for', () => {
    const p = finalStage();
    const epic = droppableBases().find((b) => b.blueprint === 'epic' && craftCost(b.id).glimmer);
    if (epic === undefined) throw new Error('no epic base that needs glimmer');
    p.gear.blueprints.push(epic.id);
    p.gear.parts.scrap = 1_000;
    for (const kind of PART_KINDS) if (kind.endsWith('-shard')) p.gear.parts[kind] = 1_000;
    p.gear.parts.glimmer = 0;
    expect(gearLimit(p)).toBe('glimmer_for_craft');
    p.gear.parts.glimmer = 100;
    for (const kind of PART_KINDS) if (kind.endsWith('-shard')) p.gear.parts[kind] = 0;
    // The base may be neutral (no shard); with a shard cost this is the shards' turn.
    const needsShard = Object.keys(craftCost(epic.id)).some((k) => k.endsWith('-shard'));
    expect(gearLimit(p)).toBe(needsShard ? 'shards_for_craft' : null);
    p.gear.parts.scrap = 0;
    expect(gearLimit(p)).toBe('scrap_for_gear');
  });

  it('a player who never works the gear is not held back by it', () => {
    const p = finalStage();
    p.profile = PRESETS['drop-in'];
    (p.creatures[0] as OwnedCreature).item = item();
    p.gear.parts.scrap = 0;
    expect(gearLimit(p)).toBeNull();
  });

  it('full expedition slots are listed as blocked but do not become the binding limit', () => {
    const p = stageOne([10, 10, 10]);
    p.bait = 0;
    p.expeditions.push({
      explorerId: 'p01/cindle',
      length: 'short',
      destination: 'x',
      kit: [],
      rolls: 1,
      twist: null,
      startHour: 0,
      endsAtHour: 10,
    });
    const limit = bindingLimit(p, 10);
    expect(limit.primary).toBe('bait_to_train');
    expect(limit.blocked).toContain('expedition_slots_full');
  });
});

describe('waits', () => {
  it('a Bait wait is the stretch between two trainings; other limits run until they change', () => {
    const t = new WaitTracker();
    t.step(1, 'bait_to_train', null, true, false); // trained: progress
    t.step(2, 'bait_to_train', null, false, false); // wait begins
    t.step(3, 'bait_to_train', null, false, false);
    t.step(4, 'bait_to_train', null, true, false); // trained again: wait over
    t.step(5, 'essence_to_evolve', null, false, false);
    t.step(6, 'next_check_in', null, false, false); // not a wait: the Essence wait carries on
    t.step(7, 'essence_to_evolve', null, true, false);
    t.step(8, 'level_cap_waiting_evolution', null, false, false);
    expect(t.waits).toEqual([
      { cause: 'bait_to_train', start: 2, length: 2, track: 'growth' },
      { cause: 'essence_to_evolve', start: 5, length: 3, track: 'growth' },
      { cause: 'level_cap_waiting_evolution', start: 8, length: 1, track: 'growth' },
    ]);
  });

  it('the gear path has its own waits, ended by any upgrade or craft', () => {
    const t = new WaitTracker();
    t.step(1, 'bait_to_train', 'scrap_for_gear', false, false);
    t.step(2, 'bait_to_train', 'scrap_for_gear', false, false);
    t.step(3, 'bait_to_train', 'scrap_for_gear', false, true); // upgraded today
    t.step(4, 'bait_to_train', 'essence_for_gear', false, false);
    t.step(5, 'bait_to_train', null, false, false);
    const gear = t.waits.filter((w) => w.track === 'gear');
    expect(gear).toEqual([
      { cause: 'scrap_for_gear', start: 1, length: 2, track: 'gear' },
      { cause: 'essence_for_gear', start: 4, length: 1, track: 'gear' },
    ]);
  });
});

describe('power split', () => {
  it('the parts and the first-stage base add up to the team power exactly', () => {
    const p = finalStage();
    for (const [k, c] of p.creatures.entries()) {
      c.level = 12 + 5 * k;
      c.fusionCount = k;
    }
    (p.creatures[0] as OwnedCreature).item = item();
    const split = powerSplit(p.creatures);
    expect(split.total).toBeGreaterThan(split.base);
    expect(split.levels).toBeGreaterThan(0);
    expect(split.evolution).toBeGreaterThan(0);
    expect(split.fusion).toBeGreaterThan(0);
    expect(split.gear).toBeGreaterThan(0);
    expect(split.base + split.levels + split.fusion + split.evolution + split.gear).toBeCloseTo(
      split.total,
      9,
    );
  });

  it('a fresh team has everything in its base', () => {
    const p = stageOne([1, 1, 1]);
    const split = powerSplit(p.creatures);
    expect(split.total).toBe(split.base);
    expect(split.levels + split.fusion + split.evolution + split.gear).toBeCloseTo(0, 9);
  });

  it('levels alone are the only part when nothing else grew', () => {
    const p = stageOne([10, 10, 10]);
    const split = powerSplit(p.creatures);
    expect(split.levels).toBeGreaterThan(0);
    expect(split.fusion).toBe(0);
    expect(split.evolution).toBe(0);
    expect(split.gear).toBe(0);
  });
});

describe('milestones', () => {
  it('detects them from a hand-made state', () => {
    const p = finalStage();
    p.creatures[0] = { ...(p.creatures[0] as OwnedCreature), fusionCount: 3 };
    p.creatures[1] = {
      ...(p.creatures[1] as OwnedCreature),
      item: { ...item(), rarity: 'epic', level: 5 },
    };
    p.dungeon.depth = 15; // cleared 14: past depth 10 and the first two landmarks
    p.slotDays = [3, null, null, null];
    p.jackpots = 1;
    const got = reachedMilestones(p);
    for (const id of [
      'first_evolution',
      'fusion_1',
      'fusion_2',
      'fusion_3',
      'level_10',
      'level_30',
      'species_cap_30',
      'gear_epic',
      'gear_plus5',
      'dungeon_depth_5',
      'dungeon_depth_10',
      'dungeon_landmark_7',
      'dungeon_landmark_14',
      'expedition_slot_2',
      'first_jackpot',
    ]) {
      expect(got, id).toContain(id);
    }
    for (const id of ['fusion_4', 'dungeon_depth_15', 'expedition_slot_3', 'gear_rare']) {
      expect(got, id).not.toContain(id);
    }
    // Every id it can name is in the catalogue.
    const catalogue = new Set(milestoneCatalogue());
    for (const id of got) expect(catalogue.has(id), id).toBe(true);
  });

  it('a new player has caught only the starter', () => {
    const p = createPlayer('p01', 'P', 'daily', 1);
    p.creatures.push(owned('p01', 'cindle', 1));
    const got = reachedMilestones(p);
    expect(got).not.toContain('first_evolution');
    expect(got).not.toContain('level_10');
    expect(got.some((id) => id.startsWith('catch_'))).toBe(true);
  });
});

describe('the recorder', () => {
  const roster = [PRESETS['min-maxer'], PRESETS.engaged, PRESETS.regular, PRESETS['drop-in']].map(
    (profile) => ({ profile }),
  );
  const options = { seed: 'journey-test', weeks: 3, roster, snapshotWeeks: [] };

  it('records one day per player per day, with consistent numbers', () => {
    const recorder = new JourneyRecorder();
    runEconomy({ ...options, income: 'allowance', observer: recorder });
    expect(recorder.journeys).toHaveLength(4);
    for (const j of recorder.journeys) {
      expect(j.days).toHaveLength(21);
      expect(j.days.map((d) => d.day)).toEqual(Array.from({ length: 21 }, (_, k) => k + 1));
      for (const d of j.days) {
        expect(d.bait).toBeGreaterThanOrEqual(0);
        expect(d.essence).toBeGreaterThanOrEqual(0);
        expect(d.scrap).toBeGreaterThanOrEqual(0);
        expect(d.power).toBeGreaterThan(0);
        expect(d.base + d.levels + d.fusion + d.evolution + d.gear).toBeCloseTo(d.power, 6);
        expect(d.blocked).toContain(d.limit);
        expect(d.week).toBe(Math.ceil(d.day / 7));
      }
      for (const day of Object.values(j.milestones)) {
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(21);
      }
      // Power never falls (a team only gets stronger).
      for (let k = 1; k < j.days.length; k++) {
        expect((j.days[k] as { power: number }).power).toBeGreaterThanOrEqual(
          (j.days[k - 1] as { power: number }).power - 1e-9,
        );
      }
      for (const w of j.waits) {
        expect(w.length).toBeGreaterThanOrEqual(1);
        expect(w.start + w.length - 1).toBeLessThanOrEqual(21);
      }
    }
    // The min-maxer checks in more often than the drop-in, and is ahead.
    const [mm, , , drop] = recorder.journeys;
    expect(Math.max(...(mm?.days ?? []).map((d) => d.checkIns))).toBeGreaterThan(
      Math.max(...(drop?.days ?? []).map((d) => d.checkIns)),
    );
    expect(mm?.days.at(-1)?.power).toBeGreaterThan(drop?.days.at(-1)?.power ?? 0);
  });

  it('scores the team in fights on the last day of each week, next to the old power', () => {
    const play = () => {
      const recorder = new JourneyRecorder();
      runEconomy({ ...options, income: 'allowance', observer: recorder });
      return recorder.journeys;
    };
    const journeys = play();
    for (const j of journeys) {
      for (const [k, d] of j.days.entries()) {
        if ((k + 1) % 7 === 0) {
          expect(d.fightPower).toBeGreaterThan(0);
          expect(d.fightSurvivalBp).toBeGreaterThanOrEqual(0);
          expect(d.fightSurvivalBp).toBeLessThanOrEqual(10_000);
          expect(d.power).toBeGreaterThan(0);
        } else {
          expect(d.fightPower).toBeNull();
          expect(d.fightSurvivalBp).toBeNull();
        }
      }
    }
    // Deterministic: the same run scores the same.
    expect(play().map((j) => j.days.map((d) => d.fightPower))).toEqual(
      journeys.map((j) => j.days.map((d) => d.fightPower)),
    );
    // The min-maxer is ahead of the drop-in in fights too.
    const [mm, , , drop] = journeys;
    expect(mm?.days.at(-1)?.fightPower).toBeGreaterThan(drop?.days.at(-1)?.fightPower ?? 0);
  });

  it('watching changes nothing: the economy plays the same with and without the recorder', () => {
    const plain = runEconomy({ ...options, income: 'allowance' });
    const watched = runEconomy({
      ...options,
      income: 'allowance',
      observer: new JourneyRecorder(),
    });
    expect(JSON.stringify(watched)).toBe(JSON.stringify(plain));
  });

  it('is reproducible from the seed', () => {
    const run = (): string => {
      const recorder = new JourneyRecorder();
      runEconomy({ ...options, income: 'allowance', observer: recorder });
      return JSON.stringify(recorder.journeys);
    };
    expect(run()).toBe(run());
  });

  it('notes the raid milestones on the day of the raid', () => {
    const recorder = new JourneyRecorder();
    runEconomy({
      seed: 'raid-days',
      weeks: 4,
      roster: [PRESETS.engaged, PRESETS.engaged, PRESETS.engaged].map((profile) => ({ profile })),
      snapshotWeeks: [],
      observer: recorder,
    });
    for (const j of recorder.journeys) {
      const day = j.milestones['raid_stage_cleared'];
      if (day === undefined) continue;
      // Friday, Saturday or Sunday of some week: day 5, 6 or 7 of a week.
      expect([5, 6, 0]).toContain(day % 7);
      const won = j.milestones['raid_finale_won'];
      if (won !== undefined) expect(won % 7).toBe(0);
    }
  });
});

/** What the profile dials do to a player's week, seen through the observer. */
describe('profile habits', () => {
  function watch(profile: PlayerProfile, weeks: number): DayInfo[] {
    const days: DayInfo[] = [];
    const observer: EconomyObserver = {
      onDayEnd: (info) => {
        days.push({
          ...info,
          loggedIn: new Set(info.loggedIn),
          leeted: new Set(info.leeted),
          checkIns: new Map(info.checkIns),
        });
      },
    };
    runEconomy({
      seed: 'habits',
      weeks,
      roster: [{ profile }],
      snapshotWeeks: [],
      observer,
      dungeon: false,
    });
    return days;
  }
  const base = PRESETS.regular;

  it('login days, leet days and check-ins follow the dials; a leet is always a login', () => {
    const days = watch({ ...base, loginDays: 3, leetDays: 1, checkInHours: [6, 12, 18] }, 6);
    expect(days).toHaveLength(42);
    for (let w = 0; w < 6; w++) {
      const week = days.slice(7 * w, 7 * w + 7);
      expect(week.filter((d) => d.loggedIn.has('p01')).length).toBe(3);
      expect(week.filter((d) => d.leeted.has('p01')).length).toBe(1);
      for (const d of week) {
        if (d.leeted.has('p01')) expect(d.loggedIn.has('p01')).toBe(true);
        expect(d.checkIns.get('p01') ?? 0).toBe(d.loggedIn.has('p01') ? 3 : 0);
      }
    }
  });

  it('fractional day counts average out over many weeks', () => {
    const days = watch({ ...base, loginDays: 4.5, leetDays: 2.25 }, 60);
    const logins = days.filter((d) => d.loggedIn.has('p01')).length / 60;
    const leets = days.filter((d) => d.leeted.has('p01')).length / 60;
    expect(logins).toBeGreaterThan(4.2);
    expect(logins).toBeLessThan(4.8);
    expect(leets).toBeGreaterThan(1.9);
    expect(leets).toBeLessThan(2.6);
  });

  it('the raid-day bias moves logins to Friday to Sunday', () => {
    const count = (bias: number): number => {
      const days = watch({ ...base, loginDays: 1, leetDays: 0, raidDayBias: bias }, 40);
      return days.filter((d) => d.dayOfWeek >= 4 && d.loggedIn.has('p01')).length;
    };
    expect(count(100)).toBe(40);
    expect(count(0)).toBeLessThan(30);
  });

  it('a player who cannot open the game cannot sign up when the profile needs a login', () => {
    const signedUp = (profile: PlayerProfile): boolean[] => {
      const result = runEconomy({
        seed: 'signup',
        weeks: 4,
        roster: [{ profile }],
        snapshotWeeks: [],
      });
      return (result.players[0]?.weeks ?? []).map((w) => w.signedUp);
    };
    const away = { ...base, loginDays: 0, leetDays: 0, signUpPercent: 100 };
    expect(signedUp({ ...away, signUpNeedsLogin: true })).toEqual([false, false, false, false]);
    expect(signedUp({ ...away, signUpNeedsLogin: false })).toEqual([true, true, true, true]);
  });
});

describe('profile decisions', () => {
  const weeks = (profile: PlayerProfile, n = 4) =>
    runEconomy({
      seed: 'decisions',
      weeks: n,
      roster: [{ profile }, { profile: PRESETS.engaged }, { profile: PRESETS.engaged }],
      snapshotWeeks: [],
    }).players[0]?.weeks ?? [];
  const engaged = { ...PRESETS.engaged, id: 'test', label: 'Test' };

  it('no Bait goes to supplies: they are not for sale, and training takes what is spent', () => {
    for (const w of weeks(engaged)) {
      expect(w).not.toHaveProperty('baitSpentExpeditions');
      expect(w.baitSpentTraining).toBeGreaterThanOrEqual(0);
    }
  });

  it('no trips are sent with an uptime of 0', () => {
    expect(weeks({ ...engaged, tripPercent: 0 }).at(-1)?.trips).toBe(0);
    expect(weeks({ ...engaged, tripPercent: 100 }).at(-1)?.trips).toBeGreaterThan(0);
  });

  it('a player who never crafts spends no Essence on gear and crafts nothing', () => {
    const never = weeks({ ...engaged, craftPercent: 0 }, 6);
    expect(never.every((w) => w.essenceSpentGear === 0)).toBe(true);
    expect(never.at(-1)?.crafted).toBe(0);
    const always = weeks({ ...engaged, craftPercent: 100 }, 6);
    expect(always.some((w) => w.essenceSpentGear > 0) || (always.at(-1)?.crafted ?? 0) > 0).toBe(
      true,
    );
  });
});
