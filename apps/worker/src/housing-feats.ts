/**
 * What the house reads about the player elsewhere in the game (`docs/design/housing.md` 3.4 and 3.5): the trophy hall's displays and the feats
 * that unlock stamps. Every read goes through a primary key or an index, once per request (`houseReads` memoises each), so a display and a
 * feat that need the same rows read them once. Nothing here runs on `/api/state`, an alarm tick or the object's start.
 */
import {
  expeditionContent,
  journalSetPages,
  stampsEarned,
  type HouseFeats,
  type HousingContent,
} from '@creatures/game';
import { grantOnce, listTrophies, type ItemRow, type TrophyRow } from './housing-store';

export type Medals = { gold: number; silver: number; bronze: number; pins: number };

/** The player's other-system rows, each read at most once per request. */
export interface HouseReads {
  trophies(kind: 'raid' | 'festival'): TrophyRow[];
  journalPages(): ReadonlySet<string>;
  medals(): Medals;
  /** Wins per event, summed over the player's creatures. */
  badges(): { eventId: string; wins: number }[];
  dungeon(): { depth: number; clears: number };
  stats(): Record<string, number>;
  /** Finished valley projects the player helped with, per place (the plaque rows). */
  keepsakes(): { place: string; count: number }[];
}

export function houseReads(sql: SqlStorage, userId: string): HouseReads {
  const memo = new Map<string, unknown>();
  const once = <T>(key: string, read: () => T): T => {
    if (!memo.has(key)) memo.set(key, read());
    return memo.get(key) as T;
  };
  return {
    trophies: (kind) => once(`trophies:${kind}`, () => listTrophies(sql, userId, kind)),
    journalPages: () =>
      once(
        'journal',
        () =>
          new Set(
            sql
              .exec<{ entry_id: string }>('SELECT entry_id FROM journal WHERE user_id = ?', userId)
              .toArray()
              .map((r) => r.entry_id),
          ),
      ),
    medals: () =>
      once('medals', () => {
        const row = sql
          .exec<Medals>(
            'SELECT gold, silver, bronze, pins FROM games_medals WHERE user_id = ?',
            userId,
          )
          .toArray()[0];
        return row ?? { gold: 0, silver: 0, bronze: 0, pins: 0 };
      }),
    badges: () =>
      once('badges', () =>
        sql
          .exec<{ event_id: string; wins: number }>(
            'SELECT event_id, SUM(wins) AS wins FROM games_badges WHERE user_id = ? GROUP BY event_id',
            userId,
          )
          .toArray()
          .map((r) => ({ eventId: r.event_id, wins: r.wins })),
      ),
    dungeon: () =>
      once('dungeon', () => {
        const row = sql
          .exec<{
            depth: number;
            clears: number;
          }>('SELECT depth, clears FROM dungeon_progress WHERE user_id = ?', userId)
          .toArray()[0];
        return row ?? { depth: 0, clears: 0 };
      }),
    stats: () =>
      once('stats', () =>
        Object.fromEntries(
          sql
            .exec<{
              stat: string;
              value: number;
            }>('SELECT stat, value FROM account_stats WHERE user_id = ?', userId)
            .toArray()
            .map((r) => [r.stat, r.value]),
        ),
      ),
    keepsakes: () =>
      once('keepsakes', () =>
        sql
          .exec<{
            place: string;
            n: number;
          }>(
            'SELECT place, COUNT(*) AS n FROM valley_gifts WHERE user_id = ? AND plaque = 1 GROUP BY place',
            userId,
          )
          .toArray()
          .map((r) => ({ place: r.place, count: r.n })),
      ),
  };
}

/** The journal's page ids by set (pages without a set belong to none). */
function pagesBySet(): Map<string, readonly string[]> {
  return journalSetPages(
    expeditionContent.journal.entries.flatMap((e) =>
      e.set === undefined ? [] : [{ id: e.id, set: e.set }],
    ),
  );
}

/** The journal sets whose every page the player found, in the journal's set order. */
export function completedJournalSets(reads: HouseReads): string[] {
  const found = reads.journalPages();
  const pages = pagesBySet();
  return expeditionContent.journal.sets
    .filter((s) => {
      const of = pages.get(s.id);
      return of !== undefined && of.length > 0 && of.every((p) => found.has(p));
    })
    .map((s) => s.id);
}

/** The feats of the player, from the rows already read. */
export function readFeats(
  reads: HouseReads,
  built: ReadonlySet<string>,
  setsComplete: number,
): HouseFeats {
  return {
    journalPages: reads.journalPages(),
    stats: reads.stats(),
    bossesBeaten: new Set(reads.trophies('raid').map((t) => t.ref)),
    dungeonDepth: reads.dungeon().depth,
    medals: reads.medals(),
    built,
    setsComplete,
  };
}

/**
 * Grants the feat stamps the player has earned and not yet held, and the blueprints their stamps teach (an item whose unlock is
 * `feat` on a held stamp). `items` are the player's rows as read for the view (stamps and learned blueprints are looked up in them);
 * the rows added here are added to `items` too, so the view that follows shows them. Returns the new stamp ids.
 */
export function awardFeats(
  sql: SqlStorage,
  userId: string,
  now: number,
  content: HousingContent,
  reads: HouseReads,
  built: ReadonlySet<string>,
  setsComplete: number,
  items: ItemRow[],
): string[] {
  const held = new Set(items.filter((i) => i.kind === 'stamp').map((i) => i.item_id));
  const learned = new Set(items.filter((i) => i.kind === 'blueprint').map((i) => i.item_id));
  const fresh: string[] = [];
  const earned = stampsEarned(content, readFeats(reads, built, setsComplete), pagesBySet());
  for (const id of earned) {
    if (held.has(id)) continue;
    if (grantOnce(sql, userId, 'stamp', id, now)) {
      items.push({ kind: 'stamp', item_id: id, count: 1, fresh: 0, at: now });
      held.add(id);
      fresh.push(id);
    }
  }
  for (const item of [...content.pieces, ...content.skins]) {
    if (item.unlock.kind !== 'feat' || !held.has(item.unlock.stamp) || learned.has(item.id))
      continue;
    if (grantOnce(sql, userId, 'blueprint', item.id, now)) {
      items.push({ kind: 'blueprint', item_id: item.id, count: 1, fresh: 0, at: now });
      learned.add(item.id);
    }
  }
  return fresh;
}
