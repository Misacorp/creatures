/**
 * Hand-made fights for the workbench's stage page: one boss move (or the enrage banner, a retreat, a
 * Support's heal) on a row of creatures, with the events written out by hand, so every new beat of
 * the raid retune can be looked at without a server or the engine. Fixture data only; nothing here
 * calls the API, and the numbers are not the engine's.
 */
import { RULES, content } from '@creatures/game';
import type { FightEvent } from '@creatures/engine';
import type { RaidPhaseId, ReplayRowEntry } from '../raid-api';
import { estimatedMaxHp } from '../stage';

export const PATTERN_SCENARIOS = [
  'Sweep (Great Wave)',
  'Barrage (Cinder Fall)',
  'Slam (Coil Crush)',
  'Lance (Riptide)',
  'Pincer (Briar Pincer)',
  'Chain (Lightning Rod)',
  'Charge: row marked',
  'Charge: creatures marked',
  'Support heal and cleanse',
  'Kind Rain (a heal for everyone)',
  'Morning Haze (first turns lost)',
  'Bramble Season (a reaction thrown back)',
  'Thorns (spikes prick the hitter)',
  'Stubborn (stays up at 1 HP)',
  'Chance and trigger lines (Echo, Sidestep, Payback)',
  'Cover pips (Guard beside)',
  'Armor pip (a Guard takes less)',
  'Crowded sweep (15 creatures)',
  'Mired: stacks and turns on the boss and a creature',
  'Dodges: a creature and the boss',
  'Shake Off: the boss purges its Mired',
  'Enraged',
  'Retreat, Phase 1',
  'Retreat, Phase 2',
] as const;

export type PatternScenario = (typeof PATTERN_SCENARIOS)[number];

export interface PatternFight {
  boss: { id: string; name: string; retreat?: { phase1: string; phase2: string } | null };
  row: ReplayRowEntry[];
  events: FightEvent[];
  phase: RaidPhaseId | undefined;
  /** The index of the first event of the boss move: where the wind-up is shown (0 when there is none). */
  moveAt: number;
  hpMax: number;
}

const ROLES = ['guard', 'setter', 'payoff', 'support', 'guard', 'payoff'] as const;

/** A row of `n` creatures (ids c0, c1...), from the first species of the content, in a fixed role pattern. */
export function patternRow(n: number): ReplayRowEntry[] {
  const species = content.creatures.filter((c) => c.stage === 1);
  return Array.from({ length: n }, (_, position) => {
    const sp = species[position % species.length];
    if (sp === undefined) throw new Error('the shipped content has no creatures');
    return {
      position,
      id: `c${String(position)}`,
      name: sp.name,
      species: sp.id,
      element: sp.element,
      role: ROLES[position % ROLES.length] ?? 'setter',
      level: 8,
      owner: position % 3 === 0 ? 'p1' : 'p2',
    };
  });
}

const gimmick = (
  round: number,
  id: string,
  op: string,
  extra: Record<string, unknown> = {},
): FightEvent => ({ t: 'gimmick', round, gimmick: id, op, ...extra });

const hit = (
  round: number,
  target: string,
  damage: number,
  extra: Record<string, unknown> = {},
): FightEvent => ({ t: 'boss_hit', round, source: 'gimmick', target, damage, ...extra });

const start = (round: number, bossHp = 1000): FightEvent => ({
  t: 'round_start',
  round,
  bossHp,
  mark: null,
});

/** A Mired application on a creature (`target`) or the boss (null), as the engine writes it. */
const effect = (
  round: number,
  target: string | null,
  stacks: number,
  turnsLeft: number,
): FightEvent => ({
  t: 'effect_apply',
  round,
  target,
  effect: 'mired',
  stacksAdded: stacks,
  stacks,
  turnsLeft,
});

/** The fight of one scenario. */
export function patternFight(scenario: PatternScenario): PatternFight {
  const row = patternRow(6);
  const done = (
    boss: PatternFight['boss'],
    events: FightEvent[],
    over: Partial<PatternFight> = {},
  ): PatternFight => ({
    boss,
    row,
    events,
    phase: undefined,
    moveAt: Math.max(
      0,
      events.findIndex((e) => e.t === 'gimmick'),
    ),
    hpMax: 1000,
    ...over,
  });
  const colossus = { id: 'tidal-colossus', name: 'Tidal Colossus' };
  const wyrm = { id: 'cinder-wyrm', name: 'Cinder Wyrm' };
  const thornmother = { id: 'thornmother', name: 'Thornmother' };
  const sovereign = { id: 'storm-sovereign', name: 'Storm Sovereign' };
  const bogback = { id: 'old-bogback', name: 'Old Bogback' };
  switch (scenario) {
    case 'Sweep (Great Wave)':
      return done(colossus, [
        start(5),
        gimmick(5, 'great-wave', 'sweep', { rows: ['middle'], targets: ['c2', 'c3'] }),
        hit(5, 'c2', 90),
        hit(5, 'c3', 70, { covered: { guard: 'c4', prevented: 40 } }),
      ]);
    case 'Barrage (Cinder Fall)':
      return done(wyrm, [
        start(4),
        gimmick(4, 'cinder-fall', 'barrage', { targets: ['c0', 'c2', 'c3', 'c5'] }),
        hit(4, 'c0', 45),
        hit(4, 'c2', 40, { covered: { guard: 'c1', prevented: 27 } }),
        hit(4, 'c3', 45),
        hit(4, 'c5', 45),
      ]);
    case 'Slam (Coil Crush)':
      return done(wyrm, [
        start(4),
        gimmick(4, 'coil-crush', 'slam', { targets: ['c0'] }),
        hit(4, 'c1', 120, { from: 'c0' }),
        hit(4, 'c0', 54, { splash: true }),
        hit(4, 'c2', 54, { splash: true }),
      ]);
    case 'Lance (Riptide)':
      return done(colossus, [
        start(4),
        gimmick(4, 'riptide', 'lance', { lane: 0, targets: ['c0', 'c2', 'c4'] }),
        hit(4, 'c0', 70),
        hit(4, 'c2', 56),
        hit(4, 'c4', 45),
      ]);
    case 'Pincer (Briar Pincer)':
      return done(thornmother, [
        start(3),
        gimmick(3, 'briar-pincer', 'pincer'),
        hit(3, 'c0', 60),
        hit(3, 'c1', 60),
        hit(3, 'c2', 60),
        hit(3, 'c3', 60),
        hit(3, 'c4', 60),
        hit(3, 'c5', 60),
      ]);
    case 'Chain (Lightning Rod)':
      return done(sovereign, [
        start(2),
        gimmick(2, 'lightning-rod', 'strike_highest_atk'),
        hit(2, 'c4', 80),
        hit(2, 'c0', 44),
        hit(2, 'c2', 24),
      ]);
    case 'Charge: row marked':
      return done(
        colossus,
        [
          start(4),
          {
            t: 'charge',
            round: 4,
            landing: 5,
            gimmick: 'great-wave',
            op: 'sweep',
            marks: ['c2', 'c3'],
            rows: ['middle'],
          },
        ],
        { moveAt: 1 },
      );
    case 'Charge: creatures marked':
      return done(
        thornmother,
        [
          start(4),
          {
            t: 'charge',
            round: 4,
            landing: 5,
            gimmick: 'seed-burst',
            op: 'barrage',
            marks: ['c1', 'c3', 'c5'],
          },
        ],
        { moveAt: 1 },
      );
    case 'Support heal and cleanse':
      return done(
        wyrm,
        [
          start(5),
          { t: 'heal', round: 5, supporter: 'c3', target: 'c2', amount: 18 },
          { t: 'heal', round: 5, supporter: 'c3', target: 'c4', amount: 12 },
          { t: 'cleanse', round: 5, supporter: 'c3', target: 'c4' },
        ],
        { moveAt: 1 },
      );
    case 'Kind Rain (a heal for everyone)':
      return done(wyrm, [
        start(4),
        {
          t: 'sky_heal',
          round: 4,
          heals: [
            { creature: 'c0', amount: 4 },
            { creature: 'c1', amount: 2 },
            { creature: 'c3', amount: 2 },
            { creature: 'c4', amount: 4 },
          ],
        },
        { t: 'turn', round: 4, creature: 'c0' },
      ]);
    case 'Morning Haze (first turns lost)':
      return done(colossus, [
        start(1),
        { t: 'skip', round: 1, creature: 'c0', reason: 'haze' },
        { t: 'turn', round: 1, creature: 'c1' },
        { t: 'skip', round: 1, creature: 'c3', reason: 'haze' },
        { t: 'turn', round: 1, creature: 'c4' },
      ]);
    case 'Bramble Season (a reaction thrown back)':
      return done(colossus, [
        start(3),
        { t: 'turn', round: 3, creature: 'c1' },
        {
          t: 'reaction',
          round: 3,
          reaction: 'steam',
          setupCreature: 'c0',
          setupPlayer: 'p1',
          payoff: 'c1',
          bonus: 70,
          reflected: false,
          bramble: { bp: 3_000, amount: 30 },
        },
        { t: 'boss_hit', round: 3, source: 'reflect', target: 'c1', damage: 30 },
      ]);
    case 'Thorns (spikes prick the hitter)':
      // Every hit on the foe pricks the creature that made it; a reaction's bonus is not part of it.
      return done(colossus, [
        start(2),
        { t: 'turn', round: 2, creature: 'c0' },
        {
          t: 'hit',
          round: 2,
          creature: 'c0',
          damage: 60,
          matchupBp: 10_000,
          bonusBp: 0,
          mark: null,
          bossHp: 940,
        },
        { t: 'boss_hit', round: 2, source: 'spikes', target: 'c0', damage: 6 },
        { t: 'turn', round: 2, creature: 'c1' },
        {
          t: 'hit',
          round: 2,
          creature: 'c1',
          damage: 150,
          matchupBp: 10_000,
          bonusBp: 0,
          mark: 'tide',
          bossHp: 790,
        },
        { t: 'boss_hit', round: 2, source: 'spikes', target: 'c1', damage: 9 },
      ]);
    case 'Stubborn (stays up at 1 HP)': {
      // c1 would be knocked out by the hit (it shows its full damage), but its Stubborn line keeps it at 1 HP.
      const max =
        estimatedMaxHp(row[1] as ReplayRowEntry, {
          guardHpBp: RULES.combat.guard.hpBp,
          guardArmorBp: RULES.combat.guard.armorBp,
        }) ?? 100;
      return done(colossus, [
        start(3),
        {
          t: 'boss_hit',
          round: 3,
          source: 'attack',
          target: 'c1',
          damage: max + 40,
          stubborn: true,
        },
        { t: 'proc', round: 3, creature: 'c1', kind: 'stubborn' },
      ]);
    }
    case 'Chance and trigger lines (Echo, Sidestep, Payback)':
      return done(colossus, [
        start(4),
        { t: 'proc', round: 4, creature: 'c1', kind: 'warm_heart', target: 'c2', amount: 1_000 },
        { t: 'turn', round: 4, creature: 'c2' },
        {
          t: 'hit',
          round: 4,
          creature: 'c2',
          damage: 120,
          matchupBp: 10_000,
          bonusBp: 1_000,
          mark: null,
          bossHp: 880,
        },
        { t: 'proc', round: 4, creature: 'c2', kind: 'echo', amount: 36, bossHp: 844 },
        gimmick(4, 'undertow', 'hit_zone', { targets: ['c0', 'c1'] }),
        hit(4, 'c0', 0, { sidestep: true }),
        hit(4, 'c1', 70),
        { t: 'boss_hit', round: 4, source: 'attack', target: 'c0', damage: 55, from: 'c3' },
        { t: 'proc', round: 4, creature: 'c0', kind: 'payback', amount: 3_000 },
      ]);
    case 'Cover pips (Guard beside)':
      return done(colossus, [
        start(3),
        gimmick(3, 'undertow', 'hit_zone', { targets: ['c0', 'c1'] }),
        hit(3, 'c0', 48, { covered: { guard: 'c1', prevented: 32 } }),
        hit(3, 'c1', 80),
      ]);
    case 'Armor pip (a Guard takes less)':
      // c0 is a Guard: its armor took a quarter off an 80-damage zone hit (60 got through).
      return done(colossus, [
        start(3),
        gimmick(3, 'undertow', 'hit_zone', { targets: ['c0', 'c1'] }),
        hit(3, 'c0', 60, { armored: 20 }),
        hit(3, 'c1', 80),
      ]);
    case 'Crowded sweep (15 creatures)': {
      const big = patternRow(15);
      const events: FightEvent[] = [
        start(6),
        gimmick(6, 'undertow', 'sweep', { rows: ['front', 'middle', 'back'] }),
      ];
      // Most hits are chip damage; a few are big (over 10% of the creature's HP) and keep their number.
      for (const c of big) {
        const max =
          estimatedMaxHp(c, {
            guardHpBp: RULES.combat.guard.hpBp,
            guardArmorBp: RULES.combat.guard.armorBp,
          }) ?? 100;
        const heavy = c.position % 5 === 0;
        events.push(hit(6, c.id, heavy ? Math.floor(max * 0.4) : 2));
      }
      return { ...done(colossus, events), row: big };
    }
    case 'Mired: stacks and turns on the boss and a creature':
      return done(
        bogback,
        [
          start(4, 900),
          effect(4, null, 5, 3),
          effect(4, 'c1', 2, 2),
          effect(4, 'c4', 1, 3),
          { t: 'turn', round: 4, creature: 'c0' },
        ],
        { moveAt: 0 },
      );
    case 'Dodges: a creature and the boss':
      return done(bogback, [
        start(4, 900),
        { t: 'turn', round: 4, creature: 'c0' },
        {
          t: 'hit',
          round: 4,
          creature: 'c0',
          damage: 0,
          matchupBp: 10_000,
          bonusBp: 0,
          mark: null,
          bossHp: 900,
          dodged: true,
        },
        gimmick(4, 'sinking-mud', 'sweep', { rows: ['front'], targets: ['c0', 'c1'] }),
        hit(4, 'c0', 0, { dodged: true }),
        hit(4, 'c1', 80),
      ]);
    case 'Shake Off: the boss purges its Mired':
      return done(bogback, [
        start(5, 800),
        effect(5, null, 4, 2),
        gimmick(5, 'shake-off', 'purge'),
        { t: 'effect_purge', round: 5, removed: [{ effect: 'mired', stacks: 4 }] },
      ]);
    case 'Enraged':
      return done(
        wyrm,
        [
          start(13, 300),
          { t: 'enrage', round: 13, first: true },
          { t: 'boss_hit', round: 13, source: 'attack', target: 'c0', damage: 30 },
          ...row.map((c): FightEvent => ({
            t: 'boss_hit',
            round: 13,
            source: 'enrage',
            target: c.id,
            damage: 60,
          })),
        ],
        { phase: 'finale', moveAt: 0 },
      );
    case 'Retreat, Phase 1':
      return retreatFight('phase1');
    case 'Retreat, Phase 2':
      return retreatFight('phase2');
  }
}

/** A phase that ends at the floor: a last hit, the retreat, and the boss's own line from the content. */
function retreatFight(phase: 'phase1' | 'phase2'): PatternFight {
  const boss = content.bosses.find((b) => b.id === 'tidal-colossus');
  const events: FightEvent[] = [
    start(7, 720),
    {
      t: 'hit',
      round: 7,
      creature: 'c1',
      damage: 40,
      matchupBp: 10_000,
      bonusBp: 0,
      mark: null,
      bossHp: 700,
    },
    { t: 'retreat', round: 7, bossHp: 700 },
  ];
  return {
    boss: {
      id: 'tidal-colossus',
      name: 'Tidal Colossus',
      ...(boss?.retreat === undefined ? {} : { retreat: boss.retreat }),
    },
    row: patternRow(6),
    events,
    phase,
    moveAt: 0,
    hpMax: 1000,
  };
}
