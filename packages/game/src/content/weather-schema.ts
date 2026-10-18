/**
 * Boons and Omens content (`data/weather.json`; docs/design/gear-and-creatures-v2.md section 10): the
 * valley's daily sky. A Boon is a good effect, an Omen a bad one; every day has one Boon and, from Boss
 * Rank 3, one Omen. Everything here is data: ids are never renamed once shipped (they are stored with the
 * days that drew them), and every number that decides how strong the sky is by rank lives in
 * `RULES.weather`. The engine never reads this: the server and the simulator turn the day's effects into
 * the plain numbers the engine already takes (`rules/weather.ts`).
 *
 * An effect is one small, typed change in one of the places the sky reaches: a fight (the modifier sheet,
 * the luck rules, the boss's attacks), a trip, the Workshop, creature experience, the dungeon's payout.
 * `text` is the line the player reads; `{n}` in it is replaced by the effect's number at the day's
 * strength. A Boon or Omen whose effects need an engine hook that does not exist yet is `planned`: it is
 * written down with what it needs and never drawn.
 *
 * Text that players read is plain text without control, format or line-break characters, and the client
 * renders it as text only.
 */
import * as v from 'valibot';
import { IdSchema, RoleSchema } from './schema';
import { ExpeditionLengthSchema } from './expedition-schema';

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
const SignedBp = Int(-10_000, 10_000);

/** The one-number fields of an engine `SlotMods` sheet that a day may set (basis points). */
export const WEATHER_SHEET_FIELDS = [
  'firstHitBp',
  'boostBp',
  'areaBp',
  'healReceivedBp',
  'coverBp',
  'pierceBp',
] as const;
export type WeatherSheetField = (typeof WEATHER_SHEET_FIELDS)[number];

export const WEATHER_KINDS = ['boon', 'omen'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

const EffectText = Text(120);

/**
 * What a Boon or Omen does. `scaled` effects grow with the day's strength (the rank's multiplier);
 * the others (a number of rounds, a number of attacks, an extra roll, a count of first actions) never do.
 */
export const WeatherEffectSchema = v.variant('op', [
  // --- A fight (the raid stage, every dungeon room) ---
  /** One field of every matching creature's sheet. A negative `areaBp` makes it take more. Scaled. */
  v.strictObject({
    op: v.literal('sheet'),
    field: v.picklist(WEATHER_SHEET_FIELDS),
    bp: SignedBp,
    /** Only creatures of these roles; absent: all. */
    roles: v.optional(v.pipe(v.array(RoleSchema), v.minLength(1), v.maxLength(4))),
    text: EffectText,
  }),
  /** Rounds added to the Rally, Shield Wall and Purge of every creature's own ability. Fixed. */
  v.strictObject({ op: v.literal('linger'), rounds: Int(1, 2), text: EffectText }),
  /** The bonus of these reactions, for every creature that sets one off. Scaled. */
  v.strictObject({
    op: v.literal('reaction'),
    reactions: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(4)),
    bp: SignedBp,
    text: EffectText,
  }),
  /** The team's crit chance, in basis points of chance. Scaled. */
  v.strictObject({ op: v.literal('crit'), bp: Int(0, 5_000), text: EffectText }),
  /** The foes' crit chance, in basis points of chance. Scaled. */
  v.strictObject({ op: v.literal('foeCrit'), bp: Int(0, 5_000), text: EffectText }),
  /**
   * The foes hit harder by `bp`; a foe of a listed element by that element's number instead. Scaled.
   * Folded into every creature's sheet as what it takes, so a stored fight needs nothing else.
   */
  v.strictObject({
    op: v.literal('foeAttack'),
    bp: Int(1, 10_000),
    elements: v.optional(
      v.partial(
        v.strictObject({
          tide: Int(1, 10_000),
          ember: Int(1, 10_000),
          grove: Int(1, 10_000),
          spark: Int(1, 10_000),
        }),
      ),
    ),
    text: EffectText,
  }),
  /** The boss makes this many more plain attacks each round (at most three in all). Fixed. */
  v.strictObject({ op: v.literal('foeAttacks'), extra: Int(1, 2), text: EffectText }),

  // --- Trips ---
  /** Trips started that day take this much longer (negative: shorter). Scaled. */
  v.strictObject({ op: v.literal('tripTime'), bp: SignedBp, text: EffectText }),
  /** Parts found, more or less (basis points on top); `places` limits it to those destinations. Scaled. */
  v.strictObject({
    op: v.literal('tripParts'),
    bp: SignedBp,
    places: v.optional(v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(8))),
    text: EffectText,
  }),
  /** The chance of a shard (a share of the chance, basis points on top). Scaled. */
  v.strictObject({ op: v.literal('tripShards'), bp: SignedBp, text: EffectText }),
  /** The chance of a supply find (a share of the chance, basis points on top). Scaled. */
  v.strictObject({ op: v.literal('tripSupply'), bp: SignedBp, text: EffectText }),
  /** Extra catch rolls on trips of at least `minLength` at these destinations. Fixed. */
  v.strictObject({
    op: v.literal('tripRoll'),
    places: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(8)),
    minLength: ExpeditionLengthSchema,
    extra: Int(1, 2),
    text: EffectText,
  }),
  /** A rarer catch: this many basis points of chance moved up a rarity on every roll. Scaled. */
  v.strictObject({ op: v.literal('tripRarity'), bp: Int(0, 2_000), text: EffectText }),
  /** The chance of a Journal page (basis points on top). Scaled. */
  v.strictObject({ op: v.literal('tripJournal'), bp: SignedBp, text: EffectText }),
  /** The Moonlit Reef (and any night place) is open all day. Fixed. */
  v.strictObject({ op: v.literal('reefOpen'), text: EffectText }),

  // --- Creatures and the Workshop ---
  /**
   * Creature experience from everything started or fought that day (basis points on top, scaled);
   * `treatMultiplier` replaces the treat's doubling (fixed).
   */
  v.strictObject({
    op: v.literal('xp'),
    bp: SignedBp,
    treatMultiplier: v.optional(Int(3, 4)),
    text: EffectText,
  }),
  /** Workshop jobs started that day take this much longer (negative: faster). Scaled. */
  v.strictObject({ op: v.literal('workshopTime'), bp: SignedBp, text: EffectText }),
  /**
   * The day's first `crafts` crafts get `stepUpBp` more one-step-up chance and its first `dismantles`
   * dismantle jobs roll the top of every range. Only the first few, never every action, so hoarding for
   * the day pays nothing (`decisions.md`, 2026-10-16). `stepUpBp` is scaled, the counts are fixed.
   */
  v.strictObject({
    op: v.literal('market'),
    stepUpBp: Int(0, 2_000),
    crafts: Int(1, 3),
    dismantles: Int(1, 5),
    text: EffectText,
  }),

  // --- The dungeon ---
  /** Scrap for every room cleared. Fixed. */
  v.strictObject({ op: v.literal('dungeonScrap'), perRoom: Int(1, 3), text: EffectText }),
]);
export type WeatherEffect = v.InferOutput<typeof WeatherEffectSchema>;

/** The ops, so a test can check that every one is used and every one is handled. */
export const WEATHER_OPS: readonly string[] = WeatherEffectSchema.options.map(
  (o) => o.entries.op.literal,
);

/** The ops whose number grows with the day's strength; their `text` shows it as `{n}`. */
export const SCALED_OPS: ReadonlySet<string> = new Set([
  'sheet',
  'reaction',
  'crit',
  'foeCrit',
  'foeAttack',
  'tripTime',
  'tripParts',
  'tripShards',
  'tripSupply',
  'tripRarity',
  'tripJournal',
  'xp',
  'workshopTime',
  'market',
]);

export const WEATHER_STATUSES = ['live', 'planned'] as const;

export const WeatherDefSchema = v.strictObject({
  id: IdSchema,
  kind: v.picklist(WEATHER_KINDS),
  name: Text(32),
  /** One line of flavour. */
  flavor: Text(120),
  /** What a creature may say about the day in the living room (a few words each). */
  bubbles: v.pipe(v.array(Text(26)), v.minLength(1), v.maxLength(4)),
  /** `live` is drawn; `planned` needs an engine hook that does not exist yet and is never drawn. */
  status: v.picklist(WEATHER_STATUSES),
  /** The lowest Boss Rank it can be drawn at (default 1). */
  minRank: v.optional(Int(1, 40)),
  /** A wild Omen: from `RULES.weather.wildFromRank`, at most one a week, never in a Festival week. */
  wild: v.optional(v.boolean()),
  /** Ids of the other kind this never meets on the same day (an Omen that would undo a Boon). */
  cancels: v.pipe(v.array(IdSchema), v.maxLength(8)),
  effects: v.pipe(v.array(WeatherEffectSchema), v.maxLength(4)),
  /** Planned ones only: what it will do and which engine hook it waits for. */
  planned: v.optional(Text(280)),
});
export type WeatherDef = v.InferOutput<typeof WeatherDefSchema>;

export const WeatherPackSchema = v.pipe(v.array(WeatherDefSchema), v.minLength(2), v.maxLength(80));
export type WeatherPack = readonly WeatherDef[];

function fail(message: string): never {
  throw new Error(`Invalid weather content: ${message}`);
}

/**
 * Validates raw weather content (schema first, then cross-references) and returns it typed. Throws an
 * Error naming the first problem. Shipped content is checked at module load. `places` are the ids of the
 * destinations, `reactions` the ids of the reactions.
 */
export function loadWeather(
  raw: unknown,
  pack: { reactions: readonly { id: string }[] },
  places: ReadonlySet<string>,
): WeatherPack {
  const parsed = v.safeParse(WeatherPackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid weather schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const defs = parsed.output;
  const ids = new Map<string, WeatherDef>();
  for (const d of defs) {
    if (ids.has(d.id)) fail(`duplicate id "${d.id}"`);
    ids.set(d.id, d);
  }
  const reactionIds = new Set(pack.reactions.map((r) => r.id));
  for (const d of defs) {
    if (d.status === 'live') {
      if (d.effects.length === 0) fail(`"${d.id}" is live but has no effect`);
      if (d.planned !== undefined) fail(`"${d.id}" is live and must not have a "planned" note`);
    } else {
      if (d.planned === undefined) fail(`"${d.id}" is planned and needs a "planned" note`);
      if (d.effects.length > 0) fail(`"${d.id}" is planned and must not have effects yet`);
    }
    if (d.kind === 'boon' && (d.wild === true || d.minRank !== undefined)) {
      fail(`"${d.id}": a Boon has no minRank or wild flag`);
    }
    if (d.wild === true && d.kind !== 'omen') fail(`"${d.id}": only an Omen can be wild`);
    for (const other of d.cancels) {
      const o = ids.get(other);
      if (o === undefined) fail(`"${d.id}" cancels unknown "${other}"`);
      if (o.kind === d.kind) fail(`"${d.id}" cancels "${other}", which is the same kind`);
      // Symmetric: the pair is written on both sides, so either one can be drawn first.
      if (!o.cancels.includes(d.id)) fail(`"${other}" must list "${d.id}" in "cancels" too`);
    }
    const ops = new Set<string>();
    for (const e of d.effects) {
      if (e.op === 'reaction') {
        for (const r of e.reactions) {
          if (!reactionIds.has(r)) fail(`"${d.id}" names unknown reaction "${r}"`);
        }
      }
      if (e.op === 'tripParts' || e.op === 'tripRoll') {
        for (const p of e.places ?? []) {
          if (!places.has(p)) fail(`"${d.id}" names unknown destination "${p}"`);
        }
      }
      if (e.op === 'sheet') {
        const key = `${e.op}:${e.field}`;
        if (ops.has(key)) fail(`"${d.id}" sets ${e.field} twice`);
        ops.add(key);
      } else {
        if (ops.has(e.op)) fail(`"${d.id}" repeats the effect "${e.op}"`);
        ops.add(e.op);
      }
      // A scaled effect shows its number in its text (at the day's strength); a fixed one has none.
      if (SCALED_OPS.has(e.op) && !e.text.includes('{n}')) {
        fail(`"${d.id}": the text of "${e.op}" must show its number with {n}`);
      }
      if (!SCALED_OPS.has(e.op) && e.text.includes('{n}')) {
        fail(`"${d.id}": the text of "${e.op}" has no number to show, remove {n}`);
      }
    }
  }
  if (!defs.some((d) => d.kind === 'boon' && d.status === 'live')) fail('needs a live Boon');
  const omens = defs.filter((d) => d.kind === 'omen' && d.status === 'live' && d.wild !== true);
  if (omens.filter((d) => (d.minRank ?? 1) <= 3).length < 3) {
    fail('needs at least 3 live Omens that can be drawn at Boss Rank 3, so none repeats at once');
  }
  return defs;
}
