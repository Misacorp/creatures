import { useRef } from 'preact/hooks';
import { gimmickGlyph } from '../glyphs';
import type { MoveTrackView, TrackTile } from '../move-track';
import { usePopoverTrigger } from '../PopoverHost';
import { Sprite } from '../sprites/Sprite';
import { PopoverCard, popupProps } from '../ui/Popover';

/** A popover opened by hovering closes this long after the mouse leaves the move (or the popover). */
const HOVER_CLOSE_MS = 200;

const KIND_WORD: Record<TrackTile['kind'], string> = {
  move: 'Strikes at the boss turn, after the creatures.',
  charge: 'Charged: marks its targets at the start of one round and lands the round after.',
  round: 'Armed from the start of the round, for the whole round.',
};

/** When a tile comes, in words: "this round", "next round", "in 3 rounds". */
function whenText(tile: TrackTile, now: number): string {
  const at = tile.kind === 'charge' && tile.from <= now ? tile.to : tile.from;
  const d = at - now;
  if (d <= 0) return 'this round';
  return d === 1 ? 'next round' : `in ${String(d)} rounds`;
}

/**
 * One move on the track: a small button with the move's glyph (a long block for a charge). A tap opens
 * its popover (the boss card's: the same panel, one open at a time); with a mouse, hovering opens it
 * too, and leaving closes it.
 */
function TrackMove({
  tile,
  now,
  first,
  last,
}: {
  tile: TrackTile;
  now: number;
  first: number;
  last: number;
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
  // Cut to the boxes on the track: a charge may start above the top or end below the bottom.
  const from = Math.max(tile.from, first);
  const to = Math.min(tile.to, last);
  const cut = `${tile.from < first ? ' cut-top' : ''}${tile.to > last ? ' cut-bottom' : ''}`;
  return (
    <button
      ref={ref}
      type="button"
      class={`track-move ${tile.kind}${cut}${open ? ' open' : ''}`}
      style={{
        gridRow: `${String(from - first + 1)} / span ${String(to - from + 1)}`,
        gridColumn: String(tile.lane + 1),
      }}
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
      <Sprite sprite={gimmickGlyph(tile.glyph)} scale={2} />
      {tile.kind === 'charge' && <span class="track-charge-bar" aria-hidden="true" />}
    </button>
  );
}

/**
 * The boss's move track (see `move-track.ts`): one box per round, this round on top and lit when a
 * move is due, the next rounds under it. Each round everything rises one box (`key` on the round, so
 * the rise plays again). The top box names what comes this round.
 */
export function MoveTrack({ track, round }: { track: MoveTrackView; round: number }) {
  const first = track.rounds[0];
  const last = track.rounds.at(-1);
  if (first === undefined || last === undefined) return null;
  const now = Math.max(1, round);
  const lit = track.now.length > 0;
  return (
    <section class="move-track" aria-label="The boss's next moves">
      <div class="track-grid" key={first}>
        {track.rounds.map((r, k) => (
          <div
            key={r}
            class={`track-box${k === 0 ? ' now' : ''}${k === 0 && lit ? ' lit' : ''}`}
            style={{ gridRow: String(k + 1) }}
            aria-hidden="true"
          >
            {k > 0 && <span class="track-round pix">{r}</span>}
          </div>
        ))}
        {track.tiles.map((t) => (
          <TrackMove key={t.key} tile={t} now={now} first={first} last={last} />
        ))}
      </div>
      {lit && (
        <p class="track-now pix">
          {track.now.map((m, k) => (
            <span key={k} class="track-now-line">
              {m.name}
              {m.note !== null && <span class="track-now-note"> {m.note}</span>}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
