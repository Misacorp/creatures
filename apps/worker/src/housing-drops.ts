/**
 * The housing-drops hook (`docs/design/housing.md` 2.3 and 3.6): what a reward moment brings the house. The reward paths call
 * `drop(userId, moment)` once per moment, inside their own transaction; a key that was already paid makes the call do nothing, so a
 * retried claim or a replayed award never pays twice. No house is needed: drops wait in `house_items` until the player opens the
 * House. Randomness is the hook's own live RNG (`crypto.getRandomValues`), never another system's.
 *
 * Writes per moment: one `house_drops` row, one row per material, blueprint and stamp, and for a cleared raid finale the trophy rows.
 * Reads: the idempotency row, and (only for a moment that can drop a blueprint or a stamp) the player's learned blueprints and stamps.
 */
import {
  HOUSING_RULES,
  housing as shippedHousing,
  rollHouseDrops,
  type HouseDrop,
  type HousingContent,
  type HousingHook,
  type HousingMoment,
  type Rng,
} from '@creatures/game';
import {
  addItem,
  addTrophy,
  dropSeen,
  grantOnce,
  insertDrop,
  listItemsOf,
  pruneDrops,
} from './housing-store';
import type { LedgerStorage } from './ledger';

export interface HousingDropsDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly rng: Rng;
  /** Test seam: the housing content (default: the shipped content). */
  readonly content?: HousingContent;
}

const DAY_MS = 86_400_000;

/** Whether the moment can roll a blueprint or a stamp (the others need no read of what the player holds). */
function canDropKeepsakes(moment: HousingMoment): boolean {
  switch (moment.kind) {
    case 'trip':
    case 'scout':
      return true;
    case 'dungeon':
    case 'raid':
      return moment.cleared;
    case 'games':
      return moment.medal === 'gold';
  }
}

export class HousingDrops implements HousingHook {
  constructor(private readonly deps: HousingDropsDeps) {}

  /**
   * Never throws: a failed drop (its own savepoint rolls back) must not undo the reward it is called from, so the failure is logged
   * (the error's name only) and the reward goes on without the drop.
   */
  drop(userId: string, moment: HousingMoment): void {
    try {
      this.dropOnce(userId, moment);
    } catch (err) {
      console.error('housing drop failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  private dropOnce(userId: string, moment: HousingMoment): void {
    const { storage } = this.deps;
    storage.transactionSync(() => {
      const sql = storage.sql;
      if (dropSeen(sql, userId, moment.key)) return;
      const now = this.deps.now();
      const content = this.deps.content ?? shippedHousing;
      const blueprints = new Set<string>();
      const stamps = new Set<string>();
      if (canDropKeepsakes(moment)) {
        for (const row of listItemsOf(sql, userId, 'blueprint')) blueprints.add(row.item_id);
        for (const row of listItemsOf(sql, userId, 'stamp')) stamps.add(row.item_id);
      }
      const drop: HouseDrop = rollHouseDrops(this.deps.rng, content, moment, {
        blueprints,
        stamps,
      });
      for (const [id, n] of Object.entries(drop.materials)) {
        if (n > 0) addItem(sql, userId, 'material', id, n, n, now);
      }
      if (drop.blueprint !== null) grantOnce(sql, userId, 'blueprint', drop.blueprint, now);
      if (drop.stamp !== null) grantOnce(sql, userId, 'stamp', drop.stamp, now);
      if (moment.kind === 'raid' && moment.cleared) {
        addTrophy(sql, userId, 'raid', moment.bossId, moment.rank, moment.weekId);
        if (moment.festival !== null) {
          addTrophy(sql, userId, 'festival', moment.festival, 0, moment.weekId);
        }
      }
      insertDrop(sql, userId, moment.key, now, JSON.stringify(drop));
      pruneDrops(sql, userId, now - HOUSING_RULES.dropsKeepDays * DAY_MS);
    });
  }
}
