/**
 * The simulated raid players of the dev tools (`dev-guest-<n>`): the guests the raid test bench fills the board with
 * (`dev-tools-raid-bench.ts`) and the Valley Games' bots (`dev-tools-games.ts`) are the same players. Staging only.
 */
import { RULES, content, int, ribbonsForLevel } from '@creatures/game';
import { creatureRngsOf, type ToolCtx } from './dev-context';
import { autoTeam, loadCreatures } from './raid-teams';
import { insertCreature } from './talent-store';

/** Simulated players have ids that are not Discord snowflakes, so they can never be a real user. */
export const GUEST_PREFIX = 'dev-guest-';
export const guestId = (n: number): string => `${GUEST_PREFIX}${String(n)}`;

/** The number of the caller's team creatures' average level, or 5 for a player with no creature. */
export function referenceLevel(ctx: ToolCtx): number {
  const team = autoTeam(loadCreatures(ctx.sql, ctx.userId));
  if (team.length === 0) return 5;
  return Math.max(1, Math.floor(team.reduce((total, c) => total + c.level, 0) / team.length));
}

/**
 * Creates one simulated player: a player row and `creatures` creatures (default three) of different lines
 * near `level`. A guest that already exists keeps its creatures and gets more of lines it lacks, up to
 * `creatures` (the Games' bots need more than a raid team).
 */
export function createGuest(
  ctx: ToolCtx,
  n: number,
  level: number,
  creatures: number = RULES.raid.teamSize,
): void {
  const id = guestId(n);
  ctx.sql.exec(
    `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    id,
    `Guest ${String(n)}`,
    ctx.now,
    ctx.now,
  );
  // Shuffle the species with the live RNG (Fisher-Yates), then take the first of distinct lines.
  const pool = content.creatures.filter((c) => c.festival !== true);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = int(ctx.rng, i + 1);
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) continue;
    pool[i] = b;
    pool[j] = a;
  }
  const owned = ctx.sql
    .exec<{ line: string }>('SELECT line FROM creatures WHERE user_id = ?', id)
    .toArray();
  const lines = new Set(owned.map((r) => r.line));
  let have = owned.length;
  for (const species of pool) {
    if (have >= creatures) break;
    if (lines.has(species.line)) continue;
    have += 1;
    lines.add(species.line);
    const spread = int(ctx.rng, 5) - 2;
    const made = insertCreature(ctx.sql, creatureRngsOf(ctx), {
      userId: id,
      species: species.id,
      origin: 'dev',
      now: ctx.now,
    });
    const guestLevel = Math.min(species.levelCap, Math.max(1, level + spread));
    ctx.sql.exec(
      'UPDATE creatures SET level = ?, ribbons = ? WHERE id = ?',
      guestLevel,
      ribbonsForLevel(guestLevel),
      made.id,
    );
  }
}

/** The simulated players of the guild, by number. */
export function existingGuests(ctx: ToolCtx): number[] {
  return ctx.sql
    .exec<{ user_id: string }>(
      'SELECT user_id FROM players WHERE user_id LIKE ?',
      `${GUEST_PREFIX}%`,
    )
    .toArray()
    .map((r) => Number(r.user_id.slice(GUEST_PREFIX.length)))
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
}
