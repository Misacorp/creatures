/**
 * What simulated raid players (`dev-guest-<n>`, see `dev-tools-raid.ts`) need on a combat v2 week
 * (`docs/design/combat/integration.md`, section 10): v2 talents on every creature, a Knack on every creature they place, and placing on the
 * v2 grid through the same code a player uses (`Raid.place`, so the cap of three, the column-major slots, the knocked-out rule and the
 * locks all apply). Staging only, like every dev tool.
 *
 * - **The Knack rule** is the lab's casual player: the first Knack the creature's form knows (`knownKnacks`). Nothing is saved on a
 *   creature that has fought this weekend (its Knack is locked) or that has one already.
 * - **Spares.** A guest on a v2 week owns `GUEST_CREATURES_V2` creatures: three to place and three to bring in when one is knocked out.
 */
import { RULES } from '@creatures/game';
import { knownKnacks } from '@creatures/game/combat-v2';
import { DevError, type ToolCtx } from './dev-context';
import { partyOf } from './raid-roster';
import { hasFoughtThisWeekend } from './raid-v2-core';
import { grantFirstTalent } from './talent-v2-store';

/** The creatures a guest owns on a v2 week: the team and as many spares (each can replace one that is knocked out). */
export const GUEST_CREATURES_V2 = RULES.raid.teamSize * 2;

/** The most slots tried when looking for a free one (a board is a few dozen seats at most). */
const MAX_SLOT_TRIED = 200;

/** Gives every creature of the player that has no v2 talent a fresh-catch roll (as `combat-v2-convert` does). Returns how many rolled. */
export function ensureV2Talents(ctx: ToolCtx, userId: string): number {
  const waiting = ctx.sql
    .exec<{ id: string; line: string }>(
      `SELECT c.id, c.line FROM creatures c
       WHERE c.user_id = ? AND NOT EXISTS (SELECT 1 FROM creature_talents_v2 t WHERE t.creature_id = c.id)
       ORDER BY c.caught_at, c.rowid`,
      userId,
    )
    .toArray();
  for (const creature of waiting) {
    grantFirstTalent(ctx.sql, ctx.talentRng, {
      creatureId: creature.id,
      userId,
      line: creature.line,
      now: ctx.now,
    });
  }
  return waiting.length;
}

/**
 * Saves the first Knack the creature's form knows, if it has none and has not fought this weekend. Returns whether it saved one.
 * A direct write: a guest has no session, and the rule is the dev tool's.
 */
export function saveFirstKnack(ctx: ToolCtx, creatureId: string): boolean {
  const row = ctx.sql
    .exec<{ species: string; knack: string | null }>(
      'SELECT species, knack FROM creatures WHERE id = ?',
      creatureId,
    )
    .toArray()[0];
  if (row === undefined || row.knack !== null) return false;
  const first = knownKnacks(row.species)[0];
  if (first === undefined || hasFoughtThisWeekend(ctx.sql, creatureId)) return false;
  ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', first, creatureId);
  return true;
}

/** The slots taken in the player's party this week. */
function takenSlots(ctx: ToolCtx, weekId: string, userId: string): Set<number> {
  const party = partyOf(ctx.sql, weekId, userId);
  if (party === null) return new Set();
  return new Set(
    ctx.sql
      .exec<{ slot: number }>(
        'SELECT slot FROM raid_placements WHERE week_id = ? AND party = ?',
        weekId,
        party,
      )
      .toArray()
      .map((r) => r.slot),
  );
}

/**
 * Places creatures of the player on the v2 grid through the placement code: each in the lowest free slot (a column fills row by row, so
 * a joining player takes a column), at most the boss piece's seats on the board. A creature already on the board stays. With `knack` each gets the
 * casual player's Knack first. Stops quietly at a full board or the cap; any other refusal (a locked week, a Festival week) is a 409.
 * Returns the ids it placed.
 */
export function placeCreaturesV2(
  ctx: ToolCtx,
  weekId: string,
  userId: string,
  creatureIds: readonly string[],
  options: { knack: boolean },
): string[] {
  const onBoard = new Set(
    ctx.sql
      .exec<{ creature_id: string }>(
        'SELECT creature_id FROM raid_placements WHERE week_id = ? AND user_id = ?',
        weekId,
        userId,
      )
      .toArray()
      .map((r) => r.creature_id),
  );
  const placed: string[] = [];
  for (const id of creatureIds) {
    if (onBoard.has(id)) continue;
    if (options.knack) saveFirstKnack(ctx, id);
    const taken = takenSlots(ctx, weekId, userId);
    let done = false;
    for (let slot = 0; slot < MAX_SLOT_TRIED && !done; slot++) {
      if (taken.has(slot)) continue;
      const outcome = ctx.raid.place(userId, ctx.tz, id, slot);
      if (outcome.ok) {
        placed.push(id);
        done = true;
      } else if (outcome.error === 'slot_taken') {
        continue;
      } else if (outcome.error === 'invalid_slot' || outcome.error === 'board_full') {
        return placed;
      } else {
        throw new DevError(409, outcome.error);
      }
    }
    if (!done) return placed;
  }
  return placed;
}
