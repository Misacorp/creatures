/**
 * Expedition content (docs/design/expeditions-v2.md): destinations, supplies, push-on goals, the journal
 * and the weekly special. Everything here is data: ids are never renamed once shipped (they are stored
 * in players' databases), and every number that can be tuned lives in `RULES.expeditions`. The engine
 * never reads any of this; the server rolls expeditions with the pure functions in `rules/expeditions`.
 *
 * Text that players read (names, flavour, journal entries) is plain text without control, format or
 * line-break characters, and the client renders it as text only. The banner brief is a description for
 * whoever draws the destination's banner image; it is never shown to players.
 */
import * as v from 'valibot';
import { PaletteColorSchema } from './lore';
import { ElementSchema, IdSchema, RaritySchema, type ContentPack, type Rarity } from './schema';

/** Trip lengths, shortest first. The 24 hour trip ("day") needs explorer rank. */
export const EXPEDITION_LENGTHS = ['short', 'medium', 'long', 'day'] as const;
export const ExpeditionLengthSchema = v.picklist(EXPEDITION_LENGTHS);
export type ExpeditionLength = v.InferOutput<typeof ExpeditionLengthSchema>;

export const SUPPLY_KINDS = ['lure', 'map-scrap', 'lantern', 'satchel'] as const;
export const SupplyKindSchema = v.picklist(SUPPLY_KINDS);
export type SupplyKind = v.InferOutput<typeof SupplyKindSchema>;

/** Supply tiers, worst first. The best tier of every kind guarantees an end-of-trip choice. */
export const SUPPLY_TIERS = ['basic', 'good', 'great'] as const;
export const SupplyTierSchema = v.picklist(SUPPLY_TIERS);
export type SupplyTier = v.InferOutput<typeof SupplyTierSchema>;

/** Where the Journal entries that any trip may turn up are grouped. */
export const JOURNAL_ANY_PLACE = 'any';

/** Player-facing text: no control, format (bidi, zero-width) or line-break characters. */
const PLAIN_TEXT = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;
const Text = (max: number) =>
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(max),
    v.regex(PLAIN_TEXT, 'must be plain text without control or format characters'),
  );

const Int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const Bp = Int(0, 10_000);

/** Parts by kind, the same kinds as `PART_KINDS` (a test keeps the two lists equal). */
export const PARTS_KEYS = [
  'scrap',
  'tide-shard',
  'ember-shard',
  'grove-shard',
  'spark-shard',
  'glimmer',
] as const;
export const PartsSchema = v.strictObject({
  scrap: v.optional(Int(1, 99)),
  'tide-shard': v.optional(Int(1, 99)),
  'ember-shard': v.optional(Int(1, 99)),
  'grove-shard': v.optional(Int(1, 99)),
  'spark-shard': v.optional(Int(1, 99)),
  glimmer: v.optional(Int(1, 99)),
});
export type PartsSpec = v.InferOutput<typeof PartsSchema>;

// --- Destinations ---

/** The brief for a destination's banner image (a 4:1 pixel art strip). Never shown to players. */
export const BannerBriefSchema = v.strictObject({
  scene: Text(240),
  palette: v.pipe(v.array(PaletteColorSchema), v.minLength(3), v.maxLength(5)),
  mood: Text(80),
  details: v.pipe(v.array(Text(120)), v.minLength(2), v.maxLength(4)),
  never: v.pipe(v.array(Text(120)), v.minLength(1), v.maxLength(3)),
});
export type BannerBrief = v.InferOutput<typeof BannerBriefSchema>;

export const RarityOddsSchema = v.pipe(
  v.strictObject({ common: Bp, rare: Bp, epic: Bp }),
  v.check((o) => o.common + o.rare + o.epic === 10_000, 'odds must add up to 10000'),
);
export type RarityOdds = v.InferOutput<typeof RarityOddsSchema>;

export const DestinationSchema = v.strictObject({
  id: IdSchema,
  name: Text(32),
  /** The place's element; null for a mixed place. */
  element: v.nullable(ElementSchema),
  access: v.strictObject({
    /** The explorer rank the creature needs to go. */
    minRank: Int(1, 20),
    /** Only open at night, by the guild's local time. */
    night: v.optional(v.boolean()),
    /** Only open in Festival weeks. */
    festival: v.optional(v.boolean()),
  }),
  /** The rarity odds of a roll here, before supplies and bonuses. Absent: the default odds. */
  odds: v.optional(RarityOddsSchema),
  /** Who lives here (species ids). */
  species: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(8)),
  /**
   * The deeper area: species that only turn up there, and a push towards rarer catches. It opens once
   * the explorer has a star here (or carries a lantern).
   */
  deep: v.strictObject({
    species: v.pipe(v.array(IdSchema), v.maxLength(4)),
    rarityUpBp: Int(0, 5_000),
  }),
  banner: BannerBriefSchema,
  flavor: Text(120),
});
export type DestinationDef = v.InferOutput<typeof DestinationSchema>;

// --- Supplies ---

const SupplyBlueprintSchema = v.strictObject({
  /** The Crafting level of the creature that crafts it. */
  craftingLevel: Int(1, 10),
  /** Hours the job takes before the crafting skill shortens it. */
  hours: Int(1, 24),
  parts: PartsSchema,
  /** How many supplies one job makes. */
  yield: Int(1, 9),
});
export type SupplyBlueprint = v.InferOutput<typeof SupplyBlueprintSchema>;

const supplyFields = {
  id: IdSchema,
  tier: SupplyTierSchema,
  name: Text(32),
  flavor: Text(120),
  /** Bait price where it can be bought. */
  price: Int(1, 10_000),
  /** The chance (basis points) that it makes an end-of-trip choice come up; the best tier guarantees one. */
  offerBp: Bp,
  blueprint: SupplyBlueprintSchema,
};

export const SupplySchema = v.variant('kind', [
  v.strictObject({
    ...supplyFields,
    kind: v.literal('lure'),
    /** Moves this many basis points of the odds from Common to Rare, and from Common to Epic. */
    rareUpBp: Bp,
    epicUpBp: Bp,
  }),
  v.strictObject({
    ...supplyFields,
    kind: v.literal('map-scrap'),
    /** Extra catch rolls: this share of the trip's rolls (at least one). */
    rollsBp: Int(0, 30_000),
  }),
  v.strictObject({
    ...supplyFields,
    kind: v.literal('lantern'),
    /** Added to the chance that a roll is drawn from the deeper area, which it opens without stars. */
    deepBp: Bp,
  }),
  v.strictObject({
    ...supplyFields,
    kind: v.literal('satchel'),
    /** More parts (basis points on top) and a better chance to find a supply. */
    partsBp: Int(0, 30_000),
    supplyBp: Bp,
  }),
]);
export type SupplyDef = v.InferOutput<typeof SupplySchema>;

// --- Push-on goals ---

export const GOAL_RISKS = ['safe', 'risky'] as const;
export const GoalRiskSchema = v.picklist(GOAL_RISKS);
export type GoalRisk = v.InferOutput<typeof GoalRiskSchema>;

/** What a goal that works out adds to the trip. */
export const GoalRewardSchema = v.strictObject({
  catchRolls: v.optional(Int(1, 20)),
  parts: v.optional(PartsSchema),
  /** A found supply of the explorer's tier (a random kind). */
  supply: v.optional(v.literal(true)),
  /** A gear piece of this rarity (a base picked evenly). */
  gear: v.optional(v.picklist(['common', 'rare', 'epic'])),
  /** A blueprint (the usual blueprint rarity odds). */
  blueprint: v.optional(v.literal(true)),
  /** One more Journal page, if the player has any left to find. */
  journal: v.optional(v.literal(true)),
  /** More explorer XP, in basis points of the trip's. */
  xpBp: v.optional(Int(1, 30_000)),
});
export type GoalReward = v.InferOutput<typeof GoalRewardSchema>;

export const PushOnGoalSchema = v.strictObject({
  id: IdSchema,
  name: Text(32),
  flavor: Text(120),
  risk: GoalRiskSchema,
  /** The explorer rank that makes the goal come up. */
  minRank: Int(1, 20),
  /** Extra hours on top of the trip, counted from the end of the trip (not from when the player chooses it). */
  extraHours: Int(1, 12),
  /**
   * The trip lengths it is offered after, and the exact chance (basis points) it works out there. A
   * safe goal always works (10000). A risky goal that does not work makes the whole trip fail: it
   * brings nothing back.
   */
  lengths: v.record(ExpeditionLengthSchema, v.strictObject({ oddsBp: Int(500, 10_000) })),
  reward: GoalRewardSchema,
});
export type PushOnGoalDef = v.InferOutput<typeof PushOnGoalSchema>;

// --- Journal ---

export const JournalEntrySchema = v.strictObject({
  id: IdSchema,
  /** A destination id, or `any` for pages any trip can turn up. */
  place: IdSchema,
  title: Text(32),
  text: Text(220),
  /** The set it belongs to, if any. */
  set: v.optional(IdSchema),
});
export type JournalEntryDef = v.InferOutput<typeof JournalEntrySchema>;

export const JournalSetSchema = v.strictObject({
  id: IdSchema,
  name: Text(32),
  place: IdSchema,
});
export type JournalSetDef = v.InferOutput<typeof JournalSetSchema>;

export const JournalSchema = v.strictObject({
  entries: v.pipe(v.array(JournalEntrySchema), v.minLength(1), v.maxLength(400)),
  sets: v.pipe(v.array(JournalSetSchema), v.maxLength(40)),
});
export type JournalDef = v.InferOutput<typeof JournalSchema>;

// --- Weekly special ---

/** What a weekly twist does to trips that start at the special destination that week. */
export const TwistEffectSchema = v.variant('kind', [
  /** More parts, in basis points on top. */
  v.strictObject({ kind: v.literal('parts'), bp: Int(1, 30_000) }),
  /** The first species of this rarity living there turns up this many times as often. */
  v.strictObject({
    kind: v.literal('featured'),
    rarity: RaritySchema,
    weight: Int(2, 9),
  }),
  /** More catch rolls. */
  v.strictObject({ kind: v.literal('rolls'), extra: Int(1, 5) }),
  /** More explorer XP, in basis points on top. */
  v.strictObject({ kind: v.literal('xp'), bp: Int(1, 30_000) }),
  /** A better chance of a Journal page, in basis points on top. */
  v.strictObject({ kind: v.literal('journal'), bp: Int(1, 30_000) }),
]);
export type TwistEffect = v.InferOutput<typeof TwistEffectSchema>;

export const TwistSchema = v.strictObject({
  id: IdSchema,
  name: Text(32),
  description: Text(120),
  effect: TwistEffectSchema,
});
export type TwistDef = v.InferOutput<typeof TwistSchema>;

export const SpecialsSchema = v.strictObject({
  twists: v.pipe(v.array(TwistSchema), v.minLength(1), v.maxLength(40)),
  /**
   * The rotation of the weekly special destination, one per week by the week index. Festival weeks
   * use `festival` instead.
   */
  rotation: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(20)),
  festival: v.strictObject({ destination: IdSchema, twist: IdSchema }),
});
export type SpecialsDef = v.InferOutput<typeof SpecialsSchema>;

// --- The pack ---

export const ExpeditionPackSchema = v.strictObject({
  destinations: v.pipe(v.array(DestinationSchema), v.minLength(1), v.maxLength(40)),
  supplies: v.pipe(v.array(SupplySchema), v.minLength(1), v.maxLength(60)),
  goals: v.pipe(v.array(PushOnGoalSchema), v.minLength(1), v.maxLength(60)),
  journal: JournalSchema,
  specials: SpecialsSchema,
});
export type ExpeditionPack = v.InferOutput<typeof ExpeditionPackSchema>;

function fail(message: string): never {
  throw new Error(`Invalid expedition content: ${message}`);
}

/**
 * Validates raw expedition content (schema first, then every cross-reference) against the creature
 * pack and returns it typed. Throws an Error naming the first problem. Shipped content is checked at
 * module load.
 */
export function loadExpeditions(raw: unknown, pack: ContentPack): ExpeditionPack {
  const parsed = v.safeParse(ExpeditionPackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(
      `Invalid expedition content schema at "${path}": ${first?.message ?? 'unknown error'}`,
    );
  }
  const out = parsed.output;
  const species = new Map(pack.creatures.map((c) => [c.id, c]));

  // Destinations: unique ids, real species, festival species only at festival places.
  const destinations = new Map<string, DestinationDef>();
  const places = new Map<string, number>();
  for (const d of out.destinations) {
    if (destinations.has(d.id)) fail(`duplicate destination id "${d.id}"`);
    destinations.set(d.id, d);
    const lives = [...d.species, ...d.deep.species];
    if (new Set(lives).size !== lives.length) fail(`destination "${d.id}" lists a species twice`);
    if (d.deep.species.length === 0 && d.deep.rarityUpBp === 0) {
      fail(`destination "${d.id}" has a deeper area with nothing in it`);
    }
    for (const id of lives) {
      const s = species.get(id);
      if (s === undefined) fail(`destination "${d.id}" has unknown species "${id}"`);
      if (s.stage !== 1) fail(`destination "${d.id}" has "${id}", which is not a stage-1 species`);
      const festivalOnly = s.festival === true;
      if (!festivalOnly && !s.catchable) fail(`"${id}" cannot be caught anywhere`);
      if (festivalOnly && d.access.festival !== true) {
        fail(`festival species "${id}" must only live at a festival destination`);
      }
      places.set(id, (places.get(id) ?? 0) + 1);
    }
    if (d.species.length > 0 && d.odds !== undefined) {
      // An odds table must not name a rarity that nobody there has (the roll would fall back anyway).
      const rarities = new Set(
        [...d.species, ...d.deep.species].map((id) => species.get(id)?.rarity as Rarity),
      );
      for (const r of ['common', 'rare', 'epic'] as const) {
        if (d.odds[r] > 0 && !rarities.has(r)) {
          fail(`destination "${d.id}" has odds for ${r} but no ${r} species`);
        }
      }
    }
  }
  // Every catchable species lives somewhere; each species in one or two places, festival ones in one.
  for (const s of pack.creatures) {
    if (s.stage !== 1) continue;
    const n = places.get(s.id) ?? 0;
    if (s.catchable && n === 0) fail(`species "${s.id}" lives nowhere`);
    if (n > 2) fail(`species "${s.id}" lives in ${String(n)} places (at most 2)`);
    if (s.festival === true && n !== 1) fail(`festival species "${s.id}" must live in one place`);
  }

  // Supplies: one of each kind and tier, id = kind-tier, the best tier guarantees a choice.
  const supplyIds = new Set<string>();
  for (const s of out.supplies) {
    if (s.id !== `${s.kind}-${s.tier}`)
      fail(`supply "${s.id}" must be called "${s.kind}-${s.tier}"`);
    if (supplyIds.has(s.id)) fail(`duplicate supply id "${s.id}"`);
    supplyIds.add(s.id);
    if (s.tier === 'great' && s.offerBp !== 10_000) {
      fail(`supply "${s.id}" is the best tier and must guarantee a choice (offerBp 10000)`);
    }
    if (s.tier !== 'great' && s.offerBp >= 10_000) {
      fail(`supply "${s.id}" must not guarantee a choice (only the best tier does)`);
    }
  }
  for (const kind of SUPPLY_KINDS) {
    for (const tier of SUPPLY_TIERS) {
      if (!supplyIds.has(`${kind}-${tier}`)) fail(`no supply "${kind}-${tier}"`);
    }
  }

  // Goals.
  const goalIds = new Set<string>();
  for (const g of out.goals) {
    if (goalIds.has(g.id)) fail(`duplicate goal id "${g.id}"`);
    goalIds.add(g.id);
    const lengths = Object.values(g.lengths);
    if (lengths.length === 0) fail(`goal "${g.id}" is offered after no trip`);
    if (g.risk === 'safe' && lengths.some((l) => l.oddsBp !== 10_000)) {
      fail(`safe goal "${g.id}" must always work (oddsBp 10000)`);
    }
    if (g.risk === 'risky' && lengths.some((l) => l.oddsBp >= 10_000)) {
      fail(`risky goal "${g.id}" must be able to fail`);
    }
    if (Object.keys(g.reward).length === 0) fail(`goal "${g.id}" gives nothing`);
  }
  if (!out.goals.some((g) => g.risk === 'safe' && g.minRank === 1)) {
    fail('there is no safe goal for a new explorer');
  }
  if (!out.goals.some((g) => g.risk === 'risky')) fail('there is no risky goal');

  // Journal.
  const entryIds = new Set<string>();
  const setById = new Map(out.journal.sets.map((s) => [s.id, s]));
  if (setById.size !== out.journal.sets.length) fail('duplicate journal set id');
  const setSizes = new Map<string, number>();
  for (const e of out.journal.entries) {
    if (entryIds.has(e.id)) fail(`duplicate journal entry id "${e.id}"`);
    entryIds.add(e.id);
    if (e.place !== JOURNAL_ANY_PLACE && !destinations.has(e.place)) {
      fail(`journal entry "${e.id}" is about unknown place "${e.place}"`);
    }
    if (e.set !== undefined) {
      const set = setById.get(e.set);
      if (set === undefined) fail(`journal entry "${e.id}" is in unknown set "${e.set}"`);
      if (set.place !== e.place) fail(`journal entry "${e.id}" is not in its set's place`);
      setSizes.set(e.set, (setSizes.get(e.set) ?? 0) + 1);
    }
  }
  for (const s of out.journal.sets) {
    if (s.place !== JOURNAL_ANY_PLACE && !destinations.has(s.place)) {
      fail(`journal set "${s.id}" is about unknown place "${s.place}"`);
    }
    if ((setSizes.get(s.id) ?? 0) < 3) fail(`journal set "${s.id}" needs at least 3 entries`);
  }
  // Every destination has pages of its own; the festival place too.
  for (const d of out.destinations) {
    if (!out.journal.entries.some((e) => e.place === d.id)) {
      fail(`destination "${d.id}" has no journal entries`);
    }
  }

  // The weekly special.
  const twistIds = new Set(out.specials.twists.map((t) => t.id));
  if (twistIds.size !== out.specials.twists.length) fail('duplicate twist id');
  const festivalPlace = destinations.get(out.specials.festival.destination);
  if (festivalPlace === undefined) fail('the festival special is at an unknown destination');
  if (festivalPlace.access.festival !== true) {
    fail('the festival special must be at a festival destination');
  }
  if (!twistIds.has(out.specials.festival.twist)) fail('the festival special has an unknown twist');
  for (const id of out.specials.rotation) {
    const d = destinations.get(id);
    if (d === undefined) fail(`the rotation has unknown destination "${id}"`);
    if (d.access.festival === true) fail(`the rotation must not hold the festival place "${id}"`);
  }
  for (const t of out.specials.twists) {
    if (t.effect.kind !== 'featured') continue;
    const featuredRarity = t.effect.rarity;
    // Every destination of the rotation needs a species of the featured rarity.
    for (const id of out.specials.rotation) {
      const d = destinations.get(id);
      const has = [...(d?.species ?? []), ...(d?.deep.species ?? [])].some(
        (sid) => species.get(sid)?.rarity === featuredRarity,
      );
      if (!has) fail(`twist "${t.id}" features ${featuredRarity} but "${id}" has none`);
    }
  }
  return out;
}
