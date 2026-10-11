import { RULES, content, createSeededRng } from '@creatures/game';
import {
  makeSlot,
  scaleBoss,
  simulateFight,
  type AbilityChoice,
  type FightEvent,
  type FightInput,
  type FightSlot,
} from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { beatEnds } from './replay';
import {
  HP_SEGMENTS,
  MAX_BEAT_MS,
  MIN_BEAT_MS,
  beatMs,
  beatOffsets,
  buildBeats,
  cuesForEvents,
  driftFor,
  fitBeats,
  groupByZone,
  hpSegments,
  playStart,
  reactionElements,
  abilityUsesAt,
  shieldedZones,
  stageStateAt,
  zoneOfCreature,
  type Cue,
} from './stage';

// A row of six: front a b, middle c d, back e f.
const ROW = ['a', 'b', 'c', 'd', 'e', 'f'];

const roundStart = (round: number, bossHp = 1000): FightEvent => ({
  t: 'round_start',
  round,
  bossHp,
  mark: null,
});
const hit = (round: number, creature: string, damage: number, extra = {}): FightEvent => ({
  t: 'hit',
  round,
  creature,
  damage,
  matchupBp: 10_000,
  bonusBp: 0,
  mark: null,
  bossHp: 900,
  ...extra,
});
const kinds = (cues: readonly Cue[]): string[] => cues.map((c) => c.kind);

describe('zones of the row', () => {
  it('puts a creature in the zone of its place in the row', () => {
    expect(ROW.map((id) => zoneOfCreature(ROW, id))).toEqual([
      'front',
      'front',
      'middle',
      'middle',
      'back',
      'back',
    ]);
    expect(zoneOfCreature(ROW, 'ghost')).toBeNull();
    expect(zoneOfCreature(['a', 'b'], 'b')).toBe('middle');
  });

  it('groups the row by zone and leaves out empty zones', () => {
    const groups = groupByZone(ROW.map((id) => ({ id })));
    expect(groups.map((g) => [g.zone, g.items.map((i) => i.id)])).toEqual([
      ['front', ['a', 'b']],
      ['middle', ['c', 'd']],
      ['back', ['e', 'f']],
    ]);
    expect(groupByZone([{ id: 'x' }]).map((g) => g.zone)).toEqual(['middle']);
    expect(groupByZone([])).toEqual([]);
  });
});

describe('driftFor', () => {
  it('is the same for the same event, and stays within three steps', () => {
    for (let i = 0; i < 50; i++) {
      expect(driftFor(i)).toBe(driftFor(i));
      expect(Math.abs(driftFor(i))).toBeLessThanOrEqual(3);
    }
    // Not a constant: neighbouring events do not all drift the same way.
    expect(new Set(Array.from({ length: 7 }, (_, i) => driftFor(i))).size).toBeGreaterThan(3);
  });
});

describe('cuesForEvents', () => {
  it('hops the attacker, flashes the boss and floats the damage on a hit', () => {
    const events: FightEvent[] = [
      roundStart(1),
      { t: 'turn', round: 1, creature: 'c' },
      hit(1, 'c', 412),
    ];
    const cues = cuesForEvents(events, 1, 3, ROW);
    expect(cues).toEqual([
      { kind: 'hop', i: 1, creature: 'c' },
      { kind: 'flash', i: 2, target: null },
      {
        kind: 'float',
        i: 2,
        target: null,
        text: '412',
        tone: 'hit',
        crit: false,
        drift: driftFor(2),
      },
    ]);
  });

  it('marks a critical hit', () => {
    const cues = cuesForEvents([hit(1, 'a', 800, { crit: true, critBp: 5000 })], 0, 1, ROW);
    expect(cues.find((c) => c.kind === 'float')).toMatchObject({ crit: true, text: '800' });
  });

  it('shows the mark and a reaction burst in the reaction element colours', () => {
    const events: FightEvent[] = [
      { t: 'mark', round: 1, creature: 'a', player: 'p', element: 'tide', replaced: null },
      {
        t: 'reaction',
        round: 1,
        reaction: 'overload',
        setupCreature: 'a',
        setupPlayer: 'p',
        payoff: 'c',
        bonus: 300,
        reflected: false,
      },
    ];
    const cues = cuesForEvents(events, 0, 2, ROW);
    expect(cues[0]).toEqual({ kind: 'mark', i: 0, element: 'tide' });
    expect(cues[1]).toEqual({
      kind: 'burst',
      i: 1,
      target: null,
      reaction: 'overload',
      elements: ['tide', 'spark'],
      reflected: false,
    });
  });

  it('bursts on the creature when the boss reflects the reaction', () => {
    const cues = cuesForEvents(
      [
        {
          t: 'reaction',
          round: 2,
          reaction: 'steam',
          setupCreature: null,
          setupPlayer: null,
          payoff: 'e',
          bonus: 50,
          reflected: true,
        },
      ],
      0,
      1,
      ROW,
    );
    expect(cues[0]).toMatchObject({ kind: 'burst', target: 'e', reflected: true });
  });

  it('flashes, floats and shakes the zone of a creature the boss hits', () => {
    const events: FightEvent[] = [
      {
        t: 'boss_hit',
        round: 1,
        source: 'attack',
        target: 'e',
        damage: 77,
        crit: true,
        critBp: 5000,
      },
    ];
    const cues = cuesForEvents(events, 0, 1, ROW);
    expect(kinds(cues)).toEqual(['flash', 'float', 'shake']);
    expect(cues[0]).toEqual({ kind: 'flash', i: 0, target: 'e' });
    expect(cues[1]).toMatchObject({ target: 'e', text: '77', tone: 'hurt', crit: true });
    expect(cues[2]).toEqual({ kind: 'shake', i: 0, zone: 'back' });
  });

  it('says BLOCKED and draws the shield over the zone when a Shield Wall stops a hit', () => {
    const events: FightEvent[] = [
      { t: 'boss_hit', round: 3, source: 'attack', target: 'a', damage: 0, shielded: true },
    ];
    const cues = cuesForEvents(events, 0, 1, ROW);
    expect(cues.find((c) => c.kind === 'float')).toMatchObject({
      text: 'BLOCKED',
      tone: 'blocked',
    });
    expect(cues).toContainEqual({ kind: 'zone', i: 0, zone: 'front', effect: 'shield', op: null });
  });

  it('lights the ability card and draws a shield on the chosen zone', () => {
    const cues = cuesForEvents(
      [
        {
          t: 'ability',
          round: 2,
          player: 'p1',
          ability: 'shield-wall',
          key: 'p1:basic',
          zone: 'middle',
          byDefault: false,
        },
      ],
      0,
      1,
      ROW,
    );
    expect(cues[0]).toEqual({
      kind: 'ability',
      i: 0,
      ability: 'shield-wall',
      creature: null,
      player: 'p1',
    });
    expect(cues).toContainEqual({ kind: 'zone', i: 0, zone: 'middle', effect: 'shield', op: null });
  });

  it('covers every zone for a rally, and names the creature of a creature ability', () => {
    const cues = cuesForEvents(
      [
        {
          t: 'ability',
          round: 2,
          player: 'p1',
          ability: 'rally',
          key: 'k',
          creature: 'c',
          byDefault: true,
        },
      ],
      0,
      1,
      ROW,
    );
    expect(cues[0]).toMatchObject({ kind: 'ability', creature: 'c' });
    expect(cues.filter((c) => c.kind === 'zone').map((c) => (c as { zone: string }).zone)).toEqual([
      'front',
      'middle',
      'back',
    ]);
  });

  it('shows a zone gimmick over the zone it hurt', () => {
    const events: FightEvent[] = [
      { t: 'gimmick', round: 3, gimmick: 'undertow', op: 'hit_zone' },
      { t: 'boss_hit', round: 3, source: 'gimmick', target: 'a', damage: 10 },
      { t: 'boss_hit', round: 3, source: 'gimmick', target: 'b', damage: 10 },
    ];
    const cues = cuesForEvents(events, 0, 3, ROW);
    expect(cues[0]).toEqual({ kind: 'gimmick', i: 0, gimmick: 'undertow', op: 'hit_zone' });
    expect(cues.filter((c) => c.kind === 'zone')).toEqual([
      { kind: 'zone', i: 0, zone: 'front', effect: 'hit', op: 'hit_zone' },
    ]);
    expect(cues.filter((c) => c.kind === 'shake').length).toBe(2);
  });

  it('shows silences, knockouts and luck banners', () => {
    const events: FightEvent[] = [
      {
        t: 'round_start',
        round: 4,
        bossHp: 1000,
        mark: null,
        luck: { kind: 'surge', bp: 500, rounds: 2 },
      },
      { t: 'skip', round: 4, creature: 'a', reason: 'silenced' },
      { t: 'silence', round: 4, creature: 'f', turns: 1 },
      { t: 'knockout', round: 4, creature: 'b' },
      { t: 'round_end', round: 4, bossHp: 5 },
    ];
    const cues = cuesForEvents(events, 0, 5, ROW);
    expect(cues).toEqual([
      { kind: 'banner', i: 0, text: 'Fortune smiles!' },
      { kind: 'silenced', i: 1, creature: 'a' },
      { kind: 'silenced', i: 2, creature: 'f' },
      { kind: 'ko', i: 3, creature: 'b' },
    ]);
  });

  it('reads only the events it is asked for, and survives a range past the log', () => {
    const events: FightEvent[] = [roundStart(1), hit(1, 'a', 5), hit(1, 'b', 6)];
    expect(cuesForEvents(events, 2, 99, ROW).filter((c) => c.kind === 'float')).toHaveLength(1);
    expect(cuesForEvents(events, 5, 9, ROW)).toEqual([]);
    expect(cuesForEvents(events, -3, 1, ROW)).toEqual([]);
  });

  it('knows the reaction elements from the content', () => {
    expect(reactionElements('overload')).toEqual(['tide', 'spark']);
    expect(reactionElements('no-such-reaction')).toBeNull();
  });
});

describe('beat lengths', () => {
  it('never lets a beat run past the maximum or below the minimum', () => {
    const everything: Cue[] = [
      { kind: 'float', i: 0, target: null, text: '1', tone: 'hit', crit: true, drift: 0 },
      { kind: 'burst', i: 0, target: null, reaction: 'x', elements: null, reflected: false },
      { kind: 'ability', i: 0, ability: 'rally', creature: null, player: 'p' },
      { kind: 'ko', i: 0, creature: 'a' },
      { kind: 'gimmick', i: 0, gimmick: 'g', op: 'hit_zone' },
      { kind: 'banner', i: 0, text: 'Bad omen!' },
    ];
    expect(beatMs(everything)).toBe(MAX_BEAT_MS);
    expect(beatMs([])).toBe(MIN_BEAT_MS);
    expect(beatMs([{ kind: 'hop', i: 0, creature: 'a' }])).toBeLessThan(MAX_BEAT_MS);
    expect(beatMs([{ kind: 'hop', i: 0, creature: 'a' }])).toBeGreaterThanOrEqual(MIN_BEAT_MS);
  });

  it('gives a crit a little longer than a plain hit', () => {
    const plain = cuesForEvents([hit(1, 'a', 5)], 0, 1, ROW);
    const crit = cuesForEvents([hit(1, 'a', 5, { crit: true })], 0, 1, ROW);
    expect(beatMs(crit)).toBeGreaterThan(beatMs(plain));
  });
});

describe('buildBeats', () => {
  const events: FightEvent[] = [
    roundStart(1),
    { t: 'turn', round: 1, creature: 'a' },
    hit(1, 'a', 10),
    { t: 'turn', round: 1, creature: 'b' },
    hit(1, 'b', 20, { crit: true }),
    { t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 5 },
    { t: 'knockout', round: 1, creature: 'a' },
    { t: 'round_end', round: 1, bossHp: 870 },
  ];

  it('cuts the log where the replay cuts it, covering every event once', () => {
    const beats = buildBeats(events, 0, ROW);
    expect(beats.map((b) => b.to)).toEqual(beatEnds(events));
    expect(beats[0]?.from).toBe(0);
    for (const [k, beat] of beats.entries()) {
      if (k > 0) expect(beat.from).toBe(beats[k - 1]?.to);
      expect(beat.to).toBeGreaterThan(beat.from);
      expect(beat.ms).toBeLessThanOrEqual(MAX_BEAT_MS);
      expect(beat.ms).toBeGreaterThanOrEqual(MIN_BEAT_MS);
    }
    expect(beats.at(-1)?.to).toBe(events.length);
  });

  it('starts in the middle of the log and keeps the first beat partial', () => {
    const beats = buildBeats(events, 4, ROW);
    expect(beats[0]?.from).toBe(4);
    expect(beats.at(-1)?.to).toBe(events.length);
    expect(buildBeats(events, events.length, ROW)).toEqual([]);
  });

  it('puts the knockout in the beat of the boss attack that caused it', () => {
    const beats = buildBeats(events, 0, ROW);
    const attack = beats.find((b) => b.cues.some((c) => c.kind === 'shake'));
    expect(attack && kinds(attack.cues)).toEqual(['flash', 'float', 'shake', 'ko']);
    expect(attack?.ms).toBe(beatMs(attack?.cues ?? []));
  });

  it('schedules beats back to back', () => {
    const beats = buildBeats(events, 0, ROW);
    const offsets = beatOffsets(beats);
    expect(offsets[0]).toBe(0);
    for (let k = 1; k < beats.length; k++) {
      expect(offsets[k]).toBe((offsets[k - 1] ?? 0) + (beats[k - 1]?.ms ?? 0));
    }
  });
});

describe('fitBeats', () => {
  const beat = (ms: number) => ({ from: 0, to: 1, round: 1, cues: [], ms });

  it('leaves beats alone when they fit the budget', () => {
    const beats = [beat(500), beat(700), beat(500)];
    // Only the beats before the last count: the last one has no next beat to wait for.
    expect(fitBeats(beats, 1200)).toEqual(beats);
  });

  it('shortens the staggers in proportion to fit the budget, and keeps the last beat as it is', () => {
    const fitted = fitBeats([beat(700), beat(700), beat(500), beat(600)], 1000);
    const total = fitted.slice(0, -1).reduce((sum, b) => sum + b.ms, 0);
    expect(total).toBeLessThanOrEqual(1000);
    expect(fitted.map((b) => b.ms)).toEqual([368, 368, 263, 600]);
  });

  it('never goes below the 250 ms minimum, even for a tiny budget', () => {
    const fitted = fitBeats([beat(700), beat(700), beat(500)], 10);
    expect(fitted.slice(0, -1).every((b) => b.ms === MIN_BEAT_MS)).toBe(true);
    expect(MIN_BEAT_MS).toBe(250);
  });
});

describe('playStart', () => {
  const events: FightEvent[] = [
    roundStart(1),
    hit(1, 'a', 1),
    { t: 'round_end', round: 1, bossHp: 1 },
    roundStart(2),
    hit(2, 'a', 1),
    roundStart(3),
    hit(3, 'a', 1),
  ];

  it('continues where it was when it is inside the newest round', () => {
    expect(playStart(events, 6)).toBe(6);
    expect(playStart(events, 5)).toBe(5);
  });

  it('skips rounds nobody saw and starts at the newest round', () => {
    expect(playStart(events, 0)).toBe(5);
    expect(playStart(events, 3)).toBe(5);
  });

  it('keeps the position when the log has no rounds yet', () => {
    expect(playStart([], 0)).toBe(0);
  });
});

describe('stageStateAt and shields', () => {
  const events: FightEvent[] = [
    roundStart(1, 1000),
    {
      t: 'ability',
      round: 1,
      player: 'p1',
      ability: 'bark-guard',
      key: 'k',
      creature: 'a',
      zone: 'front',
      byDefault: false,
    },
    { t: 'knockout', round: 1, creature: 'e' },
    { t: 'round_end', round: 1, bossHp: 900 },
    roundStart(2, 900),
    roundStart(3, 800),
  ];

  it('keeps a zone shielded for as many rounds as the ability says', () => {
    // Bark Guard: its zone takes less damage for 2 rounds.
    expect(shieldedZones(events, 1)).toEqual([]);
    expect(shieldedZones(events, 2)).toEqual(['front']);
    expect(shieldedZones(events, 5)).toEqual(['front']);
    expect(shieldedZones(events, 6)).toEqual([]);
  });

  it('adds the shields to the replay state', () => {
    const state = stageStateAt(events, 4, 1000);
    expect(state.shielded).toEqual(['front']);
    expect(state.knockedOut).toEqual(['e']);
    expect(state.bossHp).toBe(900);
    expect(stageStateAt(events, 0, 1000).bossHp).toBe(1000);
  });
});

describe('hpSegments', () => {
  it('shows every segment only at full HP and none only at zero', () => {
    expect(hpSegments(1000, 1000)).toBe(HP_SEGMENTS);
    expect(hpSegments(999, 1000)).toBe(HP_SEGMENTS - 1);
    expect(hpSegments(1, 1000)).toBe(1);
    expect(hpSegments(0, 1000)).toBe(0);
    expect(hpSegments(500, 1000)).toBe(10);
    expect(hpSegments(5, 0)).toBe(0);
  });
});

/** A whole fight from the engine: three players, level-10 creatures with abilities. */
function realFight(): { input: FightInput; events: FightEvent[] } {
  const stage1 = content.creatures.filter((c) => c.stage === 1).slice(0, 9);
  const row: FightSlot[] = stage1.map((sp, k) =>
    makeSlot(sp, {
      id: `c${String(k)}`,
      ownerId: `p${String(k % 3)}`,
      level: RULES.abilities.unlockLevel,
      fusionCount: 0,
    }),
  );
  const boss = content.bosses[0];
  if (boss === undefined) throw new Error('no boss');
  const scaled = scaleBoss(boss, 3, 3);
  const abilities: AbilityChoice[] = [
    { playerId: 'p0', abilityId: 'shield-wall', key: 'p0:basic', params: { zone: 'front' } },
    { playerId: 'p1', abilityId: 'rally', key: 'p1:basic', fireAtRound: 2 },
  ];
  for (const s of row) {
    const abilityId = content.creatures.find((c) => c.id === s.speciesId)?.ability?.id;
    if (abilityId !== undefined && s.ownerId !== null) {
      abilities.push({
        playerId: s.ownerId,
        abilityId,
        key: `${s.id}:ability`,
        creatureId: s.id,
      });
    }
  }
  const input: FightInput = {
    boss,
    bossAtk: scaled.atk,
    phase: 'finale',
    bossHpPool: { max: scaled.maxHp, current: scaled.maxHp },
    adaptation: null,
    row,
    players: ['p0', 'p1', 'p2'],
    finaleAbilities: abilities,
    luck: RULES.combat.luck,
  };
  return { input, events: simulateFight(input, createSeededRng('stage')).events };
}

// A real fight from the engine: every beat of it must be well-formed.
describe('a whole simulated fight', () => {
  it('turns every event into a short, well-formed beat', () => {
    const { input, events } = realFight();
    const rowIds = input.row.map((s) => s.id);
    const beats = buildBeats(events, 0, rowIds);
    expect(beats.length).toBeGreaterThan(10);
    expect(beats[0]?.from).toBe(0);
    expect(beats.at(-1)?.to).toBe(events.length);
    const seen = new Set(rowIds);
    for (const beat of beats) {
      expect(beat.ms).toBeGreaterThanOrEqual(MIN_BEAT_MS);
      expect(beat.ms).toBeLessThanOrEqual(MAX_BEAT_MS);
      for (const cue of beat.cues) {
        expect(cue.i).toBeGreaterThanOrEqual(beat.from);
        expect(cue.i).toBeLessThan(beat.to);
        if ('creature' in cue && cue.creature !== null) expect(seen.has(cue.creature)).toBe(true);
        if (cue.kind === 'float' || cue.kind === 'flash') {
          if (cue.target !== null) expect(seen.has(cue.target)).toBe(true);
        }
      }
    }
  });

  it('staggers the beats of a real round at 250 to 700 ms, and not at a flat pace', () => {
    const { input, events } = realFight();
    const rowIds = input.row.map((s) => s.id);
    const start = events.findIndex((e) => e.t === 'round_start' && e.round === 3);
    const end = events.findIndex((e) => e.t === 'round_start' && e.round === 4);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const round = buildBeats(events.slice(0, end), start, rowIds);
    expect(round.length).toBeGreaterThan(2);
    for (const b of round) {
      expect(b.ms).toBeGreaterThanOrEqual(250);
      expect(b.ms).toBeLessThanOrEqual(700);
    }
    expect(new Set(round.map((b) => b.ms)).size).toBeGreaterThan(1);
  });

  it('ends with the boss HP and knockouts the log ends with', () => {
    const { input, events } = realFight();
    const state = stageStateAt(events, events.length, input.bossHpPool.max);
    const last = events.at(-1);
    expect(last?.t).toBe('round_end');
    if (last?.t === 'round_end') expect(state.bossHp).toBe(last.bossHp);
    const ko = events.filter((e) => e.t === 'knockout').length;
    expect(state.knockedOut).toHaveLength(ko);
  });
});

describe('abilities that have fired', () => {
  const ability = (round: number, key: string, creature?: string): FightEvent => ({
    t: 'ability',
    round,
    player: 'p0',
    ability: 'rally',
    key,
    ...(creature === undefined ? {} : { creature }),
    byDefault: false,
  });

  it('lists the uses in the part of the log that has been shown', () => {
    const events = [roundStart(1), ability(1, 'p0:basic'), roundStart(2), ability(2, 'p0:c0', 'a')];
    expect(abilityUsesAt(events, 0)).toEqual([]);
    expect(abilityUsesAt(events, 2)).toEqual([
      { key: 'p0:basic', ability: 'rally', creature: null, round: 1 },
    ]);
    expect(abilityUsesAt(events, 99).map((u) => [u.key, u.creature, u.round])).toEqual([
      ['p0:basic', null, 1],
      ['p0:c0', 'a', 2],
    ]);
  });

  it('matches the ability events of a real fight, one for each use', () => {
    const { input, events } = realFight();
    const uses = abilityUsesAt(events, events.length);
    expect(uses.length).toBe(events.filter((e) => e.t === 'ability').length);
    const rowIds = new Set(input.row.map((s) => s.id));
    for (const use of uses) {
      if (use.creature !== null) expect(rowIds.has(use.creature)).toBe(true);
    }
  });
});

// The boss HP the stage shows must be the engine's own, for a whole fight and for a practice-style
// one (a full pool, no adaptation, a small party with guests, a boss far above the party's level).
describe('the boss HP on the stage', () => {
  function practiceInput(level: number, rank: number, bossId: string): FightInput {
    const boss = content.bosses.find((b) => b.id === bossId);
    if (boss === undefined) throw new Error('no boss');
    const species = content.creatures.filter((c) => c.stage === 1).slice(0, 9);
    const row: FightSlot[] = species.map((sp, k) =>
      makeSlot(sp, {
        id: `c${String(k)}`,
        ownerId: k < 3 ? 'm1' : null,
        level,
        fusionCount: 0,
      }),
    );
    const scaled = scaleBoss(boss, 1, rank);
    return {
      boss,
      bossAtk: scaled.atk,
      phase: 'finale',
      bossHpPool: { max: scaled.maxHp, current: scaled.maxHp },
      adaptation: null,
      row,
      players: ['m1'],
      finaleAbilities: [],
      luck: { ...RULES.combat.luck },
    };
  }

  const cases: [string, FightInput][] = [
    ['the stage fight', realFight().input],
    ['a practice fight, level 1, rank 4', practiceInput(1, 4, 'cinder-wyrm')],
    ['a practice fight, level 10, rank 1', practiceInput(10, 1, 'cinder-wyrm')],
    ['a practice fight against a very high rank', practiceInput(3, 20, 'tidal-colossus')],
  ];

  it.each(cases)('ends on the engine HP after the last round: %s', (_name, input) => {
    const result = simulateFight(input, createSeededRng('hp'));
    const state = stageStateAt(result.events, result.events.length, input.bossHpPool.current);
    expect(state.bossHp).toBe(result.bossHpEnd);
    expect(state.round).toBe(result.rounds);
  });

  it.each(cases)('is the engine HP at the end of every round: %s', (_name, input) => {
    const result = simulateFight(input, createSeededRng('hp'));
    const { events } = result;
    let checked = 0;
    events.forEach((e, i) => {
      if (e.t !== 'round_end') return;
      expect(stageStateAt(events, i + 1, input.bossHpPool.current).bossHp).toBe(e.bossHp);
      checked += 1;
    });
    expect(checked).toBe(result.rounds);
  });

  it('never shows more HP than the round before, and drops by the damage that was dealt', () => {
    const input = practiceInput(5, 4, 'cinder-wyrm');
    const { events, bossHpStart, bossHpEnd } = simulateFight(input, createSeededRng('hp'));
    let last = bossHpStart;
    let dealt = 0;
    for (let i = 1; i <= events.length; i++) {
      const hp = stageStateAt(events, i, bossHpStart).bossHp;
      expect(hp).toBeLessThanOrEqual(last);
      last = hp;
    }
    for (const e of events) if (e.t === 'hit') dealt += e.damage;
    expect(bossHpStart - dealt).toBe(bossHpEnd);
  });

  it('shows the whole fight even when the log is replayed from a later index', () => {
    // A stage that joins late still adds up every hit from the start of the log.
    const { input, events } = realFight();
    const round12 = events.findIndex((e) => e.t === 'round_start' && e.round === 12);
    if (round12 < 0) return;
    const late = stageStateAt(events, round12 + 1, input.bossHpPool.max);
    const start = events[round12];
    expect(start?.t === 'round_start' && late.bossHp === start.bossHp).toBe(true);
    expect(late.bossHp).toBeLessThan(input.bossHpPool.max);
  });
});
