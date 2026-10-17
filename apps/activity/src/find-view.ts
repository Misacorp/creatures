import type { ClaimResult, Creature } from './api';
import { catchBadgeTags, creatureName, getSpecies } from './game';
import { partName, partsEntries } from './gear-view';
import type { TripCatch } from './expedition-types';
import type { ChoiceRequest, ChoiceResult, PendingCatch, TalentView } from './talent-types';
import { choiceResultText } from './talent-view';
import type { CountItem } from './ui/CountBadge';
import { GLOSSARY_IDS } from '@creatures/game';

/**
 * A found creature as the trip result and the waiting catches draw it: its card, and for a duplicate the
 * choice as radio rows. Worked out from the server's answer (what it offers and recommends) and the
 * player's creatures (who can take it, and why not). Pure: no I/O, no randomness.
 */

/** A waiting duplicate and the row the player picked for it. */
export interface CatchPick {
  card: PendingCatch;
  request: ChoiceRequest;
}

/** What confirming picks does; the screen that owns the cards supplies it. */
export interface CatchChoiceActions {
  /** Answers each pick in turn; resolves true when every one went through (false stops at the first failure). */
  chooseMany: (picks: readonly CatchPick[]) => Promise<boolean>;
}

/** One way a duplicate can go, as a radio row. */
export interface FindOption {
  key: string;
  /** "Teach", "Fuse", "Release", "Keep". */
  label: string;
  /** Who it goes to, when the line has more than one creature ("Tidewing"); null when there is one. */
  who: string | null;
  /** Fuse: the creature's fusions now (the stars), and that one more is gained. */
  fusion?: { count: number };
  /** Teach: the Talent Book it goes into. */
  book?: string;
  /** Release: what it pays, as count badges. */
  pays?: CountItem[];
  /** Keep: a short line. */
  note?: string;
  /** Why it cannot be picked ("Already in Splashet's Talent Book"); null when it can. */
  blocked: string | null;
  recommended: boolean;
  request: ChoiceRequest;
}

/** A creature the trip found: a new one, or a duplicate that waits for a choice. */
export interface Find {
  key: string;
  species: string;
  shiny: boolean;
  talent: TalentView | null;
  /** The talent is new to every creature of its line the player has (or the creature itself is new). */
  talentNew: boolean;
  badges: { text: string; entry: string | null }[];
  /** A duplicate's choice; null for a new creature (or a duplicate already answered). */
  choice: { card: PendingCatch; options: FindOption[] } | null;
  /** What an answered duplicate became, in a sentence. */
  answered: string | null;
}

/** The player's creatures of a species' line, in the order the state lists them. */
export function lineCreatures(species: string, creatures: readonly Creature[]): Creature[] {
  const line = getSpecies(species)?.line;
  return line === undefined ? [] : creatures.filter((c) => c.line === line);
}

/** True when no creature of the line holds the talent in its book (a golden one needs a golden one). */
export function talentIsNew(
  talent: Pick<TalentView, 'id' | 'golden'>,
  line: readonly Creature[],
): boolean {
  return !line.some((c) =>
    c.talents.book.some((b) => b.id === talent.id && (b.golden || !talent.golden)),
  );
}

/** What releasing pays, as count badges in part order. */
export function releaseCounts(card: PendingCatch): CountItem[] {
  return partsEntries(card.releases).map(({ kind, amount }) => ({
    key: kind,
    icon: { kind: 'part', part: kind },
    amount,
    label: partName(kind),
    entry: GLOSSARY_IDS.part(kind),
  }));
}

/**
 * The radio rows of a waiting duplicate, Fuse and Teach first (one row per creature of the line), then
 * Release, then Keep when it is offered. A creature the server does not offer is a greyed row with the
 * reason: Teach because its Talent Book already holds the talent, Fuse because it is fully fused.
 */
export function duplicateOptions(card: PendingCatch, creatures: readonly Creature[]): FindOption[] {
  const line = lineCreatures(card.species, creatures);
  const many = line.length > 1;
  const rec = card.recommended;
  const rows: FindOption[] = [];
  for (const c of line) {
    const fusable = card.offered.fuse.includes(c.id);
    rows.push({
      key: `fuse-${c.id}`,
      label: 'Fuse',
      who: many ? creatureName(c) : null,
      fusion: { count: c.fusionCount },
      blocked: fusable ? null : 'Fully fused',
      recommended: rec.choice === 'fuse' && rec.creatureId === c.id,
      request: { choice: 'fuse', creatureId: c.id },
    });
  }
  for (const c of line) {
    const teachable = card.offered.teach.includes(c.id);
    rows.push({
      key: `teach-${c.id}`,
      label: 'Teach',
      who: many ? creatureName(c) : null,
      book: `${creatureName(c)}'s Talent Book`,
      blocked: teachable ? null : 'Already in its Talent Book',
      recommended: rec.choice === 'teach' && rec.creatureId === c.id,
      request: { choice: 'teach', creatureId: c.id },
    });
  }
  if (card.offered.release) {
    rows.push({
      key: 'release',
      label: 'Release',
      who: null,
      pays: releaseCounts(card),
      blocked: null,
      recommended: rec.choice === 'release',
      request: { choice: 'release' },
    });
  }
  if (card.offered.keep) {
    rows.push({
      key: 'keep',
      label: 'Keep',
      who: null,
      note: 'A second creature of this line',
      blocked: null,
      recommended: rec.choice === 'keep',
      request: { choice: 'keep' },
    });
  }
  return rows;
}

/** The row picked at first: the recommended one, else the first that can be picked. */
export function firstPick(options: readonly FindOption[]): string | null {
  const open = options.filter((o) => o.blocked === null);
  return (open.find((o) => o.recommended) ?? open[0])?.key ?? null;
}

/** A waiting duplicate as a find (on the Collection tab, where it has no trip). */
export function pendingFind(card: PendingCatch, creatures: readonly Creature[]): Find {
  return {
    key: card.id,
    species: card.species,
    shiny: card.shiny,
    talent: card.talent,
    talentNew: talentIsNew(card.talent, lineCreatures(card.species, creatures)),
    badges: [{ text: 'Duplicate', entry: 'duplicate-choice' }],
    choice: { card, options: duplicateOptions(card, creatures) },
    answered: null,
  };
}

/**
 * The creatures a claim found, in the order they came. A duplicate still waiting gets its choice; one
 * answered meanwhile shows what it became (`settled`, by card id); a catch from before talents has none.
 */
export function tripFinds(
  catches: readonly TripCatch[],
  pending: readonly PendingCatch[],
  creatures: readonly Creature[],
  settled: Readonly<Record<string, string>>,
): Find[] {
  return catches.map((entry, index) => {
    const card =
      entry.pendingId === undefined ? undefined : pending.find((p) => p.id === entry.pendingId);
    if (card !== undefined) return pendingFind(card, creatures);
    const isNew = entry.outcome === 'new';
    return {
      key: entry.pendingId ?? `catch-${String(index)}`,
      species: entry.species,
      shiny: entry.shiny,
      talent: entry.talent ?? null,
      // A new creature's talent is new by definition; an answered duplicate's no longer matters.
      talentNew: isNew,
      badges: catchBadgeTags(entry),
      choice: null,
      answered:
        entry.outcome === 'duplicate'
          ? ((entry.pendingId === undefined ? undefined : settled[entry.pendingId]) ?? 'Answered.')
          : null,
    };
  });
}

/** How many rolls of a trip brought no creature, in words ("No creature this time", "2 rolls found no creature"). */
export function noCatchLine(result: Pick<ClaimResult, 'catches' | 'noCatch'>): string | null {
  const none = result.noCatch ?? 0;
  if (none === 0) return null;
  if (result.catches.length === 0) {
    return none === 1
      ? 'No creature came this time, only a small find.'
      : 'No creature came this time, only small finds.';
  }
  return none === 1 ? '1 roll found no creature.' : `${String(none)} rolls found no creature.`;
}

/** What the server settled by itself because ten catches already waited, one sentence each. */
export function autoSettledLines(
  results: readonly ChoiceResult[] | undefined,
  creatures: readonly Creature[],
): string[] {
  return (results ?? []).map(
    (r) => `An older waiting catch was settled for you. ${choiceResultText(r, creatures)}`,
  );
}
