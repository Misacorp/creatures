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
 * - A forecast is not free (several full fights), so it is cached in memory per party:
 *   - a different week state (open, Phase 1 done, Phase 2 done) is a different entry and always
 *     computed at once, so results show up right after Friday and Saturday;
 *   - a change to teams, placements, ability picks or the roster (`invalidate`) is picked up lazily,
 *     and a party's band is never recomputed more often than every 30 seconds;
 *   - without a change it is refreshed every 5 minutes, which catches training.
 *   The cache is an optimisation only: losing it (the object restarting) just recomputes.
 */
import { readinessBand, type ReadinessBand, type Rng } from '@creatures/game';
import { forecastFinale, forecastWeek, type FightInput } from '@creatures/engine';
import type { LedgerStorage } from './ledger';
import { readWeekProgression } from './raid-ladder';
import { buildPhaseInput } from './raid-resolve';
import type { RaidStatus } from './raid-teams';

/** The soonest a party's band is recomputed after a change. */
export const READINESS_MIN_INTERVAL_MS = 30_000;
/** How long a band is kept when nothing was reported changed. */
export const READINESS_MAX_AGE_MS = 5 * 60_000;
/** Bound on remembered bands: one per party of the current weeks. */
const MAX_ENTRIES = 100;

interface Entry {
  /** The week state the band was computed for. */
  status: RaidStatus;
  /** The cache version at the time (see `invalidate`). */
  version: number;
  at: number;
  band: ReadinessBand | null;
}

export interface ReadinessDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Fresh randomness for the forecast dice. Never a stored seed. */
  rng: Rng;
}

export class ReadinessCache {
  private readonly entries = new Map<string, Entry>();
  private version = 0;

  constructor(private readonly deps: ReadinessDeps) {}

  /** Something the forecast depends on changed (a team, a placement, an ability pick, the roster). */
  invalidate(): void {
    this.version++;
  }

  /** The band of a party, or null when there is none (the finale has started, or nothing to fight). */
  get(
    week: { weekId: string; bossId: string; status: RaidStatus },
    party: number,
  ): ReadinessBand | null {
    if (week.status === 'finale') return null;
    const key = `${week.weekId}:${String(party)}`;
    const now = this.deps.now();
    const entry = this.entries.get(key);
    if (entry !== undefined && entry.status === week.status) {
      const age = now - entry.at;
      if (age >= 0 && age < READINESS_MIN_INTERVAL_MS) return entry.band;
      if (age >= 0 && entry.version === this.version && age < READINESS_MAX_AGE_MS) {
        return entry.band;
      }
    }
    const band = this.compute(week, party);
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(key, { status: week.status, version: this.version, at: now, band });
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
      const stage = (phase: 'phase1' | 'phase2'): FightInput => ({
        ...built.input,
        phase,
        finaleAbilities: [],
      });
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
