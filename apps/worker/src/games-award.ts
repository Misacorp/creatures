/**
 * The Valley Games' awards, at the end of a day's show (idempotent per day: `games_days.awarded_at`).
 * One transaction: each player's medals (lifetime and pocket), each creature's experience
 * (`gamesXp`), pins for beating its own record in the event, its record and its medal counts, the
 * placings' pins and experience, then the Discord podium post. Bots (the staging dev guests) take part
 * in the show but get nothing: their places keep no medal, record or experience.
 */
import { beatsRecord, gamesXp, medalPoints, type GamesMedal } from '@creatures/game';
import { awardExperience } from './creature-exp';
import type { GamesDeps } from './games-lock';
import { queueGamesPost } from './games-posts';
import {
  addCreatureMedals,
  addMedals,
  readDay,
  readRecord,
  readResults,
  writeRecord,
} from './games-store';

type Placing = {
  event_id: string;
  user_id: string;
  creature_ids: string;
  place: number;
  medal: GamesMedal | null;
};

const medalCount = (medal: GamesMedal | null) => ({
  gold: medal === 'gold' ? 1 : 0,
  silver: medal === 'silver' ? 1 : 0,
  bronze: medal === 'bronze' ? 1 : 0,
});

/** Pays a locked day's awards once. Returns false when it was already paid or is not locked. */
export function awardDay(deps: GamesDeps, day: string): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const row = readDay(sql, day);
    if (row === null || row.lockedAt === null || row.awardedAt !== null) return false;
    const now = deps.now();
    const events = readResults(sql, day);
    const scoreOf = new Map<string, number>();
    for (const e of events) {
      if (e.result === null) continue;
      for (const actor of e.result.actors) {
        scoreOf.set(`${e.eventId}:${actor.entrantId}`, e.result.scores[actor.a] ?? 0);
      }
    }
    const placings = sql
      .exec<Placing>(
        `SELECT event_id, user_id, creature_ids, place, medal FROM games_placings
         WHERE day = ? AND bot = 0 ORDER BY event_id, place, user_id`,
        day,
      )
      .toArray();
    for (const p of placings) {
      const creatureIds = JSON.parse(p.creature_ids) as string[];
      const pins: string[] = [];
      let xp = 0;
      for (const creatureId of creatureIds) {
        const score = scoreOf.get(`${p.event_id}:${creatureId}`) ?? 0;
        const prev = readRecord(sql, creatureId, p.event_id);
        const pin = beatsRecord(prev, score);
        if (pin) pins.push(creatureId);
        if (prev === undefined || score > prev) {
          writeRecord(sql, {
            creatureId,
            eventId: p.event_id,
            userId: p.user_id,
            best: score,
            day,
          });
        }
        const gained = gamesXp(p.place, pin);
        const view = awardExperience(
          sql,
          deps.analytics,
          p.user_id,
          creatureId,
          gained,
          'games',
          false,
        );
        if (view !== null) xp += gained;
        addCreatureMedals(sql, creatureId, p.user_id, {
          ...medalCount(p.medal),
          pins: pin ? 1 : 0,
        });
      }
      const counts = medalCount(p.medal);
      addMedals(sql, p.user_id, {
        ...counts,
        pins: pins.length,
        pocket: medalPoints({ ...counts, pin: pins.length }),
      });
      sql.exec(
        'UPDATE games_placings SET pins = ?, xp = ? WHERE day = ? AND event_id = ? AND user_id = ?',
        JSON.stringify(pins),
        xp,
        day,
        p.event_id,
        p.user_id,
      );
    }
    sql.exec('UPDATE games_days SET awarded_at = ? WHERE day = ?', now, day);
    queueGamesPost(sql, day, events, now);
    return true;
  });
}
