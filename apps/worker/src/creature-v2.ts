/**
 * What a creature has under combat v2 (docs/design/combat/integration.md, sections 1 and 2): its saved Knack
 * (R11) and its v2 talents, learned from its line's Talent Book (R20). Built only when the `COMBAT_V2` flag is
 * on; with it off no route reaches this, `/api/state` carries none of it and nothing here is read.
 *
 * - **The saved Knack** (`creatures.knack`, null is none). A creature knows the Knacks of its form and line
 *   (`knownKnacks`, worked out, never stored); saving checks it is one of them. An evolution that drops the
 *   saved Knack (a role change keeps only the new form's) sets it to none in the same transaction.
 * - **The Talent Book.** Every talent found goes into its line's book (`line_talents`). Learning one for a
 *   creature costs Bait once (`RULES.talents.bookSlotBait`, today's price); slotting and unslotting among
 *   the talents a creature has learned is free, and slots open with level as they do today.
 *
 * Everything is synchronous inside `atomically`; the user is always the verified session's. Learning carries
 * the client's idempotency key (CLAUDE.md spending rules): the balance check, the debit and the learning are
 * one transaction, and a retry returns the stored result and charges nothing.
 */
import { RULES, slotCount, slotOpensAt, slotsOpen, type CreatureSpecies } from '@creatures/game';
import { combatV2, knownKnacks, v2TalentWorksFor } from '@creatures/game/combat-v2';
import type { Analytics } from './analytics';
import { fightNumbers } from './fighter-v2';
import type { WornBySlot } from './gear-store';
import { keyTaken, settleSpend } from './keyed-action';
import { lookupSpend, spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import { hasFoughtThisWeekend } from './raid-v2-core';
import { fighterOf, gearLinesOf } from './raid-v2-fighters';
import { speciesOf } from './species';
import {
  booksByLine,
  learnTalent,
  learnedByCreature,
  learnedOf,
  lineBook,
  setTalentSlot,
  type BookEntry,
  type LearnedTalent,
} from './talent-v2-store';

/**
 * Whether a creature's Knack may not change now because it has fought this weekend (R11: a Knack locks for a creature once it has
 * fought this weekend): it is in the carry of the latest v2 raid week (`hasFoughtThisWeekend`). Free before the weekend's first stage
 * and again when the next week opens.
 */
export function knackLocked(sql: SqlStorage, creatureId: string): boolean {
  return hasFoughtThisWeekend(sql, creatureId);
}

/**
 * Whether a creature's talent slots may not change now ("free until the raid locks", R20): the same lock as the Knack's, from the stage
 * the creature fights in.
 */
export function talentsLocked(sql: SqlStorage, creatureId: string): boolean {
  return hasFoughtThisWeekend(sql, creatureId);
}

/** A Knack as the client reads it: its name, the family and the plain text (keywords in braces). */
export interface KnackView {
  id: string;
  name: string;
  family: string;
  text: string;
}

/** A v2 talent as the client reads it. `golden` is shown as a badge; the text is the normal one. */
export interface TalentV2View {
  id: string;
  name: string;
  text: string;
  golden: boolean;
  /** True when it does nothing for this creature's role (shown as idle). */
  idle: boolean;
}

export interface TalentV2SlotView {
  slot: number;
  /** The creature level the slot opens at. */
  opensAt: number;
  open: boolean;
  talent: TalentV2View | null;
}

/** A creature's v2 talents: its slots and its line's whole book, with what it has learned. */
export interface CreatureTalentsV2View {
  slots: TalentV2SlotView[];
  /** The line's Talent Book (shared by every creature of the line). */
  book: (TalentV2View & { learned: boolean; slot: number | null })[];
  /** What learning a talent from the book costs, once per creature. */
  learnBait: number;
}

/**
 * A creature's fight numbers as combat v2 reads them (R7.1): its form's stats at its level, with its saved Knack, the
 * talents in its open slots and the stat lines of its worn gear (`fightNumbers` of its fighter). `critChanceBp` is the chance a hit crits and `critMultBp` what a
 * crit multiplies it by (10000 is 1x), both with the base crit of the rules in. For the creature page.
 */
export interface StatsV2View {
  hp: number;
  atk: number;
  spd: number;
  armour: number;
  critChanceBp: number;
  critMultBp: number;
}

/** What `/api/state` adds to a creature while the flag is on. */
export interface CreatureV2View {
  /** The saved Knack (an id), or null for none. */
  knack: string | null;
  /** The Knacks it knows, in order. */
  knownKnacks: KnackView[];
  talentsV2: CreatureTalentsV2View;
  statsV2: StatsV2View;
}

/** What the views of one player's creatures read, loaded once (two queries). */
export interface PlayerV2 {
  books: Map<string, BookEntry[]>;
  learned: Map<string, LearnedTalent[]>;
}

export interface LearnResult {
  creatureId: string;
  talentId: string;
}

export interface SlotResult {
  creatureId: string;
  talentId: string;
  slot: number | null;
}

export interface KnackResult {
  creatureId: string;
  knack: string | null;
}

export interface CreatureV2Deps {
  storage: LedgerStorage;
  now: () => number;
  analytics?: Analytics | undefined;
}

type OwnedRow = { id: string; line: string; species: string; level: number; knack: string | null };

const knackView = (id: string): KnackView | null => {
  const def = combatV2.knacks[id];
  return def === undefined
    ? null
    : { id: def.id, name: def.name, family: def.family, text: def.text };
};

/** The Knacks a form knows, as the client reads them (ids the content no longer holds are left out). */
export function knownKnackViews(formId: string): KnackView[] {
  return knownKnacks(formId).flatMap((id) => {
    const view = knackView(id);
    return view === null ? [] : [view];
  });
}

/** The saved Knack a creature keeps after growing into `toSpecies`: the same one if it is still known, else none. */
export function knackAfterEvolution(saved: string | null, toSpecies: string): string | null {
  return saved !== null && knownKnacks(toSpecies).includes(saved) ? saved : null;
}

/** What the page's numbers are worked out from: the creature as the fight would take it. */
export interface StatsV2Source {
  species: CreatureSpecies;
  level: number;
  fusionCount: number;
  /** The saved Knack as stored (one the form no longer knows counts as none). */
  knack: string | null;
  /** The talents in its open slots, in slot order (ids). */
  talents: readonly string[];
  worn: WornBySlot | undefined;
}

/**
 * The numbers the page shows for a creature: the fighter's own, from the same function the raid and the dungeon build their fighters
 * with (`buildFighter` in `fighter-v2.ts`, over the raid's `gearLinesOf`), read as the fight reads them (`fightNumbers`). The page
 * can never disagree with the fight.
 */
export function statsV2Of(c: StatsV2Source): StatsV2View {
  const fighter = fighterOf(
    {
      id: 'page',
      userId: '',
      species: c.species.id,
      level: c.level,
      knack: c.knack,
      talents: [...c.talents],
      gear: gearLinesOf(c.species, c.level, c.fusionCount, c.worn),
    },
    'page',
    { row: 0, col: 0 },
  );
  return fightNumbers(fighter);
}

export class CreatureV2 {
  constructor(private readonly deps: CreatureV2Deps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  // --- Reads ---

  /** One player's books and learned talents: two queries, whatever the number of creatures. */
  load(userId: string): PlayerV2 {
    return { books: booksByLine(this.sql, userId), learned: learnedByCreature(this.sql, userId) };
  }

  /** The v2 part of a creature's view. */
  view(
    row: {
      id: string;
      species: string;
      level: number;
      fusion_count: number;
      knack: string | null;
    },
    data: PlayerV2,
    worn?: WornBySlot,
  ): CreatureV2View {
    const species = speciesOf(row.species);
    const known = knownKnackViews(row.species);
    const learned = data.learned.get(row.id) ?? [];
    // The line's book in the order of its pool (a stable order for the screen, whatever the order of the finds).
    const poolOrder = combatV2.pools[species.line] ?? [];
    const book = [...(data.books.get(species.line) ?? [])].sort(
      (a, b) => poolOrder.indexOf(a.talentId) - poolOrder.indexOf(b.talentId),
    );
    const open = slotsOpen(species.rarity, row.level);
    const talentOf = (entry: BookEntry): TalentV2View | null => {
      const def = combatV2.talents[entry.talentId];
      if (def === undefined) return null;
      return {
        id: def.id,
        name: def.name,
        text: def.text,
        golden: entry.golden,
        idle: !v2TalentWorksFor(def.id, species.role),
      };
    };
    const slots: TalentV2SlotView[] = [];
    for (let slot = 1; slot <= slotCount(species.rarity); slot++) {
      const holding = learned.find((l) => l.slot === slot);
      const entry =
        holding === undefined ? undefined : book.find((b) => b.talentId === holding.talentId);
      slots.push({
        slot,
        opensAt: slotOpensAt(species.rarity, slot) ?? 0,
        open: slot <= open,
        talent: entry === undefined || slot > open ? null : talentOf(entry),
      });
    }
    const bookView: CreatureTalentsV2View['book'] = [];
    for (const entry of book) {
      const view = talentOf(entry);
      if (view === null) continue;
      const have = learned.find((l) => l.talentId === entry.talentId);
      bookView.push({ ...view, learned: have !== undefined, slot: have?.slot ?? null });
    }
    return {
      // A saved Knack the form no longer knows (content changed) reads as none.
      knack: row.knack !== null && known.some((k) => k.id === row.knack) ? row.knack : null,
      knownKnacks: known,
      talentsV2: { slots, book: bookView, learnBait: RULES.talents.bookSlotBait },
      statsV2: statsV2Of({
        species,
        level: row.level,
        fusionCount: row.fusion_count,
        knack: row.knack,
        talents: slots.flatMap((s) => (s.talent === null ? [] : [s.talent.id])),
        worn,
      }),
    };
  }

  private owned(userId: string, creatureId: string): OwnedRow {
    const row = this.sql
      .exec<OwnedRow>(
        'SELECT id, line, species, level, knack FROM creatures WHERE id = ? AND user_id = ?',
        creatureId,
        userId,
      )
      .toArray()[0];
    // The same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  // --- The saved Knack ---

  /**
   * Saves a creature's Knack (null: none). The Knack must be one it knows; the creature must not have
   * fought this weekend (`knackLocked`). Setting what is already saved changes and logs nothing, so a retry
   * is harmless. `where` says which screen it was saved from.
   */
  setKnack(
    userId: string,
    creatureId: string,
    knack: string | null,
    where: 'page' | 'raid',
  ): Outcome<KnackResult> {
    return atomically(this.deps.storage, () => {
      const row = this.owned(userId, creatureId);
      if (knack !== null && !knownKnacks(row.species).includes(knack)) {
        throw new GameError(409, 'knack_not_known');
      }
      if (knackLocked(this.sql, row.id)) throw new GameError(409, 'locked');
      // What the creature has now, as a player sees it: a Knack its form no longer knows counts as none.
      const previous =
        row.knack !== null && knownKnacks(row.species).includes(row.knack) ? row.knack : null;
      if (previous === knack && row.knack === knack) return { creatureId: row.id, knack };
      this.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', knack, row.id);
      if (previous !== knack) {
        this.deps.analytics?.record(
          { kind: 'knack_set', form: row.species, knack, previous, where },
          userId,
        );
      }
      return { creatureId: row.id, knack };
    });
  }

  // --- The Talent Book ---

  /**
   * A creature learns a talent from its line's book for `RULES.talents.bookSlotBait` Bait, once. It is
   * learned, not slotted. Idempotent per key: a retry returns the stored result and charges nothing.
   */
  learn(
    userId: string,
    creatureId: string,
    talentId: string,
    idempotencyKey: string,
  ): Outcome<LearnResult> {
    return atomically(this.deps.storage, () => {
      const prior = lookupSpend(this.sql, userId, idempotencyKey);
      if (prior === null && keyTaken(this.sql, userId, idempotencyKey, ['gear_actions'])) {
        throw new GameError(409, 'key_conflict');
      }
      if (prior === null) this.checkLearning(userId, creatureId, talentId);
      const spent = spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount: RULES.talents.bookSlotBait,
          purpose: 'talent_learn',
          idempotencyKey,
          apply: () => {
            const row = this.owned(userId, creatureId);
            if (!learnTalent(this.sql, row.id, talentId, this.deps.now())) {
              throw new GameError(409, 'already_learned');
            }
            this.deps.analytics?.record(
              { kind: 'talent_learn', line: row.line, talent: talentId },
              userId,
            );
            return { creatureId: row.id, talentId } satisfies LearnResult;
          },
        },
        this.deps.now(),
      );
      return settleSpend(
        spent,
        (stored) =>
          prior?.purpose === 'talent_learn' &&
          typeof stored === 'object' &&
          stored !== null &&
          (stored as { creatureId?: unknown }).creatureId === creatureId &&
          (stored as { talentId?: unknown }).talentId === talentId,
      );
    });
  }

  /** The checks before a learning is paid for: whose creature, whether the book holds it, whether it is learned. */
  private checkLearning(userId: string, creatureId: string, talentId: string): void {
    const row = this.owned(userId, creatureId);
    if (!lineBook(this.sql, userId, row.line).some((e) => e.talentId === talentId)) {
      throw new GameError(404, 'not_in_book');
    }
    if (learnedOf(this.sql, row.id).some((l) => l.talentId === talentId)) {
      throw new GameError(409, 'already_learned');
    }
    if (talentsLocked(this.sql, row.id)) throw new GameError(409, 'locked');
  }

  /**
   * Puts a talent the creature has learned in one of its open slots, or takes it out of its slot (`slot`
   * null). Free. Whatever sat in the slot stays learned. Setting the state it is already in is a no-op.
   */
  slot(
    userId: string,
    creatureId: string,
    talentId: string,
    slot: number | null,
  ): Outcome<SlotResult> {
    return atomically(this.deps.storage, () => {
      const row = this.owned(userId, creatureId);
      const have = learnedOf(this.sql, row.id).find((l) => l.talentId === talentId);
      if (have === undefined) throw new GameError(404, 'not_learned');
      if (slot !== null) {
        const opens = slotOpensAt(speciesOf(row.species).rarity, slot);
        if (opens === null) throw new GameError(409, 'slot_closed', 'no_such_slot');
        if (row.level < opens)
          throw new GameError(409, 'slot_closed', `needs_level_${String(opens)}`);
      }
      if (have.slot === slot) return { creatureId: row.id, talentId, slot };
      if (talentsLocked(this.sql, row.id)) throw new GameError(409, 'locked');
      setTalentSlot(this.sql, row.id, talentId, slot);
      return { creatureId: row.id, talentId, slot };
    });
  }
}
