import { useEffect, useMemo, useRef } from 'preact/hooks';
import { CreatureIcon } from './CreatureIcon';
import { cssVars } from './css-vars';
import { useElementWidth } from './hooks';
import { MAP_MAX_FACES, mapScale, nextMarker, type MapPlace } from './map-view';
import { scrollBehavior } from './scroll-to';
import { drawSprites } from './room-canvas';
import { MAP_SIZE, mapPlacements } from './sprites/world-map-art';

/** The width assumed until the map has been measured (and where there is no layout). */
const FALLBACK_WIDTH = 390;

export interface WorldMapProps {
  /** One per destination in trail order (`mapPlaces` in `map-view.ts`). */
  places: readonly MapPlace[];
  /** The chosen place's id; null for none. */
  selected: string | null;
  /** The guild's night: a dark blue tint over the map. */
  night: boolean;
  onPick: (id: string) => void;
  /** The width to lay out for (CSS px). Default: measured from the element. */
  width?: number;
}

/**
 * The Expeditions world map: one pixel-art canvas (decoration, hidden from screen readers) at a whole
 * number scale, scrolling sideways when it is wider than its window, with a list of real buttons laid
 * over it, one marker per place in trail order. Left and Right move along the trail.
 */
export function WorldMap({ places, selected, night, onPick, width }: WorldMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measured = useElementWidth(rootRef, FALLBACK_WIDTH);
  const available = width ?? measured;
  const scale = mapScale(available);
  const pixelWidth = MAP_SIZE.width * scale;
  const pixelHeight = MAP_SIZE.height * scale;
  const placements = useMemo(() => mapPlacements(), []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawSprites(ctx, placements, scale, 0, { width: pixelWidth, height: pixelHeight });
  }, [placements, scale, pixelWidth, pixelHeight]);

  /** Left and Right move focus along the trail from the marker `from` and bring it into view. */
  const onArrow = (from: string, event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = nextMarker(
      places.map((p) => p.id),
      from,
      event.key === 'ArrowRight' ? 1 : -1,
    );
    if (target === null) return;
    event.preventDefault();
    const button = rootRef.current?.querySelector<HTMLElement>(`[data-place="${target}"]`);
    if (button === null || button === undefined) return;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ inline: 'center', block: 'nearest', behavior: scrollBehavior() });
  };

  return (
    <div ref={rootRef} class="world-map-wrap">
      <div
        class={night ? 'world-map night' : 'world-map'}
        ref={cssVars({ '--wm-w': `${String(pixelWidth)}px`, '--wm-h': `${String(pixelHeight)}px` })}
      >
        <div class="world-map-stage">
          <canvas
            ref={canvasRef}
            class="world-map-canvas"
            width={pixelWidth}
            height={pixelHeight}
            aria-hidden="true"
          />
          <ul class="world-map-places pix-panel" aria-label="Places on the map">
            {places.map((place) => (
              <li key={place.id}>
                <Marker
                  place={place}
                  selected={place.id === selected}
                  scale={scale}
                  onPick={onPick}
                  onArrow={onArrow}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Marker({
  place,
  selected,
  scale,
  onPick,
  onArrow,
}: {
  place: MapPlace;
  selected: boolean;
  scale: number;
  onPick: (id: string) => void;
  onArrow: (from: string, event: KeyboardEvent) => void;
}) {
  const classes = ['wm-marker', `wm-el-${place.element ?? 'mixed'}`];
  if (selected) classes.push('selected');
  if (place.home) classes.push('home');
  if (place.pushOn) classes.push('choosing');
  return (
    <button
      type="button"
      class={classes.join(' ')}
      data-place={place.id}
      aria-label={place.label}
      aria-pressed={selected}
      ref={cssVars({
        '--x': `${String(place.spot.x * scale)}px`,
        '--y': `${String(place.spot.y * scale)}px`,
      })}
      onClick={() => {
        onPick(place.id);
      }}
      onKeyDown={(event) => {
        onArrow(place.id, event);
      }}
    >
      <span class="wm-pin" aria-hidden="true">
        <span class="wm-ring" />
        <span class="wm-ink" />
        <span class="wm-gem" />
      </span>
      <span class="wm-plate" aria-hidden="true">
        {place.name}
      </span>
      {place.count > 0 && (
        <span class="wm-faces" aria-hidden="true">
          <span class="wm-chip">
            {place.faces.slice(0, MAP_MAX_FACES).map((face) => (
              <CreatureIcon key={face.creatureId} creature={face} />
            ))}
            {place.more > 0 && <span class="wm-more">+{place.more}</span>}
            {place.home && <span class="wm-flag">HOME</span>}
            {place.pushOn && <span class="wm-choice">!</span>}
          </span>
        </span>
      )}
      {place.rule !== null && (
        <span class="wm-rule" aria-hidden="true">
          {place.rule}
        </span>
      )}
    </button>
  );
}
