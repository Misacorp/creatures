/**
 * The Festival creature: a player who takes part in a won Festival finale gets the week's Festival
 * species (`raid_weeks.festival_species`, chosen by the season index). The grant follows the usual
 * collection rules (`festivalGrantOutcome`): a new level-1 creature, or, for a player who owns the
 * line already, a fusion (up to 5) and then Bait by rarity through the ledger. It is never shiny.
 *
 * Idempotent per (week, user): `raid_festival_grants` has that primary key, and the Bait credit has
 * an idempotency key as well. Call it inside the transaction that settles the finale.
 */
import { content, festivalGrantOutcome, pickQuirk, type Rng } from '@creatures/game';
import { credit, type LedgerStorage } from './ledger';
import { recordServerFirst } from './server-firsts';

/** What a Festival grant did, as shown to the player who got it. */
export interface FestivalGrantView {
  species: string;
  outcome: 'new' | 'fused' | 'converted';
  /** Only for 'fused': the creature's fusion count after the grant. */
  fusionCount?: number;
  /** Only for 'converted': the Bait granted. */
  bait?: number;
  firstOnServer: boolean;
}

/**
 * Grants the Festival creature of `weekId` to `userId`, once. Returns what happened, or null if the
 * species is unknown (it never is for stored weeks) or the player already got their grant (the
 * stored grant is then returned by `readFestivalGrant`).
 */
export function grantFestivalCreature(
  storage: LedgerStorage,
  quirkRng: Rng,
  weekId: string,
  userId: string,
  speciesId: string,
  now: number,
): FestivalGrantView | null {
  const sql = storage.sql;
  const species = content.creatures.find((c) => c.id === speciesId && c.festival === true);
  if (species === undefined) return null;
  const already = sql
    .exec('SELECT 1 FROM raid_festival_grants WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray();
  if (already.length > 0) return null;

  const existing = sql
    .exec<{
      id: string;
      fusion_count: number;
      shiny: number;
    }>(
      'SELECT id, fusion_count, shiny FROM creatures WHERE user_id = ? AND line = ?',
      userId,
      species.line,
    )
    .toArray()[0];
  const outcome = festivalGrantOutcome(
    existing === undefined
      ? undefined
      : { fusionCount: existing.fusion_count, shiny: existing.shiny === 1 },
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

  let view: FestivalGrantView;
  let fusionCount: number | null = null;
  let bait: number | null = null;
  switch (outcome.kind) {
    case 'new':
      sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, shiny, origin, caught_at, quirk_id)
         VALUES (?, ?, ?, ?, 1, 0, 'festival', ?, ?)`,
        crypto.randomUUID(),
        userId,
        species.line,
        species.id,
        now,
        // Drawn now from live randomness; cosmetic only.
        pickQuirk(species.id, quirkRng),
      );
      view = { species: species.id, outcome: 'new', firstOnServer };
      break;
    case 'fused':
      if (existing === undefined) throw new Error('fusion without a creature');
      sql.exec(
        'UPDATE creatures SET fusion_count = ? WHERE id = ?',
        outcome.newFusionCount,
        existing.id,
      );
      fusionCount = outcome.newFusionCount;
      view = { species: species.id, outcome: 'fused', fusionCount, firstOnServer };
      break;
    case 'converted':
      bait = outcome.bait;
      credit(
        storage,
        {
          userId,
          currency: 'bait',
          amount: outcome.bait,
          source: 'festival',
          idempotencyKey: `festival:${weekId}`,
          meta: { week: weekId, species: species.id },
        },
        now,
      );
      view = { species: species.id, outcome: 'converted', bait, firstOnServer };
      break;
  }
  sql.exec(
    `INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, fusion_count, bait, first_on_server, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    weekId,
    userId,
    species.id,
    view.outcome,
    fusionCount,
    bait,
    firstOnServer ? 1 : 0,
    now,
  );
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
      outcome: 'new' | 'fused' | 'converted';
      fusion_count: number | null;
      bait: number | null;
      first_on_server: number;
    }>(
      `SELECT species, outcome, fusion_count, bait, first_on_server FROM raid_festival_grants
       WHERE week_id = ? AND user_id = ?`,
      weekId,
      userId,
    )
    .toArray()[0];
  if (row === undefined) return null;
  return {
    species: row.species,
    outcome: row.outcome,
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
