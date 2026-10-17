/**
 * The duplicate choice (docs/design/gear-and-creatures-v2.md section 8.2) and the Talent Book. A catch
 * of a line the player owns arrives as a pending card with the talent it rolled at the claim; the player
 * answers **Teach** (its talent into a slot of their creature of that line), **Fuse** (one fusion
 * step), **Release** (parts, never Bait) or **Keep** (a second creature, only for a line with a branch
 * they do not own). Up to `RULES.talents.maxPending` cards wait; the next one settles the oldest with
 * Recommended. Slotting a talent from a creature's book costs Bait and is instant.
 *
 * Everything here is synchronous and runs inside `transactionSync` (the claim, or `atomically` for a
 * player's answer). The user is always an argument from the verified session. Every answer carries the
 * client's idempotency key: a retry returns the stored result and changes nothing, and a pending card
 * that is already settled answers `not_found` to any other key, so nothing is ever applied twice.
 *
 * Randomness: the talent of a duplicate is rolled when it is caught (`addPending`), with live
 * randomness; nothing is drawn when the player answers.
 */
import {
  RULES,
  canTeach,
  effectiveStats,
  fuseOnce,
  keepOffered,
  recommend,
  releaseParts,
  rollTalent,
  slotOpensAt,
  slotsOf,
  slotsOpen,
  type DuplicateChoice,
  lineBranches,
  content,
  type LineCreature,
  type PartsBundle,
  type Recommendation,
  type Rng,
  type TalentRoll,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { creditParts } from './gear-store';
import { keyTaken, runKeyed, settleSpend } from './keyed-action';
import { lookupSpend, spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import { speciesOf } from './species';
import { bookOf, holdTalent, insertCreature, slotTalent, type CreatureRngs } from './talent-store';
import { talentViewOf, type TalentView } from './talent-view';

export interface CatchChoicesDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for the talent of a duplicate, and the quirk of a Kept creature. */
  rngs: { talent: Rng; quirk: Rng };
  analytics?: Analytics | undefined;
  /**
   * The species a line can end as (its branches). Default: the shipped content. Tests inject lines with
   * two branches, since no shipped line has one yet.
   */
  branchesOf?: ((line: string) => readonly string[]) | undefined;
}

type PendingRow = {
  id: string;
  user_id: string;
  line: string;
  species: string;
  shiny: number;
  talent_id: string;
  golden: number;
  source: 'expedition' | 'festival';
  source_id: string;
  created_at: number;
};

type CreatureRow = {
  id: string;
  species: string;
  level: number;
  fusion_count: number;
  line_slot: number;
};

/** What the client shows for a waiting duplicate. */
export interface PendingView {
  id: string;
  species: string;
  line: string;
  shiny: boolean;
  /** Where it came from: an expedition or a Festival win. */
  source: 'expedition' | 'festival';
  createdAt: number;
  /** The talent it rolled (the card shows it first). */
  talent: TalentView;
  /** Which of the four buttons are offered, and for Teach and Fuse the creatures they can go to. */
  offered: { teach: string[]; fuse: string[]; release: boolean; keep: boolean };
  /** What Release would pay. */
  releases: PartsBundle;
  /** The choice the card marks Recommended. */
  recommended: Recommendation;
}

/** What a settled choice did, as stored and returned (a retry returns it again). */
export interface ChoiceResult {
  choice: DuplicateChoice;
  /** True when the server settled it (the queue was full, or "apply Recommended to all"). */
  auto: boolean;
  pendingId: string;
  species: string;
  /** Teach and Fuse: the creature that got it. Keep: the new creature. */
  creatureId?: string;
  /** Teach: the slot. */
  slot?: number;
  talent: TalentRoll;
  /** Fuse: the creature's fusion count now. */
  fusionCount?: number;
  /** Release: the parts it paid. */
  parts?: PartsBundle;
}

export interface SlotResult {
  creatureId: string;
  talentId: string;
  golden: boolean;
  slot: number;
}

export type ChoiceInput =
  | { choice: 'teach'; creatureId: string; slot: number }
  | { choice: 'fuse'; creatureId: string }
  | { choice: 'release' }
  | { choice: 'keep' }
  | { choice: 'recommended' };

export class CatchChoices {
  constructor(private readonly deps: CatchChoicesDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private creatureRngs(): CreatureRngs {
    return this.deps.rngs;
  }

  // --- Reads ---

  private pendingRows(userId: string): PendingRow[] {
    return this.sql
      .exec<PendingRow>(
        'SELECT * FROM pending_catches WHERE user_id = ? ORDER BY created_at, rowid',
        userId,
      )
      .toArray();
  }

  private lineRows(userId: string, line: string): CreatureRow[] {
    return this.sql
      .exec<CreatureRow>(
        `SELECT id, species, level, fusion_count, line_slot FROM creatures
         WHERE user_id = ? AND line = ? ORDER BY line_slot, caught_at, rowid`,
        userId,
        line,
      )
      .toArray();
  }

  /** The creatures of a line as the choice sees them. */
  private lineCreatures(userId: string, line: string): LineCreature[] {
    return this.lineRows(userId, line).map((row) => {
      const species = speciesOf(row.species);
      const book = bookOf(this.sql, row.id);
      return {
        id: row.id,
        speciesId: row.species,
        level: row.level,
        fusionCount: row.fusion_count,
        rarity: species.rarity,
        role: species.role,
        element: species.element,
        stats: effectiveStats(species, row.level, row.fusion_count),
        slots: slotsOf(species.rarity, row.level, book),
        book: book.map((b) => ({ talentId: b.talentId, golden: b.golden })),
      };
    });
  }

  private roll(row: PendingRow): TalentRoll {
    return { talentId: row.talent_id, golden: row.golden === 1 };
  }

  private offered(userId: string, row: PendingRow): { creatures: LineCreature[]; keep: boolean } {
    const creatures = this.lineCreatures(userId, row.line);
    return {
      creatures,
      keep: keepOffered(
        (this.deps.branchesOf ?? ((line: string) => lineBranches(content, line)))(row.line),
        creatures.map((c) => c.speciesId),
      ),
    };
  }

  private view(userId: string, row: PendingRow): PendingView | null {
    const species = speciesOf(row.species);
    const roll = this.roll(row);
    const talent = talentViewOf(roll, { role: species.role, element: species.element });
    if (talent === null) return null;
    const { creatures, keep } = this.offered(userId, row);
    return {
      id: row.id,
      species: row.species,
      line: row.line,
      shiny: row.shiny === 1,
      source: row.source,
      createdAt: row.created_at,
      talent,
      offered: {
        teach: creatures.filter((c) => canTeach(c, roll)).map((c) => c.id),
        fuse: creatures.filter((c) => fuseOnce(c.fusionCount) !== null).map((c) => c.id),
        release: true,
        keep,
      },
      releases: releaseParts(species.rarity, species.element),
      recommended: recommend(roll, creatures, keep),
    };
  }

  /** The duplicates waiting for a choice, oldest first. */
  pending(userId: string): PendingView[] {
    return this.pendingRows(userId).flatMap((row) => {
      const view = this.view(userId, row);
      return view === null ? [] : [view];
    });
  }

  // --- A duplicate arrives ---

  /**
   * Stores a duplicate as a pending card with the talent it rolls now (live randomness). When this is
   * the 11th card, the oldest is settled with Recommended first, so the queue never holds more than
   * `RULES.talents.maxPending`. Returns the card's id and the talent, and what was auto-settled.
   */
  addPending(
    userId: string,
    caught: { species: string; shiny: boolean },
    source: { kind: 'expedition' | 'festival'; id: string },
  ): { id: string; talent: TalentRoll; settled: ChoiceResult | null } {
    const species = speciesOf(caught.species);
    const now = this.deps.now();
    const id = crypto.randomUUID();
    const talent = rollTalent(this.deps.rngs.talent, species.line);
    this.sql.exec(
      `INSERT INTO pending_catches (id, user_id, line, species, shiny, talent_id, golden, source, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      species.line,
      species.id,
      caught.shiny ? 1 : 0,
      talent.talentId,
      talent.golden ? 1 : 0,
      source.kind,
      source.id,
      now,
    );
    this.deps.analytics?.record(
      { kind: 'talent_roll', species: species.id, talent: talent.talentId, golden: talent.golden },
      userId,
    );
    let settled: ChoiceResult | null = null;
    const rows = this.pendingRows(userId);
    if (rows.length > RULES.talents.maxPending) {
      const oldest = rows[0];
      if (oldest !== undefined)
        settled = this.settle(userId, oldest, { choice: 'recommended' }, true);
    }
    return { id, talent, settled };
  }

  // --- The player answers ---

  /**
   * Settles one pending card. `recommended` takes the card's Recommended choice. Idempotent per key
   * (a retry returns the stored result); a card that is already settled is `not_found` for any other key.
   */
  choose(
    userId: string,
    pendingId: string,
    input: ChoiceInput,
    idempotencyKey: string,
  ): Outcome<ChoiceResult> {
    const fingerprint = JSON.stringify([
      pendingId,
      input.choice,
      'creatureId' in input ? input.creatureId : null,
      'slot' in input ? input.slot : null,
    ]);
    return atomically(this.deps.storage, () =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'catch_choice', fingerprint },
        () => {
          const row = this.sql
            .exec<PendingRow>(
              'SELECT * FROM pending_catches WHERE id = ? AND user_id = ?',
              pendingId,
              userId,
            )
            .toArray()[0];
          // The same answer for "does not exist", "belongs to someone else" and "already settled".
          if (row === undefined) throw new GameError(404, 'not_found');
          return this.settle(userId, row, input, false);
        },
      ),
    );
  }

  /** Settles every waiting card with its Recommended choice, oldest first ("apply Recommended to all"). */
  chooseAllRecommended(
    userId: string,
    idempotencyKey: string,
  ): Outcome<{ results: ChoiceResult[] }> {
    return atomically(this.deps.storage, () =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'catch_choice_all', fingerprint: 'all' },
        () => {
          const results: ChoiceResult[] = [];
          for (const row of this.pendingRows(userId)) {
            results.push(this.settle(userId, row, { choice: 'recommended' }, true));
          }
          return { results };
        },
      ),
    );
  }

  /**
   * Applies a choice to a card and deletes the card. Throws a `GameError` (rolling everything back) when
   * the choice is not offered. `auto` is true when the server decides (a full queue, or "all").
   */
  private settle(userId: string, row: PendingRow, input: ChoiceInput, auto: boolean): ChoiceResult {
    const species = speciesOf(row.species);
    const roll = this.roll(row);
    const { creatures, keep } = this.offered(userId, row);
    let choice: ChoiceInput = input;
    if (input.choice === 'recommended') {
      const rec = recommend(roll, creatures, keep);
      choice =
        rec.choice === 'teach' && rec.creatureId !== undefined && rec.slot !== undefined
          ? { choice: 'teach', creatureId: rec.creatureId, slot: rec.slot }
          : rec.choice === 'fuse' && rec.creatureId !== undefined
            ? { choice: 'fuse', creatureId: rec.creatureId }
            : { choice: rec.choice === 'keep' ? 'keep' : 'release' };
    }
    const base = { auto, pendingId: row.id, species: row.species, talent: roll };
    const now = this.deps.now();
    let result: ChoiceResult;
    switch (choice.choice) {
      case 'teach': {
        const target = this.lineCreature(creatures, choice.creatureId);
        if (!canTeach(target, roll)) {
          throw new GameError(409, 'teach_not_offered');
        }
        const open = slotsOpen(target.rarity, target.level);
        if (choice.slot < 1 || choice.slot > open) {
          const opens = slotOpensAt(target.rarity, choice.slot);
          throw new GameError(
            409,
            'slot_closed',
            opens === null ? 'no_such_slot' : `needs_level_${String(opens)}`,
          );
        }
        // The talent that sat in the slot stays in the book; the new one takes the slot.
        if (!holdTalent(this.sql, target.id, roll, choice.slot, now)) {
          throw new GameError(409, 'teach_not_offered');
        }
        result = {
          ...base,
          choice: 'teach',
          creatureId: target.id,
          slot: choice.slot,
        };
        break;
      }
      case 'fuse': {
        const target = this.lineCreature(creatures, choice.creatureId);
        const next = fuseOnce(target.fusionCount);
        if (next === null) throw new GameError(409, 'max_fusions');
        this.sql.exec('UPDATE creatures SET fusion_count = ? WHERE id = ?', next, target.id);
        this.deps.analytics?.record(
          {
            kind: 'fuse',
            species: row.species,
            rarity: species.rarity,
            converted: false,
            fusionCount: next,
            bait: 0,
          },
          userId,
        );
        result = { ...base, choice: 'fuse', creatureId: target.id, fusionCount: next };
        break;
      }
      case 'release': {
        const parts = releaseParts(species.rarity, species.element);
        creditParts(this.sql, userId, parts);
        result = { ...base, choice: 'release', parts };
        break;
      }
      case 'keep': {
        if (!keep) throw new GameError(409, 'keep_not_offered');
        const taken = new Set(this.lineRows(userId, row.line).map((r) => r.line_slot));
        const lineSlot = taken.has(1) ? 2 : 1;
        if (taken.has(lineSlot)) throw new GameError(409, 'keep_not_offered');
        const made = insertCreature(
          this.sql,
          this.creatureRngs(),
          {
            userId,
            species: row.species,
            origin: row.source,
            shiny: row.shiny === 1,
            lineSlot,
            talent: roll,
            now,
          },
          this.deps.analytics,
        );
        result = { ...base, choice: 'keep', creatureId: made.id };
        break;
      }
      case 'recommended':
        // Replaced above by the card's Recommended choice.
        throw new Error('unreachable: recommended is resolved first');
    }
    this.sql.exec('DELETE FROM pending_catches WHERE id = ?', row.id);
    this.deps.analytics?.record(
      {
        kind: 'duplicate_choice',
        choice: result.choice,
        auto,
        species: row.species,
        rarity: species.rarity,
        talent: roll.talentId,
        golden: roll.golden,
      },
      userId,
    );
    return result;
  }

  private lineCreature(creatures: readonly LineCreature[], id: string): LineCreature {
    const found = creatures.find((c) => c.id === id);
    // The same answer for "not yours" and "not of this line".
    if (found === undefined) throw new GameError(404, 'not_found');
    return found;
  }

  // --- The Talent Book ---

  /**
   * Puts a talent from a creature's Talent Book into one of its open slots: `RULES.talents.bookSlotBait`
   * Bait, instant. The talent that sat in the slot stays in the book. Idempotent per key: a retry
   * returns the stored result and charges nothing.
   */
  slotFromBook(
    userId: string,
    creatureId: string,
    input: { talentId: string; golden: boolean; slot: number },
    idempotencyKey: string,
  ): Outcome<SlotResult> {
    return atomically(this.deps.storage, () => {
      const prior = lookupSpend(this.sql, userId, idempotencyKey);
      if (prior === null && keyTaken(this.sql, userId, idempotencyKey, ['gear_actions'])) {
        throw new GameError(409, 'key_conflict');
      }
      if (prior === null) this.checkSlotting(userId, creatureId, input);
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount: RULES.talents.bookSlotBait,
          purpose: 'talent_slot',
          idempotencyKey,
          apply: () => {
            if (
              !slotTalent(
                this.sql,
                creatureId,
                { talentId: input.talentId, golden: input.golden },
                input.slot,
              )
            ) {
              throw new GameError(404, 'not_in_book');
            }
            const species = speciesOf(
              this.sql
                .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', creatureId)
                .one().species,
            );
            this.deps.analytics?.record(
              {
                kind: 'talent_slot',
                species: species.id,
                talent: input.talentId,
                golden: input.golden,
                slot: input.slot,
              },
              userId,
            );
            return {
              creatureId,
              talentId: input.talentId,
              golden: input.golden,
              slot: input.slot,
            } satisfies SlotResult;
          },
        },
        this.deps.now(),
      );
      return settleSpend(
        spent,
        (stored) =>
          prior?.purpose === 'talent_slot' &&
          typeof stored === 'object' &&
          stored !== null &&
          (stored as { creatureId?: unknown }).creatureId === creatureId &&
          (stored as { talentId?: unknown }).talentId === input.talentId &&
          (stored as { golden?: unknown }).golden === input.golden &&
          (stored as { slot?: unknown }).slot === input.slot,
      );
    });
  }

  /** The checks before a book slotting is paid for: whose creature, which slot, whether the book holds it. */
  private checkSlotting(
    userId: string,
    creatureId: string,
    input: { talentId: string; golden: boolean; slot: number },
  ): void {
    const row = this.sql
      .exec<CreatureRow>(
        'SELECT id, species, level, fusion_count, line_slot FROM creatures WHERE id = ? AND user_id = ?',
        creatureId,
        userId,
      )
      .toArray()[0];
    // The same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    const species = speciesOf(row.species);
    const opens = slotOpensAt(species.rarity, input.slot);
    if (opens === null) throw new GameError(409, 'slot_closed', 'no_such_slot');
    if (row.level < opens) throw new GameError(409, 'slot_closed', `needs_level_${String(opens)}`);
    const held = bookOf(this.sql, row.id).find(
      (h) => h.talentId === input.talentId && h.golden === input.golden,
    );
    if (held === undefined) throw new GameError(404, 'not_in_book');
    if (held.slot === input.slot) throw new GameError(409, 'already_slotted');
  }
}
