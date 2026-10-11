/**
 * Species lore, the visual brief, traits and quirks (see `docs/design/creatures.md`).
 *
 * All of it is data (`data/species-lore.json`, `data/bosses-lore.json`, `data/quirks.json`); this
 * file holds the schemas, the load-time cross-checks and the pure quirk pick. None of it has any
 * gameplay effect: the engine never reads it.
 */
import * as v from 'valibot';
import { int, chance, type Rng } from '../rng';
import { IdSchema, type ContentPack } from './schema';

const Line = (max: number) => v.pipe(v.string(), v.minLength(1), v.maxLength(max));

/** Longest player-facing description, in characters. */
export const MAX_DESCRIPTION_LENGTH = 220;
/** Longest trait or quirk, in characters. */
export const MAX_SHORT_TEXT_LENGTH = 60;

export const LORE_SIZES = ['tiny', 'small', 'medium', 'large'] as const;
export const BOSS_LORE_SIZES = ['large', 'huge'] as const;

/** A named colour of a palette: lowercase `#rrggbb`. */
export const PaletteColorSchema = v.strictObject({
  name: Line(24),
  hex: v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/, 'must be a lowercase #rrggbb colour')),
});
export type PaletteColor = v.InferOutput<typeof PaletteColorSchema>;

const appearanceFields = {
  silhouette: Line(120),
  palette: v.pipe(v.array(PaletteColorSchema), v.minLength(3), v.maxLength(5)),
  features: v.pipe(v.array(Line(120)), v.minLength(3), v.maxLength(5)),
  pose: Line(120),
  always: v.pipe(v.array(Line(120)), v.minLength(1), v.maxLength(3)),
  never: v.pipe(v.array(Line(120)), v.minLength(1), v.maxLength(3)),
};

/**
 * The visual brief for art, an input for anyone who draws the species (pixel sprites at 16x16 and
 * any other medium). Never shown to players. A stage-2 form also says what it keeps from its
 * stage-1 form and what changes.
 */
export const AppearanceSchema = v.strictObject({
  ...appearanceFields,
  /** Relative to other creatures. */
  size: v.picklist(LORE_SIZES),
  fromStage1: v.optional(
    v.strictObject({
      keeps: v.pipe(v.array(Line(120)), v.minLength(1), v.maxLength(5)),
      changes: v.pipe(v.array(Line(120)), v.minLength(1), v.maxLength(5)),
    }),
  ),
});
export type Appearance = v.InferOutput<typeof AppearanceSchema>;

export const SpeciesLoreSchema = v.strictObject({
  /** Player-facing, 1 to 2 sentences. */
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_DESCRIPTION_LENGTH)),
  appearance: AppearanceSchema,
  /** Short behavioural traits, shown to players as small chips. */
  traits: v.pipe(v.array(Line(MAX_SHORT_TEXT_LENGTH)), v.minLength(3), v.maxLength(4)),
});
export type SpeciesLore = v.InferOutput<typeof SpeciesLoreSchema>;

/** Bosses are 24x24 sprites; they have a description and a visual brief only. */
export const BossLoreSchema = v.strictObject({
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_DESCRIPTION_LENGTH)),
  appearance: v.strictObject({
    ...appearanceFields,
    size: v.picklist(BOSS_LORE_SIZES),
  }),
});
export type BossLore = v.InferOutput<typeof BossLoreSchema>;

export const QuirkSchema = v.strictObject({
  id: IdSchema,
  text: Line(MAX_SHORT_TEXT_LENGTH),
});
export type Quirk = v.InferOutput<typeof QuirkSchema>;

export const QuirkPoolSchema = v.strictObject({
  /** Fits any creature. */
  general: v.pipe(v.array(QuirkSchema), v.minLength(30), v.maxLength(200)),
  /** Per evolution line (the id of its stage-1 species): 2 to 3 quirks that go against its traits. */
  againstType: v.record(IdSchema, v.pipe(v.array(QuirkSchema), v.minLength(2), v.maxLength(3))),
});
export type QuirkPool = v.InferOutput<typeof QuirkPoolSchema>;

export const LorePackSchema = v.strictObject({
  species: v.record(IdSchema, SpeciesLoreSchema),
  bosses: v.record(IdSchema, BossLoreSchema),
  quirks: QuirkPoolSchema,
});
export type LorePack = v.InferOutput<typeof LorePackSchema>;

/** Chance that a new creature gets an "against type" quirk instead of a general one: 1 in 4. */
export const AGAINST_TYPE_ODDS = { numerator: 1, denominator: 4 } as const;

function fail(message: string): never {
  throw new Error(`Invalid lore: ${message}`);
}

function sameIds(kind: string, have: readonly string[], want: readonly string[]): void {
  const haveSet = new Set(have);
  const wantSet = new Set(want);
  for (const id of want) if (!haveSet.has(id)) fail(`${kind} "${id}" has no entry`);
  for (const id of have) if (!wantSet.has(id)) fail(`${kind} entry "${id}" matches nothing`);
}

/**
 * Validates raw lore against the schema and the content pack: every species and boss has an entry
 * (and nothing else does), stage-2 forms (and only they) describe their evolution, every
 * evolution line has against-type quirks, and quirk ids are unique. Throws an Error naming the
 * first problem.
 */
export function loadLore(raw: unknown, pack: ContentPack): LorePack {
  const parsed = v.safeParse(LorePackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid lore schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const lore = parsed.output;

  sameIds(
    'species',
    Object.keys(lore.species),
    pack.creatures.map((c) => c.id),
  );
  sameIds(
    'boss',
    Object.keys(lore.bosses),
    pack.bosses.map((b) => b.id),
  );
  for (const c of pack.creatures) {
    const entry = lore.species[c.id];
    if (entry === undefined) continue; // sameIds reported it
    const hasEvolution = entry.appearance.fromStage1 !== undefined;
    if (c.stage === 2 && !hasEvolution) fail(`stage-2 species "${c.id}" needs "fromStage1"`);
    if (c.stage === 1 && hasEvolution) fail(`stage-1 species "${c.id}" must not have "fromStage1"`);
  }
  for (const [id, entry] of [...Object.entries(lore.species), ...Object.entries(lore.bosses)]) {
    const names = entry.appearance.palette.map((p) => p.name);
    const hexes = entry.appearance.palette.map((p) => p.hex);
    if (new Set(names).size !== names.length) fail(`"${id}" repeats a palette colour name`);
    if (new Set(hexes).size !== hexes.length) fail(`"${id}" repeats a palette colour`);
  }

  // Against-type quirks exist per evolution line, which is the id of its stage-1 species.
  sameIds(
    'line',
    Object.keys(lore.quirks.againstType),
    pack.creatures.filter((c) => c.stage === 1).map((c) => c.line),
  );
  const seen = new Set<string>();
  const all = [...lore.quirks.general, ...Object.values(lore.quirks.againstType).flat()];
  for (const q of all) {
    if (seen.has(q.id)) fail(`duplicate quirk id "${q.id}"`);
    seen.add(q.id);
  }
  return lore;
}

/**
 * Picks the quirk id for a new creature of an evolution line: 1 in 4 from the line's "against type"
 * quirks, otherwise from the general pool, uniformly. A line without against-type quirks (or an
 * unknown one) uses the general pool. Pure: all randomness comes from `rng`. Live callers pass the
 * crypto RNG, drawn at the moment the creature is created.
 */
export function pickQuirkFrom(pool: QuirkPool, line: string | undefined, rng: Rng): string {
  const against = line === undefined ? undefined : pool.againstType[line];
  const useAgainst = chance(rng, AGAINST_TYPE_ODDS.numerator, AGAINST_TYPE_ODDS.denominator);
  const from = useAgainst && against !== undefined && against.length > 0 ? against : pool.general;
  const picked = from[int(rng, from.length)];
  if (picked === undefined) throw new Error('quirk pool is empty');
  return picked.id;
}
