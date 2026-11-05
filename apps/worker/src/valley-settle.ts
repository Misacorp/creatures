/**
 * The valley's lazy pass on the server (phase 5 step 1, docs/design/valley/systems/posts.md V-POST-14, bonfire.md V-BON-1, 3): a
 * player's valley is computed from timestamps when the player looks, in one pass, by the pure `settle` of `@creatures/game`. Nothing
 * runs on a timer and nothing here is read for any player but the caller (the caller is always the session's user).
 *
 * What a pass does, for the calling player only, in one transaction:
 * - every creature earns idle XP for the time since the last pass (V-BON-1: at the fire or at a post the rate is the same; the away
 *   steps of V-POST-10 count from the last visit), paid through the game's own `addExperience` (level, bank, cap). With the valley
 *   on the ribbon gates are open (each creature touched holds every ribbon), so only the species' level cap stops a level;
 * - the allowance builds in its store (V-POST-5). There is no collect button: the store comes home on arrival (a new visit, after
 *   `VISIT_GAP_MS` without one), and during a long visit whenever it holds a day's worth, so a client that never closes cannot lose
 *   it to the cap. It is paid to the Bait ledger (the Acorns' internal id) under a key that is unique to the pass;
 * - the player is visiting: `last_visit_at` becomes now, which restarts the away steps (V-POST-10).
 *
 * Where it runs (`guild-core.ts`): in `GET /api/state`, always; before an intent (any request that is not a read) when the last pass
 * is `INTENT_MIN_MS` old or older, since a creature that joins in between is not paid before it joined (`joinedAt`), so the short
 * skip costs nothing but a minute of a released creature's XP. Never when looking at someone else's data.
 *
 * Settling twice at the same `now` changes nothing: the second pass starts where the first stopped and has no time to pay.
 */
import {
  VALLEY_RULES,
  addExperience,
  expToReach,
  settle,
  MAX_RIBBONS,
  type SettleState,
  type ValleyView,
} from '@creatures/game';
import { credit, type LedgerStorage } from './ledger';
import { speciesOf } from './species';

/** Without a request for this long, the next one is a new visit: the "+N" starts again and the allowance store comes home. */
export const VISIT_GAP_MS = 30 * 60_000;
/**
 * A pass is skipped when the last one is younger than this (an intent skips before even reading the creatures; a state read
 * answers from what is stored): looking again within a minute would write every creature's carry for under an XP. Splitting is
 * invariant, so nothing is lost; a visit inside the minute is recorded by the next pass.
 */
export const INTENT_MIN_MS = 60_000;
/** The ledger source of the idle allowance (the same Bait as the old daily claim; that claim is off with the valley on). */
export const VALLEY_ALLOWANCE_SOURCE = 'allowance';

const HOUR_MS = 3_600_000;
/** Basis points of a multiplier of 1. */
const BP = 10_000;

type PlayerRow = {
  settled_at: number;
  last_visit_at: number;
  hearth_at_visit_bp: number;
  visit_started_at: number;
  allowance_store: number;
  allowance_carry: number;
  visit_allowance: number;
};

type CreatureRow = {
  id: string;
  species: string;
  level: number;
  exp: number;
  ribbons: number;
  caught_at: number;
  tracked: string | null;
  xp_carry: number | null;
  catchup_bp: number | null;
  visit_xp: number | null;
};

/** The store's size in Acorns (V-POST-5: `storeHours` of the hourly rate). */
export const allowanceCap = (): number =>
  Math.floor((VALLEY_RULES.acorns.allowancePerDay / 24) * VALLEY_RULES.posts.storeHours + 1e-9);

export class ValleySettle {
  constructor(private readonly deps: { storage: LedgerStorage; now: () => number }) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /**
   * Settles the player's valley up to now and returns what the Bonfire shows. `intent` passes before a request that changes
   * something: it may skip (returns null) when the last pass was a moment ago.
   */
  settle(userId: string, mode: 'state' | 'intent' = 'state'): ValleyView | null {
    const now = this.deps.now();
    const player = this.sql
      .exec<PlayerRow>(
        `SELECT settled_at, last_visit_at, hearth_at_visit_bp, visit_started_at, allowance_store,
                allowance_carry, visit_allowance FROM valley_players WHERE user_id = ?`,
        userId,
      )
      .toArray()[0];
    if (mode === 'intent' && player !== undefined && now - player.settled_at < INTENT_MIN_MS) {
      return null;
    }
    const rows = this.sql
      .exec<CreatureRow>(
        `SELECT c.id, c.species, c.level, c.exp, c.ribbons, c.caught_at, v.creature_id AS tracked,
                v.xp_carry, v.catchup_bp, v.visit_xp
         FROM creatures c LEFT JOIN valley_creatures v ON v.creature_id = c.id
         WHERE c.user_id = ? ORDER BY c.caught_at, c.rowid`,
        userId,
      )
      .toArray();
    return this.deps.storage.transactionSync(() => this.pass(userId, now, player, rows));
  }

  private pass(
    userId: string,
    now: number,
    player: PlayerRow | undefined,
    rows: readonly CreatureRow[],
  ): ValleyView {
    const cap = allowanceCap();
    if (player === undefined) {
      // The first pass of a player: the valley opens now, nothing is owed for the time before.
      this.sql.exec(
        `INSERT INTO valley_players (user_id, settled_at, last_visit_at, hearth_at_visit_bp, visit_started_at)
         VALUES (?, ?, ?, ?, ?)`,
        userId,
        now,
        now,
        BP,
        now,
      );
      for (const row of rows) this.trackCreature(userId, row.id, 0, BP, 0);
      return {
        settledAt: now,
        arrived: true,
        awayHours: 0,
        creatures: rows.map((row) => ({
          id: row.id,
          state: 'resting' as const,
          gained: 0,
          catchUpBp: BP,
        })),
        allowance: { store: 0, cap, brought: 0 },
      };
    }
    // A clock that went back (the dev clock) settles nothing; the view is what is stored.
    const to = Math.max(now, player.settled_at);
    const newVisit = to - player.last_visit_at >= VISIT_GAP_MS;
    if (to - player.settled_at < INTENT_MIN_MS && !newVisit) {
      return {
        settledAt: player.settled_at,
        arrived: false,
        awayHours: 0,
        creatures: rows.map((row) => ({
          id: row.id,
          state: 'resting' as const,
          gained: row.visit_xp ?? 0,
          catchUpBp: row.catchup_bp ?? BP,
        })),
        allowance: { store: player.allowance_store, cap, brought: player.visit_allowance },
      };
    }
    const before: SettleState = {
      settledAt: player.settled_at,
      lastVisitAt: player.last_visit_at,
      hearth: player.hearth_at_visit_bp / BP,
      creatures: rows.map((row) => ({
        xp: 0,
        carry: row.xp_carry ?? 0,
        capXp: Number.POSITIVE_INFINITY,
        catchUp: (row.catchup_bp ?? BP) / BP,
        ...(row.tracked === null ? { joinedAt: row.caught_at } : {}),
      })),
      allowance: { store: player.allowance_store, carry: player.allowance_carry },
    };
    const after = settle(before, player.settled_at, to, [
      { at: to, kind: 'visit', hearth: player.hearth_at_visit_bp / BP },
    ]);

    let visitAllowance = newVisit ? 0 : player.visit_allowance;
    let store = after.allowance?.store ?? 0;
    const carry = after.allowance?.carry ?? 0;
    if (newVisit || store >= VALLEY_RULES.acorns.allowancePerDay) {
      if (store > 0) {
        const applied = credit(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: store,
            source: VALLEY_ALLOWANCE_SOURCE,
            idempotencyKey: `valley-allowance:${String(to)}`,
            meta: { arrival: newVisit },
          },
          now,
        ).applied;
        if (applied) {
          visitAllowance += store;
          store = 0;
        }
      }
    }

    const creatures = rows.map((row, i) => {
      const paid = after.creatures[i];
      const whole = paid?.xp ?? 0;
      const gainedNow = this.payXp(row, whole);
      const visitXp = (newVisit ? 0 : (row.visit_xp ?? 0)) + gainedNow;
      const catchUpBp = row.catchup_bp ?? BP;
      const changed =
        row.tracked === null || whole > 0 || newVisit || (paid?.carry ?? 0) !== (row.xp_carry ?? 0);
      if (changed) this.trackCreature(userId, row.id, paid?.carry ?? 0, catchUpBp, visitXp);
      return { id: row.id, state: 'resting' as const, gained: visitXp, catchUpBp };
    });

    if (newVisit) {
      // Creatures that left the roster (released, fused) leave their rows too; once a visit is enough.
      this.sql.exec(
        `DELETE FROM valley_creatures WHERE user_id = ? AND creature_id NOT IN
           (SELECT id FROM creatures WHERE user_id = ?)`,
        userId,
        userId,
      );
    }
    this.sql.exec(
      `UPDATE valley_players SET settled_at = ?, last_visit_at = ?, visit_started_at = ?, allowance_store = ?,
         allowance_carry = ?, visit_allowance = ? WHERE user_id = ?`,
      to,
      to,
      newVisit ? to : player.visit_started_at,
      store,
      carry,
      visitAllowance,
      userId,
    );
    return {
      settledAt: to,
      arrived: newVisit,
      awayHours: newVisit ? Math.floor((to - player.last_visit_at) / HOUR_MS) : 0,
      creatures,
      allowance: { store, cap, brought: visitAllowance },
    };
  }

  /**
   * Pays `whole` XP through the game's level rules with the ribbon gates open. Returns the XP the creature really took: less than
   * `whole` at the top level, or while it waits at its species' cap with the next level's XP already banked (before evolving), so
   * the fire's "+N" never shows XP that went nowhere.
   */
  private payXp(row: CreatureRow, whole: number): number {
    if (whole === 0 && row.ribbons >= MAX_RIBBONS) return 0;
    const species = speciesOf(row.species);
    const gain = addExperience(
      { level: row.level, exp: row.exp, ribbons: MAX_RIBBONS, levelCap: species.levelCap },
      whole,
    );
    this.sql.exec(
      'UPDATE creatures SET level = ?, exp = ?, ribbons = ? WHERE id = ?',
      gain.level,
      gain.exp,
      gain.ribbons,
      row.id,
    );
    // Never below 0, even on a row holding more than its level's need (bad data the clamp would shrink).
    return Math.max(0, expToReach(gain.level) + gain.exp - (expToReach(row.level) + row.exp));
  }

  private trackCreature(
    userId: string,
    creatureId: string,
    carry: number,
    catchUpBp: number,
    visitXp: number,
  ): void {
    this.sql.exec(
      `INSERT INTO valley_creatures (creature_id, user_id, catchup_bp, xp_carry, visit_xp)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(creature_id) DO UPDATE SET xp_carry = excluded.xp_carry, visit_xp = excluded.visit_xp,
         catchup_bp = excluded.catchup_bp`,
      creatureId,
      userId,
      catchUpBp,
      carry,
      visitXp,
    );
  }
}
