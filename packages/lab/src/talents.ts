/**
 * Combat talents of the combat v2 draft (docs/design/combat/proposals/001-combat-v2.md, R20). A
 * creature rolls talents from its line's pool when it is found (and once more at the migration,
 * roadmap phase 6). Talents use the Knacks' effect grammar; their numbers add to the Knack's, flags
 * combine.
 *
 * Rules (panel 2):
 * - One name per effect, one number per name (P-06), across Knacks, talents and gear.
 * - A talent never repeats a Knack's effect, and Seal is never a talent: the roll must not decide
 *   the Knack choice.
 * - Talents use only fields that add up (`ADDITIVE_FIELDS`), never a Knack's multipliers.
 * - Pools are by role, shared by every line (P-09: 100 species, no per-species effects). Flavour
 *   lives in Knacks.
 * Exploration and crafting talents stay out of the combat rework (Misa, 2026-10-26).
 */
import { content } from '@creatures/game';
import type { KnackFx } from './knacks';
import type { Role } from './types';

export interface TalentDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
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
]);

const T = (def: TalentDef): TalentDef => def;

export const TALENTS: Readonly<Record<string, TalentDef>> = Object.fromEntries(
  [
    T({
      id: 'sharp-claws',
      name: 'Sharp Claws',
      text: 'Attack +8%.',
      intent: 'Plain power for hitters.',
      fx: { atkBp: 800 },
    }),
    T({
      id: 'light-feet',
      name: 'Light Feet',
      text: 'Dodge +10.',
      intent: 'Front-row Setters and Supports; more with dodge auras beside (R1).',
      fx: { dodgeBonusBp: 1_000 },
    }),
    T({
      id: 'keen-eye',
      name: 'Keen Eye',
      text: 'Crit chance +8.',
      intent: 'Feeds Big Finish.',
      fx: { critChanceBp: 800 },
    }),
    T({
      id: 'big-finish',
      name: 'Big Finish',
      text: 'A crit on a hit that sets off a {Reaction} raises its bonus by 60% (inside the cap).',
      intent: 'A Payoff combo talent with Keen Eye; the reaction cap (R7) still holds.',
      fx: { reactionCritBp: 6_000 },
    }),
    T({
      id: 'first-strike',
      name: 'First Strike',
      text: 'Its first hit that lands each fight deals +40%.',
      intent: 'Short fights, the dungeon and each raid stage.',
      fx: { firstHitBp: 4_000 },
    }),
    T({
      id: 'unflappable',
      name: 'Unflappable',
      text: 'It cannot be {Silenced}.',
      intent: 'The silence answer on the creature itself, for row ends and front rows.',
      fx: { ignoreSilence: true },
    }),
    T({
      id: 'tough-hide',
      name: 'Tough Hide',
      text: 'Armour +6.',
      intent: 'Blocks more small hits (R13): Swarm and multi-hit bosses.',
      fx: { armourBonus: 6 },
    }),
    T({
      id: 'broad-back',
      name: 'Broad Back',
      text: 'Cover +15.',
      intent: 'A Guard against sweeps.',
      fx: { coverBonusBp: 1_500 },
    }),
    T({
      id: 'second-wind',
      name: 'Second Wind',
      text: 'Once per fight, when a hit drops it below half its max HP, it heals 20% of max HP.',
      intent: 'A Guard that survives one big hit (Crusher, Payoff Hunter).',
      fx: { secondWindBp: 2_000 },
    }),
    T({
      id: 'big-heart',
      name: 'Big Heart',
      text: 'Its {Boost} +5%.',
      intent: 'A Support that hits harder through others.',
      fx: { boostBonusBp: 500 },
    }),
    T({
      id: 'gentle-touch',
      name: 'Gentle Touch',
      text: 'Its heal +3% of max HP (a Support of any element heals with it).',
      intent: 'Makes Ember and Spark Supports small healers.',
      fx: { mendBonusBp: 300 },
    }),
  ].map((t) => [t.id, t]),
);

/** The role talents: every form of a role rolls from the same four. */
export const BY_ROLE: Readonly<Record<Role, readonly string[]>> = {
  setter: ['sharp-claws', 'light-feet', 'unflappable', 'tough-hide'],
  payoff: ['sharp-claws', 'keen-eye', 'big-finish', 'first-strike'],
  guard: ['tough-hide', 'broad-back', 'unflappable', 'second-wind'],
  support: ['big-heart', 'gentle-touch', 'unflappable', 'light-feet'],
};

export interface PoolEntry {
  readonly talent: string;
  /** The roles of the line's forms this talent is meant for. */
  readonly roles: readonly Role[];
}

/** A line's pool: the role talents of its forms' roles. */
export function talentPool(line: string): PoolEntry[] {
  const roles = [...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role))];
  const out = new Map<string, Role[]>();
  for (const r of roles) for (const t of BY_ROLE[r]) out.set(t, [...(out.get(t) ?? []), r]);
  return [...out.entries()].map(([talent, rs]) => ({ talent, roles: rs }));
}

/** Every creature line (each has a pool from its forms' roles). */
export const TALENT_LINES: readonly string[] = [...new Set(content.creatures.map((c) => c.line))];

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
