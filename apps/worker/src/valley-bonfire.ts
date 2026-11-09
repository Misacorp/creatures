/**
 * The bonfire's server side beyond the lazy pass (phase 5 step 5, docs/design/valley/systems/bonfire.md V-BON-2, V-BON-4, V-BON-9 and
 * posts.md V-POST-7). Four small jobs, each priced (`docs/design/database-reads.md`):
 *
 * - **The server's middle** (V-BON-2): once a game day the guild's `maintain` writes the median of the active players' top-three levels
 *   to the one row of `valley_server` (`writeMiddle`: one read of the players who visited in the last seven days, each one's creatures
 *   through the `creatures_user` index, one write). A pass reads that one row (`middle`) when it fixes a visit's catch-up.
 * - **Who is online** (V-BON-4, `online`): the lounge's tracked Activity instances (`lounge_instances`, at most ten rows, kept by the
 *   lounge check and by sessions starting) say who is in the Activity now. For each (at most `MAX_ONLINE`, never the caller) their name
 *   and up to three of their creatures that are not posted, oldest caught first (the `creatures_user` index order, so no sort).
 *   No XP and no boost for company. It stands on a real-clock freshness check, since the instance rows are refreshed by real time.
 * - **A raider's post pauses** (V-POST-7, `raidWindows`): a creature placed in the week's raid is away from the first stage's lock to
 *   the end of the finale. Read only when the span a pass settles reaches a raid's span by the calendar (no read otherwise), and then
 *   the player's own placements through `raid_placements_user`, the week's row and the finale's done marker: a handful of rows.
 * - **The small moments' draw** (V-BON-9, `momentDay` and `pickMoments`): who featured last is a column of `valley_creatures`.
 */
import {
  MAX_ONLINE,
  RULES,
  VALLEY_RULES,
  activeWeightOf,
  maskDays,
  momentWeight,
  pickByWeight,
  serverMiddleOf,
  shiftMask,
  topThreeMean,
  type AwayWindow,
  type ValleyOnline,
} from '@creatures/game';
import type { LedgerStorage } from './ledger';
import { MAX_TRACKED_INSTANCES, playerNames, trackedInstances } from './lounge';
import { addWeeks, eventTimes, weekIdFor, type RaidRules } from './raid-schedule';
import { gameDay } from './time';

const DAY_MS = 86_400_000;
/** A player who has not visited for this long is not counted in the server's middle (the lab's rule). */
export const ACTIVE_DAYS = 7;
/** The most players the daily middle reads (a guild has 5 to 15; the cap guards a runaway table). */
const MAX_ACTIVE = 50;
/** An instance the lounge has not looked at for this long (real time) is no longer taken as "online": five checks. */
export const ONLINE_FRESH_MS = 5 * 60_000;
/** A finale that left no done marker ends this long after its time (it is live for far less). */
const FINALE_GRACE_MS = 24 * 3_600_000;
/** The most past weeks a pass looks back for raid windows (a longer absence loses nothing that matters at the away share). */
const WEEKS_BACK = 4;

export interface ValleyBonfireDeps {
  readonly storage: LedgerStorage;
  /** The game clock (the dev clock moves it). */
  readonly now: () => number;
  /** The real clock: the lounge's instance rows are refreshed by it. */
  readonly realNow: () => number;
  readonly timezone: () => string;
}

/** A raid week's window as the calendar sets it, and the raid rules it follows. */
interface RaidSpan {
  readonly weekId: string;
  readonly from: number;
  readonly to: number;
}

export class ValleyBonfire {
  constructor(private readonly deps: ValleyBonfireDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The server's middle from the last daily write (0: none yet, so the player's own 3rd best decides). */
  middle(): number {
    const row = this.sql
      .exec<{ middle: number }>('SELECT middle FROM valley_server WHERE id = 1')
      .toArray()[0];
    return row?.middle ?? 0;
  }

  /**
   * Writes the server's middle (V-BON-2): the median of the top-three means of the players who visited in the last `ACTIVE_DAYS`,
   * and in the same row the server's active weight (V-COM-5: each of those players counted by how many of the last seven days they
   * visited, a weekly player about 0.4), which sizes the commons' next projects. The weight comes from columns of the same rows, so it
   * costs no read of its own and no row of its own (V-COM-8). Called once a game day by `maintain`; a day with no active player
   * leaves the last values standing.
   */
  writeMiddle(now: number): { middle: number; players: number; weight: number } {
    const day = gameDay(now, this.deps.timezone(), RULES.daily.reset);
    const today = Math.floor(now / DAY_MS);
    const active = this.sql
      .exec<{ user_id: string; visit_mask: number; mask_day: number; joined_day: number }>(
        `SELECT user_id, visit_mask, mask_day, joined_day FROM valley_players WHERE last_visit_at >= ? LIMIT ?`,
        now - ACTIVE_DAYS * DAY_MS,
        MAX_ACTIVE,
      )
      .toArray();
    const weight = active.reduce(
      (sum, p) =>
        sum +
        activeWeightOf(
          VALLEY_RULES,
          maskDays(shiftMask(p.visit_mask, p.mask_day, today)),
          today - p.joined_day,
        ),
      0,
    );
    const means = active.map((player) =>
      topThreeMean(
        this.sql
          .exec<{ level: number }>('SELECT level FROM creatures WHERE user_id = ?', player.user_id)
          .toArray()
          .map((row) => row.level),
      ),
    );
    if (means.length === 0) return { middle: this.middle(), players: 0, weight: 0 };
    const middle = serverMiddleOf(means);
    this.sql.exec(
      `INSERT INTO valley_server (id, middle, day, players, weight) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET middle = excluded.middle, day = excluded.day, players = excluded.players,
         weight = excluded.weight`,
      middle,
      day,
      means.length,
      weight,
    );
    return { middle, players: means.length, weight };
  }

  /**
   * The players in the Activity now besides `userId`, each with up to three of their creatures that stand by the fire (V-BON-4). Empty
   * when alone, and when the lounge has not looked lately.
   */
  online(userId: string): ValleyOnline[] {
    const fresh = this.deps.realNow() - ONLINE_FRESH_MS;
    const ids: string[] = [];
    for (const instance of trackedInstances(this.sql).slice(0, MAX_TRACKED_INSTANCES)) {
      if (instance.checkedAt < fresh) continue;
      for (const id of instance.users) if (id !== userId && !ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) return [];
    const names = playerNames(this.sql, ids.slice(0, MAX_ONLINE * 2));
    const out: ValleyOnline[] = [];
    for (const id of ids) {
      const name = names.get(id);
      if (name === undefined || name === '') continue;
      const creatures = this.sql
        .exec<{
          id: string;
          species: string;
          level: number;
          shiny: number;
          nickname: string | null;
        }>(
          `SELECT c.id, c.species, c.level, c.shiny, c.nickname FROM creatures c
           WHERE c.user_id = ? AND NOT EXISTS (SELECT 1 FROM valley_seats s WHERE s.creature_id = c.id)
           ORDER BY c.caught_at LIMIT 3`,
          id,
        )
        .toArray()
        .map((c) => ({
          id: c.id,
          species: c.species,
          shiny: c.shiny === 1,
          level: c.level,
          name: c.nickname === null || c.nickname === '' ? null : c.nickname.slice(0, 40),
        }));
      out.push({ name: name.slice(0, 40), creatures });
      if (out.length >= MAX_ONLINE) break;
    }
    return out;
  }

  /**
   * Who a small moment is about (V-BON-9): one resting creature picked by weight (the longer since it featured, the likelier), and
   * with a roll under a half a second one beside it. `rolls` are uniform [0, 1) from live randomness (the caller draws them). Returns
   * indexes into `weights`' creatures, and a turn the client reads its line from.
   */
  static pickMoments(
    day: number,
    lastDays: readonly (number | null)[],
    rolls: readonly [number, number, number],
  ): { first: number; second: number | null; turn: number } | null {
    const weights = lastDays.map((last) => momentWeight(day, last));
    const first = pickByWeight(weights, rolls[0]);
    if (first < 0) return null;
    let second: number | null = null;
    if (lastDays.length > 1 && rolls[1] < 0.5) {
      const rest = weights.map((w, i) => (i === first ? 0 : w));
      const pick = pickByWeight(rest, rolls[2]);
      second = pick < 0 ? null : pick;
    }
    return { first, second, turn: Math.floor(rolls[2] * 1000) };
  }

  /** The raid weeks whose span, by the calendar, reaches into `[from, to]` (no read). */
  private spansBetween(from: number, to: number): RaidSpan[] {
    const tz = this.deps.timezone();
    const spans: RaidSpan[] = [];
    let week = weekIdFor(to, tz);
    for (let i = 0; i <= WEEKS_BACK; i++) {
      const starts = ([1, 2] as RaidRules[]).map((rules) => eventTimes(week, tz, rules));
      const start = Math.min(...starts.map((t) => t.phase1));
      const end = Math.max(...starts.map((t) => t.finale)) + FINALE_GRACE_MS;
      if (start <= to && end > from) spans.push({ weekId: week, from: start, to: end });
      week = addWeeks(week, -1);
    }
    return spans;
  }

  /**
   * The spans in which the player's creatures are in the raid (V-POST-7): from the first stage's lock to the end of the finale, per
   * creature id. Only the weeks that reach `[from, to]` by the calendar are read at all, and only for a player with a creature on
   * a post (`posted`: the caller says so, so a player with no post reads nothing).
   */
  raidWindows(
    userId: string,
    from: number,
    to: number,
    posted: boolean,
  ): { creatureId: string; window: Omit<AwayWindow, 'creature'> }[] {
    if (!posted) return [];
    const tz = this.deps.timezone();
    const out: { creatureId: string; window: Omit<AwayWindow, 'creature'> }[] = [];
    for (const span of this.spansBetween(from, to)) {
      const placed = this.sql
        .exec<{ creature_id: string }>(
          'SELECT creature_id FROM raid_placements WHERE user_id = ? AND week_id = ?',
          userId,
          span.weekId,
        )
        .toArray();
      const week = this.sql
        .exec<{ rules_version: number }>(
          'SELECT rules_version FROM raid_weeks WHERE week_id = ?',
          span.weekId,
        )
        .toArray()[0];
      if (week === undefined) continue;
      // A combat v2 stage frees a knocked-out creature's place, but it stays out of the raid for the weekend (it cannot be placed
      // again), so its post stays paused too: the party's carry lists who is out. One row, only for a v2 week the player joined.
      // (Ids of other players' creatures may come with it; the caller only looks up its own.)
      const ids = new Set(placed.map((row) => row.creature_id));
      if (week.rules_version === 2) {
        const carry = this.sql
          .exec<{ carry_json: string | null }>(
            `SELECT p.carry_json FROM raid_party_members m JOIN raid_parties p ON p.week_id = m.week_id AND p.party = m.party
             WHERE m.week_id = ? AND m.user_id = ?`,
            span.weekId,
            userId,
          )
          .toArray()[0]?.carry_json;
        if (carry !== null && carry !== undefined) {
          const out = (JSON.parse(carry) as { out?: unknown }).out;
          if (Array.isArray(out)) for (const key of out) if (typeof key === 'string') ids.add(key);
        }
      }
      if (ids.size === 0) continue;
      const times = eventTimes(span.weekId, tz, week.rules_version === 2 ? 2 : 1);
      const done = this.sql
        .exec<{ done_at: number }>(
          "SELECT done_at FROM raid_events WHERE week_id = ? AND event = 'finale'",
          span.weekId,
        )
        .toArray()[0];
      const window = { from: times.phase1, to: done?.done_at ?? times.finale + FINALE_GRACE_MS };
      for (const creatureId of ids) out.push({ creatureId, window });
    }
    return out;
  }
}
