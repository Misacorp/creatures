/**
 * Gear and the workshop of a guild: the player's items, parts, blueprints, jobs and Crafting skill, and
 * the actions on them (equip, Equip best, dismantle, start and claim a job). Everything is synchronous
 * and runs inside `transactionSync`, so a check and the writes that depend on it can never be
 * interleaved with another request. The user is always an argument from the verified session.
 *
 * Idempotency: dismantle, start job and claim job carry the client's key. `gear_actions` stores the
 * result under (player, key) with a fingerprint of what the action was, so a retry returns the stored
 * result, and the same key on a different action is a `key_conflict`. Equip and Equip best change no
 * balance and repeat harmlessly, so they carry no key.
 *
 * Randomness: a craft's rarity, lines and tiers are drawn with the live RNG at the moment the job is
 * claimed, never when it starts, and a claimed job stores its result and never rolls again.
 *
 * Gear v2 (docs/design/gear-and-creatures-v2.md): three slots, items with levels and rolled lines, no
 * upgrades, Improve or enchants. A creature wears an item only if the wear rule allows it (the slot is
 * open, the item's level is not above the creature's, a role-locked Charm fits the role).
 */
import {
  RULES,
  craftLevelNeeded,
  effectiveStats,
  nextSkillXp,
  planEquipBest,
  skillLevel,
  wearBlock,
  type GearSlot,
  type WearBlock,
} from '@creatures/game';
import { GameError, atomically, type Outcome } from './outcome';
import { conversionPending, dismissNotice, pendingNotice } from './gear-convert';
import { grantWelcomeKit, recentGrants } from './gear-grants';
import {
  getParts,
  knownBlueprints,
  ownedItems,
  rowToItem,
  viewOrSkip,
  type GearRow,
  type JobRow,
} from './gear-store';
import { getBalances } from './ledger';
import type {
  CraftPreview,
  DismantlePreview,
  EquipBestResult,
  GearItemView,
  GearState,
  JobResult,
  StartJobInput,
} from './gear-types';
import {
  assertNotBusy,
  busyReason,
  itemView,
  jobView,
  ownedCreature,
  ownedItem,
  type GearDeps,
} from './gear-access';
import { speciesOf } from './species';
import { Workshop } from './workshop';

export type { GearDeps } from './gear-access';
export type {
  CraftOption,
  CraftPreview,
  DismantlePreview,
  EquipBestResult,
  GearItemView,
  GearLineView,
  GearState,
  GearStatView,
  ItemSnapshot,
  JobCommon,
  JobResult,
  JobView,
  SkillView,
  StartJobInput,
} from './gear-types';

/** Finished jobs shown besides the open ones. */
const RECENT_CLAIMED_JOBS = 5;
/** Recent grants shown (the loot reveals read from them). */
const RECENT_GRANTS = 20;
/** Stored action results are kept this long; a retry comes within minutes. */
const ACTION_RETENTION_MS = 30 * 86_400_000;
/** Most creatures one Equip best call may plan for. */
export const EQUIP_BEST_MAX_CREATURES = 24;

/** The error a wear rule breach answers with. */
function wearError(block: WearBlock): GameError {
  switch (block.reason) {
    case 'role':
      return new GameError(409, 'wrong_role', block.role);
    case 'slot_locked':
      return new GameError(409, 'slot_locked', String(block.needs));
    case 'item_level':
      return new GameError(409, 'item_level_too_high', String(block.needs));
  }
}

export class Gear {
  /** The Workshop (previews, start and claim of jobs); the routes reach it through the delegates below. */
  private readonly workshop: Workshop;

  constructor(private readonly deps: GearDeps) {
    this.workshop = new Workshop(deps);
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
  }

  /** Deletes stored action results older than 30 days. Called from the guild alarm. */
  prune(): void {
    this.sql.exec(
      'DELETE FROM gear_actions WHERE created_at < ?',
      this.deps.now() - ACTION_RETENTION_MS,
    );
  }

  // --- Reads ---

  /** The caller's gear, parts, blueprints, jobs, skills and recent loot. */
  state(userId: string): GearState {
    const now = this.deps.now();
    const rows = ownedItems(this.sql, userId);
    const open = this.sql
      .exec<JobRow>(
        'SELECT * FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NULL ORDER BY ends_at, rowid',
        userId,
      )
      .toArray();
    const claimed = this.sql
      .exec<JobRow>(
        `SELECT * FROM workshop_jobs WHERE user_id = ? AND claimed_at IS NOT NULL
         ORDER BY claimed_at DESC, rowid DESC LIMIT ?`,
        userId,
        RECENT_CLAIMED_JOBS,
      )
      .toArray();
    const creatures = this.sql
      .exec<{ id: string }>(
        'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
    const xps = new Map(
      this.sql
        .exec<{ creature_id: string; xp: number }>(
          'SELECT creature_id, xp FROM crafting_skill WHERE user_id = ?',
          userId,
        )
        .toArray()
        .map((r) => [r.creature_id, r.xp]),
    );
    return {
      serverNow: now,
      balances: getBalances(this.sql, userId),
      inventory: {
        cap: RULES.gear.inventoryCap,
        used: rows.length,
        reserved: open.filter((j) => j.kind === 'craft').length,
      },
      items: rows.flatMap((row) => viewOrSkip('item', () => itemView(this.sql, row))),
      slotOpens: { ...RULES.gear.slotUnlockLevel },
      parts: getParts(this.sql, userId),
      blueprints: knownBlueprints(this.sql, userId).flatMap((b) =>
        viewOrSkip('blueprint', () => ({ ...b, needsCraftingLevel: craftLevelNeeded(b.baseId) })),
      ),
      jobs: [...open, ...claimed].flatMap((row) => viewOrSkip('job', () => jobView(row, now))),
      slots: { total: RULES.gear.workshopSlots, used: open.length },
      skills: creatures.map((c) => {
        const xp = xps.get(c.id) ?? 0;
        const level = skillLevel(xp);
        return { creatureId: c.id, xp, level, nextLevelXp: nextSkillXp(level) };
      }),
      grants: recentGrants(this.sql, userId, RECENT_GRANTS),
      notice: pendingNotice(this.sql, userId),
    };
  }

  /** True while the player's old gear is waiting for its conversion (it failed on start; see `convertPendingGear`). */
  conversionPending(userId: string): boolean {
    return conversionPending(this.sql, userId);
  }

  /** Dismisses the one-time conversion card. Repeats change nothing. */
  dismissNotice(userId: string): void {
    dismissNotice(this.sql, userId, this.deps.now());
  }

  // --- The welcome kit ---

  /**
   * Gives the player their welcome kit on their first gear load: a Common Hat (item level 1), a
   * blueprint and scrap. Once per player; later calls change nothing and draw nothing. A player who
   * was converted from the first gear model has had their kit already (their grant row stands).
   */
  ensureWelcome(userId: string): void {
    const done = this.sql
      .exec("SELECT 1 FROM gear_grants WHERE user_id = ? AND key = 'welcome'", userId)
      .toArray();
    if (done.length > 0) return;
    this.deps.storage.transactionSync(() =>
      grantWelcomeKit(
        {
          storage: this.deps.storage,
          now: this.deps.now,
          rng: this.deps.rng,
          analytics: this.deps.analytics,
        },
        userId,
      ),
    );
  }

  // --- Equip ---

  private recordEquip(
    row: GearRow,
    species: string,
    action: 'equip' | 'unequip',
    swap: boolean,
    userId: string,
  ): void {
    this.deps.analytics?.record(
      {
        kind: 'gear_equip',
        base: row.base_id,
        rarity: row.rarity,
        level: row.item_level,
        slot: row.slot,
        species,
        action,
        swap,
      },
      userId,
    );
  }

  /**
   * Puts an item on a creature, or takes it off with `creatureId` null. One item per slot per
   * creature: the item that was in the slot goes back to the inventory (a swap). An item that was on
   * another creature leaves it. The wear rule is checked on the server: the slot must be open, the
   * item's level not above the creature's, a role-locked Charm on its role. Putting an item where it
   * already is changes nothing and logs nothing.
   */
  equip(
    userId: string,
    gearId: string,
    creatureId: string | null,
  ): Outcome<{ item: GearItemView; unequipped: GearItemView | null }> {
    return this.atomically(() => {
      const row = ownedItem(this.sql, userId, gearId);
      const creature = creatureId === null ? null : ownedCreature(this.sql, userId, creatureId);
      // Trip and Workshop lines are read when a trip or job is claimed, so what a creature wears is
      // frozen while it is away or on a job: neither the new wearer nor the one losing the item may be busy.
      if (creature !== null && row.equipped_on !== creature.id) assertNotBusy(this.sql, creature);
      if (row.equipped_on !== null && row.equipped_on !== creature?.id) {
        assertNotBusy(this.sql, ownedCreature(this.sql, userId, row.equipped_on));
      }
      let displaced: GearRow | undefined;
      if (creature === null) {
        if (row.equipped_on !== null) {
          const was = this.sql
            .exec<{ species: string }>(
              'SELECT species FROM creatures WHERE id = ?',
              row.equipped_on,
            )
            .toArray()[0];
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', row.id);
          this.recordEquip(row, was?.species ?? '', 'unequip', false, userId);
        }
      } else if (row.equipped_on !== creature.id) {
        const block = wearBlock(rowToItem(row), {
          level: creature.level,
          role: speciesOf(creature.species).role,
        });
        if (block !== null) throw wearError(block);
        displaced = this.sql
          .exec<GearRow>(
            'SELECT * FROM gear_items WHERE equipped_on = ? AND slot = ?',
            creature.id,
            row.slot,
          )
          .toArray()[0];
        // Clear first: (equipped_on, slot) is unique, so a creature can never wear two items of a slot.
        if (displaced !== undefined) {
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', displaced.id);
        }
        this.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creature.id, row.id);
        this.recordEquip(row, creature.species, 'equip', displaced !== undefined, userId);
      }
      const fresh = ownedItem(this.sql, userId, gearId);
      return {
        item: itemView(this.sql, fresh),
        unequipped:
          displaced === undefined
            ? null
            : itemView(this.sql, ownedItem(this.sql, userId, displaced.id)),
      };
    });
  }

  /**
   * "Equip best" for one creature or a team: the server picks, for every slot of every given creature,
   * the best item it may wear from the bag and from what the given creatures wear now (never from other
   * creatures), by `itemScore` (see `docs/design/decisions.md`: a deterministic score, not a fight). A
   * slot changes only for a better item. Returns what changed.
   */
  equipBest(userId: string, creatureIds: readonly string[]): Outcome<EquipBestResult> {
    return this.atomically(() => {
      const requested = [...new Set(creatureIds)];
      if (requested.length === 0 || requested.length > EQUIP_BEST_MAX_CREATURES) {
        throw new GameError(400, 'invalid_body');
      }
      // A creature that is away or on a job keeps what it wears (see `equip`): it is skipped, and
      // its items stay out of the plan.
      const skipped: EquipBestResult['skipped'] = [];
      const creatures = requested.flatMap((id) => {
        const creature = ownedCreature(this.sql, userId, id);
        const busy = busyReason(this.sql, creature);
        if (busy !== null) {
          skipped.push({
            creatureId: id,
            reason: busy.message === 'creature_away' ? 'away' : 'job',
          });
          return [];
        }
        return [creature];
      });
      const unique = creatures.map((c) => c.id);
      const rows = ownedItems(this.sql, userId);
      const planned = new Set(unique);
      const candidates = rows.filter((r) => r.equipped_on === null || planned.has(r.equipped_on));
      const worn = new Map<string, Partial<Record<GearSlot, string>>>();
      for (const r of rows) {
        if (r.equipped_on === null || !planned.has(r.equipped_on)) continue;
        worn.set(r.equipped_on, { ...worn.get(r.equipped_on), [r.slot]: r.id });
      }
      const moves = planEquipBest(
        creatures.map((c) => {
          const species = speciesOf(c.species);
          return {
            id: c.id,
            level: c.level,
            role: species.role,
            element: species.element,
            stats: effectiveStats(species, c.level, c.fusion_count),
            worn: worn.get(c.id) ?? {},
          };
        }),
        candidates.map((r) => ({ id: r.id, item: rowToItem(r) })),
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      const speciesOfCreature = new Map(creatures.map((c) => [c.id, c.species]));
      // Take everything that moves off first, so swaps between creatures never meet the unique index.
      for (const move of moves) {
        const old = worn.get(move.creatureId)?.[move.slot];
        if (old !== undefined)
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', old);
        if (move.itemId !== null) {
          this.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', move.itemId);
        }
      }
      const changes: { creatureId: string; slot: GearSlot; itemId: string }[] = [];
      for (const move of moves) {
        if (move.itemId === null) continue;
        this.sql.exec(
          'UPDATE gear_items SET equipped_on = ? WHERE id = ?',
          move.creatureId,
          move.itemId,
        );
        changes.push({ creatureId: move.creatureId, slot: move.slot, itemId: move.itemId });
        const row = byId.get(move.itemId);
        if (row !== undefined) {
          this.recordEquip(
            row,
            speciesOfCreature.get(move.creatureId) ?? '',
            'equip',
            worn.get(move.creatureId)?.[move.slot] !== undefined,
            userId,
          );
        }
      }
      return { changes, skipped };
    });
  }

  // --- Workshop jobs (see `workshop.ts`; each opens its own transaction) ---

  previewCraft(userId: string, creatureId: string, blueprintId: string): Outcome<CraftPreview> {
    return this.workshop.previewCraft(userId, creatureId, blueprintId);
  }

  previewDismantle(
    userId: string,
    creatureId: string,
    itemIds: readonly string[],
  ): Outcome<DismantlePreview> {
    return this.workshop.previewDismantle(userId, creatureId, itemIds);
  }

  startJob(userId: string, input: StartJobInput): Outcome<{ jobId: string }> {
    return this.workshop.startJob(userId, input);
  }

  claimJob(userId: string, jobId: string, idempotencyKey: string): Outcome<JobResult> {
    return this.workshop.claimJob(userId, jobId, idempotencyKey);
  }
}
