/**
 * Gear content (`data/gear.json`, `data/gear-lines.json`, `data/gear-legacy.json`): schemas and
 * load-time checks (docs/design/gear-and-creatures-v2.md). An item is a base (the kind of thing: a
 * Kelp Cap, a Warden's Bell) with a slot, a tag and fixed base stats (a Hat or a Scarf) or a fixed base
 * line (a Charm's implicit), an item level it unlocks at, plus rolled lines drawn from the slot's
 * weighted pool. Local lines change the item's own base stats; all others are global. Everything about WHICH lines exist, what they do and
 * how heavy they are in each slot is data here; everything about how items roll (tiers, item levels,
 * line counts, tag weights, costs) lives in `RULES.gear`. The engine never reads this: gear is folded
 * into a creature's stats and modifier sheet before a fight (`wornEffects`).
 *
 * Gear sets (`data/gear-sets.json`, 2026-10-18): a set is three named pieces (a Hat, a Scarf and a Charm:
 * bases that name the set in `set`) that share a tag. Bonuses count the pieces one creature wears: two
 * pieces give plain lines at a fixed value, all three one named effect (`SET_EFFECTS`) the fold turns into a
 * field of the modifier sheet or a trip rule. Set pieces are ordinary bases otherwise: they unlock at a
 * higher item level, drop and craft like others and roll lines like any base.
 */
import * as v from 'valibot';
import { ElementSchema, ELEMENTS, IdSchema, RoleSchema, type Element, type Role } from './schema';

/**
 * The rarities of an item: Common, Rare and Epic decide how many lines it rolls. A Festival piece is not
 * a fourth rarity: it is a base (`festival: true`) that drops at the normal item level and rarity odds
 * of its source, with a fixed unique line, a narrow roll pool and its own look (2026-10-17).
 */
export const GEAR_RARITIES = ['common', 'rare', 'epic'] as const;
export const GearRaritySchema = v.picklist(GEAR_RARITIES);
export type GearRarity = v.InferOutput<typeof GearRaritySchema>;

/** The rarities old (pre-v2) gear had, for the one-time conversion: the three above and the Festival rarity. */
export const LEGACY_RARITIES = [...GEAR_RARITIES, 'festival'] as const;
export type LegacyRarity = (typeof LEGACY_RARITIES)[number];

/** The three slots. A creature wears one item in each. */
export const GEAR_SLOTS = ['hat', 'scarf', 'charm'] as const;
export const GearSlotSchema = v.picklist(GEAR_SLOTS);
export type GearSlot = v.InferOutput<typeof GearSlotSchema>;

/** What an item is tied to: nothing, an element, the explorers, or (a role-locked Charm) one role. */
export const GEAR_TAGS = [
  'neutral',
  'tide',
  'ember',
  'grove',
  'spark',
  'explorer',
  'setter',
  'payoff',
  'support',
  'guard',
] as const;
export const GearTagSchema = v.picklist(GEAR_TAGS);
export type GearTag = v.InferOutput<typeof GearTagSchema>;

export function tagElement(tag: GearTag): Element | null {
  return (ELEMENTS as readonly string[]).includes(tag) ? (tag as Element) : null;
}

export function tagRole(tag: GearTag): Role | null {
  return RoleSchema.options.includes(tag as Role) ? (tag as Role) : null;
}

/** Items reach item level 20 at most, and a line has five tiers. */
export const TIER_COUNT = 5;

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const Flavor = v.pipe(v.string(), v.minLength(1), v.maxLength(120));
const About = v.pipe(v.string(), v.minLength(1), v.maxLength(80));

const Values = v.pipe(
  v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000))),
  v.length(TIER_COUNT),
);
const Weight = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000));

/** A line's value at each tier I to V, in the unit of the line. */
export type TierValues = readonly [number, number, number, number, number];

/** A base's fixed line: a line id and its value for each item level band (I to V). */
const FixedLineSchema = v.strictObject({ line: IdSchema, values: Values });
export type FixedLine = v.InferOutput<typeof FixedLineSchema>;

/**
 * The kinds of base stat an item can carry. Every kind already exists in the engine's numbers: Attack
 * and HP are the creature's, crit chance and crit damage are added to its crit bonus (in basis points).
 * More kinds can be added here later (a kind needs a fold in `wornEffects` and at least one local line
 * in `gear-lines.json`); nothing that the engine does not have yet (a universal armor) belongs here.
 */
export const BASE_STAT_KINDS = ['atk', 'hp', 'critChance', 'critDamage'] as const;
export const BaseStatKindSchema = v.picklist(BASE_STAT_KINDS);
export type BaseStatKind = v.InferOutput<typeof BaseStatKindSchema>;

/**
 * One base stat of a base: a fixed number, the same on every item of the base (never rolled, never
 * scaled by item level). Attack and HP are whole points, crit chance and crit damage basis points.
 * It is part of the item, not a line: the item's local lines (`kind: 'local'`) change it, and the whole
 * item adds to its wearer (`itemStats`).
 */
export const BaseStatSchema = v.strictObject({
  stat: BaseStatKindSchema,
  value: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
});
export type BaseStat = v.InferOutput<typeof BaseStatSchema>;

export const GearBaseSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  slot: GearSlotSchema,
  tag: GearTagSchema,
  /** A Festival piece: only a Festival finale drops it, and it carries its `fixed` line. */
  festival: v.optional(v.boolean()),
  /**
   * The gear set this piece belongs to (`data/gear-sets.json`). A set piece shares the set's tag, so a
   * role set's Hat and Scarf are role-locked like a role Charm (only that role can wear them).
   */
  set: v.optional(IdSchema),
  /**
   * The fixed base stats of a Hat (Attack and HP, Attack first) or a Scarf (HP and Attack, HP first), and
   * optionally a third (crit chance or crit damage). Charms have none: they are the mechanics slot.
   */
  stats: v.optional(v.pipe(v.array(BaseStatSchema), v.minLength(2), v.maxLength(4))),
  /**
   * The lowest item level this base can drop or be crafted at (default 1). A better base unlocks at a
   * higher item level, as in Path of Exile: growth over the journey is the local lines' tiers and these
   * better bases, not a stat that scales with the item level.
   */
  minItemLevel: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20))),
  /** The base line of a Charm (its mechanic), sized by the item level's band. Hats and Scarves have base stats instead. */
  implicit: v.optional(FixedLineSchema),
  /** The unique line of a Festival piece, sized by the item level's band. */
  fixed: v.optional(FixedLineSchema),
  /** A narrow roll pool: the only lines this base can roll (Festival pieces). Absent: the slot's whole pool. */
  pool: v.optional(v.pipe(v.array(IdSchema), v.minLength(3), v.maxLength(12))),
  flavor: Flavor,
});
export type GearBase = v.InferOutput<typeof GearBaseSchema>;

/**
 * The position lines that are worked out when the fight input is built, from the creature's row and its
 * neighbours (`rules/gear-position.ts`); the engine sees only numbers. `besideRole` (Guard's shadow, Beside
 * the mark-maker) is the one position line the engine reads on the board itself, each hit.
 */
export const POSITION_RULES = [
  'sameElementBeside',
  'oddOneOut',
  'edge',
  'heart',
  'front',
  'back',
  'lantern',
  'fourElements',
  'sheltered',
] as const;
export type PositionRule = (typeof POSITION_RULES)[number];

/**
 * What a line does. `stat` lines change Attack, HP or the crit numbers before the fight; `attune` is
 * Attack for a wearer of the line's element; `hunter`, `ward` and `reaction` are the element lines
 * (resolved to the boss's element or the reaction id); `sheet` fills a field of the fight's modifier
 * sheet (`SlotMods`); `besideRole` is a position line; `rule` is a trip, Workshop or XP rule outside
 * combat; `rest` is the dungeon's between-room rest; `local` is a line of the item itself: it changes
 * one of the item's own base stats (`BASE_STAT_KINDS`), by a percentage or a flat amount, and nothing
 * else. It can only roll on an item whose base has that stat.
 */
export const LineEffectSchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('stat'),
    stat: v.picklist(['atk', 'hp', 'critChance', 'critDamage']),
    mode: v.picklist(['pct', 'flat']),
  }),
  v.strictObject({ kind: v.literal('attune') }),
  v.strictObject({ kind: v.literal('hunter') }),
  v.strictObject({ kind: v.literal('ward') }),
  v.strictObject({ kind: v.literal('reaction') }),
  v.strictObject({
    kind: v.literal('sheet'),
    field: v.picklist([
      'markedFoeBp',
      'firstHitBp',
      'markingHitBp',
      'strikeBp',
      'pierceBp',
      'pounceBp',
      'ownerMarkBp',
      'keenReactionBp',
      'shareBp',
      'takenBp',
      'areaBp',
      'aimedBp',
      'reflectedBp',
      'chargedBp',
      'healReceivedBp',
      'armorBp',
      'coverBp',
      'boostBp',
      'mendBp',
      'lingerRounds',
      'ignoreSilence',
    ]),
  }),
  v.strictObject({ kind: v.literal('besideRole'), role: RoleSchema }),
  v.strictObject({ kind: v.literal('position'), rule: v.picklist(POSITION_RULES) }),
  v.strictObject({
    kind: v.literal('rule'),
    rule: v.picklist([
      'trailXp',
      'quickFeet',
      'keenNose',
      'luckyFind',
      'packer',
      'busyPaws',
      'apprentice',
    ]),
  }),
  v.strictObject({ kind: v.literal('rest') }),
  v.strictObject({
    kind: v.literal('local'),
    stat: BaseStatKindSchema,
    mode: v.picklist(['pct', 'flat']),
  }),
]);
export type LineEffect = v.InferOutput<typeof LineEffectSchema>;

export const LINE_UNITS = ['pct', 'pt', 'flat', 'once'] as const;
export const LineUnitSchema = v.picklist(LINE_UNITS);
export type LineUnit = v.InferOutput<typeof LineUnitSchema>;

export const LINE_GROUPS = [
  'core',
  'local',
  'element',
  'role',
  'mark',
  'position',
  'utility',
  'festival',
] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];

/**
 * The line groups whose lines are "special": an item can have at most one special line (a rolled one;
 * a base's own fixed line does not count). Position lines are the first such group; chance and trigger
 * lines (design 6.3 and 6.4) join this list when they are built. Rolling, crafting and any reroll draw
 * lines through `rollLines`, which enforces it.
 */
export const SPECIAL_GROUPS: readonly LineGroup[] = ['position'];

/** A line as written in `data/gear-lines.json`. `perElement` lines expand into one line per element. */
export const LineSchema = v.strictObject({
  id: IdSchema,
  /** The line's name; `{element}` becomes the element's name (Tide Attunement). */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  about: About,
  group: v.picklist(LINE_GROUPS),
  effect: LineEffectSchema,
  /** One line per element (the element lines of 5.2). */
  perElement: v.optional(v.boolean()),
  unit: LineUnitSchema,
  /** A reduction (shown with a minus: "Damage taken -4%"). */
  reduction: v.optional(v.boolean()),
  /** The value at tiers I to V (basis points for `pct` and `pt`; whole numbers for `flat`; `once` uses the first). */
  values: Values,
  /** One value only (no tiers): rolls only on items of at least `minItemLevel`. */
  single: v.optional(v.boolean()),
  minItemLevel: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20))),
  /** The lowest rarity that can roll it. */
  minRarity: v.picklist(['common', 'rare', 'epic']),
  /** Roll weight in each slot's pool; 0 never rolls there. */
  weights: v.strictObject({ hat: Weight, scarf: Weight, charm: Weight }),
  /**
   * A line that never rolls on an item: only a talent (a flat HP talent) or a base's fixed line (a
   * Festival piece's unique line) uses it, so its weights may all be 0.
   */
  fixedOnly: v.optional(v.boolean()),
  /** The roles it is about: a role-locked Charm favours its role's lines and rolls no other role's. */
  roles: v.optional(v.array(RoleSchema)),
  /** The effect only exists for a wearer of one of `roles` (a Guard's armor). */
  restricted: v.optional(v.boolean()),
  /**
   * What it is worth to a wearer, for "Equip best" and the sim's choices: the share of the creature's
   * power (basis points) a value of 10000 basis points of this line adds. 0 for a line that does
   * not touch fights. Decisions only; the real effect is in the fight.
   */
  worth: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000)),
});
export type LineDef = v.InferOutput<typeof LineSchema>;

/** A line after the per-element ones have been expanded: what the game works with. */
export interface GearLine {
  id: string;
  name: string;
  about: string;
  group: LineGroup;
  effect: LineEffect;
  /** The element of an element line (Tide Attunement), else null. */
  element: Element | null;
  unit: LineUnit;
  reduction: boolean;
  values: TierValues;
  single: boolean;
  minItemLevel: number;
  minRarity: 'common' | 'rare' | 'epic';
  weights: { hat: number; scarf: number; charm: number };
  /** True for a line of the item itself (`kind: 'local'`): it shows as "(this item)" and changes one of the item's base stats. */
  local: boolean;
  /** True for a special line (its group is in `SPECIAL_GROUPS`): an item rolls at most one of these. */
  special: boolean;
  /** True when no item rolls it (talents and fixed lines use it). */
  fixedOnly: boolean;
  roles: readonly Role[];
  restricted: boolean;
  worth: number;
}

/** Old (pre-v2) gear, kept as data only so the conversion can map it. Nothing else reads it. */
export const LegacyBaseSchema = v.strictObject({
  id: IdSchema,
  /** The slot the converted item takes (by the old stat focus). */
  slot: GearSlotSchema,
  /** The tag from the old tint: null is neutral. */
  tint: v.nullable(ElementSchema),
  festival: v.optional(v.boolean()),
});
export const LegacyEnchantSchema = v.strictObject({ id: IdSchema, shard: ElementSchema });
export const LegacyPackSchema = v.strictObject({
  bases: v.pipe(v.array(LegacyBaseSchema), v.minLength(1), v.maxLength(100)),
  enchants: v.pipe(v.array(LegacyEnchantSchema), v.maxLength(100)),
});
export type LegacyPack = v.InferOutput<typeof LegacyPackSchema>;

/**
 * What a full set (three pieces worn) does beyond its two-piece lines. Each is one small effect the fold
 * (`wornEffects`) turns into a field of the modifier sheet (`SlotMods`), a trip rule or, for the row
 * ones, a gift to the creatures standing in the wearer's row (`rules/gear-position.ts`):
 * - `unreflected`: its first reaction each fight cannot be reflected (the boss's trap).
 * - `critWindow`: after it sets off a reaction its crits deal `value` more crit damage (basis points) for a round.
 * - `healOnReaction`: it heals `value` (basis points of max HP) whenever it sets off a reaction.
 * - `chainMark`: after it sets off a reaction the boss keeps the creature's own mark, so a chain can follow.
 * - `coverReach`: a Guard's cover reaches the creature one slot further out.
 * - `boostReach`: a Support's boost also lands on the creature two slots away.
 * - `sealMark`: the first mark it leaves each fight cannot be replaced.
 * - `firstReactionCrit`: its first reaction each fight is a critical hit.
 * - `longTripCatch`: `value` extra catch rolls on 24 hour trips.
 * - `rowShieldWall`: Guards in the wearer's row have Shield Walls that last 1 more round.
 */
export const SET_EFFECTS = [
  'unreflected',
  'critWindow',
  'healOnReaction',
  'chainMark',
  'coverReach',
  'boostReach',
  'sealMark',
  'firstReactionCrit',
  'longTripCatch',
  'rowShieldWall',
] as const;
export type SetEffectId = (typeof SET_EFFECTS)[number];

/** The tag a set's pieces share: the base tags (not neutral) or the Festival. */
export const SET_TAGS = [...GEAR_TAGS.filter((t) => t !== 'neutral'), 'festival'] as const;
export type SetTag = (typeof SET_TAGS)[number];

/** A plain line a set gives at a fixed value (basis points, or whole numbers for a flat line). */
const SetLineSchema = v.strictObject({
  line: IdSchema,
  value: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
});

/** A set as written in `data/gear-sets.json`. */
export const GearSetSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  tag: v.picklist(SET_TAGS),
  flavor: Flavor,
  /** Two pieces: plain lines at a fixed value (folded exactly like the same line on an item). */
  two: v.strictObject({
    /** The bonus in words, as the card shows it. */
    text: About,
    lines: v.pipe(v.array(SetLineSchema), v.minLength(1), v.maxLength(3)),
  }),
  /** Three pieces: this on top of the two-piece bonus. */
  three: v.strictObject({
    text: About,
    effect: v.picklist(SET_EFFECTS),
    /** The effect's number, where it has one (crit damage and healing in basis points, extra rolls). */
    value: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))),
    /** The effect only works for a wearer of this element (Steam is cashed by Tide wearers). */
    wearerElement: v.optional(ElementSchema),
  }),
});
export type GearSet = v.InferOutput<typeof GearSetSchema>;
export const GearSetsSchema = v.pipe(v.array(GearSetSchema), v.minLength(1), v.maxLength(40));

export const GearBasesSchema = v.pipe(v.array(GearBaseSchema), v.minLength(1), v.maxLength(200));
export const GearLinesSchema = v.pipe(v.array(LineSchema), v.minLength(1), v.maxLength(200));

export interface GearPack {
  bases: GearBase[];
  /** Every line, per-element ones expanded (`tide-attunement`). */
  lines: GearLine[];
  /** The gear sets, each with exactly one piece in every slot (`bases[].set`). */
  sets: GearSet[];
  legacy: LegacyPack;
}

function fail(message: string): never {
  throw new Error(`Invalid gear content: ${message}`);
}

function firstIssue(parsed: { issues: v.BaseIssue<unknown>[] }, what: string): never {
  const first = parsed.issues[0];
  const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
  throw new Error(`Invalid ${what} schema at "${path}": ${first?.message ?? 'unknown error'}`);
}

const ELEMENT_NAMES: Record<Element, string> = {
  tide: 'Tide',
  ember: 'Ember',
  grove: 'Grove',
  spark: 'Spark',
};

/**
 * The name of an element line: the line's name with `{element}`. A reaction line is named after the
 * reaction the element sets off, which the caller passes (`reactionNames`).
 */
function expandName(
  name: string,
  element: Element,
  reactionNames: Record<Element, string>,
): string {
  return name
    .replace('{element}', ELEMENT_NAMES[element])
    .replace('{reaction}', reactionNames[element]);
}

/** Expands `perElement` lines into one per element. Ids become `<element>-<id>`. */
export function expandLines(
  defs: readonly LineDef[],
  reactionNames: Record<Element, string>,
): GearLine[] {
  const out: GearLine[] = [];
  for (const def of defs) {
    const make = (id: string, name: string, element: Element | null): GearLine => ({
      id,
      name,
      about: def.about.replace('{element}', element === null ? '' : ELEMENT_NAMES[element]),
      group: def.group,
      effect: def.effect,
      element,
      unit: def.unit,
      reduction: def.reduction === true,
      values: def.values as unknown as TierValues,
      single: def.single === true,
      minItemLevel: def.minItemLevel ?? 1,
      minRarity: def.minRarity,
      weights: def.weights,
      local: def.effect.kind === 'local',
      special: SPECIAL_GROUPS.includes(def.group),
      fixedOnly: def.fixedOnly === true,
      roles: def.roles ?? [],
      restricted: def.restricted === true,
      worth: def.worth,
    });
    if (def.perElement === true) {
      for (const element of ELEMENTS) {
        out.push(
          make(`${element}-${def.id}`, expandName(def.name, element, reactionNames), element),
        );
      }
    } else {
      out.push(make(def.id, def.name, null));
    }
  }
  return out;
}

/** Reaction names by the element that sets them off (Tide: Steam, Ember: Wildfire, ...). */
export interface ReactionRef {
  name: string;
  triggerElement: Element;
}

/**
 * Validates raw gear content (schema first, then cross-references) and returns it typed. Throws an
 * Error naming the first problem. Shipped content is checked at module load.
 */
export function loadGear(
  rawBases: unknown,
  rawLines: unknown,
  rawLegacy: unknown,
  reactions: readonly ReactionRef[],
  rawSets: unknown,
): GearPack {
  const bases = v.safeParse(GearBasesSchema, rawBases);
  if (!bases.success) firstIssue(bases, 'gear bases');
  const lineDefs = v.safeParse(GearLinesSchema, rawLines);
  if (!lineDefs.success) firstIssue(lineDefs, 'gear lines');
  const legacy = v.safeParse(LegacyPackSchema, rawLegacy);
  if (!legacy.success) firstIssue(legacy, 'legacy gear');
  const setDefs = v.safeParse(GearSetsSchema, rawSets);
  if (!setDefs.success) firstIssue(setDefs, 'gear sets');

  const reactionNames = {} as Record<Element, string>;
  for (const element of ELEMENTS) {
    const reaction = reactions.find((r) => r.triggerElement === element);
    if (reaction === undefined) fail(`no reaction is set off by ${element}`);
    reactionNames[element] = reaction.name;
  }
  const lines = expandLines(lineDefs.output, reactionNames);
  const lineIds = new Set<string>();
  for (const line of lines) {
    if (lineIds.has(line.id)) fail(`duplicate line id "${line.id}"`);
    lineIds.add(line.id);
    // Values must not fall as the tier rises (a fixed list of five numbers).
    for (let i = 1; i < TIER_COUNT; i++) {
      if ((line.values[i] as number) < (line.values[i - 1] as number)) {
        fail(`line "${line.id}" gets weaker at tier ${String(i + 1)}`);
      }
    }
    if (line.single && !line.values.every((x) => x === line.values[0])) {
      fail(`single line "${line.id}" must have one value at every tier`);
    }
    // The position group is the special group, and only position effects live in it.
    const positional = line.effect.kind === 'besideRole' || line.effect.kind === 'position';
    if (positional !== (line.group === 'position')) {
      fail(`line "${line.id}": only position effects belong to the position group`);
    }
    if (line.restricted && line.roles.length === 0) {
      fail(`restricted line "${line.id}" needs the roles it works for`);
    }
    const w = line.weights;
    if (line.fixedOnly) {
      if (w.hat + w.scarf + w.charm !== 0)
        fail(`fixed-only line "${line.id}" must have no weights`);
    } else if (w.hat + w.scarf + w.charm === 0) {
      fail(`line "${line.id}" can roll in no slot`);
    }
    if (line.effect.kind === 'local') {
      // A local line is about the item's own stats, which only Hats and Scarves have.
      if (w.charm > 0) fail(`local line "${line.id}" cannot roll on a charm`);
      if (line.worth !== 0) fail(`local line "${line.id}" is counted by the item's stat (worth 0)`);
    }
  }

  const baseIds = new Set<string>();
  const seenKey = new Set<string>();
  for (const base of bases.output) {
    if (baseIds.has(base.id)) fail(`duplicate base id "${base.id}"`);
    baseIds.add(base.id);
    const key = `${base.slot}:${base.tag}:${base.festival === true ? 'festival' : 'plain'}:${base.set ?? ''}:${String(base.minItemLevel ?? 1)}`;
    if (seenKey.has(key)) {
      fail(`two ${base.slot} bases with the tag ${base.tag} unlock at the same item level`);
    }
    seenKey.add(key);
    for (const fixed of [base.implicit, base.fixed]) {
      if (fixed === undefined) continue;
      if (!lineIds.has(fixed.line)) fail(`base "${base.id}" uses unknown line "${fixed.line}"`);
    }
    // Hats and Scarves have base stats (and no implicit line), Charms a mechanic line (and no stats).
    if (base.slot === 'charm') {
      if (base.stats !== undefined) fail(`Charm "${base.id}" cannot have base stats`);
      if (base.implicit === undefined) fail(`Charm "${base.id}" needs its implicit`);
      // A Charm has no better makes, except that a set's Charm unlocks with its set's pieces.
      if (base.set === undefined && base.minItemLevel !== undefined && base.minItemLevel > 1) {
        fail(`Charm "${base.id}" has no better versions, so it cannot have a minimum item level`);
      }
    } else {
      const stats = base.stats;
      if (stats === undefined) fail(`${base.slot} "${base.id}" needs base stats`);
      if (base.implicit !== undefined)
        fail(`${base.slot} "${base.id}" has base stats, not an implicit`);
      const kinds = stats.map((x) => x.stat);
      if (new Set(kinds).size !== kinds.length) fail(`base "${base.id}" repeats a base stat`);
      // A Hat is Attack first, a Scarf HP first, and both carry both.
      const head = base.slot === 'hat' ? 'atk' : 'hp';
      const other = base.slot === 'hat' ? 'hp' : 'atk';
      if (kinds[0] !== head || kinds[1] !== other) {
        fail(`${base.slot} "${base.id}" must list ${head} then ${other} first`);
      }
      // Every base stat is a target for at least one local line.
      for (const kind of kinds) {
        if (!lines.some((l) => l.effect.kind === 'local' && l.effect.stat === kind)) {
          fail(`base "${base.id}" has the stat ${kind}, which no local line can change`);
        }
      }
    }
    if (base.pool !== undefined) {
      if (new Set(base.pool).size !== base.pool.length)
        fail(`base "${base.id}" repeats a pool line`);
      for (const id of base.pool) {
        const line = lines.find((l) => l.id === id);
        if (line === undefined) fail(`base "${base.id}" pools unknown line "${id}"`);
        if (line.fixedOnly || line.weights[base.slot] <= 0) {
          fail(`base "${base.id}" pools "${id}", which cannot roll in ${base.slot}`);
        }
      }
    }
    if (base.festival === true && base.fixed === undefined) {
      fail(`festival base "${base.id}" needs its fixed line`);
    }
    if (base.festival === true && base.pool === undefined) {
      fail(`festival base "${base.id}" needs its narrow roll pool`);
    }
    if (
      base.fixed !== undefined &&
      lines.find((l) => l.id === base.fixed?.line)?.fixedOnly !== true
    ) {
      fail(`base "${base.id}" fixes a line that is not fixed-only`);
    }
    if (base.festival !== true && base.fixed !== undefined) {
      fail(`base "${base.id}" has a fixed line but is not a Festival piece`);
    }
    if (tagRole(base.tag) !== null && base.slot !== 'charm' && base.set === undefined) {
      fail(`only Charms and set pieces can be role-locked ("${base.id}")`);
    }
  }
  // Every element and the neutral tag have a base in each slot that is there from item level 1 (a
  // better one may unlock later); there is a Festival piece.
  for (const slot of GEAR_SLOTS) {
    for (const tag of ['neutral', ...ELEMENTS] as const) {
      const mine = bases.output.filter(
        (b) => b.slot === slot && b.tag === tag && b.festival !== true,
      );
      if (mine.length === 0) fail(`no ${tag} ${slot}`);
      if (!mine.some((b) => (b.minItemLevel ?? 1) === 1)) {
        fail(`no ${tag} ${slot} from item level 1`);
      }
    }
  }
  for (const base of bases.output) {
    if (base.festival === true && (base.minItemLevel ?? 1) !== 1) {
      fail(
        `festival base "${base.id}" must be there from item level 1 (it drops at a normal level)`,
      );
    }
  }
  if (!bases.output.some((b) => b.festival === true)) fail('no festival base');
  for (const role of RoleSchema.options) {
    if (!bases.output.some((b) => b.slot === 'charm' && b.tag === role)) {
      fail(`no ${role} Charm`);
    }
  }
  if (!bases.output.some((b) => b.tag === 'explorer')) fail('no explorer base');
  // Every slot can roll something at every rarity, or an item could come out empty.
  for (const slot of GEAR_SLOTS) {
    if (!lines.some((l) => l.minRarity === 'common' && l.weights[slot] > 0)) {
      fail(`no common line rolls in ${slot}`);
    }
  }
  // Gear sets: every set has exactly one Hat, one Scarf and one Charm, which share its tag.
  const sets = setDefs.output;
  const setIds = new Set<string>();
  const setNames = new Set<string>();
  for (const set of sets) {
    if (setIds.has(set.id)) fail(`duplicate set id "${set.id}"`);
    setIds.add(set.id);
    if (setNames.has(set.name)) fail(`duplicate set name "${set.name}"`);
    setNames.add(set.name);
    const pieces = bases.output.filter((b) => b.set === set.id);
    for (const slot of GEAR_SLOTS) {
      const count = pieces.filter((b) => b.slot === slot).length;
      if (count !== 1) fail(`set "${set.id}" needs exactly one ${slot} (it has ${String(count)})`);
    }
    for (const piece of pieces) {
      if (set.tag === 'festival') {
        if (piece.festival !== true) fail(`set "${set.id}" pieces must be Festival pieces`);
      } else {
        if (piece.festival === true) fail(`set "${set.id}" has a Festival piece`);
        if (piece.tag !== set.tag) fail(`set piece "${piece.id}" must have the tag ${set.tag}`);
      }
    }
    for (const entry of set.two.lines) {
      const line = lines.find((l) => l.id === entry.line);
      if (line === undefined) fail(`set "${set.id}" uses unknown line "${entry.line}"`);
      if (line.local || line.fixedOnly) {
        fail(`set "${set.id}" uses "${entry.line}", which a set cannot give`);
      }
    }
    if (set.three.effect === 'longTripCatch' && set.three.value === undefined) {
      fail(`set "${set.id}": longTripCatch needs a value`);
    }
  }
  for (const base of bases.output) {
    if (base.set !== undefined && !setIds.has(base.set)) {
      fail(`base "${base.id}" is in the unknown set "${base.set}"`);
    }
  }
  const legacyIds = new Set<string>();
  for (const old of legacy.output.bases) {
    if (legacyIds.has(old.id)) fail(`duplicate legacy base "${old.id}"`);
    legacyIds.add(old.id);
  }
  return { bases: bases.output, lines, sets, legacy: legacy.output };
}
