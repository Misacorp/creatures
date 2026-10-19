import { describe, expect, it } from 'vitest';
import {
  RULES,
  addExperience,
  content,
  creatureXpParts,
  createSeededRng,
  expToNext,
  raidExperience,
  ribbonParts,
  treatCost,
  tripExperience,
  workshopExperience,
} from '@creatures/game';
import { speciesOf, type OwnedCreature } from '../src/data';
import { PRESETS, type PlayerProfile } from '../src/profiles';
import { openRaidWeek, playStage } from '../src/raid';
import { createPlayer, type SimPlayer } from '../src/state';
import {
  awardRaidExperience,
  buyRibbons,
  canGrow,
  creatureTrips,
  focusFirst,
  focusSet,
  giveExperience,
  packTreat,
  ribbonReserve,
  ribbonShardsWanted,
  ribbonsOf,
} from '../src/training';

const LINES = ['splashet', 'cindle', 'sproutle', 'zipmouse', 'stormray', 'mistnewt', 'ashmole'];

function make(
  levels: number[],
  profile: Partial<PlayerProfile> = {},
  extra: Partial<OwnedCreature> = {},
): SimPlayer {
  const p = createPlayer('p01', 'P', 'daily', 1, { ...PRESETS.engaged, ...profile });
  p.joined = true;
  for (const [k, level] of levels.entries()) {
    const line = LINES[k] as string;
    // A first stage caps at level 15: above it the creature has evolved.
    const evolvesTo = speciesOf(line).evolvesTo?.species;
    const speciesId = level > 15 && evolvesTo !== undefined ? evolvesTo : line;
    p.creatures.push({
      id: `p01/${line}`,
      line,
      speciesId,
      level,
      fusionCount: 0,
      exp: 0,
      ribbons: level > 10 ? (level > 20 ? 2 : 1) : 0,
      ...extra,
    });
  }
  return p;
}

const at = (p: SimPlayer, i: number): OwnedCreature => p.creatures[i] as OwnedCreature;

describe('giving experience', () => {
  it('levels a creature up by the game curve, keeps the rest and counts what it was for', () => {
    const p = make([1]);
    const c = at(p, 0);
    const g = giveExperience(p, c, expToNext(1) + expToNext(2) + 7, 'trip');
    expect(g.levelsGained).toBe(2);
    expect(c).toMatchObject({ level: 3, exp: 7 });
    expect(p.week.levelUps).toBe(2);
    expect(p.stats.exp_trip).toBe(expToNext(1) + expToNext(2) + 7);
    // A gain with no source (a ribbon or an evolution spending the bank) counts no experience earned.
    giveExperience(p, c, 0, null);
    expect(p.stats.exp_trip).toBe(expToNext(1) + expToNext(2) + 7);
  });

  it('stops at level 10 until the ribbon and banks at most the next level', () => {
    const p = make([9]);
    const c = at(p, 0);
    giveExperience(p, c, 100_000, 'dungeon');
    expect(c).toMatchObject({ level: 10, exp: expToNext(10) });
    expect(canGrow(c)).toBe(false);
    expect(p.stats.exp_dungeon).toBe(100_000);
  });

  it('treats a creature a test made without ribbons as holding the ones its level is past', () => {
    const c: OwnedCreature = {
      id: 'x',
      line: 'cindle',
      speciesId: 'cindle',
      level: 14,
      fusionCount: 0,
    };
    expect(ribbonsOf(c)).toBe(1);
    const p = make([]);
    giveExperience(p, c, expToNext(14), 'raid');
    expect(c.level).toBe(15);
  });

  it('a first stage waits at its cap and levels on once it evolves', () => {
    const p = make([14]);
    const c = at(p, 0);
    giveExperience(p, c, 1_000_000, 'trip');
    expect(speciesOf(c.speciesId).levelCap).toBe(15);
    expect(c).toMatchObject({ level: 15, exp: expToNext(15) });
    c.speciesId = speciesOf(c.speciesId).evolvesTo?.species ?? c.speciesId;
    giveExperience(p, c, 0, null);
    expect(c.level).toBe(16);
  });
});

describe('who can still grow, and the training focus', () => {
  it('a creature can grow until it stands at a closed gate with a full bank, or at the top', () => {
    const p = make([10, 10, 30, 5]);
    at(p, 0).exp = expToNext(10) - 1;
    at(p, 1).exp = expToNext(10);
    expect(canGrow(at(p, 0))).toBe(true);
    expect(canGrow(at(p, 1))).toBe(false);
    expect(canGrow(at(p, 2))).toBe(false);
    expect(canGrow(at(p, 3))).toBe(true);
  });

  it('focus 3 is the strongest three that can still grow; spread has no plan', () => {
    const p = make([9, 8, 7, 6, 5, 4], { trainFocus: 3, evolutionPush: false });
    expect(focusSet(p).size).toBe(3);
    // The one that is stalled drops out of the focus and the next takes its place.
    const strongest = [...p.creatures].sort((a, b) => b.level - a.level)[0] as OwnedCreature;
    const before = focusSet(p);
    expect(before.has(strongest.id)).toBe(true);
    strongest.level = 10;
    strongest.exp = expToNext(10);
    strongest.ribbons = 0;
    const after = focusSet(p);
    expect(after.has(strongest.id)).toBe(false);
    expect(after.size).toBe(3);
    expect(focusSet(make([9, 8, 7], { trainFocus: 'spread' })).size).toBe(0);
  });

  it('focus 6 reaches further down than focus 3', () => {
    const levels = [10, 9, 8, 7, 6, 5, 4];
    const three = focusSet(make(levels, { trainFocus: 3, evolutionPush: false }));
    const six = focusSet(make(levels, { trainFocus: 6, evolutionPush: false }));
    expect([...three].every((id) => six.has(id))).toBe(true);
    expect(six.size).toBe(Math.min(6, levels.length));
  });

  it('the evolution push puts a creature working towards its evolution in the focus', () => {
    // Coralynx has no evolution; the three Cindle-like ones are stage 1.
    const p = make([12, 11, 11, 3], { trainFocus: 3, evolutionPush: true });
    const focus = focusSet(p);
    expect(focus.size).toBe(3);
  });

  it('focusFirst sends the focus first and leaves the order inside each part alone; spread keeps the order', () => {
    const p = make([10, 9, 8, 7, 6, 1], { trainFocus: 3, evolutionPush: false });
    const order = [5, 4, 3, 2, 1, 0].map((i) => at(p, i));
    const sorted = focusFirst(p, order);
    const focus = focusSet(p);
    const firstThree = sorted.slice(0, 3);
    expect(firstThree.every((c) => focus.has(c.id))).toBe(true);
    expect(sorted.slice(3).every((c) => !focus.has(c.id))).toBe(true);
    // Inside each part the incoming order holds.
    expect(firstThree.map((c) => c.id)).toEqual(
      order.filter((c) => focus.has(c.id)).map((c) => c.id),
    );
    const spread = make([10, 9, 8], { trainFocus: 'spread' });
    const list = [...spread.creatures].reverse();
    expect(focusFirst(spread, list)).toBe(list);
  });
});

describe('treats', () => {
  const long = { kind: 'trip', hours: 12 } as const;
  const short = { kind: 'trip', hours: 2 } as const;

  it('are never packed under the none policy', () => {
    const p = make([5], { treats: 'none', trainFocus: 3 });
    p.bait = 1000;
    expect(packTreat(p, at(p, 0), long)).toBe(false);
    expect(p.bait).toBe(1000);
  });

  it('cost 3 + half the level, taken now, and count', () => {
    const p = make([9], { treats: 'all', trainFocus: 3 });
    p.bait = 100;
    expect(packTreat(p, at(p, 0), long)).toBe(true);
    expect(p.bait).toBe(100 - treatCost(9));
    expect(p.week.baitTreats).toBe(treatCost(9));
    expect(p.stats.treats).toBe(1);
  });

  it('need the Bait: a short purse packs nothing and takes nothing', () => {
    const p = make([9], { treats: 'all', trainFocus: 3 });
    p.bait = treatCost(9) - 1;
    expect(packTreat(p, at(p, 0), long)).toBe(false);
    expect(p.bait).toBe(treatCost(9) - 1);
  });

  it('the long policy packs the 12 hour trips and the dungeon only; all packs 6 hour trips and long jobs too', () => {
    const rich = (treats: PlayerProfile['treats']): SimPlayer => {
      const p = make([5], { treats, trainFocus: 3 });
      p.bait = 1_000;
      return p;
    };
    const medium = { kind: 'trip', hours: 6 } as const;
    const job = { kind: 'job', hours: 3 } as const;
    const shortJob = { kind: 'job', hours: 0.25 } as const;
    for (const [policy, expected] of [
      ['long', [false, false, true, true, false, false]],
      ['all', [false, true, true, true, true, false]],
    ] as const) {
      const results = [short, medium, long, { kind: 'dungeon' } as const, job, shortJob].map(
        (activity) => {
          const p = rich(policy);
          return packTreat(p, at(p, 0), activity);
        },
      );
      expect(results, policy).toEqual(expected);
    }
  });

  it('go only to the focus, and only to a creature that can still grow', () => {
    const p = make([9, 8, 7, 6, 5], { treats: 'all', trainFocus: 3 });
    p.bait = 1_000;
    const focus = focusSet(p);
    const outside = p.creatures.find((c) => !focus.has(c.id)) as OwnedCreature;
    expect(packTreat(p, outside, long)).toBe(false);
    const stalled = make([10], { treats: 'all', trainFocus: 3 });
    stalled.bait = 1_000;
    at(stalled, 0).exp = expToNext(10);
    expect(packTreat(stalled, at(stalled, 0), long)).toBe(false);
    // A spread player has no focus, so any creature that can grow may get one.
    const spread = make([9], { treats: 'all', trainFocus: 'spread' });
    spread.bait = 100;
    expect(packTreat(spread, at(spread, 0), long)).toBe(true);
  });
});

describe('ribbons', () => {
  function atTheGate(): SimPlayer {
    const p = make([10, 4], { trainFocus: 3 });
    const c = at(p, 0);
    c.exp = expToNext(10);
    return p;
  }

  it('cost materials of the creature’s element, and the banked experience is spent at once', () => {
    const p = atTheGate();
    const c = at(p, 0);
    const bronze = RULES.experience.ribbons[0] as (typeof RULES.experience.ribbons)[number];
    const cost = ribbonParts(bronze, speciesOf(c.speciesId).element);
    buyRibbons(p, true);
    expect(c.ribbons).toBe(0); // no materials yet
    for (const [kind, n] of Object.entries(cost))
      p.gear.parts[kind as keyof typeof p.gear.parts] = n;
    buyRibbons(p, true);
    expect(c).toMatchObject({ level: 11, exp: 0, ribbons: 1 });
    expect(Object.values(p.gear.parts).every((n) => n === 0)).toBe(true);
    expect(p.stats.ribbons).toBe(1);
  });

  it('the Silver Ribbon asks for five finished trips of the creature itself', () => {
    const p = make([20], { trainFocus: 3 });
    const c = at(p, 0);
    c.exp = expToNext(20);
    c.ribbons = 1;
    const silver = RULES.experience.ribbons[1] as (typeof RULES.experience.ribbons)[number];
    for (const [kind, n] of Object.entries(ribbonParts(silver, speciesOf(c.speciesId).element))) {
      p.gear.parts[kind as keyof typeof p.gear.parts] = n;
    }
    buyRibbons(p, true);
    expect(c.ribbons).toBe(1);
    p.familiarity[`${c.id}|tidepools`] = { trips: 3, found: [], shiny: false };
    p.familiarity[`${c.id}|ember-caves`] = { trips: 2, found: [], shiny: false };
    expect(creatureTrips(p, c.id)).toBe(5);
    expect(creatureTrips(p, 'p01/other')).toBe(0);
    buyRibbons(p, true);
    expect(c).toMatchObject({ level: 21, ribbons: 2 });
  });

  it('are free in a sim without gear (the materials are not modelled)', () => {
    const p = atTheGate();
    buyRibbons(p, false);
    expect(at(p, 0)).toMatchObject({ level: 11, ribbons: 1 });
  });

  it('are bought only for creatures at their gate', () => {
    const p = make([9, 11, 19], {});
    buyRibbons(p, false);
    expect(p.creatures.map((c) => c.ribbons)).toEqual([0, 1, 1]);
  });

  it('are saved for: a creature near its gate keeps its materials back, one far from it does not', () => {
    const far = make([3], {});
    expect(ribbonReserve(far)).toEqual({});
    const near = make([9], {});
    const reserve = ribbonReserve(near);
    expect(reserve.scrap).toBe(RULES.experience.ribbons[0]?.scrap);
    const element = speciesOf(at(near, 0).speciesId).element;
    expect(reserve[`${element}-shard`]).toBe(RULES.experience.ribbons[0]?.shards);
    // It lacks the shards, so trips to that element's place are wanted.
    expect(ribbonShardsWanted(near).has(element)).toBe(true);
    near.gear.parts[`${element}-shard`] = 5;
    expect(ribbonShardsWanted(near).has(element)).toBe(false);
  });
});

describe('what each activity pays, in the sim', () => {
  function raidPlayers(): SimPlayer[] {
    return ['p01', 'p02', 'p03', 'p04', 'p05'].map((id) => {
      const q = createPlayer(id, id, 'daily', 1);
      q.joined = true;
      for (const line of ['splashet', 'cindle', 'sproutle', 'zipmouse']) {
        q.creatures.push({
          id: `${id}/${line}`,
          line,
          speciesId: line,
          level: 5,
          fusionCount: 0,
          exp: 0,
          ribbons: 0,
        });
      }
      return q;
    });
  }
  const boss = content.bosses[0] as NonNullable<(typeof content.bosses)[number]>;

  it('a raid stage pays every creature that stood in the row (the three each player brings), and nobody else', () => {
    const players = raidPlayers();
    const week = openRaidWeek(boss, players);
    playStage(week, 'phase1', createSeededRng('fight'), createSeededRng('loot'));
    awardRaidExperience(week, 'phase1');
    const cleared = week.stages['phase1']?.cleared === true;
    const gained = raidExperience('phase1', cleared, []);
    const fought = new Set(week.row.map((s) => s.id));
    expect(fought.size).toBe(15);
    for (const p of players) {
      for (const c of p.creatures) {
        if (!fought.has(c.id)) {
          expect(c).toMatchObject({ level: 5, exp: 0 });
          continue;
        }
        const expected = addExperience(
          { level: 5, exp: 0, ribbons: 0, levelCap: speciesOf(c.speciesId).levelCap },
          gained,
        );
        expect(c, c.id).toMatchObject({ level: expected.level, exp: expected.exp });
      }
    }
    // The three each player brings, of four: exactly one stays home and earns nothing.
    for (const p of players) {
      expect(p.creatures.filter((c) => !fought.has(c.id))).toHaveLength(1);
    }
    expect(players.every((p) => p.stats.exp_raid === 3 * gained)).toBe(true);
  });

  it('a cleared stage pays one and a half times a stage that was not', () => {
    const lost = openRaidWeek(boss, raidPlayers());
    lost.pool = { max: 1_000_000_000, current: 1_000_000_000 };
    playStage(lost, 'phase1', createSeededRng('lost'), createSeededRng('lost'));
    expect(lost.stages['phase1']?.cleared).toBe(false);
    awardRaidExperience(lost, 'phase1');
    const player = lost.players[0] as SimPlayer;
    expect(player.stats.exp_raid).toBe(3 * raidExperience('phase1', false, []));
    const won = openRaidWeek(boss, raidPlayers());
    won.pool = { max: 10, current: 10 };
    playStage(won, 'phase1', createSeededRng('won'), createSeededRng('won'));
    expect(won.stages['phase1']?.cleared).toBe(true);
    awardRaidExperience(won, 'phase1');
    expect((won.players[0] as SimPlayer).stats.exp_raid).toBe(
      3 * raidExperience('phase1', true, []),
    );
    expect(raidExperience('phase1', true, [])).toBe(Math.floor(RULES.experience.raid.phase1 * 1.5));
  });

  it('uses the game’s numbers for trips and jobs', () => {
    expect(tripExperience('long', creatureXpParts(true, null, []))).toBe(
      2 * RULES.experience.trip.long,
    );
    expect(workshopExperience(180, creatureXpParts(true, null, []))).toBe(
      2 * workshopExperience(180, []),
    );
  });
});
