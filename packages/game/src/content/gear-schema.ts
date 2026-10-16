/**
 * Gear content (`data/gear.json`, `data/gear-lines.json`, `data/gear-legacy.json`): schemas and
 * load-time checks (docs/design/gear-and-creatures-v2.md). An item is a base (the kind of thing: a
 * Kelp Cap, a Warden's Bell) with a slot, a tag and a fixed base line (its implicit), plus rolled
 * lines drawn from the slot's weighted pool. Everything about WHICH lines exist, what they do and
 * how heavy they are in each slot is data here; everything about how items roll (tiers, item levels,
 * line counts, tag weights, costs) lives in `RULES.gear`. The engine never reads this: gear is folded
 * into a creature's stats and modifier sheet before a fight (`wornEffects`).
 */
import * as v from 'valibot';
import { ElementSchema, ELEMENTS, IdSchema, RoleSchema, type Element, type Role } from './schema';

export const GEAR_RARITIES = ['common', 'rare', 'epic', 'festival'] as const;
export const GearRaritySchema = v.picklist(GEAR_RARITIES);
export type GearRarity = v.InferOutput<typeof GearRaritySchema>;

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

export const GearBaseSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  slot: GearSlotSchema,
  tag: GearTagSchema,
  /** A Festival piece: only a Festival finale drops it, and it carries its `fixed` line. */
  festival: v.optional(v.boolean()),
  /** The base line every item of this base has, sized by the item level's band. */
  implicit: FixedLineSchema,
  /** A second fixed line (the Festival glow). */
  fixed: v.optional(FixedLineSchema),
  flavor: Flavor,
});
export type GearBase = v.InferOutput<typeof GearBaseSchema>;

/**
 * What a line does. `stat` lines change Attack, HP or the crit numbers before the fight; `attune` is
 * Attack for a wearer of the line's element; `hunter`, `ward` and `reaction` are the element lines
 * (resolved to the boss's element or the reaction id); `sheet` fills a field of the fight's modifier
 * sheet (`SlotMods`); `besideRole` is a position line; `rule` is a trip, Workshop or XP rule outside
 * combat; `rest` is the dungeon's between-room rest; `glow` is the Festival glow (Attack and HP).
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
  v.strictObject({ kind: v.literal('glow') }),
]);
export type LineEffect = v.InferOutput<typeof LineEffectSchema>;

export const LINE_UNITS = ['pct', 'pt', 'flat', 'once'] as const;
export const LineUnitSchema = v.picklist(LINE_UNITS);
export type LineUnit = v.InferOutput<typeof LineUnitSchema>;

export const LINE_GROUPS = ['core', 'element', 'role', 'mark', 'position', 'utility'] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];

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

export const GearBasesSchema = v.pipe(v.array(GearBaseSchema), v.minLength(1), v.maxLength(200));
export const GearLinesSchema = v.pipe(v.array(LineSchema), v.minLength(1), v.maxLength(200));

export interface GearPack {
  bases: GearBase[];
  /** Every line, per-element ones expanded (`tide-attunement`). */
  lines: GearLine[];
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
): GearPack {
  const bases = v.safeParse(GearBasesSchema, rawBases);
  if (!bases.success) firstIssue(bases, 'gear bases');
  const lineDefs = v.safeParse(GearLinesSchema, rawLines);
  if (!lineDefs.success) firstIssue(lineDefs, 'gear lines');
  const legacy = v.safeParse(LegacyPackSchema, rawLegacy);
  if (!legacy.success) firstIssue(legacy, 'legacy gear');

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
    if (line.restricted && line.roles.length === 0) {
      fail(`restricted line "${line.id}" needs the roles it works for`);
    }
    const w = line.weights;
    if (w.hat + w.scarf + w.charm === 0 && line.effect.kind !== 'glow') {
      fail(`line "${line.id}" can roll in no slot`);
    }
  }

  const baseIds = new Set<string>();
  const seenKey = new Set<string>();
  for (const base of bases.output) {
    if (baseIds.has(base.id)) fail(`duplicate base id "${base.id}"`);
    baseIds.add(base.id);
    const key = `${base.slot}:${base.tag}:${base.festival === true ? 'festival' : 'plain'}`;
    if (seenKey.has(key)) fail(`two ${base.slot} bases with the tag ${base.tag}`);
    seenKey.add(key);
    for (const fixed of [base.implicit, base.fixed]) {
      if (fixed === undefined) continue;
      if (!lineIds.has(fixed.line)) fail(`base "${base.id}" uses unknown line "${fixed.line}"`);
    }
    if (base.festival === true && base.fixed === undefined) {
      fail(`festival base "${base.id}" needs its fixed line`);
    }
    if (base.festival !== true && base.fixed !== undefined) {
      fail(`base "${base.id}" has a fixed line but is not a Festival piece`);
    }
    if (tagRole(base.tag) !== null && base.slot !== 'charm') {
      fail(`only Charms can be role-locked ("${base.id}")`);
    }
  }
  // Every element and the neutral tag have a base in each slot; there is a Festival piece.
  for (const slot of GEAR_SLOTS) {
    for (const tag of ['neutral', ...ELEMENTS] as const) {
      if (!bases.output.some((b) => b.slot === slot && b.tag === tag && b.festival !== true)) {
        fail(`no ${tag} ${slot}`);
      }
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
  const legacyIds = new Set<string>();
  for (const old of legacy.output.bases) {
    if (legacyIds.has(old.id)) fail(`duplicate legacy base "${old.id}"`);
    legacyIds.add(old.id);
  }
  return { bases: bases.output, lines, legacy: legacy.output };
}
