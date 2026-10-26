/**
 * The readiness band of a party: Long shot / Even / Likely / Strong. It tells a party how ready its
 * team looks, never a number.
 *
 * - Before Saturday (the week is open, or only Phase 1 has resolved) it is `forecastWeek`: the
 *   whole week from the full pool, with the HP left at the finale estimated from two simulated
 *   phases. After Saturday (Phase 2 has resolved) it is `forecastFinale` on the finale input the
 *   party would fight with now (the pool and counter-move Phase 2 left). Once the finale has
 *   started there is no band: the fight is on.
 * - The dice are fresh every time, from the injected Rng (crypto in production), never the seed of
 *   a stored or coming fight. Only the band leaves this module.
 * - A forecast is not free (several full fights: it loads every fighting creature), so it is
 *   cached per party in `raid_readiness` (migration 45). It was kept in memory until 2026-10-25, but the
 *   object sleeps a few seconds after each request, so nearly every raid view computed it again:
 *   - a different week state (open, Phase 1 done, Phase 2 done) is a different entry and always
 *     computed at once, so results show up right after Friday and Saturday;
 *   - a change to teams, placements, ability picks or the roster (`invalidate`) is picked up lazily,
 *     and a party's band is never recomputed more often than every 30 seconds;
 *   - without a change it is refreshed every 5 minutes, which catches training.
 *   The cache is an optimisation only: a missing row just recomputes. Rows of other weeks are deleted when
 *   a band is stored.
 */
import { readinessBand, type ReadinessBand, type Rng } from '@creatures/game';
import { forecastFinale, forecastWeek, phaseFloorHp, type FightInput } from '@creatures/engine';
import type { LedgerStorage } from './ledger';
import { readWeekProgression } from './raid-ladder';
import { buildPhaseInput } from './raid-resolve';
import type { RaidStatus } from './raid-teams';

/** The soonest a party's band is recomputed after a change. */
export const READINESS_MIN_INTERVAL_MS = 30_000;
/** How long a band is kept when nothing was reported changed. */
export const READINESS_MAX_AGE_MS = 5 * 60_000;
/** Migration 45: the stored readiness bands, one per party of the current week. */
export function raidReadinessMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE raid_readiness (
    week_id TEXT NOT NULL,
    party INTEGER NOT NULL,
    status TEXT NOT NULL,
    band TEXT,
    at INTEGER NOT NULL,
    stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
    PRIMARY KEY (week_id, party)
  )`);
}

export interface ReadinessDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Fresh randomness for the forecast dice. Never a stored seed. */
  rng: Rng;
}

export class ReadinessCache {
  constructor(private readonly deps: ReadinessDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** Something the forecast depends on changed (a team, a placement, an ability pick, the roster). */
  invalidate(): void {
    this.sql.exec('UPDATE raid_readiness SET stale = 1 WHERE stale = 0');
  }

  /** The band of a party, or null when there is none (the finale has started, or nothing to fight). */
  get(
    week: { weekId: string; bossId: string; status: RaidStatus },
    party: number,
  ): ReadinessBand | null {
    if (week.status === 'finale') return null;
    const now = this.deps.now();
    const entry = this.sql
      .exec<{ status: string; band: ReadinessBand | null; at: number; stale: number }>(
        'SELECT status, band, at, stale FROM raid_readiness WHERE week_id = ? AND party = ?',
        week.weekId,
        party,
      )
      .toArray()[0];
    if (entry !== undefined && entry.status === week.status) {
      const age = now - entry.at;
      if (age >= 0 && age < READINESS_MIN_INTERVAL_MS) return entry.band;
      if (age >= 0 && entry.stale === 0 && age < READINESS_MAX_AGE_MS) return entry.band;
    }
    const band = this.compute(week, party);
    this.sql.exec('DELETE FROM raid_readiness WHERE week_id <> ?', week.weekId);
    this.sql.exec(
      `INSERT INTO raid_readiness (week_id, party, status, band, at, stale) VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(week_id, party) DO UPDATE SET status = excluded.status, band = excluded.band,
         at = excluded.at, stale = 0`,
      week.weekId,
      party,
      week.status,
      band,
      now,
    );
    return band;
  }

  private compute(
    week: { weekId: string; bossId: string; status: RaidStatus },
    party: number,
  ): ReadinessBand | null {
    try {
      const sql = this.deps.storage.sql;
      // A week from before the ladder that has no pool yet has no rank to forecast with until its
      // Phase 1 ranks it: no band rather than a band for the wrong boss.
      if (readWeekProgression(sql, week.weekId) === null && !poolStored(sql, week.weekId)) {
        return null;
      }
      if (week.status === 'phase2') {
        const built = buildPhaseInput(sql, week, party, 'finale');
        if (built === null) return null;
        return readinessBand(forecastFinale(built.input, this.deps.rng));
      }
      // The full pool and no counter-move: the forecast plays the week from the start.
      const built = buildPhaseInput(sql, week, party, 'finale', { practice: true });
      if (built === null) return null;
      // Each stage has its own floor and no enrage (only the finale enrages and has no floor).
      const stage = (phase: 'phase1' | 'phase2'): FightInput => {
        const input: FightInput = {
          ...built.input,
          phase,
          finaleAbilities: [],
          bossHpFloor: phaseFloorHp(built.input.bossHpPool.max, phase),
        };
        delete input.enrage;
        return input;
      };
      return readinessBand(
        forecastWeek(
          { phase1: stage('phase1'), phase2: stage('phase2'), finale: built.input },
          this.deps.rng,
        ),
      );
    } catch (err) {
      // A forecast must never break the raid view.
      console.error('readiness forecast failed', err instanceof Error ? err.name : 'unknown');
      return null;
    }
  }
}

function poolStored(sql: SqlStorage, weekId: string): boolean {
  return (
    sql
      .exec('SELECT 1 FROM raid_parties WHERE week_id = ? AND hp_max IS NOT NULL LIMIT 1', weekId)
      .toArray().length > 0
  );
}
