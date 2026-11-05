/**
 * The welcome-back Gazette on the server (phase 5 step 4, docs/design/valley/systems/return.md V-RET-0, 3, 4a, 6, 7; posts.md V-POST-14;
 * scouts.md V-SCOUT-6).
 *
 * - `PaperRecorder` is what the lazy pass writes into while it runs on an arrival: the notable events of the time away, as one capped
 *   `PaperLog` (`@creatures/game`, `valley/gazette.ts`). It is plain memory for one pass; nothing is kept between requests but the stored paper.
 * - `ValleyGazette` keeps the last paper of each player in `valley_gazette` (migration 59: `user_id` is the key, so a read is one row). The
 *   stored log is merged when an earlier paper was never closed (two absences in a row tell one story); the headlines are composed from
 *   it on read with the shared ranking, so a reload replays the same paper until it is closed. Closing marks it read: from then on the
 *   state carries no paper. The paper is small: a month away is no bigger than a day (the log's lists are capped).
 * - The one decision (V-RET-3) is a way deeper for an Expert scout (V-SCOUT-6): the paper carries it while it is unread; taking it is
 *   `takeDecision`, which the route calls before it sets the seat deep. Closing the paper without taking it lets that way go (it is a
 *   choice, asked once; the scout may find another).
 *
 * Every table here carries `user_id`, so `purgeUser` (the `valley-fresh` tool) clears it. Everything runs inside the caller's transaction.
 */
import * as v from 'valibot';
import {
  LOG_CAPS,
  PaperDecisionSchema,
  PaperLogSchema,
  WELCOME_AFTER_HOURS,
  composePaper,
  emptyLog,
  logHasNews,
  mergeLogs,
  type Paper,
  type PaperDecision,
  type PaperItem,
  type PaperLog,
  type PaperRarity,
} from '@creatures/game';
import type { LedgerStorage } from './ledger';

const RARITY_OF: Record<string, PaperRarity> = { common: 'common', rare: 'rare', epic: 'epic' };

/** A piece as the paper shows it (an unknown rarity reads as common). */
export const paperItem = (item: {
  id: string;
  baseId: string;
  rarity: string;
  itemLevel?: number | undefined;
}): PaperItem => ({
  id: item.id,
  baseId: item.baseId,
  rarity: RARITY_OF[item.rarity] ?? 'common',
  level: Math.max(0, Math.floor(item.itemLevel ?? 1)),
});

const RARITY_RANK = ['common', 'rare', 'epic'];

/** What the pass writes as it runs (one arrival). Every add is capped like the stored log, so a long absence stays small. */
export class PaperRecorder {
  readonly log: PaperLog = emptyLog();

  newcomer(creatureId: string, species: string, by: string | null): void {
    this.log.newcomerCount += 1;
    if (this.log.newcomers.length < LOG_CAPS.newcomers) {
      this.log.newcomers.push({ creatureId, species, by });
    }
  }

  duplicate(): void {
    this.log.duplicates += 1;
  }

  /** Gear a scout's pack held when it came home, the best kept. */
  gear(item: PaperItem, by: string | null): void {
    this.log.gearCount += 1;
    this.log.gear.push({ item, by });
    this.log.gear.sort(
      (a, b) =>
        RARITY_RANK.indexOf(b.item.rarity) - RARITY_RANK.indexOf(a.item.rarity) ||
        b.item.level - a.item.level ||
        a.item.id.localeCompare(b.item.id, 'en'),
    );
    this.log.gear.length = Math.min(this.log.gear.length, LOG_CAPS.items);
  }

  blueprint(baseId: string, by: string | null): void {
    this.log.blueprintCount += 1;
    if (this.log.blueprints.length < LOG_CAPS.blueprints) this.log.blueprints.push({ baseId, by });
  }

  pages(count: number): void {
    this.log.pages += Math.max(0, count);
  }

  packFull(by: string | null): void {
    if (this.log.packsFull.length < LOG_CAPS.packs) this.log.packsFull.push(by);
  }

  /** Scrap and shards a pack brought home. */
  parts(scrap: number, shards: number): void {
    this.log.brought.scrap += Math.max(0, Math.floor(scrap));
    this.log.brought.shards += Math.max(0, Math.floor(shards));
  }

  acorns(amount: number): void {
    this.log.brought.acorns += Math.max(0, Math.floor(amount));
  }

  /** The Forge's pieces that came home (best kept). */
  forgePieces(items: readonly PaperItem[], by: string | null): void {
    for (const item of items) {
      this.log.forge.count += 1;
      const r = RARITY_RANK.indexOf(item.rarity);
      if (r >= 0 && r <= 2) this.log.forge.byRarity[r] = (this.log.forge.byRarity[r] ?? 0) + 1;
      this.log.forge.best.push(item);
    }
    this.log.forge.best.sort(
      (a, b) =>
        RARITY_RANK.indexOf(b.rarity) - RARITY_RANK.indexOf(a.rarity) ||
        b.level - a.level ||
        a.id.localeCompare(b.id, 'en'),
    );
    this.log.forge.best.length = Math.min(this.log.forge.best.length, LOG_CAPS.items);
    if (items.length > 0) this.log.forge.by = by ?? this.log.forge.by;
  }

  mastery(post: 'scout' | 'anvil', creatureId: string, step: 1 | 2 | 3): void {
    this.log.mastery.push({ post, creatureId, step });
    this.log.mastery.sort((a, b) => b.step - a.step);
    this.log.mastery.length = Math.min(this.log.mastery.length, LOG_CAPS.mastery);
  }

  /** The resting creatures that gained the most (the top few are kept). */
  xp(creatureId: string, gained: number, levels: number): void {
    if (gained <= 0) return;
    this.log.xp.push({ creatureId, gained, levels });
    this.log.xp.sort((a, b) => b.levels - a.levels || b.gained - a.gained);
    this.log.xp.length = Math.min(this.log.xp.length, LOG_CAPS.xp);
  }

  moment(creatureId: string, turn: number): void {
    this.log.moment = { creatureId, turn };
  }
}

type PaperRow = {
  paper_id: string;
  at: number;
  away_hours: number;
  log: string;
  decision: string | null;
  read_at: number | null;
};

export class ValleyGazette {
  constructor(
    private readonly storage: LedgerStorage,
    private readonly now: () => number,
  ) {}

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  private row(userId: string): PaperRow | undefined {
    return this.sql
      .exec<PaperRow>(
        'SELECT paper_id, at, away_hours, log, decision, read_at FROM valley_gazette WHERE user_id = ?',
        userId,
      )
      .toArray()[0];
  }

  private parseLog(text: string): PaperLog | null {
    try {
      const result = v.safeParse(PaperLogSchema, JSON.parse(text));
      return result.success ? result.output : null;
    } catch {
      return null;
    }
  }

  private parseDecision(text: string | null): PaperDecision | null {
    if (text === null) return null;
    try {
      const result = v.safeParse(PaperDecisionSchema, JSON.parse(text));
      return result.success ? result.output : null;
    } catch {
      return null;
    }
  }

  /**
   * Writes the paper of an arrival after `awayHours` away: nothing for a short absence (V-RET-6, the first moments go straight to the
   * valley) or when there is no news. An unread earlier paper is joined (one story, the newer decision wins). Returns whether it wrote one.
   */
  write(
    userId: string,
    at: number,
    awayHours: number,
    log: PaperLog,
    decision: PaperDecision | null,
  ): boolean {
    if (awayHours < WELCOME_AFTER_HOURS) return false;
    const old = this.row(userId);
    const unread = old !== undefined && old.read_at === null ? old : undefined;
    const oldLog = unread === undefined ? null : this.parseLog(unread.log);
    const joined = oldLog === null ? log : mergeLogs(oldLog, log);
    const joinedDecision =
      decision ?? (unread === undefined ? null : this.parseDecision(unread.decision));
    if (!logHasNews(joined) && joinedDecision === null) return false;
    this.sql.exec(
      `INSERT INTO valley_gazette (user_id, paper_id, at, away_hours, log, decision, read_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET paper_id = excluded.paper_id, at = excluded.at, away_hours = excluded.away_hours,
         log = excluded.log, decision = excluded.decision, read_at = NULL`,
      userId,
      String(at),
      at,
      unread === undefined ? awayHours : Math.max(awayHours, unread.away_hours),
      JSON.stringify(joined),
      joinedDecision === null ? null : JSON.stringify(joinedDecision),
    );
    return true;
  }

  /** The player's paper while it is unread (one row by its key); null when there is none or it was closed. */
  current(userId: string): Paper | null {
    const row = this.row(userId);
    if (row === undefined || row.read_at !== null) return null;
    const log = this.parseLog(row.log);
    if (log === null) return null;
    const { headlines, more } = composePaper(log);
    return {
      id: row.paper_id,
      at: row.at,
      awayHours: row.away_hours,
      headlines,
      more,
      brought: log.brought,
      decision: this.parseDecision(row.decision),
    };
  }

  /** Closing the paper: marks it read (a newer paper, or one already closed, is left as it is). Returns whether a paper was closed. */
  close(userId: string, paperId: string): boolean {
    const changed = this.sql.exec(
      'UPDATE valley_gazette SET read_at = ? WHERE user_id = ? AND paper_id = ? AND read_at IS NULL',
      this.now(),
      userId,
      paperId,
    ).rowsWritten;
    return changed > 0;
  }

  /** The decision of the unread paper, if any. */
  pendingDecision(userId: string): PaperDecision | null {
    const row = this.row(userId);
    if (row === undefined || row.read_at !== null) return null;
    return this.parseDecision(row.decision);
  }

  /** The decision is taken: the paper no longer offers it. */
  clearDecision(userId: string): void {
    this.sql.exec('UPDATE valley_gazette SET decision = NULL WHERE user_id = ?', userId);
  }
}
