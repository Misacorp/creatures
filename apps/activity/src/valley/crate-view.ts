/**
 * The Forge's sealed crate, in plain functions (V-FORGE-5; Misa, 2026-11-15, option C: "I like C"): what the crate prop and its bubble
 * say, the order the opened pieces are revealed in (worst first, best last), the words on each card and on the summary. The pictures are
 * `crate-art.ts`, the reveal itself `CrateReveal.tsx`, the prop in the room `ForgeScenes.tsx`. The server rolls and orders the pieces;
 * nothing here decides anything, it only shows what the answer said.
 */
import type { CratePiece } from '../api';
import { gearName, rarityName, slotName } from '../gear-view';
import type { GearRarity } from '../gear-types';

/** The sealed crate as the valley view shows it: how many pieces wait, how many it holds at most, and the best rarity inside. */
export interface CrateState {
  count: number;
  cap: number;
  best: 'rare' | 'epic' | null;
}

/** What opening the crate answered (the client's slice of the server's answer). */
export interface CrateOpened {
  pieces: readonly CratePiece[];
  /** Pieces still sealed (the bag was full), and whether the bag is why. */
  sealed: number;
  bagFull: boolean;
}

const RANK: Readonly<Record<GearRarity, number>> = { common: 0, rare: 1, epic: 2 };

/**
 * The pieces in reveal order: worst first, best last. The server already sends them so; this keeps the order if it ever did not (a
 * stable sort by rarity, then item level), without changing a list that is in order.
 */
export function revealOrder(pieces: readonly CratePiece[]): CratePiece[] {
  return pieces
    .map((piece, index) => ({ piece, index }))
    .sort(
      (a, b) =>
        RANK[a.piece.item.rarity] - RANK[b.piece.item.rarity] ||
        a.piece.item.itemLevel - b.piece.item.itemLevel ||
        a.index - b.index,
    )
    .map((x) => x.piece);
}

/** The words of one revealed piece. */
export interface PieceCard {
  /** "Kelp Cap". */
  name: string;
  rarity: GearRarity;
  /** "Epic". */
  rarityLabel: string;
  level: number;
  /** "Hat". */
  slot: string;
  /** "Pip puts it on": the creature that wears it now; null when it went to the bag. */
  wearLine: string | null;
  /** "Made by Sprig": the smith; null when that anvil is gone. */
  madeLine: string | null;
  /** The card as one spoken sentence. */
  spoken: string;
}

/** The card of a piece; `nameOf` turns a creature's id into its name (an unknown id says "A creature"). */
export function pieceCard(
  piece: CratePiece,
  nameOf: (creatureId: string) => string | undefined,
): PieceCard {
  const { item } = piece;
  const wearer = piece.wornBy === null ? undefined : nameOf(piece.wornBy);
  const maker = piece.madeBy === null ? undefined : nameOf(piece.madeBy);
  const name = gearName(item.baseId);
  const rarityLabel = rarityName(item.rarity);
  const wearLine = piece.wornBy === null ? null : `${wearer ?? 'A creature'} puts it on`;
  const madeLine = maker === undefined ? null : `Made by ${maker}`;
  return {
    name,
    rarity: item.rarity,
    rarityLabel,
    level: item.itemLevel,
    slot: slotName(item.slot),
    wearLine,
    madeLine,
    spoken: [`${rarityLabel} ${name}, item level ${String(item.itemLevel)}`, wearLine, madeLine]
      .filter((x): x is string => x !== null)
      .join('. '),
  };
}

/** The end of the reveal: what the crate held, in words. */
export interface CrateSummary {
  total: number;
  /** "2 epic, 1 rare" (best first); empty for an empty list. */
  counts: { rarity: GearRarity; count: number }[];
  /** How many a creature put on at once. */
  worn: number;
  /** "The bag is full, 2 stay sealed." (only when something stays sealed). */
  sealedLine: string | null;
}

/** The summary of an opened crate. */
export function crateSummary(opened: CrateOpened): CrateSummary {
  const counts = (['epic', 'rare', 'common'] as const)
    .map((rarity) => ({
      rarity,
      count: opened.pieces.filter((p) => p.item.rarity === rarity).length,
    }))
    .filter((c) => c.count > 0);
  const sealedLine =
    opened.sealed <= 0
      ? null
      : opened.bagFull
        ? `The bag is full, ${String(opened.sealed)} stay sealed.`
        : `${String(opened.sealed)} stay sealed.`;
  return {
    total: opened.pieces.length,
    counts,
    worn: opened.pieces.filter((p) => p.wornBy !== null).length,
    sealedLine,
  };
}

/** "2 epic, 1 rare" as words. */
export function countsLine(counts: CrateSummary['counts']): string {
  return counts.map((c) => `${String(c.count)} ${c.rarity}`).join(', ');
}

/** The reveal's next position: the piece shown (0 is the worst), or `pieces` for the summary. */
export function advance(at: number, pieces: number): number {
  return Math.min(pieces, at + 1);
}

/** Skip: straight to the summary. */
export function skipTo(pieces: number): number {
  return pieces;
}

/** Whether the reveal is on its last piece (the best one: it waits for a tap, it never moves on by itself). */
export function onLastPiece(at: number, pieces: number): boolean {
  return pieces > 0 && at === pieces - 1;
}

/** The crate prop's spoken name for the scene's button. */
export function crateLabel(crate: CrateState): string {
  const what = crate.count === 1 ? '1 piece' : `${String(crate.count)} pieces`;
  const best = crate.best === 'epic' ? 'something epic' : 'something rare';
  return `The sealed crate: ${what}, ${best} inside. Open it`;
}

/** The words of the bubble over the Forge on the map and in the Places list. */
export function crateBubbleLine(best: 'rare' | 'epic' | null): string {
  return best === 'epic'
    ? 'Something epic waits in the sealed crate'
    : 'Something rare waits in the sealed crate';
}

/** The Forge's line in the Places list while the crate holds pieces. */
export function crateLine(best: 'rare' | 'epic' | null): string {
  return best === 'epic' ? 'something epic waits' : 'something rare waits';
}

/** The palette alt of the crate art: the glow's rarity and the time of day (`valley-forge-crate` alts: `epic`, `day`, `epic-day`). */
export function crateAlt(best: 'rare' | 'epic' | null, night: boolean): string | undefined {
  if (best === 'epic') return night ? 'epic' : 'epic-day';
  return night ? undefined : 'day';
}

/** The rattle before the crate opens: the sealed crate and the three shake frames, one step each (the art's note: sealed, 1, 2, 1, 3). */
export const RATTLE = ['sealed', 'shake-1', 'shake-2', 'shake-1', 'shake-3'] as const;
export type CrateFrame = (typeof RATTLE)[number] | 'open';
/** The rattle's step, in ms, and how many times it plays at least (the server's answer may take longer: it keeps rattling). */
export const RATTLE_STEP_MS = 90;
export const RATTLE_LOOPS = 2;
/** How long a card waits before it moves on by itself (never the last one, never under reduced motion). */
export const CARD_AUTO_MS = 2600;
