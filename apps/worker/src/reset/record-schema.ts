/**
 * The settlers' record (`docs/design/reset.md`, section 1): what one server keeps of its players before the reset.
 * A versioned JSON shape with a strict schema, so later content (settler visitors, rare finds) can read it back.
 *
 * It holds no Discord user ids and no server ids: each settler has a random id (`id`), each server a random archive
 * key, and `idHash` is a keyed hash (HMAC-SHA-256) of the Discord id, shown to no one. Player-typed text (`name`,
 * `nickname`) is kept as stored and shown only as text. Private creature notes are never part of it.
 */
import * as v from 'valibot';

export const RECORD_VERSION = 1;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9-]{1,64}$/;

const Day = v.pipe(v.string(), v.regex(DAY_RE));
const Count = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
/** At most 32 characters (code points) of text is 64 UTF-16 units. */
const Name = v.pipe(v.string(), v.maxLength(64));
const Text = v.pipe(v.string(), v.maxLength(200));
const ContentId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/** How a creature came: the starter, a trip, a Festival win, or anything else the game once stored. */
export const ORIGINS = ['starter', 'trip', 'festival', 'other'] as const;
export type SettlerOrigin = (typeof ORIGINS)[number];

export const SettlerCreatureSchema = v.strictObject({
  /** The species it is now (its current form). */
  species: ContentId,
  speciesName: Text,
  line: ContentId,
  level: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
  shiny: v.boolean(),
  nickname: v.nullable(Text),
  origin: v.picklist(ORIGINS),
  caughtDay: Day,
  quirk: v.nullable(ContentId),
});
export type SettlerCreature = v.InferOutput<typeof SettlerCreatureSchema>;

/** A creature named for a feat: its nickname and species name (the feat text reads "Pebbles the Mossling"). */
const NamedCreature = v.strictObject({
  species: ContentId,
  speciesName: Text,
  nickname: v.nullable(Text),
});
export type FeatCreature = v.InferOutput<typeof NamedCreature>;

/** The eight feats, and nothing else (Misa, 2026-11-06). A feat a settler has nothing for is `null`, 0 or empty. */
export const SettlerFeatsSchema = v.strictObject({
  /** Deepest depth of a cleared dungeon run. */
  deepestDepth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000))),
  /** Lines the settler was first to catch on the server, named by the line's first form. */
  firsts: v.pipe(v.array(Text), v.maxLength(1000)),
  blueprints: Count,
  creatures: Count,
  highestLevel: v.nullable(v.strictObject({ creature: NamedCreature, level: Count })),
  totalLevels: Count,
  bestCrafter: v.nullable(v.strictObject({ creature: NamedCreature, level: Count })),
  bestExplorer: v.nullable(v.strictObject({ creature: NamedCreature, rank: Count })),
});
export type SettlerFeats = v.InferOutput<typeof SettlerFeatsSchema>;

export const SettlerSchema = v.strictObject({
  /** Random, made when the record is built. Not derived from anything. */
  id: v.pipe(v.string(), v.regex(ID_RE)),
  /** HMAC-SHA-256 of the Discord id under the Worker secret `SETTLER_HMAC_KEY`, in hex. Never shown. */
  idHash: v.pipe(v.string(), v.regex(HEX64_RE)),
  /** The display name on the switch day, as stored, at most 32 characters. */
  name: Name,
  firstPlayedDay: Day,
  creatures: v.pipe(v.array(SettlerCreatureSchema), v.maxLength(2000)),
  feats: SettlerFeatsSchema,
});
export type Settler = v.InferOutput<typeof SettlerSchema>;

export const SettlersRecordSchema = v.strictObject({
  version: v.literal(RECORD_VERSION),
  /** Random key of this server's record in the archive. Not the Discord server id. */
  archiveKey: v.pipe(v.string(), v.regex(ID_RE)),
  /** When the snapshot was taken (UTC epoch milliseconds). */
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** The guild-local day of the snapshot. */
  switchDay: Day,
  settlers: v.pipe(v.array(SettlerSchema), v.maxLength(5000)),
});
export type SettlersRecord = v.InferOutput<typeof SettlersRecordSchema>;

/** The archive's proof that a record is stored: what `wipeGuild` demands. */
export const ArchiveReceiptSchema = v.strictObject({
  archiveKey: v.pipe(v.string(), v.regex(ID_RE)),
  /** SHA-256 of the stored JSON text, in hex. */
  digest: v.pipe(v.string(), v.regex(HEX64_RE)),
  settlers: Count,
  creatures: Count,
  storedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type ArchiveReceipt = v.InferOutput<typeof ArchiveReceiptSchema>;
