import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { gimmickGlyph } from '../glyphs';
import { nextMoves, type MoveTrackView, type TrackTile } from '../move-track';
import { usePopoverTrigger } from '../PopoverHost';
import { RAMPS } from '../games/art/tint';
import { YOU_MARKER } from '../games/show-art';
import { Sprite } from '../sprites/Sprite';
import { PopoverCard, popupProps } from '../ui/Popover';

/** A popover opened by hovering closes this long after the mouse leaves the move (or the popover). */
const HOVER_CLOSE_MS = 200;

/**
 * This round's mark on the track: the Valley Games' "yours" marker (the same sprite, at 1x), turned to
 * point at this round's moves. Gold, and red while a move comes this round.
 */
const DUE_MARKER = { a: RAMPS.red[1], b: RAMPS.red[2] } as const;

const KIND_WORD: Record<TrackTile['kind'], string> = {
  move: 'Strikes at the boss turn, after the creatures.',
  charge: 'Charged: marks its targets at the start of one round and lands the round after.',
  round: 'Armed from the start of the round, for the whole round.',
};

/** How many rounds until a tile comes: 0 this round (a charge: until it lands). */
function roundsUntil(tile: TrackTile, now: number): number {
  const at = tile.kind === 'charge' && tile.from <= now ? tile.to : tile.from;
  return Math.max(0, at - now);
}

/** When a tile comes, in words: "this round", "next round", "in 3 rounds". */
function whenText(tile: TrackTile, now: number): string {
  const d = roundsUntil(tile, now);
  if (d === 0) return 'this round';
  return d === 1 ? 'next round' : `in ${String(d)} rounds`;
}

/**
 * One move: a small button with the move's glyph. A tap opens its popover (the boss card's: the same
 * panel, one open at a time); with a mouse, hovering opens it too, and leaving closes it. `style`
 * places it (the rising looks put it in the round it comes in); `children` is what it says beside
 * the glyph (the countdown looks).
 */
function TrackMove({
  tile,
  now,
  class: extra = '',
  style,
  scale = 2,
  children,
}: {
  tile: TrackTile;
  now: number;
  class?: string;
  style?: Record<string, string>;
  scale?: number;
  children?: ComponentChildren;
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const hovered = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLeave = (): void => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
  };
  const show = (): void => {
    if (ref.current === null) return;
    host?.openCustom(tile.key, ref.current, {
      label: tile.name,
      body: (
        <div
          onPointerEnter={(event: PointerEvent) => {
            if (event.pointerType !== 'touch') cancelLeave();
          }}
          onPointerLeave={(event: PointerEvent) => {
            if (event.pointerType !== 'touch' && hovered.current) leaveSoon();
          }}
        >
          <PopoverCard
            visual={<Sprite sprite={gimmickGlyph(tile.glyph)} scale={4} />}
            title={tile.name}
            short={tile.text !== '' ? tile.text : tile.short}
            note={`${tile.cadence}. ${KIND_WORD[tile.kind]}`}
          />
        </div>
      ),
    });
  };
  const leaveSoon = (): void => {
    cancelLeave();
    leaving.current = setTimeout(() => {
      leaving.current = null;
      if (!hovered.current) return;
      hovered.current = false;
      host?.close();
    }, HOVER_CLOSE_MS);
  };
  return (
    <button
      ref={ref}
      type="button"
      class={`track-move ${tile.kind}${extra === '' ? '' : ` ${extra}`}${open ? ' open' : ''}`}
      {...(style === undefined ? {} : { style })}
      {...popupProps(open)}
      aria-label={`${tile.name}, ${whenText(tile, now)}. What does it do?`}
      onClick={() => {
        cancelLeave();
        hovered.current = false;
        if (open) host?.close();
        else show();
      }}
      onPointerEnter={(event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        cancelLeave();
        if (open) return;
        hovered.current = true;
        show();
      }}
      onPointerLeave={(event: PointerEvent) => {
        if (event.pointerType !== 'touch' && hovered.current) leaveSoon();
      }}
    >
      <Sprite sprite={gimmickGlyph(tile.glyph)} scale={scale} />
      {children}
    </button>
  );
}

/**
 * How the track looks (Misa's design rounds, 2026-10-23 and 24: fewer boxes, less noise, more meaning,
 * and less room taken from the boss).
 * - `rows` (the default): a row per round, this round on top, its moves as icons side by side, a
 *   small pointer at this round (no words) and the rounds to go beside the others; an empty round is a
 *   dot.
 * - `countdown` (the reviewers' pick of the 23rd): no column: the next few moves, each once, with the
 *   rounds left beside it; a hard "NOW" for this round's, and the names of this round's and the next.
 * - `hitline`: no boxes at all. The moves float up a column toward a single glowing line at the top
 *   and cross it in the round they come, like notes in a rhythm game.
 * - `ribbon`: a thin timeline with a notch for each round; the moves sit on their notches and slide
 *   up a notch a round.
 * - `single`: only the next move, with "in 2" (or "NOW") and its name.
 */
export type TrackLook = 'rows' | 'hitline' | 'ribbon' | 'countdown' | 'single';
export const TRACK_LOOKS: readonly TrackLook[] = [
  'rows',
  'countdown',
  'hitline',
  'ribbon',
  'single',
];

/** The names of this round's moves (a charge that only marks now says so). */
function NowLine({ track }: { track: MoveTrackView }) {
  if (track.now.length === 0) return null;
  return (
    <p class="track-now pix">
      {track.now.map((m, k) => (
        <span key={k} class="track-now-line">
          {m.name}
          {m.note !== null && <span class="track-now-note"> {m.note}</span>}
        </span>
      ))}
    </p>
  );
}

/**
 * The boss's move track (see `move-track.ts`). In the rising looks each round has a row, this round on
 * top, and everything rises a row each round (`key` on the round, so the rise plays again).
 */
export function MoveTrack({
  track,
  round,
  look = 'rows',
}: {
  track: MoveTrackView;
  round: number;
  look?: TrackLook;
}) {
  const first = track.rounds[0];
  const last = track.rounds.at(-1);
  if (first === undefined || last === undefined) return null;
  const now = Math.max(1, round);
  const lit = track.now.length > 0;

  if (look === 'rows') {
    return (
      <section
        class={`move-track look-rows${lit ? ' lit' : ''}`}
        aria-label="The boss's next moves"
      >
        <ol class="track-rounds" key={first}>
          {track.rounds.map((r, k) => {
            // A charge shows in the round it marks (faint) and the round it lands.
            const moves = track.tiles.filter((t) => t.from <= r && r <= t.to);
            return (
              <li
                key={r}
                class={`track-round${k === 0 ? ' now' : ''}${moves.length === 0 ? ' quiet' : ''}`}
              >
                <span class="track-round-label pix" aria-hidden="true">
                  {k === 0 ? (
                    <Sprite
                      sprite={YOU_MARKER}
                      scale={1}
                      class="track-now-mark"
                      {...(lit ? { palette: DUE_MARKER } : {})}
                    />
                  ) : (
                    String(k)
                  )}
                </span>
                {moves.length === 0 ? (
                  <span class="track-none" aria-hidden="true" />
                ) : (
                  moves.map((t) => (
                    <TrackMove
                      key={t.key}
                      tile={t}
                      now={now}
                      class={t.kind === 'charge' && r < t.to ? 'marking' : ''}
                      style={{ '--depth': String(k) }}
                    />
                  ))
                )}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (look === 'countdown' || look === 'single') {
    const single = look === 'single';
    const next = nextMoves(track, now).slice(0, single ? 1 : 4);
    return (
      <section
        class={`move-track look-${look}${lit ? ' lit' : ''}`}
        aria-label="The boss's next moves"
      >
        <ul class="track-next" key={first}>
          {next.map((t) => {
            const d = roundsUntil(t, now);
            return (
              <li key={t.gimmick} class={d === 0 ? 'due' : d === 1 ? 'soon' : undefined}>
                <TrackMove tile={t} now={now} scale={3}>
                  <span class="track-when pix" aria-hidden="true">
                    {d === 0 ? 'NOW' : single ? `in ${String(d)}` : String(d)}
                  </span>
                  {/* The name of what comes this round or the next: the moves to plan for. */}
                  {(d <= 1 || single) && (
                    <span class="track-name pix" aria-hidden="true">
                      {t.name}
                    </span>
                  )}
                </TrackMove>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section
      class={`move-track look-${look}${lit ? ' lit' : ''}`}
      aria-label="The boss's next moves"
    >
      <div class="track-grid" key={first}>
        {track.rounds.map((r, k) => (
          <div
            key={r}
            class={`track-row${k === 0 ? ' now' : ''}`}
            style={{ gridRow: String(k + 1), '--depth': String(k) }}
            aria-hidden="true"
          />
        ))}
        {track.tiles.map((t) => {
          // Cut to the rows on the track: a charge may start above the top or end below the bottom.
          const from = Math.max(t.from, first);
          const to = Math.min(t.to, last);
          const cut = `${t.from < first ? ' cut-top' : ''}${t.to > last ? ' cut-bottom' : ''}`;
          return (
            <TrackMove
              key={t.key}
              tile={t}
              now={now}
              class={`${cut.trim()}${t.from <= first ? ' top' : ''}`.trim()}
              style={{
                gridRow: `${String(from - first + 1)} / span ${String(to - from + 1)}`,
                gridColumn: String(t.lane + 1),
                '--depth': String(from - first),
              }}
            >
              {t.kind === 'charge' && <span class="track-charge-bar" aria-hidden="true" />}
            </TrackMove>
          );
        })}
      </div>
      <NowLine track={track} />
    </section>
  );
}
