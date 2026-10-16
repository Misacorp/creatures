/**
 * The shapes the server sends for talents and the duplicate choice (`apps/worker/src/talent-view.ts`,
 * `catch-choices.ts` and `collection-routes.ts`). Types only: the parsing is in `talent-parse.ts` and the
 * fixtures `creatures-*.json` in `fixtures/` are real server output (the Worker's
 * `creatures-fixtures.test.ts` fails when the server stops sending these shapes).
 *
 * Every number, name and sentence about a talent comes from the server, worked out from the content: the
 * client only draws it, as text.
 */
import type { PartKind } from './gear-types';

/** A talent as the server shows it: its name, its effect in one phrase and one plain sentence. */
export interface TalentView {
  id: string;
  name: string;
  golden: boolean;
  /** "First pounce +14%". */
  text: string;
  /** What the effect does, in one plain sentence. */
  about: string;
  /** True when it does nothing for the creature that holds it (a Guard's cover on a Setter). */
  idle: boolean;
}

/** One talent slot of a creature: open at its level or not, and what is in it. */
export interface TalentSlotView {
  slot: number;
  /** The creature level the slot opens at. */
  opensAt: number;
  open: boolean;
  talent: TalentView | null;
}

/** A creature's talents: its slots, its signature talent (epic species) and its whole Talent Book. */
export interface CreatureTalents {
  slots: TalentSlotView[];
  signature: TalentView | null;
  /** Every talent the creature has held, with the slot it sits in now (null: only in the book). */
  book: (TalentView & { slot: number | null })[];
}

export type DuplicateChoice = 'teach' | 'fuse' | 'release' | 'keep';

/** What Recommended is: the choice and, for Teach and Fuse, the creature (and for Teach the slot). */
export interface Recommendation {
  choice: DuplicateChoice;
  creatureId?: string;
  slot?: number;
}

/** A duplicate waiting for a choice. */
export interface PendingCatch {
  id: string;
  species: string;
  line: string;
  shiny: boolean;
  source: 'expedition' | 'festival';
  createdAt: number;
  talent: TalentView;
  /** Which buttons are offered, and the creatures Teach and Fuse can go to. */
  offered: { teach: string[]; fuse: string[]; release: boolean; keep: boolean };
  /** What Release would pay (parts, never Bait). */
  releases: Partial<Record<PartKind, number>>;
  recommended: Recommendation;
}

/** The body of POST /api/catches/:id/choose, without its idempotency key. */
export type ChoiceRequest =
  | { choice: 'teach'; creatureId: string; slot: number }
  | { choice: 'fuse'; creatureId: string }
  | { choice: 'release' }
  | { choice: 'keep' }
  | { choice: 'recommended' };

/** What a settled duplicate did (the server returns it, and a retry returns it again). */
export interface ChoiceResult {
  choice: DuplicateChoice;
  /** The server settled it (a full queue, or "apply Recommended to all"). */
  auto: boolean;
  pendingId: string;
  species: string;
  creatureId?: string;
  slot?: number;
  talent: { talentId: string; golden: boolean };
  fusionCount?: number;
  parts?: Partial<Record<PartKind, number>>;
}

/** What slotting a talent from the Talent Book did. */
export interface SlotResult {
  creatureId: string;
  talentId: string;
  golden: boolean;
  slot: number;
}
