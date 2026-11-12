/**
 * Trim (`docs/design/housing-interior.md`, layer 3): the skirting, the wainscot, the cornice and the picture rail of a
 * room, drawn over the wallpaper as an overlay tile 28 wide (a divisor of 112) and 52 tall, transparent where the paper
 * shows. A trim is a kind (which parts) in a colourway (painted wood, dark panelling or stone). Keys `a b c d` as the
 * wallpaper: `a` face, `b` recess, `c` light edge, `d` shade.
 */
import type { SpriteDef } from '../../sprite-data';
import { hash2, makeTile, paletteOf, WALL_H, type Tones } from './kit';

export type TrimKind = 'none' | 'skirting' | 'classic' | 'wainscot' | 'panelled';

export const TRIM_KINDS: readonly { id: TrimKind; name: string; note: string }[] = [
  { id: 'none', name: 'None', note: 'bare paper to the floor' },
  { id: 'skirting', name: 'Skirting', note: 'a board along the floor' },
  { id: 'classic', name: 'Classic', note: 'skirting, picture rail and cornice' },
  { id: 'wainscot', name: 'Wainscot', note: 'panelled lower wall, skirting and cornice' },
  { id: 'panelled', name: 'Panelled', note: 'tall panelling, skirting and cornice' },
];

const SKIRT_TOP = 47;

const isStone = (t: Tones): boolean => t.id.startsWith('stone');

/** The key of the trim at a pixel, or `.`. `ceilingH` is where the ceiling ends (the cornice hangs from it). */
function trimAt(kind: TrimKind, tones: Tones, ceilingH: number, x: number, y: number): string {
  if (kind === 'none') return '.';
  const stone = isStone(tones);

  // skirting
  if (y >= SKIRT_TOP) {
    const r = y - SKIRT_TOP;
    if (stone && r >= 1 && r <= 3 && x % 14 === 0) return 'd';
    return ['c', 'a', 'a', 'b', 'd'][r] ?? '.';
  }

  // cornice and picture rail (not on a bare skirting)
  if (kind !== 'skirting') {
    const r = y - ceilingH;
    if (r >= 0 && r < 5) {
      if (stone && r === 2) return x % 4 < 2 ? 'a' : '.';
      return ['c', 'a', 'a', 'b', 'd'][r] ?? '.';
    }
  }
  if (kind === 'classic') {
    const r = y - (ceilingH + 9);
    if (r === 0) return 'c';
    if (r === 1) return 'a';
    if (r === 2) return 'd';
  }

  // panelling
  if (kind === 'wainscot' || kind === 'panelled') {
    const top = kind === 'wainscot' ? 30 : 17;
    if (y < top || y >= SKIRT_TOP) return '.';
    const r = y - top;
    if (r === 0) return 'c';
    if (r === 1) return 'a';
    if (r === 2) return 'd';
    if (stone) {
      const course = Math.floor((r - 3) / 5);
      const cr = (r - 3) % 5;
      if (cr === 4) return 'd';
      if ((x + (course % 2) * 7) % 14 === 0) return 'd';
      if (cr === 0) return 'c';
      return hash2(Math.floor((x + (course % 2) * 7) / 14), course, 41) % 3 === 0 ? 'b' : 'a';
    }
    const m = x % 14;
    if (m < 2 || m > 11) return 'a';
    const pt = top + 4;
    const pb = SKIRT_TOP - 3;
    if (y < pt || y > pb) return 'a';
    if (y === pt || m === 2) return 'd';
    if (y === pb || m === 11) return 'c';
    return 'b';
  }
  return '.';
}

/** The overlay tile for a kind and colourway: 28 x 52. */
export function trimOverlay(kind: TrimKind, tones: Tones, ceilingH: number): SpriteDef | undefined {
  if (kind === 'none') return undefined;
  return makeTile(28, WALL_H, (x, y) => trimAt(kind, tones, ceilingH, x, y), paletteOf(tones));
}
