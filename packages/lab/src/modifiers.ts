/**
 * The modifier library (docs/design/combat/modifiers.md): every effect that changes a creature, one entry
 * per effect, with one name wherever it appears (P-06). It is a catalogue for reading (the wiki's
 * "Modifiers" section), not something the engine runs. Three sources, one entry per name:
 *
 * - `game`: a shipped gear line (`gear-lines.json`, the lines of gear and of today's talents). Its name and
 *   text are the game's own; its category, roles and kind come from `GEAR_CLASS` below, so a new gear line
 *   must be classified there (a test fails until it is).
 * - `lab`: an effect of a lab draft talent (`TALENTS`) that no gear line has. Derived at runtime, so a talent
 *   added to the lab shows up with no change here (its class is guessed from its effect unless `LAB_CLASS`
 *   says otherwise).
 * - `idea`: in the design document, not built anywhere (`IDEAS`).
 *
 * A draft talent that is the same effect as a gear line or an idea does not get its own entry: it is listed
 * on that entry (`talents`). A design idea that a gear line already is (`Vengeful` is Rally cry) is listed as
 * a second name (`also`).
 */
import { gearContent } from '@creatures/game';
import type { KnackFx } from './knacks';
import { TALENTS, type TalentDef } from './talents';
import type { Role } from './types';

/**
 * What a modifier is about, the fewest groups that work (panel 3, finding 18): `damage`, `marks` (marks and
 * reactions: anything that keys on a mark or raises a reaction's bonus), `protection`, `team` (helps others:
 * heals, boosts, auras, debuffs on the boss, cleanses, whatever role uses them) and `outside` (outside
 * fights: trips, crafting, catches).
 */
export const MODIFIER_CATEGORIES = ['damage', 'marks', 'protection', 'team', 'outside'] as const;
export type ModifierCategory = (typeof MODIFIER_CATEGORIES)[number];

/** Where a modifier exists: a shipped gear line, a lab draft talent, or only an idea in the design. */
export const MODIFIER_STATUSES = ['game', 'lab', 'idea'] as const;
export type ModifierStatus = (typeof MODIFIER_STATUSES)[number];

/** What a modifier is made of (docs/design/combat/modifiers.md, "What a modifier is made of"). */
export const MODIFIER_KINDS = [
  'stat',
  'condition',
  'trigger',
  'shape',
  'aura',
  'transfer',
  'rhythm',
  'chance',
  'rule',
] as const;
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

export interface ModifierDef {
  /** A gear line's id, an idea's slug, or `talent-<id>` for a lab-only effect. Unique. */
  readonly id: string;
  readonly name: string;
  /** What it does, in one line. */
  readonly text: string;
  readonly category: ModifierCategory;
  /** The roles it works for (all four for "any"). */
  readonly roles: readonly Role[];
  readonly status: ModifierStatus;
  readonly kind: ModifierKind;
  /** Ids of the lab draft talents that are this effect. */
  readonly talents: readonly string[];
  /** Other names the design gives the same effect. */
  readonly also: readonly string[];
}

const ANY: readonly Role[] = ['setter', 'payoff', 'guard', 'support'];
const HIT: readonly Role[] = ['setter', 'payoff'];
const GUARD: readonly Role[] = ['guard'];
const SUPPORT: readonly Role[] = ['support'];
const SETTER: readonly Role[] = ['setter'];
const PAYOFF: readonly Role[] = ['payoff'];

type Class = readonly [ModifierCategory, readonly Role[], ModifierKind];

/** A gear line's class, with a generic name and text where the line is made per element. */
interface GearClass {
  readonly class: Class;
  readonly name?: string;
  readonly text?: string;
}

const c = (category: ModifierCategory, roles: readonly Role[], kind: ModifierKind): GearClass => ({
  class: [category, roles, kind],
});

/**
 * The class of every shipped gear line, by the line's id in `gear-lines.json` (an element line by its id
 * without the element: `attunement`, not `tide-attunement`). A line missing here fails the test.
 */
export const GEAR_CLASS: Readonly<Record<string, GearClass>> = {
  'attack-local-pct': c('damage', ANY, 'stat'),
  'attack-local-flat': c('damage', ANY, 'stat'),
  'hp-local-pct': c('protection', ANY, 'stat'),
  'hp-local-flat': c('protection', ANY, 'stat'),
  'crit-chance-local-pct': c('damage', HIT, 'stat'),
  'crit-damage-local-pct': c('damage', HIT, 'stat'),
  attack: c('damage', ANY, 'stat'),
  hp: c('protection', ANY, 'stat'),
  'thick-coat': c('protection', ANY, 'stat'),
  // Luck is a build (Misa, 2026-10-30): a crit doubles a hit (R7.1), and these add to it. The lab's words for the shipped lines.
  'crit-chance': {
    ...c('damage', HIT, 'stat'),
    text: 'More chance to crit, in points. A crit doubles the hit; the species, Knack and talents add to it, with no cap in the lab.',
  },
  'crit-damage': {
    ...c('damage', HIT, 'stat'),
    text: 'Crits hit harder: the multiplier adds on top of the 2x (+1x makes a 3x crit). Crit chance, Knacks and talents add to it, with no cap in the lab.',
  },
  'all-damage-taken': c('protection', ANY, 'stat'),
  'area-ward': c('protection', ANY, 'stat'),
  'aimed-ward': c('protection', ANY, 'stat'),
  'well-fed': c('protection', ANY, 'stat'),
  attunement: {
    ...c('damage', ANY, 'condition'),
    name: 'Element Attunement',
    text: 'Raises Attack, but only for a creature of that element.',
  },
  hunter: {
    ...c('damage', ANY, 'condition'),
    name: 'Element Hunter',
    text: 'More damage to bosses and foes that the element is strong against.',
  },
  reaction: {
    ...c('marks', PAYOFF, 'stat'),
    name: 'Reaction bonus',
    text: 'The bonus of the reaction that creatures of an element set off is bigger.',
  },
  ward: {
    ...c('protection', ANY, 'condition'),
    name: 'Element Ward',
    text: 'Less damage from the foes that beat that element.',
  },
  // Armour works for every creature (Misa, 2026-10-28); the shipped line still names Guards only.
  armor: {
    ...c('protection', ANY, 'stat'),
    text: 'Armour grows by these points. Every creature has armour; Guards have the most.',
  },
  cover: c('protection', GUARD, 'stat'),
  'wide-stance': c('protection', GUARD, 'shape'),
  'long-arm-left': c('protection', GUARD, 'shape'),
  'long-arm-right': c('protection', GUARD, 'shape'),
  'flank-guard-left': c('protection', GUARD, 'shape'),
  'flank-guard-right': c('protection', GUARD, 'shape'),
  boost: c('team', SUPPORT, 'stat'),
  mend: c('team', SUPPORT, 'stat'),
  'spark-share': c('marks', SUPPORT, 'stat'),
  'marking-hit': c('marks', SETTER, 'stat'),
  'payoffs-pounce': c('marks', PAYOFF, 'stat'),
  strike: c('damage', ANY, 'stat'),
  lingering: c('team', ANY, 'stat'),
  'marked-foe': c('marks', HIT, 'condition'),
  'first-pounce': c('damage', HIT, 'condition'),
  'owners-mark': c('marks', SETTER, 'condition'),
  'backdraft-ward': c('protection', ANY, 'condition'),
  'keen-reaction': c('marks', PAYOFF, 'stat'),
  'adaptation-pierce': c('damage', ANY, 'stat'),
  unbothered: c('protection', ANY, 'rule'),
  brace: c('protection', ANY, 'rule'),
  'guards-shadow': c('damage', ANY, 'condition'),
  'shoulder-to-shoulder': c('damage', ANY, 'condition'),
  'odd-one-out': c('damage', ANY, 'condition'),
  'edge-walker': c('damage', ANY, 'condition'),
  'heart-of-the-row': c('protection', ANY, 'condition'),
  'front-liner': c('protection', ANY, 'condition'),
  'back-row-patience': c('damage', HIT, 'condition'),
  'lantern-bearer': c('team', ANY, 'aura'),
  'four-winds': c('marks', PAYOFF, 'condition'),
  sheltered: c('protection', ANY, 'condition'),
  'beside-the-mark-maker': c('damage', PAYOFF, 'condition'),
  'second-wind': c('protection', ANY, 'chance'),
  echo: c('damage', HIT, 'chance'),
  sidestep: c('protection', ANY, 'chance'),
  'quick-remark': c('marks', PAYOFF, 'chance'),
  'steady-paws': c('protection', ANY, 'chance'),
  'spill-over': c('marks', PAYOFF, 'chance'),
  'warm-heart': c('team', SUPPORT, 'chance'),
  'tinkers-luck': c('outside', ANY, 'chance'),
  'second-look': c('outside', ANY, 'chance'),
  payback: c('damage', GUARD, 'trigger'),
  kindling: c('team', ANY, 'aura'),
  'opening-mark': c('marks', ANY, 'trigger'),
  'rally-cry': c('damage', ANY, 'trigger'),
  'ember-tail': c('damage', HIT, 'trigger'),
  'storm-warning': c('protection', ANY, 'trigger'),
  stubborn: c('protection', ANY, 'trigger'),
  'last-stand': c('protection', ANY, 'condition'),
  overflow: c('team', PAYOFF, 'trigger'),
  'second-breath': c('protection', ANY, 'trigger'),
  patient: c('damage', ANY, 'trigger'),
  'shared-warmth': c('team', ANY, 'trigger'),
  'trail-xp': c('outside', ANY, 'stat'),
  'quick-feet': c('outside', ANY, 'stat'),
  'keen-nose': c('outside', ANY, 'stat'),
  'lucky-find': c('outside', ANY, 'chance'),
  packer: c('outside', ANY, 'chance'),
  'busy-paws': c('outside', ANY, 'stat'),
  apprentice: c('outside', ANY, 'stat'),
  'between-room-rest': c('protection', ANY, 'stat'),
  'hearth-warmth': c('protection', ANY, 'stat'),
  'lantern-luck': c('outside', ANY, 'chance'),
  'lantern-light': c('outside', ANY, 'stat'),
  'clean-coat': c('protection', ANY, 'stat'),
  'heavy-hand': c('team', SUPPORT, 'chance'),
  clinging: c('team', SUPPORT, 'stat'),
  fleet: c('protection', ANY, 'stat'),
  'light-footed': c('protection', ANY, 'stat'),
  riposte: c('damage', ANY, 'trigger'),
  momentum: c('damage', ANY, 'trigger'),
  slipstream: c('team', ANY, 'trigger'),
};

/**
 * Draft talents that are the same effect as a gear line: the talent id and the gear line id (a raw id, see
 * `GEAR_CLASS`). The line keeps its name (Misa, 2026-10-28: a talent takes the gear line's name when it is
 * the same effect). A talent not listed here, and not of a gear line's name, is a lab effect of its own.
 */
export const TALENT_IS_GEAR: Readonly<Record<string, string>> = {
  'sharp-claws': 'attack',
  hardy: 'hp',
  'light-feet': 'light-footed',
  'keen-eye': 'crit-chance',
  'mighty-blow': 'crit-damage',
  // The talents Crit Chance and Amplified Crits are the shipped lines Crit chance and Crit damage (luck is a build, 2026-10-30; gear takes the talent names when it moves to combat v2).
  'crit-chance': 'crit-chance',
  'crit-damage': 'crit-damage',
  'first-pounce': 'first-pounce',
  unbothered: 'unbothered',
  'tough-hide': 'armor',
  'hunker-down': 'area-ward',
  stubborn: 'stubborn',
  'broad-back': 'cover',
  'big-heart': 'boost',
  'gentle-touch': 'mend',
  // The same effect as the shipped line of the same name (the name is the line's).
  'rally-cry': 'rally-cry',
  'heavy-hand': 'heavy-hand',
  clinging: 'clinging',
  'odd-one-out': 'odd-one-out',
  'edge-walker': 'edge-walker',
  'front-liner': 'front-liner',
  'shoulder-to-shoulder': 'shoulder-to-shoulder',
  'owners-mark': 'owners-mark',
  brace: 'brace',
  momentum: 'momentum',
};

/** The class of a lab-only effect that the guess from its effect would get wrong. */
const LAB_CLASS: Readonly<Record<string, Class>> = {
  nimble: ['protection', ANY, 'stat'],
  'big-finish': ['marks', PAYOFF, 'trigger'],
  hungry: ['marks', PAYOFF, 'stat'],
  cornered: ['damage', HIT, 'condition'],
  'perfect-timing': ['damage', HIT, 'trigger'],
  'hold-the-line': ['damage', GUARD, 'trigger'],
};

interface Idea {
  readonly name: string;
  readonly text: string;
  readonly class: Class;
  /** The design's other names for it. */
  readonly also?: readonly string[];
  /** The gear line this idea already is (a raw id): the idea is listed on the line, not on its own. */
  readonly isGear?: string;
}

/**
 * The ideas of docs/design/combat/modifiers.md, "New modifiers that come from the combat v2 rules" (names as
 * the talent library calls them), that are neither a gear line nor a lab talent.
 */
export const IDEAS: readonly Idea[] = [
  {
    name: 'Long Shadow',
    text: "A Guard's cover, and the cut on hits it takes for others, grow by 20% per slot of distance.",
    class: ['protection', GUARD, 'shape'],
    also: ['Distance cover'],
  },
  {
    name: 'Opportunist',
    text: '+80% on a reaction that cashes a mark at x2 or more.',
    class: ['marks', PAYOFF, 'condition'],
    also: ['Count hunter'],
  },
  {
    name: 'Quick Draw',
    text: "+27% on a reaction on a mark added since the boss's last turn.",
    class: ['marks', PAYOFF, 'condition'],
    also: ['Fresh mark'],
  },
  {
    name: 'Deep Ink',
    text: 'Its first mark each fight adds 2 more to the count.',
    class: ['marks', SETTER, 'rhythm'],
    also: ['Mark painter'],
  },
  {
    name: 'Slow Burn',
    text: '+2% per round from round 2, up to +12%.',
    class: ['damage', HIT, 'condition'],
  },
  {
    name: 'Finisher',
    text: '+75% while the boss is below a third of its HP.',
    class: ['damage', HIT, 'condition'],
  },
  {
    name: 'Vengeful',
    text: '+50% for the rest of the fight after a creature beside it is knocked out (not while silenced).',
    class: ['damage', ANY, 'trigger'],
    isGear: 'rally-cry',
  },
  {
    name: 'Steady Rhythm',
    text: 'Every third hit that lands is a crit, +0.1x on crits.',
    class: ['damage', HIT, 'rhythm'],
  },
  {
    name: 'Brace for impact',
    text: "Takes 50% less from the boss's moves (a Wind-up landing announced on its slot included), not its plain attack.",
    class: ['protection', ANY, 'rule'],
    isGear: 'brace',
  },
  {
    name: 'Shoulder Charge',
    text: 'When it intercepts, it strikes back for 80% of its Attack (ignores armour).',
    class: ['damage', GUARD, 'trigger'],
  },
  {
    name: 'Bright Boost',
    text: 'Every second boost it gives is doubled.',
    class: ['team', SUPPORT, 'rhythm'],
  },
  {
    name: 'Triage',
    text: 'Its heal on the creatures beside it goes to the most hurt one, 70% bigger.',
    class: ['team', SUPPORT, 'shape'],
  },
  {
    name: 'Overheal Spill',
    text: 'Healing past full HP passes to the most hurt creature in the row of the one healed.',
    class: ['team', SUPPORT, 'transfer'],
  },
  {
    name: 'Kindred Boost',
    text: 'Its boost +32% on creatures of its own element.',
    class: ['team', SUPPORT, 'condition'],
  },
  {
    name: 'Store Saver',
    text: 'Its Store keeps 1 point between raid stages.',
    class: ['protection', ANY, 'rule'],
  },
  {
    name: 'Culling Strike',
    text: 'A hit that leaves the foe below 5% of its full HP defeats it outright; the HP removed counts as the killing blow, not as damage.',
    class: ['damage', ANY, 'rule'],
  },
  {
    name: 'Killing blow',
    text: 'When it lands the killing blow on a foe, something happens: more loot for the raid, a boost to its row, a heal.',
    class: ['damage', ANY, 'trigger'],
  },
];

/** A name as one key: lower case, letters and digits only, so "Odd One Out" and "Odd one out" are one. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** The category, roles and kind a lab talent's effect most likely has, from the fields it sets. */
export function guessClass(fx: KnackFx, roles: readonly Role[]): Class {
  const f = fx as Readonly<Record<string, unknown>>;
  const has = (...keys: string[]): boolean => keys.some((k) => f[k] !== undefined);
  if (has('boostBonusBp', 'mendBonusBp', 'support', 'guardMendBp', 'healOnReactionBp')) {
    return ['team', roles, 'stat'];
  }
  if (
    has(
      'markStacks',
      'markOthers',
      'marksAs',
      'seal',
      'leadBoostBp',
      'minStacks',
      'trail',
      'reactionBonusBp',
      'reactionCritBp',
      'bakedShell',
      'spendAllBp',
    )
  ) {
    return ['marks', roles, 'rule'];
  }
  if (has('reachBonus', 'rowAreaCutBp', 'interceptArea', 'interceptCharged')) {
    return ['protection', roles, 'shape'];
  }
  if (has('holdOn', 'secondWindBp', 'ignoreSilence')) return ['protection', roles, 'rule'];
  if (has('armourBonus', 'coverBonusBp', 'hpBp', 'dodgeBonusBp', 'areaCutBp', 'areaDodgeBp')) {
    return ['protection', roles, 'stat'];
  }
  if (has('firstHitBp', 'lowHpAtkBp', 'retaliateBp')) {
    return ['damage', roles, 'condition'];
  }
  return ['damage', roles, 'stat'];
}

/** A talent's text with its `{Keyword}` markers shown as plain words. */
function plainText(text: string): string {
  return text.replace(/\{([^}]+)\}/g, '$1');
}

/** The raw id of a gear line: an element line (`tide-attunement`) is its `attunement`. */
function rawId(line: { id: string; element: string | null }): string {
  return line.element === null ? line.id : line.id.slice(line.element.length + 1);
}

/** Lab talents in the library's order, as a list. */
function labTalents(): TalentDef[] {
  return Object.values(TALENTS);
}

/** The library: shipped gear lines, then design ideas, then lab-only effects; one entry per name. */
export function buildModifiers(talents: readonly TalentDef[] = labTalents()): ModifierDef[] {
  const out: ModifierDef[] = [];
  const byKey = new Map<string, number>();
  const used = new Set<string>();
  const add = (m: ModifierDef): number => {
    let id = m.id;
    for (let n = 2; used.has(id); n += 1) id = `${m.id}-${String(n)}`;
    used.add(id);
    out.push({ ...m, id });
    return out.length - 1;
  };
  const merge = (index: number, change: { talent?: string; also?: string }): void => {
    const m = out[index];
    if (m === undefined) return;
    out[index] = {
      ...m,
      talents: change.talent === undefined ? m.talents : [...m.talents, change.talent],
      also: change.also === undefined ? m.also : [...m.also, change.also],
    };
  };

  // Shipped gear lines (a line made per element once, with a generic name and text).
  const gearIndex = new Map<string, number>();
  for (const line of gearContent.lines) {
    const id = rawId(line);
    if (gearIndex.has(id)) continue;
    const known = GEAR_CLASS[id];
    const [category, roles, kind] = known?.class ?? ['damage', ANY, 'stat'];
    const index = add({
      id,
      name: known?.name ?? line.name,
      text: known?.text ?? line.about,
      category,
      roles,
      status: 'game',
      kind,
      talents: [],
      also: [],
    });
    gearIndex.set(id, index);
    // The first of a name keeps the key; a second gear line of the same name is its own entry.
    if (!byKey.has(nameKey(known?.name ?? line.name))) {
      byKey.set(nameKey(known?.name ?? line.name), index);
    }
  }

  // Design ideas: one that is a gear line is listed on it; one that is another idea's name is not repeated.
  for (const idea of IDEAS) {
    const gear = idea.isGear === undefined ? undefined : gearIndex.get(idea.isGear);
    if (gear !== undefined) {
      merge(gear, { also: idea.name });
      byKey.set(nameKey(idea.name), gear);
      continue;
    }
    const existing = byKey.get(nameKey(idea.name));
    if (existing !== undefined) continue;
    const [category, roles, kind] = idea.class;
    const index = add({
      id: nameKey(idea.name),
      name: idea.name,
      text: idea.text,
      category,
      roles,
      status: 'idea',
      kind,
      talents: [],
      also: idea.also ?? [],
    });
    byKey.set(nameKey(idea.name), index);
  }

  // Lab draft talents: the same effect as a gear line or an idea is listed on it, any other is a lab entry.
  for (const t of talents) {
    const gear = gearIndex.get(TALENT_IS_GEAR[t.id] ?? '');
    const existing = gear ?? byKey.get(nameKey(t.name));
    if (existing !== undefined) {
      merge(existing, { talent: t.id });
      const m = out[existing];
      // An idea that the lab builds is now a lab effect (it still has no gear line).
      if (m !== undefined && m.status === 'idea') out[existing] = { ...m, status: 'lab' };
      continue;
    }
    const [category, , kind] = LAB_CLASS[t.id] ?? guessClass(t.fx, t.roles);
    const index = add({
      id: `talent-${t.id}`,
      name: t.name,
      text: plainText(t.text),
      category,
      roles: t.roles,
      status: 'lab',
      kind,
      talents: [t.id],
      also: [],
    });
    byKey.set(nameKey(t.name), index);
  }
  return out;
}

/** The modifier library, built once from the shipped gear lines, the design ideas and the lab talents. */
export const MODIFIERS: ModifierDef[] = buildModifiers();
