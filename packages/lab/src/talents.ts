/**
 * Combat talents of the combat v2 draft (docs/design/combat/proposals/001-combat-v2.md, R20). One
 * shared library; each creature line links to its own pool from it (Misa, 2026-10-27), so two lines
 * of the same role can roll different tools. A creature rolls from its line's pool when it is found
 * and through the Talent Book over time; the migration rerolls them (roadmap phase 6, a golden talent
 * rolls golden). Talents use the Knacks' effect grammar; their numbers add to the Knack's.
 *
 * Rules (panel 2, Misa 2026-10-26):
 * - One name per effect, one number per name (P-06), across Knacks, talents and gear; every species
 *   uses the shared names.
 * - A talent never repeats a Knack's effect, and Seal is never a talent: the roll must not decide
 *   the Knack choice.
 * - Talents use only fields that add up (`ADDITIVE_FIELDS`), never a Knack's multipliers.
 * - A talent that does nothing for a form's role is idle on it (shown as such, as in the game today).
 * Exploration and crafting talents stay out of the combat rework (Misa, 2026-10-26).
 */
import { content } from '@creatures/game';
import type { KnackFx } from './knacks';
import type { Role } from './types';

const ALL: readonly Role[] = ['setter', 'payoff', 'guard', 'support'];

export interface TalentDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  /** The roles it does something for; on any other role it is idle. */
  readonly roles: readonly Role[];
  /** Design intent for contributors (never shown to players). */
  readonly intent: string;
  readonly fx: KnackFx;
}

/** Effect fields whose values add when a Knack and talents combine (a talent may use only these). */
export const ADDITIVE_FIELDS: ReadonlySet<keyof KnackFx> = new Set<keyof KnackFx>([
  'atkBp',
  'dodgeBonusBp',
  'critChanceBp',
  'reactionCritBp',
  'firstHitBp',
  'ignoreSilence',
  'armourBonus',
  'coverBonusBp',
  'secondWindBp',
  'boostBonusBp',
  'mendBonusBp',
  'hpBp',
  'critDamageBp',
  'lowHpAtkBp',
  'areaCutBp',
  'holdOn',
  'reactionBonusBp',
  'areaDodgeBp',
]);

const T = (def: TalentDef): TalentDef => def;

export const TALENTS: Readonly<Record<string, TalentDef>> = Object.fromEntries(
  [
    T({
      id: 'sharp-claws',
      name: 'Sharp Claws',
      text: 'Attack +8%.',
      roles: ['setter', 'payoff'],
      intent: 'Plain power for hitters.',
      fx: { atkBp: 800 },
    }),
    T({
      id: 'light-feet',
      name: 'Light Feet',
      text: 'Dodge +10.',
      roles: ALL,
      intent: 'Front-row creatures; more with dodge auras beside (R1).',
      fx: { dodgeBonusBp: 1_000 },
    }),
    T({
      id: 'nimble',
      name: 'Nimble',
      text: 'Dodge +10 against {Area hit}s.',
      roles: ALL,
      intent: 'Sweeps and splashes (Great Wave, Payoff Hunter).',
      fx: { areaDodgeBp: 1_000 },
    }),
    T({
      id: 'keen-eye',
      name: 'Keen Eye',
      text: 'Crit chance +8.',
      roles: ['setter', 'payoff'],
      intent: 'Feeds Mighty Blow and Big Finish.',
      fx: { critChanceBp: 800 },
    }),
    T({
      id: 'mighty-blow',
      name: 'Mighty Blow',
      text: 'Its crits deal +30%.',
      roles: ['setter', 'payoff'],
      intent: 'A crit build with Keen Eye.',
      fx: { critDamageBp: 3_000 },
    }),
    T({
      id: 'big-finish',
      name: 'Big Finish',
      text: 'A crit on a hit that sets off a {Reaction} raises its bonus by 60% (inside the cap).',
      roles: ['payoff'],
      intent: 'A Payoff combo talent with Keen Eye; the reaction cap (R7) still holds.',
      fx: { reactionCritBp: 6_000 },
    }),
    T({
      id: 'hungry',
      name: 'Hungry',
      text: 'Its {Reaction} bonus +15% (inside the cap).',
      roles: ['payoff'],
      intent: 'A steady Payoff talent, no crit needed.',
      fx: { reactionBonusBp: 1_500 },
    }),
    T({
      id: 'first-strike',
      name: 'First Strike',
      text: 'Its first hit that lands each fight deals +40%.',
      roles: ['setter', 'payoff'],
      intent: 'Short fights, the dungeon and each raid stage.',
      fx: { firstHitBp: 4_000 },
    }),
    T({
      id: 'cornered',
      name: 'Cornered',
      text: '+25% on its hits while it is below half its max HP.',
      roles: ['setter', 'payoff'],
      intent: 'A comeback talent; strong with healers and Second Wind.',
      fx: { lowHpAtkBp: 2_500 },
    }),
    T({
      id: 'unflappable',
      name: 'Unflappable',
      text: 'It cannot be {Silenced}.',
      roles: ALL,
      intent: 'The silence answer on the creature itself, for row ends and front rows.',
      fx: { ignoreSilence: true },
    }),
    T({
      id: 'tough-hide',
      name: 'Tough Hide',
      text: 'Armour +6.',
      roles: ALL,
      intent: 'Blocks more small hits (R13): Swarm and multi-hit bosses.',
      fx: { armourBonus: 6 },
    }),
    T({
      id: 'hardy',
      name: 'Hardy',
      text: 'Max HP +10%.',
      roles: ALL,
      intent: 'Plain staying power; carries through a raid weekend (R14).',
      fx: { hpBp: 1_000 },
    }),
    T({
      id: 'hunker-down',
      name: 'Hunker Down',
      text: 'It takes 20% less from {Area hit}s.',
      roles: ALL,
      intent: 'Its own cut; adds to a Row Ward beside it.',
      fx: { areaCutBp: 2_000 },
    }),
    T({
      id: 'hold-on',
      name: 'Hold On',
      text: 'Once per fight, a hit that would knock it out leaves it at 1 HP.',
      roles: ALL,
      intent: 'Survives one Crusher; pairs with healers.',
      fx: { holdOn: true },
    }),
    T({
      id: 'second-wind',
      name: 'Second Wind',
      text: 'Once per fight, when a hit drops it below half its max HP, it heals 20% of max HP.',
      roles: ALL,
      intent: 'Survives one big hit (Crusher, Payoff Hunter).',
      fx: { secondWindBp: 2_000 },
    }),
    T({
      id: 'broad-back',
      name: 'Broad Back',
      text: 'Cover +15.',
      roles: ['guard'],
      intent: 'A Guard against sweeps.',
      fx: { coverBonusBp: 1_500 },
    }),
    T({
      id: 'big-heart',
      name: 'Big Heart',
      text: 'Its {Boost} +5%.',
      roles: ['support'],
      intent: 'A Support that hits harder through others.',
      fx: { boostBonusBp: 500 },
    }),
    T({
      id: 'gentle-touch',
      name: 'Gentle Touch',
      text: 'Its heal +3% of max HP (a Support of any element heals with it).',
      roles: ['support'],
      intent: 'Makes Ember and Spark Supports small healers.',
      fx: { mendBonusBp: 300 },
    }),
  ].map((t) => [t.id, t]),
);

/**
 * Each line's pool: 7 talents from the library, chosen for the line's forms and flavour (branch forms
 * share the line's pool, as in the game today). Every role in a line has at least three that fit it.
 */
export const LINE_POOLS: Readonly<Record<string, readonly string[]>> = {
  splashet: [
    'light-feet',
    'sharp-claws',
    'unflappable',
    'first-strike',
    'hunker-down',
    'keen-eye',
    'hungry',
  ],
  cindle: [
    'sharp-claws',
    'keen-eye',
    'mighty-blow',
    'big-finish',
    'cornered',
    'light-feet',
    'first-strike',
  ],
  sproutle: [
    'tough-hide',
    'broad-back',
    'hardy',
    'second-wind',
    'gentle-touch',
    'big-heart',
    'hold-on',
  ],
  zipmouse: [
    'light-feet',
    'nimble',
    'sharp-claws',
    'unflappable',
    'keen-eye',
    'tough-hide',
    'first-strike',
  ],
  mistnewt: [
    'unflappable',
    'hardy',
    'hunker-down',
    'broad-back',
    'gentle-touch',
    'second-wind',
    'nimble',
  ],
  ashmole: [
    'big-heart',
    'gentle-touch',
    'tough-hide',
    'hunker-down',
    'hardy',
    'cornered',
    'broad-back',
  ],
  stormray: [
    'keen-eye',
    'big-finish',
    'mighty-blow',
    'sharp-claws',
    'gentle-touch',
    'big-heart',
    'nimble',
  ],
  mossback: [
    'tough-hide',
    'hardy',
    'hold-on',
    'unflappable',
    'hungry',
    'sharp-claws',
    'hunker-down',
  ],
  coralynx: [
    'sharp-claws',
    'keen-eye',
    'cornered',
    'hungry',
    'light-feet',
    'first-strike',
    'mighty-blow',
  ],
  solmane: [
    'first-strike',
    'sharp-claws',
    'unflappable',
    'hardy',
    'light-feet',
    'cornered',
    'tough-hide',
  ],
  gaiadrake: [
    'hardy',
    'hungry',
    'big-finish',
    'tough-hide',
    'hold-on',
    'sharp-claws',
    'hunker-down',
  ],
  aurorix: [
    'big-heart',
    'nimble',
    'light-feet',
    'gentle-touch',
    'unflappable',
    'keen-eye',
    'hardy',
  ],
  lanternfin: [
    'gentle-touch',
    'big-heart',
    'unflappable',
    'light-feet',
    'second-wind',
    'hardy',
    'nimble',
  ],
  hearthshell: [
    'broad-back',
    'tough-hide',
    'second-wind',
    'hold-on',
    'hardy',
    'hunker-down',
    'unflappable',
  ],
  mudlump: [
    'hardy',
    'hold-on',
    'tough-hide',
    'second-wind',
    'broad-back',
    'hunker-down',
    'cornered',
  ],
  squelch: [
    'big-heart',
    'gentle-touch',
    'cornered',
    'hardy',
    'nimble',
    'unflappable',
    'light-feet',
  ],
};

export interface PoolEntry {
  readonly talent: string;
  /** The roles of the line's forms this talent does something for. */
  readonly roles: readonly Role[];
}

/** The roles of a line's forms. */
export function lineRoles(line: string): Role[] {
  return [...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role))];
}

/** A line's pool, each talent with the line's roles it fits. */
export function talentPool(line: string): PoolEntry[] {
  const roles = lineRoles(line);
  return (LINE_POOLS[line] ?? []).map((t) => ({
    talent: t,
    roles: roles.filter((r) => TALENTS[t]?.roles.includes(r)),
  }));
}

/** The lines with a talent pool. */
export const TALENT_LINES: readonly string[] = Object.keys(LINE_POOLS);

export function talent(id: string): TalentDef | undefined {
  return TALENTS[id];
}

/** Knack and talent effects together: numbers add, flags combine, a Support shape comes from the Knack. */
export function mergeFx(parts: readonly KnackFx[]): KnackFx {
  const out: Record<string, unknown> = {};
  for (const p of parts) {
    for (const [key, value] of Object.entries(p)) {
      const prev = out[key];
      if (typeof value === 'number') out[key] = (typeof prev === 'number' ? prev : 0) + value;
      else if (typeof value === 'boolean') out[key] = prev === true || value;
      else if (prev === undefined) out[key] = value;
    }
  }
  return out;
}
