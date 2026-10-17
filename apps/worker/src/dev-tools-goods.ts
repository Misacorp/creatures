/**
 * Dev tools for what a player owns: Bait and Essence, parts, supplies, blueprints, creatures, explorer
 * ranks, familiarity, Crafting XP, gear and the Workshop. Staging only (see `dev-tools.ts`). Each
 * function runs inside the tool's one transaction and acts on `ctx.userId` only.
 *
 * The tools write the tables directly: they set a state for testing, they do not play the game, so the
 * game's own idempotency keys and checks are not in the way. What a rule forbids outright (a level above
 * a species' cap, a rarity a base cannot have, a full bag) is still refused.
 */
import {
  baseMinLevel,
  blueprintBases,
  RULES,
  allSpecies,
  destinationDef,
  familiarityStars,
  gearBase,
  gearContent,
  int,
  ribbonsForLevel,
  rollItem,
  skillLevel,
  type GearRarity,
  type PartsBundle,
} from '@creatures/game';
import type * as v from 'valibot';
import { DevError, ownCreature, type ToolCtx } from './dev-context';
import type {
  GrantBlueprintsBodySchema,
  GrantCreatureBodySchema,
  GrantGearBodySchema,
  GrantPartsBodySchema,
  GrantSuppliesBodySchema,
  SetBalancesBodySchema,
  SetCraftingXpBodySchema,
  SetCreatureBodySchema,
  SetExplorerBodySchema,
  SetFamiliarityBodySchema,
} from './dev-schemas';
import { addSupply, explorerOf, familiarityOf, saveFamiliarity } from './expedition-store';
import {
  countItems,
  countPendingCrafts,
  creditParts,
  getParts,
  hasRoom,
  insertItem,
  knownBlueprints,
  learnBlueprint,
} from './gear-store';
import { credit, getBalance, getBalances, type Currency } from './ledger';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

// --- Currencies ---

/** Sets Bait and/or Essence to an exact amount, through the ledger (source `dev`) so history stays honest. */
export function setBalances(ctx: ToolCtx, body: Body<typeof SetBalancesBodySchema>) {
  for (const currency of ['bait', 'essence'] as const satisfies readonly Currency[]) {
    const target = body[currency];
    if (target === undefined) continue;
    const delta = target - getBalance(ctx.sql, ctx.userId, currency);
    if (delta === 0) continue;
    const key = `dev:${crypto.randomUUID()}`;
    if (delta > 0) {
      credit(
        ctx.storage,
        { userId: ctx.userId, currency, amount: delta, source: 'dev', idempotencyKey: key },
        ctx.now,
      );
    } else {
      ctx.sql.exec(
        `INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at)
         VALUES (?, ?, ?, 'dev', ?, ?)`,
        ctx.userId,
        currency,
        delta,
        key,
        ctx.now,
      );
      ctx.sql.exec(
        'UPDATE balances SET amount = amount + ? WHERE user_id = ? AND currency = ?',
        delta,
        ctx.userId,
        currency,
      );
    }
  }
  return { balances: getBalances(ctx.sql, ctx.userId) };
}

export function grantParts(ctx: ToolCtx, body: Body<typeof GrantPartsBodySchema>) {
  const bundle: PartsBundle = {};
  for (const [kind, amount] of Object.entries(body) as [keyof PartsBundle, number | undefined][]) {
    if (amount !== undefined) bundle[kind] = amount;
  }
  creditParts(ctx.sql, ctx.userId, bundle);
  return { parts: getParts(ctx.sql, ctx.userId) };
}

export function grantSupplies(ctx: ToolCtx, body: Body<typeof GrantSuppliesBodySchema>) {
  addSupply(ctx.sql, ctx.userId, body.supply, body.amount);
  return { supply: body.supply, added: body.amount };
}

export function grantBlueprints(ctx: ToolCtx, body: Body<typeof GrantBlueprintsBodySchema>) {
  const bases =
    'all' in body ? blueprintBases() : blueprintBases().filter((b) => b.id === body.baseId);
  let learned = 0;
  for (const base of bases) {
    if (learnBlueprint(ctx.sql, ctx.userId, base.id, ctx.now)) learned++;
  }
  return { learned, known: knownBlueprints(ctx.sql, ctx.userId).length };
}

// --- Creatures ---

/**
 * Gives the caller a creature of a species. A player has one creature per line: if they have the line
 * already, that creature becomes this species (and takes the level, fusions and shine that were asked
 * for). With no starter chosen yet, the first creature also counts as the starter, so the picker goes.
 */
export function grantCreature(ctx: ToolCtx, body: Body<typeof GrantCreatureBodySchema>) {
  const species = speciesOf(body.species);
  if (body.level !== undefined && body.level > species.levelCap) {
    throw new DevError(400, 'level_cap');
  }
  const existing = ctx.sql
    .exec<{ id: string }>(
      'SELECT id FROM creatures WHERE user_id = ? AND line = ?',
      ctx.userId,
      species.line,
    )
    .toArray()[0];
  let creatureId: string;
  if (existing === undefined) {
    creatureId = insertCreature(
      ctx.sql,
      { quirk: ctx.quirkRng, talent: ctx.talentRng },
      {
        userId: ctx.userId,
        species: species.id,
        origin: 'dev',
        shiny: body.shiny === true,
        now: ctx.now,
      },
    ).id;
    ctx.sql.exec(
      'UPDATE creatures SET level = ?, fusion_count = ?, exp = 0, ribbons = ? WHERE id = ?',
      body.level ?? 1,
      body.fusion ?? 0,
      ribbonsForLevel(body.level ?? 1),
      creatureId,
    );
  } else {
    creatureId = existing.id;
    ctx.sql.exec(
      `UPDATE creatures SET species = ?,
         level = COALESCE(?, level), fusion_count = COALESCE(?, fusion_count), shiny = COALESCE(?, shiny)
       WHERE id = ?`,
      species.id,
      body.level ?? null,
      body.fusion ?? null,
      body.shiny === undefined ? null : body.shiny ? 1 : 0,
      creatureId,
    );
  }
  ctx.sql.exec(
    `INSERT INTO player_progress (user_id, starter_species) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET starter_species = COALESCE(starter_species, excluded.starter_species)`,
    ctx.userId,
    species.id,
  );
  return { creatureId, created: existing === undefined };
}

/** Sets a creature's level and fusions, or evolves it (the same line only). Levels stay within the cap. */
export function setCreature(ctx: ToolCtx, body: Body<typeof SetCreatureBodySchema>) {
  const row = ownCreature(ctx, body.creatureId);
  const target = speciesOf(body.species ?? row.species);
  if (target.line !== row.line) throw new DevError(400, 'wrong_line');
  const level = body.level ?? row.level;
  if (level > target.levelCap) throw new DevError(400, 'level_cap');
  // A level set by hand comes with the ribbons the level is past, and no banked experience.
  ctx.sql.exec(
    'UPDATE creatures SET species = ?, level = ?, fusion_count = ?, exp = 0, ribbons = ? WHERE id = ?',
    target.id,
    level,
    body.fusion ?? row.fusion_count,
    ribbonsForLevel(level),
    row.id,
  );
  return { creatureId: row.id, species: target.id, level, fusion: body.fusion ?? row.fusion_count };
}

export function setExplorer(ctx: ToolCtx, body: Body<typeof SetExplorerBodySchema>) {
  const row = ownCreature(ctx, body.creatureId);
  const current = explorerOf(ctx.sql, ctx.userId, row.id);
  const xp =
    body.rank === undefined
      ? (body.xp ?? current.xp)
      : (RULES.expeditions.rank.xpForRank[body.rank - 1] ?? 0);
  const trips = body.trips ?? current.trips;
  writeExplorer(ctx, row.id, xp, trips);
  return { creatureId: row.id, xp, trips };
}

/** Writes a creature's explorer XP and finished trips (both exact). */
export function writeExplorer(ctx: ToolCtx, creatureId: string, xp: number, trips: number): void {
  ctx.sql.exec(
    `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp, trips = excluded.trips`,
    ctx.userId,
    creatureId,
    xp,
    trips,
  );
}

export function setFamiliarity(ctx: ToolCtx, body: Body<typeof SetFamiliarityBodySchema>) {
  const row = ownCreature(ctx, body.creatureId);
  const dest = destinationDef(body.destination);
  if (dest === undefined) throw new DevError(400, 'invalid_destination');
  const record = familiarityOf(ctx.sql, ctx.userId, row.id, dest.id);
  const next = {
    trips: body.trips ?? record.trips,
    found: body.foundAll === undefined ? record.found : body.foundAll ? allSpecies(dest) : [],
    shiny: body.shiny ?? record.shiny,
  };
  saveFamiliarity(ctx.sql, ctx.userId, row.id, dest.id, next);
  return {
    creatureId: row.id,
    destination: dest.id,
    trips: next.trips,
    stars: familiarityStars(dest, next),
  };
}

export function setCraftingXp(ctx: ToolCtx, body: Body<typeof SetCraftingXpBodySchema>) {
  const row = ownCreature(ctx, body.creatureId);
  ctx.sql.exec(
    `INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, ?)
     ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
    ctx.userId,
    row.id,
    body.xp,
  );
  return { creatureId: row.id, xp: body.xp, level: skillLevel(body.xp) };
}

// --- The Workshop and the bag ---

/** Makes every open job of the caller ready to claim now. */
export function finishJobs(ctx: ToolCtx) {
  const done = ctx.sql
    .exec(
      `UPDATE workshop_jobs SET ends_at = ?
       WHERE user_id = ? AND claimed_at IS NULL AND ends_at > ? RETURNING id`,
      ctx.now,
      ctx.userId,
      ctx.now,
    )
    .toArray();
  return { finished: done.length };
}

/** Gives the caller one item (its lines drawn now from live randomness). Refused when the bag is full. */
export function grantGear(ctx: ToolCtx, body: Body<typeof GrantGearBodySchema>) {
  const base = gearBase(body.baseId);
  if (base === undefined) throw new DevError(400, 'invalid_base');
  if (!hasRoom(ctx.sql, ctx.userId)) throw new DevError(409, 'bag_full');
  // A better base only exists from its item level; the default is the lowest level it can have.
  const itemLevel = body.itemLevel ?? baseMinLevel(base);
  if (itemLevel < baseMinLevel(base)) throw new DevError(400, 'item_level_too_low');
  const item = rollItem(ctx.gearRng, { baseId: base.id, rarity: body.rarity, itemLevel });
  const gearId = insertItem(ctx.sql, ctx.userId, item, { source: 'dev', now: ctx.now });
  return { gearId };
}

const NORMAL_RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];

/** Adds random items until the bag (items plus crafts still to claim) is at its cap. */
export function fillBag(ctx: ToolCtx) {
  const cap = RULES.gear.inventoryCap;
  let added = 0;
  while (countItems(ctx.sql, ctx.userId) + countPendingCrafts(ctx.sql, ctx.userId) < cap) {
    const bases = gearContent.bases;
    const base = bases[int(ctx.gearRng, bases.length)];
    if (base === undefined) break;
    const rarity: GearRarity =
      NORMAL_RARITIES[int(ctx.gearRng, NORMAL_RARITIES.length)] ?? 'common';
    const item = rollItem(ctx.gearRng, {
      baseId: base.id,
      rarity,
      itemLevel: Math.max(baseMinLevel(base), 1 + int(ctx.gearRng, RULES.gear.maxItemLevel)),
    });
    insertItem(ctx.sql, ctx.userId, item, { source: 'dev', now: ctx.now });
    added++;
  }
  return { added, items: countItems(ctx.sql, ctx.userId), cap };
}
