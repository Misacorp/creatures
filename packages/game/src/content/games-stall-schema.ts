/**
 * The Valley Games Prize Stall (`data/games-stall.json`; docs/design/valley-games.md): the offers a
 * player can buy with medal points on the Wednesday game day. Each offer has a kind the server knows
 * how to grant (`gear`, `supply`, `bait`, `shards`, `glimmer`), a price in medal points, a per-week
 * limit per player and the kind's numbers. Ids are never renamed once shipped (purchases are counted by
 * offer id). Names are plain text; the client renders them as text only.
 */
import * as v from 'valibot';
import stallJson from './data/games-stall.json';
import { IdSchema } from './schema';

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

export const GAMES_STALL_KINDS = ['gear', 'supply', 'bait', 'shards', 'glimmer'] as const;
export type GamesStallKind = (typeof GAMES_STALL_KINDS)[number];

const Base = {
  id: IdSchema,
  name: Text(32),
  /** Medal points (gold 3, silver 2, bronze and pins 1: `RULES.games.medalPoints`). */
  price: Int(1, 99),
  /** Purchases per player per stall week. */
  weeklyLimit: Int(1, 9),
};

export const GamesStallOfferSchema = v.variant('kind', [
  /** A mystery gear piece: a random base and element at the player's dungeon item level. */
  v.strictObject({
    ...Base,
    kind: v.literal('gear'),
    params: v.strictObject({ rarity: v.picklist(['common', 'rare', 'epic']) }),
  }),
  /** One supply of this tier, of a kind drawn at the purchase (never a lure, as in the dungeon). */
  v.strictObject({
    ...Base,
    kind: v.literal('supply'),
    params: v.strictObject({ tier: v.picklist(['basic', 'good', 'great']) }),
  }),
  v.strictObject({
    ...Base,
    kind: v.literal('bait'),
    params: v.strictObject({ amount: Int(1, 1_000) }),
  }),
  /** Shards of one element, drawn at the purchase. */
  v.strictObject({
    ...Base,
    kind: v.literal('shards'),
    params: v.strictObject({ amount: Int(1, 50) }),
  }),
  v.strictObject({
    ...Base,
    kind: v.literal('glimmer'),
    params: v.strictObject({ amount: Int(1, 20) }),
  }),
]);
export type GamesStallOffer = v.InferOutput<typeof GamesStallOfferSchema>;

export const GamesStallSchema = v.strictObject({
  offers: v.pipe(v.array(GamesStallOfferSchema), v.minLength(1), v.maxLength(12)),
});

/** Validates raw stall content and returns it typed. Throws an Error naming the first problem. */
export function loadGamesStall(raw: unknown): readonly GamesStallOffer[] {
  const parsed = v.safeParse(GamesStallSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid games stall at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const ids = new Set<string>();
  for (const o of parsed.output.offers) {
    if (ids.has(o.id)) throw new Error(`Invalid games stall: duplicate offer "${o.id}"`);
    ids.add(o.id);
  }
  return parsed.output.offers;
}

/** The shipped Prize Stall, validated at module load. */
export const gamesStall: readonly GamesStallOffer[] = loadGamesStall(stallJson);

/** A stall offer by id, or undefined. */
export function gamesStallOffer(id: string): GamesStallOffer | undefined {
  return gamesStall.find((o) => o.id === id);
}
