import { resourceIcon } from '@creatures/game';
import type { PartKind } from './gear-types';

/**
 * A little picture a view model asks for, as plain data: a bundled glyph, a supply (drawn like a
 * glyph, its id is the supply kind), a gear part, a gear item's art, an element's icon or a house piece, skin
 * or stamp (`housing/house-icon.ts`). The one
 * renderer is `<GameIcon>` (`ui/GameIcon.tsx`); every view model that names an icon uses this type.
 */
export type IconRef =
  | { kind: 'glyph'; id: string }
  | { kind: 'supply'; id: string }
  | { kind: 'part'; part: PartKind }
  | { kind: 'gear'; baseId: string }
  | { kind: 'element'; element: string }
  /** A house piece, skin or stamp; `silhouette`: its shape in one flat colour (not found yet); `box`: fit a square of this many CSS px. */
  | { kind: 'house'; id: string; silhouette?: boolean; box?: number };

/** The icon of a resource from the resource library (a plain diamond for an id it does not know). */
export function resourceIconRef(id: string): IconRef {
  const icon = resourceIcon(id);
  if (icon === undefined) return { kind: 'glyph', id: 'unknown' };
  // The library names a part icon by part kind: the same ids.
  return icon.kind === 'part' ? { kind: 'part', part: icon.part as PartKind } : icon;
}
