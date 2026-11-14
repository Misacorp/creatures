/**
 * The expedition map as the Signpost place's canvas (Misa, 2026-11-11: "a click on the sign post open the expedition map, which the
 * user could then drag and select a place"). It is the Expeditions screen's own map (`WorldMap`, its art, spots and markers, with the
 * creatures standing at the place they are at), filling the view instead of sitting in a page: it never scrolls the page, and the map
 * itself pans by drag (`ui/use-drag-scroll`, with the shared drag-click guard: a drag never picks a place), wheel and trackpad. A click
 * on a place is the canvas's one thing clicked, which opens its drawer. Over the map's top left two small buttons open the left drawer's
 * collections (the packs, the project board; Misa, 2026-11-15: the map is the place, there is no scene first). The words of each marker
 * are `signpost-map.ts`.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { MapPlace } from '../map-view';
import { mapScaleWide } from '../map-view';
import { centerOn } from '../map-start';
import { scrollBehavior } from '../scroll-to';
import { HUB } from '../sprites/world-map-art';
import { WorldMap } from '../WorldMap';
import { CRATE_PROP, PLANS_PROP } from './forge-props';
import { Pic } from './parts';
import type { Opener } from './PlaceCanvas';
import { openerOf } from './PlaceCanvas';

/** The place a map opens on: one with a pack to look at, else one with a scout, else the hub (Old Crossroads). */
export function startPlace(places: readonly MapPlace[]): string {
  return places.find((p) => p.flag === 'FULL')?.id ?? places.find((p) => p.count > 0)?.id ?? HUB;
}

export function SignpostMap({
  places,
  selected,
  night,
  scale,
  fullPacks,
  packsOpen,
  boardOpen,
  onPacks,
  onBoard,
  onPick,
}: {
  places: readonly MapPlace[];
  selected: string | null;
  night: boolean;
  /** The map art's whole-number scale (the canvas picks it from its own size, so a drawer opening does not change it). */
  scale: number | undefined;
  onPick: (id: string) => void;
  /** How many seats have a full pack (the packs button's tag). */
  fullPacks: number;
  packsOpen: boolean;
  boardOpen: boolean;
  /** Opens the packs drawer. */
  onPacks: (opener: Opener) => void;
  /** Opens the project board drawer; absent when the valley has no project board to show. */
  onBoard?: (opener: Opener) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const start = useRef(startPlace(places));

  /** Scrolls the map so the place `id` is as near its middle as it can scroll. */
  const centerMap = (id: string, behavior: ScrollBehavior): void => {
    const scroller = box.current?.querySelector<HTMLElement>('.world-map');
    const target = box.current?.querySelector<HTMLElement>(`[data-place="${id}"]`);
    if (scroller !== null && scroller !== undefined && target !== null && target !== undefined) {
      centerOn(scroller, target, behavior);
    }
  };

  // A map that scrolls starts on the place that matters most (once, without a glide), and glides to a place when it is chosen.
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return undefined;
    const frame = requestAnimationFrame(() => {
      centerMap(start.current, 'instant');
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    if (selected === null || typeof requestAnimationFrame !== 'function') return undefined;
    const frame = requestAnimationFrame(() => {
      centerMap(selected, scrollBehavior());
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [selected]);

  return (
    <div class="sg-map" ref={box} data-testid="signpost-map">
      <WorldMap
        fill
        places={places}
        selected={selected}
        night={night}
        onPick={onPick}
        {...(scale === undefined ? {} : { scale })}
      />
      <button
        type="button"
        class="vy-hatch sg-map-tool"
        aria-label={`The packs${fullPacks > 0 ? `: ${String(fullPacks)} full` : ''}. Open`}
        aria-expanded={packsOpen}
        onClick={(event) => {
          onPacks(openerOf(event.currentTarget));
        }}
      >
        <Pic sprite={CRATE_PROP} scale={2} />
        {fullPacks > 0 && (
          <span class="vy-hatch-count pix" aria-hidden="true">
            {fullPacks}
          </span>
        )}
      </button>
      {onBoard !== undefined && (
        <button
          type="button"
          class="vy-hatch sg-map-tool sg-map-tool-2"
          aria-label="The project board. Open"
          aria-expanded={boardOpen}
          onClick={(event) => {
            onBoard(openerOf(event.currentTarget));
          }}
        >
          <Pic sprite={PLANS_PROP} scale={2} />
        </button>
      )}
    </div>
  );
}

/** The whole-number scale of the map for a canvas `width` by `height` CSS px (the canvas's own size, drawers not counted). */
export function signpostMapScale(width: number, height: number): number | undefined {
  return width > 0 && height > 0 ? mapScaleWide(width, height) : undefined;
}
