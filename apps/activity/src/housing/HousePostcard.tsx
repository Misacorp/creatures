import { useEffect, useMemo, useRef } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { composePostcard, postcardName, type PostcardHouse } from './house-postcard';
import { paintPlacements } from './house-paint';

/** The largest whole scale (at least 1) at which a picture `width` px wide fits `maxWidth` CSS px. */
export function postcardScale(width: number, maxWidth: number): number {
  return Math.max(1, Math.floor(maxWidth / Math.max(1, width)));
}

/**
 * A house as one small picture seen from outside (`composePostcard`): the whole of it, wings, grounds and all, at the
 * largest whole scale that fits `maxWidth` (CSS px, at least 1x), crisp. It is a picture with a spoken name built from the
 * parts ("Anna's house: cottage with an east wing and a pool"); `label` replaces the lead-in before the colon ("Anna's
 * house"). Transparent round the house, so it sits on any backdrop.
 */
export function HousePostcard({
  house,
  maxWidth,
  label,
}: {
  house: PostcardHouse;
  maxWidth: number;
  label?: string;
}) {
  const model = useMemo(() => composePostcard(house), [house]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintPlacements(
      ref.current?.getContext('2d') ?? null,
      model.placements,
      model.width,
      model.height,
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
      class="hp-postcard"
      role="img"
      aria-label={name}
      ref={cssVars({
        '--pw': `${String(model.width * scale)}px`,
        '--ph': `${String(model.height * scale)}px`,
      })}
    >
      <canvas ref={ref} width={model.width} height={model.height} aria-hidden="true" />
    </span>
  );
}
