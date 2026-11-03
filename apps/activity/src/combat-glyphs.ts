/**
 * The pictures the combat v2 board draws (docs/design/combat/icons.md): a boss move's shape icon, a role's icon, and the
 * drafts of the icons Misa has not answered yet. A shape or role icon is a shipped glyph (`glyphs.ts`); a draft is read
 * from the concept set (`sprites/concepts/combat-icons.ts`) so there is one drawing of it, and it moves into `glyphs.ts`
 * (and out of the concept set) when he approves it. `DRAFT_GLYPH_IDS` is the list a report hands him.
 */
import { ROLE_GLYPH } from './dungeon-rooms';
import { glyph } from './glyphs';
import { COMBAT_ICONS_CONCEPTS } from './sprites/concepts/combat-icons';
import type { SpriteDef } from './sprites/sprite-data';

/** The drafts a screen draws before Misa has approved them: Leap's redraw, Armour, Escalating and Determination. */
export const DRAFT_GLYPH_IDS = ['shape-leap', 'armour', 'escalating', 'determination'] as const;
type DraftId = (typeof DRAFT_GLYPH_IDS)[number];

const isDraft = (id: string): id is DraftId => (DRAFT_GLYPH_IDS as readonly string[]).includes(id);

/** A combat v2 glyph by id: a shipped one, or the concept draft of one still waiting for Misa; undefined for an unknown id. */
export function combatGlyph(id: string): SpriteDef | undefined {
  const shipped = glyph(id);
  if (shipped !== undefined) return shipped;
  return isDraft(id) ? COMBAT_ICONS_CONCEPTS.sprites[id]?.sprite : undefined;
}

/** The glyph id of a boss move's shape (the library's `shape`), with `silences` (Hush) and `oneShot` picking their own. */
export function moveGlyphId(move: { shape: string; silences: boolean; oneShot: boolean }): string {
  if (move.oneShot) return 'shape-one-shot';
  switch (move.shape) {
    case 'single':
      return 'shape-strike';
    case 'line3':
      return 'shape-slam';
    case 'row':
    case 'rows':
    case 'randomRow':
      return 'sweep';
    case 'column':
    case 'columns':
      return 'shape-lance';
    case 'rowEnds':
      return move.silences ? 'silence_ends' : 'shape-pincer';
    case 'scatter':
      return 'barrage';
    case 'all':
      return 'shape-quake';
    case 'chain':
      return 'shape-leap';
    case 'cross':
      return 'shape-cross';
    case 'checker':
      return 'shape-checker';
    default:
      return 'unknown';
  }
}

/** The glyph id of a creature's role: the picture the role's job looks like (setter, payoff, guard, support). */
export function roleGlyphId(role: string): string | null {
  return Object.hasOwn(ROLE_GLYPH, role)
    ? (ROLE_GLYPH[role as keyof typeof ROLE_GLYPH] ?? null)
    : null;
}
