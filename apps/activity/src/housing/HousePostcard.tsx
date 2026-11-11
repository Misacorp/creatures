import { useEffect, useMemo, useRef } from 'preact/hooks';
import { housing } from '@creatures/game/housing-content';
import { cssVars } from '../css-vars';
import { composePostcard, postcardName, type PostcardHouse } from './house-postcard';
import { paintPlacements } from './house-paint';
import { useHousePhase } from './house-phase';

/** The largest whole scale (at least 1) at which a picture `width` px wide fits `maxWidth` CSS px. */
export function postcardScale(width: number, maxWidth: number): number {
  return Math.max(1, Math.floor(maxWidth / Math.max(1, width)));
}

/**
 * A house as one small picture seen from outside (`composePostcard`): the whole of it, wings, grounds and all, at the
 * largest whole scale that fits `maxWidth` (CSS px, at least 1x), crisp. It is a picture with a spoken name built from the
 * parts ("Anna's house: cottage with an east wing and a pool"); `label` replaces the lead-in before the colon ("Anna's
 * house"). By day it is transparent round the house, so it sits on any backdrop; at twilight and night (the house's phase,
 * `useHousePhase`) it is drawn in that light with the valley's sky behind it and lit windows.
 */
export function HousePostcard({
  house,
  maxWidth,
  label,
  fit = false,
}: {
  house: PostcardHouse;
  maxWidth: number;
  label?: string;
  /** Fill the width of its place (a row's small picture) instead of a whole scale: the aspect is kept, the edges stay hard. */
  fit?: boolean;
}) {
  const phase = useHousePhase();
  const model = useMemo(() => composePostcard(house, housing, phase), [house, phase]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintPlacements(
      ref.current?.getContext('2d') ?? null,
      model.placements,
      model.width,
      model.height,
      model.lighting,
    );
  }, [model]);
  const scale = postcardScale(model.width, maxWidth);
  const name = useMemo(() => {
    const full = postcardName(house);
    if (label === undefined) return full;
    const at = full.indexOf(': ');
    return at < 0 ? label : `${label}${full.slice(at)}`;
  }, [house, label]);
  return (
    <span
      class={fit ? 'hp-postcard fit' : 'hp-postcard'}
      role="img"
      aria-label={name}
      ref={cssVars({
        '--pw': `${String(model.width * scale)}px`,
        '--ph': `${String(model.height * scale)}px`,
        '--aw': String(model.width),
        '--ah': String(model.height),
      })}
    >
      <canvas ref={ref} width={model.width} height={model.height} aria-hidden="true" />
    </span>
  );
}
