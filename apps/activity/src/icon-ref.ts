import type { PartKind } from './gear-types';

/**
 * A little picture a view model asks for, as plain data: a bundled glyph, a supply (drawn like a
 * glyph, its id is the supply kind), a gear part, a gear item's art or an element's icon. The one
 * renderer is `<GameIcon>` (`ui/GameIcon.tsx`); every view model that names an icon uses this type.
 */
export type IconRef =
  | { kind: 'glyph'; id: string }
  | { kind: 'supply'; id: string }
  | { kind: 'part'; part: PartKind }
  | { kind: 'gear'; baseId: string }
  | { kind: 'element'; element: string };
