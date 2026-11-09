/**
 * The resource library: the one place that names every resource a player holds (its stable id, its
 * kind, its singular and plural name, its icon and its glossary entry). Data is `data/resources.json`.
 * Screens and the worker read names and icons through the helpers in `./resources`, so adding a
 * resource or renaming one is one data edit (`pnpm resources rename <id> <Name> [<plural>]` also
 * rewrites the word in the content text). None of it has any gameplay effect.
 */
import * as v from 'valibot';
import { IdSchema } from './schema';

export const RESOURCE_KINDS = [
  'currency',
  'material',
  'shard',
  'supply',
  'prize',
  'collectible',
  'luxury',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

const IconId = v.pipe(
  v.string(),
  v.maxLength(32),
  v.regex(/^[a-z][a-z0-9_-]*$/, 'must be a plain id'),
);

/** The picture a resource wears, as plain data (the Activity's `IconRef` without the gear art). */
export const ResourceIconSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('glyph'), id: IconId }),
  v.strictObject({ kind: v.literal('supply'), id: IconId }),
  v.strictObject({ kind: v.literal('part'), part: IconId }),
  v.strictObject({ kind: v.literal('element'), element: IconId }),
]);
export type ResourceIcon = v.InferOutput<typeof ResourceIconSchema>;

const Name = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(32),
  v.regex(
    /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u,
    'must be plain text without control or format characters',
  ),
);

export const ResourceSchema = v.strictObject({
  /** The storage key (ledger currency, part kind, supply id, ...). Never renamed. */
  id: IdSchema,
  kind: v.picklist(RESOURCE_KINDS),
  name: Name,
  /** What more than one is called (often the same word). */
  plural: Name,
  icon: ResourceIconSchema,
  /** The glossary entry that explains it, when it has one. */
  glossary: v.optional(IdSchema),
});
export type ResourceDef = v.InferOutput<typeof ResourceSchema>;

export const ResourcesSchema = v.pipe(
  v.array(ResourceSchema),
  v.minLength(1),
  v.maxLength(200),
  v.check(
    (all) => new Set(all.map((r) => r.id)).size === all.length,
    'resource ids must be unique',
  ),
);

export function loadResources(raw: unknown): readonly ResourceDef[] {
  return v.parse(ResourcesSchema, raw);
}
