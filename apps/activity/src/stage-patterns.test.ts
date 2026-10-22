import { content, RULES } from '@creatures/game';
import type { FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { addFx, FX_MS, staticFx } from './stage-fx';
import {
  MAX_RETICLES,
  buildBeats,
  creatureHpAt,
  cuesForEvents,
  enragedAt,
  estimatedMaxHp,
  pendingChargesAt,
  retreatedAt,
  reticleTargets,
  strikeRows,
  strikesOf,
  windupCuesForEvents,
  type BossStrike,
  type Cue,
} from './stage';

// A row of six: front a b, middle c d, back e f.
const ROW = ['a', 'b', 'c', 'd', 'e', 'f'];

const gimmick = (round: number, id: string, op: string, extra = {}): FightEvent => ({
  t: 'gimmick',
  round,
  gimmick: id,
  op,
  ...extra,
});
const bossHit = (target: string, damage: number, extra = {}): FightEvent => ({
  t: 'boss_hit',
  round: 4,
  source: 'gimmick',
  target,
  damage,
  ...extra,
});
const strikeAt = (events: FightEvent[], boss = 'tidal-colossus'): BossStrike => {
  const found = strikesOf(events, 0, events.length, ROW, boss)[0];
  if (found === undefined) throw new Error('no strike');
  return found.strike;
};

describe('reading the attack patterns from the events', () => {
  it('reads a sweep by the rows the engine names, and falls back to where the hits landed', () => {
    const events: FightEvent[] = [
      gimmick(5, 'great-wave', 'sweep', { rows: ['middle'], targets: ['c', 'd'] }),
      bossHit('c', 30),
      bossHit('d', 30),
    ];
    const strike = strikeAt(events);
    expect(strike).toMatchObject({
      action: 'sweep',
      targets: ['c', 'd'],
      zone: 'middle',
      rows: ['middle'],
      charged: true,
    });
    expect(strikeRows(strike)).toEqual(['middle']);
    // No rows on the event: the zones of whoever was hit, front first.
    const bare = strikeAt([gimmick(5, 'undertow', 'sweep'), bossHit('e', 1), bossHit('a', 1)]);
    expect(bare.rows).toEqual(['front', 'back']);
  });

  it('reads a landing charge as its pattern whether the event says charge or the pattern', () => {
    const viaCharge = strikeAt([
      gimmick(5, 'great-wave', 'charge', { rows: ['back'] }),
      bossHit('e', 1),
    ]);
    expect(viaCharge).toMatchObject({ action: 'sweep', charged: true });
    const plain = strikeAt([gimmick(5, 'riptide', 'lance', { lane: 1 }), bossHit('a', 1)]);
    expect(plain.charged).toBeUndefined();
  });

  it('reads a barrage, a pincer and a lance from who was hit, and the lane', () => {
    const barrage = strikeAt(
      [gimmick(2, 'cinder-fall', 'barrage'), bossHit('a', 5), bossHit('d', 5), bossHit('f', 5)],
      'cinder-wyrm',
    );
    expect(barrage).toMatchObject({ action: 'barrage', targets: ['a', 'd', 'f'] });
    const pincer = strikeAt(
      [gimmick(3, 'briar-pincer', 'pincer'), bossHit('a', 5), bossHit('b', 5), bossHit('e', 5)],
      'thornmother',
    );
    expect(pincer.action).toBe('pincer');
    const lance = strikeAt([
      gimmick(4, 'riptide', 'lance', { lane: 1, targets: ['b', 'd', 'f'] }),
      bossHit('b', 9),
      bossHit('d', 7),
      bossHit('f', 6),
    ]);
    expect(lance).toMatchObject({ action: 'lance', lane: 1, targets: ['b', 'd', 'f'] });
  });

  it('reads a slam: the impact, the splash beside it and the creature a guard stepped in for', () => {
    const slam = strikeAt(
      [
        gimmick(4, 'coil-crush', 'slam', { targets: ['a'] }),
        bossHit('b', 40, { from: 'a' }),
        bossHit('a', 18, { splash: true }),
        bossHit('c', 18, { splash: true, covered: { guard: 'b', prevented: 12 } }),
      ],
      'cinder-wyrm',
    );
    expect(slam).toMatchObject({
      action: 'slam',
      targets: ['b'],
      splash: ['a', 'c'],
      guarded: 'a',
    });
  });

  it('reads a chain: the first hit and its jumps are all targets, in order', () => {
    const chain = strikeAt(
      [
        gimmick(1, 'lightning-rod', 'strike_highest_atk'),
        bossHit('e', 30),
        bossHit('a', 16),
        bossHit('c', 9),
      ],
      'storm-sovereign',
    );
    expect(chain).toMatchObject({ action: 'strike_highest_atk', targets: ['e', 'a', 'c'] });
  });

  it('reads a charge being announced, with its marks and rows, and shows it without a wind-up', () => {
    const events: FightEvent[] = [
      {
        t: 'charge',
        round: 4,
        landing: 5,
        gimmick: 'great-wave',
        op: 'sweep',
        marks: ['c', 'd'],
        rows: ['middle'],
      },
    ];
    const found = strikesOf(events, 0, 1, ROW, 'tidal-colossus');
    expect(found).toHaveLength(1);
    expect(found[0]?.strike).toMatchObject({
      action: 'charge',
      gimmick: 'great-wave',
      targets: ['c', 'd'],
      zone: 'middle',
      rows: ['middle'],
    });
    expect(windupCuesForEvents(events, 0, 1, ROW, 'tidal-colossus')).toEqual([]);
  });

  it('reads the enrage round as one action on every creature it hit', () => {
    const events: FightEvent[] = [
      { t: 'round_start', round: 13, bossHp: 10, mark: null },
      { t: 'enrage', round: 13, first: true },
      { t: 'boss_hit', round: 13, source: 'attack', target: 'a', damage: 5 },
      { t: 'boss_hit', round: 13, source: 'enrage', target: 'a', damage: 50 },
      { t: 'boss_hit', round: 13, source: 'enrage', target: 'b', damage: 50 },
      { t: 'knockout', round: 13, creature: 'b' },
      { t: 'boss_hit', round: 13, source: 'enrage', target: 'c', damage: 50 },
    ];
    const found = strikesOf(events, 0, events.length, ROW, 'cinder-wyrm');
    expect(found.map((f) => f.strike.action)).toEqual(['attack', 'enrage']);
    expect(found[1]?.strike.targets).toEqual(['a', 'b', 'c']);
    // No wind-up for it: the stage shows it as it lands.
    expect(
      windupCuesForEvents(events, 0, events.length, ROW, 'cinder-wyrm').map((c) => c.i),
    ).toEqual([2]);
  });

  it('puts up at most six reticles, and none for a row outline', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const barrage: BossStrike = {
      action: 'barrage',
      gimmick: 'x',
      targets: many,
      zone: null,
      blocked: [],
      guarded: null,
    };
    expect(MAX_RETICLES).toBe(6);
    expect(reticleTargets(barrage)).toEqual(many.slice(0, 6));
    for (const action of ['sweep', 'hit_zone', 'charge', 'enrage', 'reflect_armed'] as const) {
      expect(reticleTargets({ ...barrage, action }), action).toEqual([]);
    }
    expect(reticleTargets({ ...barrage, action: 'slam', targets: ['a'] })).toEqual(['a']);
  });

  it('ignores an event it does not know', () => {
    const odd = { t: 'tidal_surge', round: 3, power: 9 } as unknown as FightEvent;
    expect(cuesForEvents([odd], 0, 1, ROW)).toEqual([]);
    expect(strikesOf([odd], 0, 1, ROW)).toEqual([]);
    expect(pendingChargesAt([odd], 1)).toEqual([]);
    expect(creatureHpAt([odd], 1, { a: 10 })).toEqual({ a: 10 });
  });
});

describe('the cues of the new events', () => {
  it('shows a heal as a green number and a cleanse as a quiet word, each with the Support hopping', () => {
    const cues = cuesForEvents(
      [
        { t: 'heal', round: 2, supporter: 'b', target: 'a', amount: 12 },
        { t: 'cleanse', round: 2, supporter: 'b', target: 'a' },
      ],
      0,
      2,
      ROW,
    );
    expect(cues).toMatchObject([
      { kind: 'hop', creature: 'b' },
      { kind: 'float', target: 'a', text: '+12', tone: 'heal' },
      { kind: 'hop', creature: 'b' },
      { kind: 'float', target: 'a', text: 'Cleansed', tone: 'cleanse' },
    ]);
  });

  it('shows "Immune!" over the boss at a retreat', () => {
    const cues = cuesForEvents([{ t: 'retreat', round: 6, bossHp: 700 }], 0, 1, ROW);
    expect(cues).toMatchObject([{ kind: 'float', target: null, text: 'Immune!', tone: 'immune' }]);
  });

  it('puts a shield pip on a creature whose hit Guard cover softened', () => {
    const cues = cuesForEvents(
      [bossHit('c', 20, { covered: { guard: 'b', prevented: 13 } })],
      0,
      1,
      ROW,
    );
    expect(cues.find((c) => c.kind === 'cover')).toEqual({
      kind: 'cover',
      i: 0,
      creature: 'c',
      guard: 'b',
    });
  });

  it('puts an armor pip on a Guard whose armor took damage off a hit', () => {
    const cues = cuesForEvents([bossHit('c', 75, { armored: 25 })], 0, 1, ROW);
    expect(cues.find((c) => c.kind === 'armor')).toEqual({
      kind: 'armor',
      i: 0,
      creature: 'c',
      prevented: 25,
    });
    // No pip for a hit nothing was taken off, and none for cover.
    expect(cuesForEvents([bossHit('c', 100)], 0, 1, ROW).some((c) => c.kind === 'armor')).toBe(
      false,
    );
    expect(cues.some((c) => c.kind === 'cover')).toBe(false);
    const [item] = addFx(
      [],
      cues.filter((c) => c.kind === 'armor'),
      1000,
    );
    expect(item?.ms).toBe(FX_MS.callout);
  });

  it('outlines every row a sweep covers and draws no reticles for it', () => {
    const events: FightEvent[] = [
      gimmick(3, 'flood-gate', 'sweep', { rows: ['front', 'back'] }),
      bossHit('a', 1),
      bossHit('e', 1),
    ];
    const cues = cuesForEvents(events, 0, 3, ROW, 'drowned-warden');
    expect(cues.filter((c) => c.kind === 'zone').map((c) => (c as { zone: string }).zone)).toEqual([
      'front',
      'back',
    ]);
    const windup = windupCuesForEvents(events, 0, 3, ROW, 'drowned-warden');
    expect(windup).toHaveLength(1);
    const strike = (windup[0] as Extract<Cue, { kind: 'windup' }>).strike;
    expect(reticleTargets(strike)).toEqual([]);
    expect(strikeRows(strike)).toEqual(['front', 'back']);
  });

  it('plays a hand-made round of the new events as beats, with the charge shown', () => {
    const events: FightEvent[] = [
      { t: 'round_start', round: 4, bossHp: 900, mark: null },
      { t: 'heal', round: 4, supporter: 'b', target: 'a', amount: 5 },
      {
        t: 'charge',
        round: 4,
        landing: 5,
        gimmick: 'great-wave',
        op: 'sweep',
        marks: ['c'],
        rows: ['middle'],
      },
      { t: 'turn', round: 4, creature: 'a' },
      { t: 'round_end', round: 4, bossHp: 900 },
    ];
    const beats = buildBeats(events, 0, ROW, 'tidal-colossus');
    const cues = beats.flatMap((b) => b.cues);
    expect(cues.some((c) => c.kind === 'strike' && c.strike.action === 'charge')).toBe(true);
    expect(cues.some((c) => c.kind === 'float' && c.tone === 'heal')).toBe(true);
    // Every event is in some beat.
    expect(beats.at(-1)?.to).toBe(events.length);
  });

  it('keeps a cover pip as long as a callout, and stands still without motion', () => {
    const cover: Cue = { kind: 'cover', i: 0, creature: 'c', guard: 'b' };
    const [item] = addFx([], [cover], 1000);
    expect(item?.ms).toBe(FX_MS.callout);
    expect(staticFx([cover])).toHaveLength(1);
  });
});

describe('the max HP the stage estimates', () => {
  it('estimates max HP from the species and level, a Guard with its extra HP', () => {
    const species = content.creatures[0];
    if (species === undefined) throw new Error('no species');
    const plain = estimatedMaxHp({ species: species.id, level: 1, role: 'setter' });
    const guard = estimatedMaxHp({ species: species.id, level: 1, role: 'guard' });
    expect(plain).toBe(species.baseStats.hp);
    expect(guard).toBeGreaterThan(plain ?? 0);
    expect(estimatedMaxHp({ species: 'nobody', level: 1, role: 'setter' })).toBeNull();
  });

  it("uses the fight's own Guard HP bonus when it has rules, the content's +30% without", () => {
    const species = content.creatures[0];
    if (species === undefined) throw new Error('no species');
    const guard = { species: species.id, level: 1, role: 'guard' };
    const hp = species.baseStats.hp;
    expect(estimatedMaxHp(guard)).toBe(
      Math.floor((hp * (10_000 + RULES.combat.guardHpBp)) / 10_000),
    );
    // A fight with rules: the Guard has the rules' extra HP (none now), not the old +30%.
    expect(estimatedMaxHp(guard, { guardHpBp: 0, guardArmorBp: 2_500 })).toBe(hp);
    expect(estimatedMaxHp(guard, { guardHpBp: 1_000, guardArmorBp: 0 })).toBe(
      Math.floor((hp * 11_000) / 10_000),
    );
  });
});

describe('state read from the events', () => {
  const charge = (round: number, gimmickId: string, landing: number): FightEvent => ({
    t: 'charge',
    round,
    landing,
    gimmick: gimmickId,
    op: 'sweep',
    marks: ['c', 'd'],
    rows: ['middle'],
  });

  it('keeps a charge marked from its announcement until it lands', () => {
    const events: FightEvent[] = [
      { t: 'round_start', round: 4, bossHp: 9, mark: null },
      charge(4, 'great-wave', 5),
      { t: 'round_end', round: 4, bossHp: 9 },
      { t: 'round_start', round: 5, bossHp: 9, mark: null },
      gimmick(5, 'great-wave', 'sweep', { rows: ['middle'] }),
      bossHit('c', 9),
    ];
    expect(pendingChargesAt(events, 1)).toEqual([]);
    expect(pendingChargesAt(events, 2)).toEqual([
      { gimmick: 'great-wave', landing: 5, marks: ['c', 'd'], rows: ['middle'] },
    ]);
    // Still marked at the start of the landing round, gone once it has fired.
    expect(pendingChargesAt(events, 4)).toHaveLength(1);
    expect(pendingChargesAt(events, 5)).toEqual([]);
  });

  it('drops a charge whose landing round went by without it', () => {
    const events: FightEvent[] = [
      charge(4, 'great-wave', 5),
      { t: 'round_start', round: 6, bossHp: 9, mark: null },
    ];
    expect(pendingChargesAt(events, 1)).toHaveLength(1);
    expect(pendingChargesAt(events, 2)).toEqual([]);
  });

  it('knows two charges at once, and a charge announced again replaces its earlier mark', () => {
    const events: FightEvent[] = [
      charge(4, 'great-wave', 5),
      charge(4, 'seed-burst', 5),
      charge(4, 'great-wave', 5),
    ];
    expect(pendingChargesAt(events, 3).map((c) => c.gimmick)).toEqual(['seed-burst', 'great-wave']);
  });

  it('says when the boss is enraged or has retreated', () => {
    const events: FightEvent[] = [
      { t: 'round_start', round: 13, bossHp: 9, mark: null },
      { t: 'enrage', round: 13, first: true },
      { t: 'retreat', round: 13, bossHp: 700 },
    ];
    expect(enragedAt(events, 1)).toBe(false);
    expect(enragedAt(events, 2)).toBe(true);
    expect(retreatedAt(events, 2)).toBe(false);
    expect(retreatedAt(events, 3)).toBe(true);
    expect(enragedAt(events, 99)).toBe(true);
  });

  it('gives HP back for a heal, never reviving a creature that is down', () => {
    const events: FightEvent[] = [
      bossHit('a', 30),
      { t: 'heal', round: 5, supporter: 'b', target: 'a', amount: 12 },
      bossHit('c', 100),
      { t: 'heal', round: 5, supporter: 'b', target: 'c', amount: 12 },
    ];
    expect(creatureHpAt(events, 2, { a: 50, c: 100 })).toEqual({ a: 32, c: 100 });
    expect(creatureHpAt(events, 4, { a: 50, c: 100 })).toEqual({ a: 32, c: 0 });
  });

  it("gives HP back for Kind Rain's sky heal, never reviving a creature that is down", () => {
    const events: FightEvent[] = [
      bossHit('a', 30),
      bossHit('c', 100),
      {
        t: 'sky_heal',
        round: 6,
        heals: [
          { creature: 'a', amount: 20 },
          { creature: 'c', amount: 20 },
        ],
      },
    ];
    expect(creatureHpAt(events, 3, { a: 50, c: 100 })).toEqual({ a: 40, c: 0 });
  });
});
