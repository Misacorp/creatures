import { useEffect, useMemo, useRef } from 'preact/hooks';
import { type HouseView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { cssVars } from '../css-vars';
import { HOUSE_DRAWING } from './HouseScene';
import { paintPlacements } from './house-paint';
import { partPreview } from './house-scene';

/** The widest a part's own page draws its picture (CSS px). */
const PAGE_WIDTH = 330;

/**
 * A part of the house as a picture: the part's new rooms and the roof over them, drawn from the house with the part built
 * (`partPreview`). `size` `row` is the small one of the build list's rows, `page` the larger one of a part's own page; both are
 * fitted to their box, never stretched. Decoration: the row or the page carries the part's name.
 */
export function PartPreview({
  house,
  partId,
  size,
}: {
  house: HouseView;
  partId: string;
  size: 'row' | 'page';
}) {
  const model = useMemo(
    () => partPreview(house, partId, { content: housing, drawing: HOUSE_DRAWING }),
    [house, partId],
  );
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    paintPlacements(
      ref.current?.getContext('2d') ?? null,
      model.placements,
      model.width,
      model.height,
    );
  }, [model]);
  // The page shows it at the largest whole scale (up to 3) that keeps it inside a phone's width.
  const scale = Math.max(1, Math.min(3, Math.floor(PAGE_WIDTH / Math.max(1, model.width))));
  return (
    <span
      class={`hp-preview hp-preview-${size}`}
      aria-hidden="true"
      ref={cssVars({
        '--pw': `${String(model.width * scale)}px`,
        '--ph': `${String(model.height * scale)}px`,
      })}
    >
      <canvas ref={ref} width={model.width} height={model.height} />
    </span>
  );
}
