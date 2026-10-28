/**
 * Which mechanics the bosses and foes call for (Misa, 2026-10-28: every mechanic should matter somewhere: each Knack
 * family, talent kind, keyword, armour, silence, Mired, marks, Charged moves, Taunt, intercept and cover should be the
 * answer or the problem for at least one boss or foe). Each mechanic has a predicate over a boss's data that returns why
 * it is present, or nothing. These predicates only say a feature is PRESENT on a boss ("features present"); that a
 * mechanic is really called for is measured (`ablation.ts`: taking it out of the boss's best line costs the line
 * clearly). The predicates read the data, so a change to a boss changes the list: nothing is claimed by hand.
 */
import { FAMILIES } from './knacks';
import { KEYWORDS } from './keywords';
import { MODIFIER_CATEGORIES } from './modifiers';
import { ESCALATION_FEEDS, type BossDef, type BossMove, type Pattern } from './types';

/** Why a boss calls for a mechanic, or a falsy value when it does not. */
export type Reason = string | false | undefined;

export interface Mechanic {
  readonly id: string;
  readonly name: string;
  readonly group: 'Knack family' | 'Keyword' | 'Rule' | 'Talent kind' | 'Escalation feed';
  /** Why the boss calls for it (a short phrase), or undefined when it does not. */
  readonly calls: (boss: BossDef) => Reason;
}

interface Attack {
  readonly pattern: Pattern;
  readonly powerBp: number;
  readonly plain: boolean;
  readonly hits: number;
  readonly silenceTurns: number;
  readonly charged: boolean;
}

/** Every attack the boss can make: its plain attack, its moves and its phase's moves. */
export function attacksOf(boss: BossDef): Attack[] {
  const fromMove = (m: BossMove): Attack => ({
    pattern: m.pattern,
    powerBp: m.powerBp,
    plain: false,
    hits: 1,
    silenceTurns: m.silenceTurns ?? 0,
    charged: m.charged ?? false,
  });
  return [
    {
      pattern: boss.plain.pattern,
      powerBp: boss.plain.powerBp,
      plain: true,
      hits: boss.plain.hits ?? 1,
      silenceTurns: 0,
      charged: false,
    },
    ...boss.moves.map(fromMove),
    ...(boss.escalation?.phase?.moves.map(fromMove) ?? []),
  ];
}

const AREA_SHAPES: readonly Pattern['shape'][] = [
  'line3',
  'row',
  'column',
  'rowEnds',
  'randomRow',
  'all',
  'scatter',
  'chain',
  'columns',
  'rows',
  'cross',
  'checker',
];
const dealsDamage = (a: Attack) => a.silenceTurns === 0 && a.powerBp > 0;
const area = (a: Attack) => dealsDamage(a) && AREA_SHAPES.includes(a.pattern.shape);
/** An aimed hit: one slot, or the first slot of a line, chain or cross. */
const aimed = (a: Attack) =>
  dealsDamage(a) &&
  (a.pattern.shape === 'single' ||
    a.pattern.shape === 'line3' ||
    a.pattern.shape === 'chain' ||
    a.pattern.shape === 'cross');
const shapes = (boss: BossDef, ...s: Pattern['shape'][]) =>
  attacksOf(boss).some((a) => dealsDamage(a) && s.includes(a.pattern.shape));
const silences = (boss: BossDef) => attacksOf(boss).some((a) => a.silenceTurns > 0);
const charged = (boss: BossDef) => attacksOf(boss).some((a) => a.charged);
/** The boss's own dodge in Speed points (a card such as Elusive raises it). */
const dodgy = (boss: BossDef) => boss.spd >= 300;
/** Shapes with no anchor (scatter, a random row, everything, the row ends): Taunt does not move them. */
const ANCHORLESS_SHAPES: readonly Pattern['shape'][] = ['scatter', 'randomRow', 'all', 'rowEnds'];
/** Whether Taunt can draw the boss's plain attack off its anchor: it has an anchor, and it is not the front already. */
const tauntable = (b: BossDef) =>
  !ANCHORLESS_SHAPES.includes(b.plain.pattern.shape) && b.plain.pattern.anchor !== 'front';
const armoured = (boss: BossDef) => boss.armour >= 38;

const first = (...reasons: Reason[]): Reason => reasons.find((r) => typeof r === 'string');

/** The Knack families (`FAMILIES`), each answered or posed by a feature of a boss. "Signature" is one species' twist, so it is not asked for. */
const FAMILY_CALLS: Readonly<Record<string, Mechanic['calls']>> = {
  Seal: (b) => b.mods.shedMarks && 'it sheds marks after its turns (Clean Scales)',
  Lead: (b) => armoured(b) && 'armour: a boosted hit gets past it',
  'Heavy Prime': (b) =>
    b.armour >= 60 && 'armour that Blocks a Setter’s hit anyway: trade the hit for marks',
  'Self Prime': (b) => silences(b) && 'it silences Setters: another creature must mark',
  'Guard Prime': (b) => silences(b) && 'it silences Setters: another creature must mark',
  'Support Prime': (b) => silences(b) && 'it silences Setters: another creature must mark',
  Detonator: (b) =>
    first(
      b.escalation?.feed === 'reactions' && 'its escalation feeds on reactions: few, big ones',
      b.armour >= 60 && 'armour: only big hits get through',
    ),
  Chain: (b) =>
    first(
      b.mods.fizzle && 'Fizzle holds a mark made by a reaction',
      b.mods.reflectFirst && 'it reflects the first reaction: a trail needs another Payoff',
    ),
  Flurry: (b) => b.mods.capPerHit !== undefined && 'no hit deals more than a cap',
  Reach: (b) => shapes(b, 'row', 'rows', 'line3', 'cross') && 'area hits a Guard covers by reach',
  Intercept: (b) => attacksOf(b).some(aimed) && 'aimed hits a Guard can take',
  Taunt: (b) =>
    tauntable(b) && 'its plain attack aims at the strongest, the loudest or a random slot',
  Evasion: (b) =>
    attacksOf(b).some((a) => a.plain && a.hits > 1) && 'many small hits dodge can turn away',
  'Evasion aura': (b) =>
    shapes(b, 'scatter', 'all', 'row', 'rows', 'columns') && 'area hits are dodged at half chance',
  'Row Ward': (b) => shapes(b, 'row', 'rows', 'all', 'randomRow') && 'whole rows hit at once',
  Ward: (b) => silences(b) && 'it silences creatures',
  Pierce: (b) => armoured(b) && 'armour that Blocks small hits',
  Partner: (b) =>
    shapes(b, 'chain', 'cross', 'checker') && 'who stands beside whom decides who is hit',
  'Support shape': (b) =>
    (shapes(b, 'column', 'columns') ||
      b.plain.pattern.anchor === 'back' ||
      attacksOf(b).some((a) => a.pattern.anchor === 'back')) &&
    'it hits columns and the back, where a Support stands',
  Sustain: (b) =>
    first(
      b.mods.healBp !== undefined && 'healing is cut (Wither)',
      attacksOf(b).some((a) => a.pattern.anchor === 'weakest') && 'it picks the wounded',
      b.mods.reflectFirst && 'a reflected reaction hurts the Payoff',
    ),
  Store: (b) =>
    (shapes(b, 'scatter') || b.plain.hits !== undefined) && 'many hits that fill a Store',
  Debuff: (b) =>
    first(
      b.mods.shakeEvery !== undefined && 'it washes every debuff off itself',
      b.escalation && 'Mired holds its escalation',
    ),
};

const KEYWORD_CALLS: Readonly<Record<string, Mechanic['calls']>> = {
  Mark: (b) =>
    (b.mods.shedMarks || b.mods.fizzle || b.mods.reflectFirst || b.mods.adapts) &&
    'it acts on marks and reactions',
  Reaction: (b) =>
    (b.mods.reflectFirst || b.mods.adapts || b.escalation?.feed === 'reactions') &&
    'it answers reactions',
  Spend: (b) => (b.mods.adapts || b.escalation?.feed === 'reactions') && 'fewer, bigger reactions',
  Store: (b) =>
    (shapes(b, 'scatter') || b.plain.hits !== undefined) && 'many hits that fill a Store',
  Seal: (b) => b.mods.shedMarks && 'it sheds marks',
  Taunt: (b) => tauntable(b) && 'its plain attack can be drawn',
  Intercept: (b) => attacksOf(b).some(aimed) && 'aimed hits',
  Retaliate: (b) =>
    attacksOf(b).some((a) => aimed(a) && a.powerBp >= 10_000) &&
    'heavy aimed hits a dodge can turn away',
  Blocked: (b) =>
    (armoured(b) || attacksOf(b).some((a) => a.plain && a.hits > 1)) &&
    'armour turns small hits into Blocked',
  Silenced: (b) => silences(b) && 'it silences creatures',
  Charged: (b) => charged(b) && 'moves announced at round start',
  Mired: (b) =>
    (b.mods.shakeEvery !== undefined || b.escalation) && 'it washes debuffs off, or Mired holds it',
  Beside: (b) => shapes(b, 'line3', 'chain', 'cross') && 'hits that spread to the creatures beside',
  'Row end': (b) => shapes(b, 'rowEnds') && 'it hits the ends of the rows',
  'Front row': (b) =>
    attacksOf(b).some(
      (a) => a.pattern.anchor === 'front' && ['row', 'rows', 'all'].includes(a.pattern.shape),
    ) && 'the front row takes its sweeps',
  Reach: (b) => shapes(b, 'row', 'rows', 'line3', 'cross') && 'area hits a Guard covers',
  Boost: (b) => silences(b) && 'a silenced Support gives no boost',
  'Area hit': (b) => attacksOf(b).some(area) && 'area hits',
};

const RULE_CALLS: readonly Mechanic[] = [
  {
    id: 'rule:armour',
    name: 'Armour',
    group: 'Rule',
    calls: (b) =>
      first(
        armoured(b) && 'its armour Blocks small hits',
        attacksOf(b).some((a) => a.plain && a.hits > 1) &&
          'many small hits meet the creatures’ armour',
      ),
  },
  {
    id: 'rule:dodge',
    name: 'Dodge',
    group: 'Rule',
    calls: (b) =>
      first(
        dodgy(b) && 'it is hard to hit',
        b.escalation?.feed === 'dodges' && 'its dodges feed its escalation',
        shapes(b, 'scatter') && 'scattered hits can be dodged',
      ),
  },
  {
    id: 'rule:silence',
    name: 'Silence',
    group: 'Rule',
    calls: (b) => silences(b) && 'it silences',
  },
  {
    id: 'rule:mired',
    name: 'Mired',
    group: 'Rule',
    calls: (b) =>
      first(
        b.mods.shakeEvery !== undefined && 'it washes every debuff off itself',
        b.escalation && 'Mired holds its escalation',
      ),
  },
  {
    id: 'rule:marks',
    name: 'Marks',
    group: 'Rule',
    calls: (b) =>
      first(
        b.mods.shedMarks && 'it sheds marks',
        b.mods.fizzle && 'Fizzle holds marks',
        b.mods.reflectFirst && 'it reflects the first reaction',
      ),
  },
  {
    id: 'rule:charged',
    name: 'Charged moves',
    group: 'Rule',
    calls: (b) => charged(b) && 'it announces moves at round start',
  },
  {
    id: 'rule:taunt',
    name: 'Taunt',
    group: 'Rule',
    calls: (b) => tauntable(b) && 'its plain attack can be drawn off',
  },
  {
    id: 'rule:intercept',
    name: 'Intercept',
    group: 'Rule',
    calls: (b) => attacksOf(b).some(aimed) && 'aimed hits can be taken',
  },
  {
    id: 'rule:cover',
    name: 'Cover',
    group: 'Rule',
    calls: (b) => attacksOf(b).some(area) && 'area hits a Guard covers',
  },
  {
    id: 'rule:escalation',
    name: 'Escalation',
    group: 'Rule',
    calls: (b) =>
      b.escalation !== undefined && `${b.escalation.name} grows with ${b.escalation.feed}`,
  },
  {
    id: 'rule:adaptation',
    name: 'Adaptation',
    group: 'Rule',
    calls: (b) =>
      first(
        b.mods.adapts && 'it resists your most-used reaction',
        b.mods.adaptsElement && 'it resists your strongest element',
      ),
  },
];

const TALENT_CALLS: Readonly<Record<(typeof MODIFIER_CATEGORIES)[number], Mechanic['calls']>> = {
  damage: (b) => (b.mods.capPerHit !== undefined || armoured(b)) && 'hits must be worth landing',
  marks: (b) =>
    (b.mods.shedMarks ||
      b.mods.fizzle ||
      b.mods.reflectFirst ||
      b.escalation?.feed === 'reactions') &&
    'it acts on marks and reactions',
  protection: (b) =>
    attacksOf(b).some((a) => dealsDamage(a) && a.powerBp >= 12_000) && 'heavy hits',
  team: (b) =>
    (silences(b) || b.mods.healBp !== undefined || b.mods.shakeEvery !== undefined) &&
    'silence, drained healing or a boss that washes debuffs',
  outside: () => undefined,
};

/** Every mechanic the check asks about, in a fixed order. `outside` talents (trips, crafting, catches) are never fights and are left out of the check. */
export const MECHANICS: readonly Mechanic[] = [
  ...Object.keys(FAMILIES)
    .filter((f) => f !== 'Signature')
    .map<Mechanic>((f) => ({
      id: `family:${f}`,
      name: f,
      group: 'Knack family',
      calls: FAMILY_CALLS[f] ?? (() => undefined),
    })),
  ...Object.keys(KEYWORDS).map<Mechanic>((k) => ({
    id: `keyword:${k}`,
    name: k,
    group: 'Keyword',
    calls: KEYWORD_CALLS[k] ?? (() => undefined),
  })),
  ...RULE_CALLS,
  ...MODIFIER_CATEGORIES.filter((c) => c !== 'outside').map<Mechanic>((c) => ({
    id: `talent:${c}`,
    name: c,
    group: 'Talent kind',
    calls: TALENT_CALLS[c],
  })),
  ...ESCALATION_FEEDS.map<Mechanic>((f) => ({
    id: `feed:${f}`,
    name: f,
    group: 'Escalation feed',
    calls: (b) =>
      b.escalation !== undefined && b.escalation.feed === f && `${b.escalation.name} feeds on ${f}`,
  })),
];

export interface Coverage {
  readonly mechanic: Mechanic;
  /** Bosses and foes that call for it, with why. */
  readonly callers: readonly { readonly id: string; readonly name: string; readonly why: string }[];
}

/** For every mechanic, the bosses that call for it (the reason is the predicate's). */
export function coverage(bosses: readonly BossDef[]): Coverage[] {
  return MECHANICS.map((mechanic) => ({
    mechanic,
    callers: bosses.flatMap((b) => {
      const why = mechanic.calls(b);
      return typeof why === 'string' ? [{ id: b.id, name: b.name, why }] : [];
    }),
  }));
}
