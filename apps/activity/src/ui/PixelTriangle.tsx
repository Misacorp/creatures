/**
 * The game's one small pixel triangle, pointing down, drawn as an SVG of square rows in the text's own
 * colour so it stays sharp. It marks something that opens or orders: the "Equip on" button's menu, the
 * column a table is sorted by. `small` is five squares by three (8 by 5 px), `medium` seven by four
 * (14 by 8 px). Decorative: the words next to it say what it does. Never draw another triangle; turn
 * this one with CSS if it must point another way.
 */
const SIZES = {
  small: { width: 5, height: 3, px: [8, 5] },
  medium: { width: 7, height: 4, px: [14, 8] },
} as const;

export type PixelTriangleSize = keyof typeof SIZES;

export function PixelTriangle({
  size = 'small',
  class: extra,
}: {
  size?: PixelTriangleSize;
  class?: string;
}) {
  const { width, height, px } = SIZES[size];
  return (
    <svg
      class={`pixel-triangle${extra === undefined ? '' : ` ${extra}`}`}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={px[0]}
      height={px[1]}
      aria-hidden="true"
      focusable="false"
      shape-rendering="crispEdges"
    >
      {Array.from({ length: height }, (_, row) => (
        <rect key={row} x={row} y={row} width={width - 2 * row} height={1} />
      ))}
    </svg>
  );
}
