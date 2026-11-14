/**
 * The `apply-roster-preset` dev tool and the player list the panel picks from (staging only, with `COMBAT_V2` on; see
 * `dev-presets.ts` for what a preset holds). It **replaces** a player's creatures and gear bag with a preset, or every
 * player's ("everyone", the whole staging guild). It is the one dev tool that acts on a player other than the caller, so:
 * the id must be a player of this guild, simulated guests (`dev-guest-*`) are never targets, and the body must carry what
 * the manager typed to confirm (the player's name, or `everyone`).
 *
 * What goes: the player's creatures with everything stored by creature id (talents, placements on the raid board, explorer
 * and crafting progress, Workshop jobs, Games entries, badges and the lounge's company: every table with a `creature_id`
 * column, found from the schema), the player's line book and every item they own (worn or not). What stays: balances and
 * the ledger (append-only), parts, blueprints, the dungeon and the raid week itself. What comes: creatures made
 * by the normal creation path (`insertCreature`: the quirk, the v1 talent and the first v2 talent rolled from the line's
 * pool, learned in slot 1, no Knack, so a player picks one) at the preset's level, and items rolled by `rollItem` (their
 * lines drawn from the pools by the live gear dice), worn by nobody. All randomness is the server's own.
 */
import { fusionThreshold, ribbonsForLevel, rollItem } from '@creatures/game';
import type * as v from 'valibot';
import { DevError, creatureRngsOf, type ToolCtx } from './dev-context';
import { ROSTER_PRESETS, presetItems, presetSummary, type RosterPreset } from './dev-presets';
import type { ApplyRosterPresetBodySchema } from './dev-schemas';
import { deleteAllItems, insertItem } from './gear-store';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';

type Body = v.InferOutput<typeof ApplyRosterPresetBodySchema>;

type GuildPlayer = {
  user_id: string;
  display_name: string;
};

/** The guild's players (simulated guests left out), by name. */
function guildPlayers(sql: SqlStorage): GuildPlayer[] {
  return sql
    .exec<GuildPlayer>(
      "SELECT user_id, display_name FROM players WHERE user_id NOT LIKE 'dev-guest-%' ORDER BY display_name COLLATE NOCASE, user_id",
    )
    .toArray();
}

/** The picker's data: the guild's players with what they own, and the presets in numbers. */
export function playersView(ctx: Pick<ToolCtx, 'sql'>) {
  const counts = (table: 'creatures' | 'gear_items'): Map<string, number> =>
    new Map(
      ctx.sql
        .exec<{ user_id: string; n: number }>(
          `SELECT user_id, COUNT(*) AS n FROM ${table} GROUP BY user_id`,
        )
        .toArray()
        .map((r) => [r.user_id, r.n]),
    );
  const creatures = counts('creatures');
  const items = counts('gear_items');
  // Each player's creatures, for the pickers of the tools that act on a creature of the target player.
  const roster = new Map<string, { id: string; species: string; level: number }[]>();
  for (const r of ctx.sql
    .exec<{ id: string; user_id: string; species: string; level: number }>(
      'SELECT id, user_id, species, level FROM creatures ORDER BY level DESC, caught_at, id',
    )
    .toArray()) {
    const list = roster.get(r.user_id) ?? [];
    list.push({ id: r.id, species: r.species, level: r.level });
    roster.set(r.user_id, list);
  }
  return {
    players: guildPlayers(ctx.sql).map((p) => ({
      userId: p.user_id,
      name: p.display_name,
      creatures: creatures.get(p.user_id) ?? 0,
      items: items.get(p.user_id) ?? 0,
      roster: roster.get(p.user_id) ?? [],
    })),
    presets: Object.values(ROSTER_PRESETS).map(presetSummary),
  };
}

/** What a manager types to confirm: the same text with the same letters, trimmed (case does not matter). */
const same = (a: string, b: string): boolean =>
  a.normalize('NFKC').trim().toLowerCase() === b.normalize('NFKC').trim().toLowerCase();

export function applyRosterPreset(ctx: ToolCtx, body: Body) {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
  const preset = ROSTER_PRESETS[body.preset];
  const all = guildPlayers(ctx.sql);
  let targets: GuildPlayer[];
  if ('everyone' in body) {
    if (!same(body.confirm, 'everyone')) throw new DevError(409, 'confirm_mismatch');
    targets = all;
  } else {
    const player = all.find((p) => p.user_id === body.userId);
    if (player === undefined) throw new DevError(404, 'not_found');
    if (!same(body.confirm, player.display_name)) throw new DevError(409, 'confirm_mismatch');
    targets = [player];
  }
  let creatures = 0;
  let items = 0;
  for (const player of targets) {
    const made = replaceRoster(ctx, player.user_id, preset);
    creatures += made.creatures;
    items += made.items;
  }
  ctx.raid.invalidateReadiness();
  return { preset: preset.id, players: targets.length, creatures, items };
}

/** Takes away a player's creatures and items and gives the preset's. One player, inside the tool's transaction. */
export function replaceRoster(ctx: ToolCtx, userId: string, preset: RosterPreset) {
  const sql = ctx.sql;
  const mine = 'SELECT id FROM creatures WHERE user_id = ?';
  // Everything stored by creature id: found from the schema (a table name never comes from a request).
  const tables = sql
    .exec<{ name: string }>(
      `SELECT m.name FROM sqlite_master m
       WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
         AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'creature_id')`,
    )
    .toArray();
  for (const { name } of tables) {
    // A post is a seat the player bought (and what it stored, and an anvil's orders and floor): it is emptied, not deleted.
    const sqlText =
      name === 'valley_seats'
        ? `UPDATE valley_seats SET creature_id = NULL WHERE creature_id IN (${mine})`
        : `DELETE FROM "${name.replaceAll('"', '""')}" WHERE creature_id IN (${mine})`;
    sql.exec(sqlText, userId);
  }
  sql.exec('DELETE FROM creatures WHERE user_id = ?', userId);
  sql.exec('DELETE FROM line_talents WHERE user_id = ?', userId);
  deleteAllItems(sql, userId);

  const perLine = new Map<string, number>();
  for (const [speciesId, level] of preset.creatures) {
    const species = speciesOf(speciesId);
    const lineSlot = (perLine.get(species.line) ?? 0) + 1;
    if ((lineSlot !== 1 && lineSlot !== 2) || level > species.levelCap) {
      throw new Error(`preset ${preset.id}: ${speciesId} does not fit`);
    }
    perLine.set(species.line, lineSlot);
    const { id } = insertCreature(ctx.sql, creatureRngsOf(ctx), {
      userId,
      species: species.id,
      origin: 'dev',
      lineSlot,
      now: ctx.now,
    });
    sql.exec(
      'UPDATE creatures SET level = ?, fusion_count = 0, fusion_points = ?, exp = 0, ribbons = ? WHERE id = ?',
      level,
      fusionThreshold(0),
      ribbonsForLevel(level),
      id,
    );
  }
  const first = preset.creatures[0];
  if (first !== undefined) {
    sql.exec(
      `INSERT INTO player_progress (user_id, starter_species) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET starter_species = COALESCE(starter_species, excluded.starter_species)`,
      userId,
      first[0],
    );
  }
  const list = presetItems(preset);
  for (const item of list) {
    insertItem(sql, userId, rollItem(ctx.gearRng, item), { source: 'dev', now: ctx.now });
  }
  return { creatures: preset.creatures.length, items: list.length };
}
