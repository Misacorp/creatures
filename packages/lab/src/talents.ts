/**
 * Combat talents of the combat v2 draft (docs/design/combat/proposals/001-combat-v2.md). A creature
 * rolls talents from its line's pool when it is found (and once more at the migration, roadmap
 * phase 6). Talents use the Knacks' effect grammar; numbers add up with the Knack's, flags combine.
 * Exploration and crafting talents stay out of the combat rework (Misa, 2026-10-26).
 *
 * Naming (P-06): a talent that appears in several pools keeps one name; a line's own flavour
 * talent has an effect no other pool has.
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

const T = (def: TalentDef): TalentDef => def;

export const TALENTS: Readonly<Record<string, TalentDef>> = Object.fromEntries(
  [
    // Shared by role (the same effect keeps the same name in every pool).
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
      text: '+8 dodge.',
      intent: 'A little dodge, more with Guards beside (R1).',
      fx: { dodgeBonusBp: 800 },
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
      text: 'A crit on a hit that sets off a {Reaction} deals 60% more.',
      intent: 'A Payoff combo talent with Keen Eye and crit gear.',
      fx: { reactionCritBp: 6_000 },
    }),
    T({
      id: 'first-strike',
      name: 'First Strike',
      text: 'Its first hit each fight deals +40%.',
      intent: 'Short fights and the dungeon.',
      fx: { firstHitBp: 4_000 },
    }),
    T({
      id: 'unflappable',
      name: 'Unflappable',
      text: 'It cannot be {Silenced}.',
      intent: 'The silence answer on the creature itself.',
      fx: { ignoreSilence: true },
    }),
    T({
      id: 'tough-hide',
      name: 'Tough Hide',
      text: 'Armour +6.',
      intent: 'Blocks more small hits (R13).',
      fx: { armourBonus: 6 },
    }),
    T({
      id: 'steady-paws',
      name: 'Steady Paws',
      text: 'Its cover is 15 points stronger.',
      intent: 'Guards against sweeps.',
      fx: { coverBonusBp: 1_500 },
    }),
    T({
      id: 'quick-healer',
      name: 'Quick Healer',
      text: 'Healing it receives +30%.',
      intent: 'Pairs with healer Supports.',
      fx: { healReceivedBp: 3_000 },
    }),
    T({
      id: 'warm-heart',
      name: 'Warm Heart',
      text: 'Its {Boost} is 5 points stronger.',
      intent: 'A Support that hits harder through others.',
      fx: { boostBonusBp: 500 },
    }),
    T({
      id: 'gentle-touch',
      name: 'Gentle Touch',
      text: 'It heals 3 points more (a Support of any element heals with it).',
      intent: 'Makes Ember and Spark Supports small healers.',
      fx: { mendBonusBp: 300 },
    }),
    T({
      id: 'lasting-marks',
      name: 'Lasting Marks',
      text: '{Seal}: its marks are not shed by the boss.',
      intent: 'A Setter that answers shedding bosses without spending its Knack on it.',
      fx: { seal: true },
    }),
    // One flavour talent per line: an effect no other pool has.
    T({
      id: 'proud-wings',
      name: 'Proud Wings',
      text: 'Crit chance +5, and a crit on a {Reaction} hit deals 90% more.',
      intent: 'Stormray line: the showy crit Payoff.',
      fx: { critChanceBp: 500, reactionCritBp: 9_000 },
    }),
    T({
      id: 'stands-close',
      name: 'Stands Close',
      text: 'Its cover is 25 points stronger.',
      intent: 'Sproutle line: guards friends by standing close.',
      fx: { coverBonusBp: 2_500 },
    }),
    T({
      id: 'toasty-paws',
      name: 'Toasty Paws',
      text: 'It heals 4 points more, and its {Boost} 3 points more.',
      intent: 'Ashmole line: a warm burrow for friends.',
      fx: { mendBonusBp: 400, boostBonusBp: 300 },
    }),
    T({
      id: 'zoomies',
      name: 'Zoomies',
      text: '+15 dodge.',
      intent: 'Zipmouse line: never sits still.',
      fx: { dodgeBonusBp: 1_500 },
    }),
    T({
      id: 'fiercely-loyal',
      name: 'Fiercely Loyal',
      text: '+15% on its hits while a living Guard stands beside it.',
      intent: 'Cindle line: loyal to its team.',
      fx: { besideGuardBp: 1_500 },
    }),
    T({
      id: 'slow-and-unbothered',
      name: 'Slow and Unbothered',
      text: 'It cannot be {Silenced}, and Armour +4.',
      intent: 'Mistnewt line: takes its time with everything.',
      fx: { ignoreSilence: true, armourBonus: 4 },
    }),
    T({
      id: 'tends-the-garden',
      name: 'Tends the Garden',
      text: 'Creatures beside it take 10% less from {Area hit}s.',
      intent: 'Mossback line: the garden on its shell.',
      fx: { besideAreaCutBp: 1_000 },
    }),
    T({
      id: 'splashes-everywhere',
      name: 'Splashes Everywhere',
      text: 'When it dodges, it hits back for 30% of its Attack ({Retaliate}).',
      intent: 'Splashet line: playful and splashy.',
      fx: { retaliateBp: 3_000 },
    }),
    T({
      id: 'lone-hunter',
      name: 'Lone Hunter',
      text: '+15% on its hits while no other Payoff stands in its row.',
      intent: 'Coralynx: fierce about its territory.',
      fx: { alonePayoffBp: 1_500 },
    }),
    T({
      id: 'leads-from-the-front',
      name: 'Leads from the Front',
      text: 'Its first hit each fight deals +70%.',
      intent: 'Solmane: loves to lead from the front.',
      fx: { firstHitBp: 7_000 },
    }),
    T({
      id: 'ecosystem',
      name: 'Ecosystem',
      text: 'Creatures beside it take 15% less from {Area hit}s, and Armour +4.',
      intent: 'Gaiadrake: protects every living thing it carries.',
      fx: { besideAreaCutBp: 1_500, armourBonus: 4 },
    }),
    T({
      id: 'starry-nights',
      name: 'Starry Nights',
      text: 'Its {Boost} is 8 points stronger.',
      intent: 'Aurorix: looks after friends from a distance.',
      fx: { boostBonusBp: 800 },
    }),
    T({
      id: 'gentle-glow',
      name: 'Gentle Glow',
      text: 'It heals 5 points more.',
      intent: 'Lanternfin: guides friends through the dark.',
      fx: { mendBonusBp: 500 },
    }),
    T({
      id: 'shares-its-warmth',
      name: 'Shares Its Warmth',
      text: 'At round start it heals the creatures in its {Reach} by 2%.',
      intent: 'Hearthshell: happy to share its warmth.',
      fx: { guardMendBp: 200 },
    }),
    T({
      id: 'squishy',
      name: 'Squishy',
      text: 'Healing it receives +40%.',
      intent: 'Mudlump line: soaks up whatever comes.',
      fx: { healReceivedBp: 4_000 },
    }),
    T({
      id: 'croaky-cheer',
      name: 'Croaky Cheer',
      text: 'Its {Boost} is 6 points stronger.',
      intent: 'Squelch line: a cheerful croak.',
      fx: { boostBonusBp: 600 },
    }),
  ].map((t) => [t.id, t]),
);

const BY_ROLE: Readonly<Record<Role, readonly string[]>> = {
  setter: ['sharp-claws', 'light-feet', 'unflappable', 'lasting-marks'],
  payoff: ['sharp-claws', 'keen-eye', 'big-finish', 'first-strike'],
  guard: ['tough-hide', 'steady-paws', 'unflappable', 'quick-healer'],
  support: ['warm-heart', 'gentle-touch', 'unflappable', 'light-feet'],
};

const FLAVOUR: Readonly<Record<string, string>> = {
  splashet: 'splashes-everywhere',
  stormray: 'proud-wings',
  sproutle: 'stands-close',
  ashmole: 'toasty-paws',
  zipmouse: 'zoomies',
  cindle: 'fiercely-loyal',
  mistnewt: 'slow-and-unbothered',
  mossback: 'tends-the-garden',
  coralynx: 'lone-hunter',
  solmane: 'leads-from-the-front',
  gaiadrake: 'ecosystem',
  aurorix: 'starry-nights',
  lanternfin: 'gentle-glow',
  hearthshell: 'shares-its-warmth',
  mudlump: 'squishy',
  squelch: 'croaky-cheer',
};

export interface PoolEntry {
  readonly talent: string;
  /** The roles of the line's forms this talent is meant for (the flavour talent fits every form). */
  readonly roles: readonly Role[];
}

/** A line's pool: the role talents of its forms' roles, then its flavour talent. */
export function talentPool(line: string): PoolEntry[] {
  const roles = [...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role))];
  const out = new Map<string, Role[]>();
  for (const r of roles) for (const t of BY_ROLE[r]) out.set(t, [...(out.get(t) ?? []), r]);
  const pool = [...out.entries()].map(([talent, rs]) => ({ talent, roles: rs }));
  const flavour = FLAVOUR[line];
  if (flavour) pool.push({ talent: flavour, roles });
  return pool;
}

/** The lines that have a combat talent pool (every line with a flavour talent). */
export const TALENT_LINES: readonly string[] = Object.keys(FLAVOUR);

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
