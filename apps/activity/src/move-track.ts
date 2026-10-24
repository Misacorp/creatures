/**
 * The boss's move track (decisions.md, 2026-10-22): a column of boxes left of the boss, one box per
 * round, the top box this round. A boss's special moves come on a fixed schedule (`every N` rounds,
 * or every round), so each upcoming move sits in the box of the round it fires in and rises one box a
 * round, like notes in a rhythm game, until it reaches the top. An empty box is a round with only
 * the plain attack. Pure: `stage/MoveTrack.tsx` draws it.
 *
 * - A plain move is one box: it strikes at the boss's turn, after the creatures.
 * - A charged move is a long block over two boxes: it marks its targets at the start of the round
 *   before it lands (the engine's `announceCharges`) and lands at the boss's turn of the next.
 * - A whole-round move (Backdraft's trap) is one box, drawn dashed: it is armed from the start of the
 *   round.
 * - A move that comes every round is in every box (Misa, 2026-10-22: the track shows what each round
 *   brings, so a move used every round shows in each one).
 *
 * Several moves in one round stand side by side (`lane`).
 */
import type { BossDef, Gimmick } from '@creatures/game';
import { gimmickDue } from '@creatures/engine';
import { gimmickGlyphKey, gimmickShort, gimmickText } from './raid-text';

/** Boxes on the track: this round and the next four. */
export const TRACK_ROUNDS = 5;
/** Moves side by side in one box at most; more are left out of the drawing (never out of the fight). */
export const TRACK_LANES = 3;

export type TrackKind = 'move' | 'charge' | 'round';

export interface TrackTile {
  /** Unique on the track: the move and the round it fires (or lands) in. */
  key: string;
  gimmick: string;
  name: string;
  /** The glyph key (the move's kind of attack). */
  glyph: string;
  kind: TrackKind;
  /** The first and last round the tile covers (a charge: the round it marks, the round it lands). */
  from: number;
  to: number;
  /** The column inside the boxes (0 is the left). */
  lane: number;
  /** One line on what it does, and the full sentence (the popover). */
  short: string;
  text: string;
  /** How often it comes: "Every 4 rounds", "Every round". */
  cadence: string;
}

export interface MoveTrackView {
  /** The rounds of the boxes, top first: the round now, then the next ones (never past the last round). */
  rounds: number[];
  tiles: TrackTile[];
  /** What the top box says: the moves of this round, with a word for a charge that only marks now. */
  now: { name: string; note: string | null }[];
}

function cadence(g: Gimmick): string {
  if (!('every' in g.trigger)) return 'Every round';
  return g.trigger.every === 1 ? 'Every round' : `Every ${String(g.trigger.every)} rounds`;
}

/**
 * The track at `round` (0 before the fight: it shows from round 1) for a boss or a dungeon foe (as the
 * stage resolves it), whose fight has `lastRound` regular rounds. Moves never fire past the last
 * round (enrage rounds have none), so the track stops there.
 */
export function moveTrack(
  boss: Pick<BossDef, 'gimmicks'>,
  round: number,
  lastRound: number,
  names: Readonly<Record<string, string>> = {},
): MoveTrackView {
  const top = Math.max(1, round);
  const rounds: number[] = [];
  for (let r = top; r < top + TRACK_ROUNDS && r <= lastRound; r++) rounds.push(r);
  const bottom = rounds.at(-1) ?? top - 1;
  const raw: Omit<TrackTile, 'lane'>[] = [];
  for (const g of boss.gimmicks) {
    const base = {
      gimmick: g.id,
      name: names[g.id] ?? g.name,
      glyph: gimmickGlyphKey(g),
      short: gimmickShort(g),
      text: gimmickText(g),
      cadence: cadence(g),
    };
    if (g.op === 'charge') {
      // A charge that lands in round L is marked at the start of L - 1; it is drawn while either end
      // is on the track (one that would be marked in round 0 is never marked, as in the engine).
      for (let landing = top; landing <= Math.min(lastRound, bottom + 1); landing++) {
        if (landing < 2 || !gimmickDue(g, landing)) continue;
        raw.push({
          ...base,
          key: `${g.id}:${String(landing)}`,
          kind: 'charge',
          from: landing - 1,
          to: landing,
        });
      }
      continue;
    }
    for (let r = top; r <= bottom; r++) {
      if (!gimmickDue(g, r)) continue;
      const kind: TrackKind = g.op === 'reflect_first_reaction' ? 'round' : 'move';
      raw.push({ ...base, key: `${g.id}:${String(r)}`, kind, from: r, to: r });
    }
  }
  // Lanes: earlier tiles first, each in the first lane free over all its rounds.
  raw.sort((a, b) => a.from - b.from || a.to - b.to);
  const busy: number[][] = [];
  const tiles: TrackTile[] = [];
  for (const t of raw) {
    let lane = 0;
    while (lane < TRACK_LANES && (busy[lane] ?? []).some((end) => end >= t.from)) lane++;
    if (lane >= TRACK_LANES) continue;
    (busy[lane] ??= []).push(t.to);
    tiles.push({ ...t, lane });
  }
  const now = tiles
    .filter((t) => t.from <= top && t.to >= top)
    .map((t) => ({
      name: t.name,
      note: t.kind === 'charge' && t.from === top ? 'marks' : null,
    }));
  return { rounds, tiles, now };
}

/**
 * The next time each move comes, soonest first, each move once (the countdown looks): a charge by
 * the round it lands. Moves due this round come first.
 */
export function nextMoves(track: MoveTrackView, now: number): TrackTile[] {
  const at = (t: TrackTile): number => (t.kind === 'charge' && t.from <= now ? t.to : t.from);
  const seen = new Set<string>();
  const out: TrackTile[] = [];
  for (const t of [...track.tiles].sort((a, b) => at(a) - at(b) || a.lane - b.lane)) {
    if (seen.has(t.gimmick)) continue;
    seen.add(t.gimmick);
    out.push(t);
  }
  return out;
}
