/**
 * The Festival creature: a player who takes part in a won Festival finale gets the week's Festival
 * species (`raid_weeks.festival_species`, chosen by the season index). The grant follows the usual
 * collection rules (`festivalGrantOutcome`): a new level-1 creature with its first talent, or, for a
 * player who owns the line already, a pending duplicate card with the talent it rolled (Teach, Fuse,
 * Release or Keep, see `catch-choices.ts`). It is never shiny and never turns into Bait.
 *
 * Idempotent per (week, user): `raid_festival_grants` has that primary key. Call it inside the
 * transaction that settles the finale.
 */
import { content, festivalGrantOutcome, type Rng } from '@creatures/game';
import type { Analytics } from './analytics';
import { CatchChoices } from './catch-choices';
import type { LedgerStorage } from './ledger';
import { recordServerFirst } from './server-firsts';
import { insertCreature } from './talent-store';
import { talentViewOf, type TalentView } from './talent-view';

/** What a Festival grant did, as shown to the player who got it. */
export interface FestivalGrantView {
  species: string;
  /**
   * `new`: now a creature. `duplicate`: a pending card (see `pendingId`). `fused` and `converted` only
   * appear in grants stored before the duplicate choice.
   */
  outcome: 'new' | 'duplicate' | 'fused' | 'converted';
  /** The talent it rolled (absent in grants stored before talents). */
  talent?: TalentView;
  /** Only for 'duplicate': the id of the pending card, while it waits. */
  pendingId?: string;
  /** Only for the old 'fused': the creature's fusion count after the grant. */
  fusionCount?: number;
  /** Only for the old 'converted': the Bait granted. */
  bait?: number;
  firstOnServer: boolean;
}

/** The randomness a Festival grant draws from (live, crypto in production). */
export interface FestivalRngs {
  quirk: Rng;
  talent: Rng;
}

/**
 * Grants the Festival creature of `weekId` to `userId`, once. Returns what happened, or null if the
 * species is unknown (it never is for stored weeks) or the player already got their grant (the
 * stored grant is then returned by `readFestivalGrant`).
 */
export function grantFestivalCreature(
  storage: LedgerStorage,
  rngs: FestivalRngs,
  weekId: string,
  userId: string,
  speciesId: string,
  now: number,
  analytics?: Analytics,
): FestivalGrantView | null {
  const sql = storage.sql;
  const species = content.creatures.find((c) => c.id === speciesId && c.festival === true);
  if (species === undefined) return null;
  const already = sql
    .exec('SELECT 1 FROM raid_festival_grants WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray();
  if (already.length > 0) return null;

  const owned = sql
    .exec<{
      id: string;
      fusion_count: number;
      shiny: number;
    }>(
      'SELECT id, fusion_count, shiny FROM creatures WHERE user_id = ? AND line = ? ORDER BY line_slot',
      userId,
      species.line,
    )
    .toArray();
  const existing = owned[0];
  const outcome = festivalGrantOutcome(
    existing === undefined
      ? undefined
      : { fusionCount: existing.fusion_count, shiny: owned.some((c) => c.shiny === 1) },
    species,
  );
  // Everyone who gets it in the same Festival shares the record, like a catch drop.
  const firstOnServer = recordServerFirst(
    sql,
    'festival',
    species.id,
    userId,
    `festival:${weekId}`,
    now,
  );
  const wearer = { role: species.role, element: species.element };

  let view: FestivalGrantView;
  switch (outcome.kind) {
    case 'new': {
      // Drawn now from live randomness: the quirk (cosmetic) and the first talent.
      const made = insertCreature(
        sql,
        { quirk: rngs.quirk, talent: rngs.talent },
        { userId, species: species.id, origin: 'festival', now },
        analytics,
      );
      const talent = talentViewOf(made.talent, wearer);
      view = {
        species: species.id,
        outcome: 'new',
        ...(talent === null ? {} : { talent }),
        firstOnServer,
      };
      break;
    }
    case 'duplicate': {
      const choices = new CatchChoices({
        storage,
        now: () => now,
        rngs: { talent: rngs.talent, quirk: rngs.quirk },
        analytics,
      });
      const pending = choices.addPending(
        userId,
        { species: species.id, shiny: false },
        { kind: 'festival', id: weekId },
      );
      const talent = talentViewOf(pending.talent, wearer);
      view = {
        species: species.id,
        outcome: 'duplicate',
        pendingId: pending.id,
        ...(talent === null ? {} : { talent }),
        firstOnServer,
      };
      break;
    }
  }
  sql.exec(
    `INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, fusion_count, bait, first_on_server, created_at, talent_json)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    weekId,
    userId,
    species.id,
    view.outcome,
    firstOnServer ? 1 : 0,
    now,
    JSON.stringify({ talent: view.talent ?? null, pendingId: view.pendingId ?? null }),
  );
  // Guild-level: the grant is logged by species and result, with no player.
  analytics?.record({ kind: 'festival_grant', species: species.id, result: view.outcome });
  return view;
}

/** The player's stored Festival grant for a week, or null if they got none. */
export function readFestivalGrant(
  sql: SqlStorage,
  weekId: string,
  userId: string,
): FestivalGrantView | null {
  const row = sql
    .exec<{
      species: string;
      outcome: 'new' | 'duplicate' | 'fused' | 'converted';
      fusion_count: number | null;
      bait: number | null;
      first_on_server: number;
      talent_json: string | null;
    }>(
      `SELECT species, outcome, fusion_count, bait, first_on_server, talent_json FROM raid_festival_grants
       WHERE week_id = ? AND user_id = ?`,
      weekId,
      userId,
    )
    .toArray()[0];
  if (row === undefined) return null;
  let stored: { talent?: TalentView | null; pendingId?: string | null } = {};
  if (row.talent_json !== null) {
    try {
      stored = JSON.parse(row.talent_json) as typeof stored;
    } catch {
      stored = {};
    }
  }
  return {
    species: row.species,
    outcome: row.outcome,
    ...(stored.talent === null || stored.talent === undefined ? {} : { talent: stored.talent }),
    ...(row.outcome === 'duplicate' && typeof stored.pendingId === 'string'
      ? { pendingId: stored.pendingId }
      : {}),
    ...(row.outcome === 'fused' && row.fusion_count !== null
      ? { fusionCount: row.fusion_count }
      : {}),
    ...(row.outcome === 'converted' && row.bait !== null ? { bait: row.bait } : {}),
    firstOnServer: row.first_on_server === 1,
  };
}

/** Display names of everyone who got a Festival grant in a week and party (Discord post). */
export function festivalWinners(
  sql: SqlStorage,
  weekId: string,
  memberIds: readonly string[],
): string[] {
  const got = new Set(
    sql
      .exec<{ user_id: string }>(
        'SELECT user_id FROM raid_festival_grants WHERE week_id = ?',
        weekId,
      )
      .toArray()
      .map((r) => r.user_id),
  );
  return memberIds.filter((id) => got.has(id));
}
