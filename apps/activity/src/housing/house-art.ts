/**
 * The art registry of the player house (`docs/design/housing.md` section 5). Every art pack in
 * `sprites/data/house/*.ts` exports a `HOUSE_ART` of the shape below; this file collects them with a glob, so a pack
 * never edits a shared list, and answers every question the scene and the panels have about a picture:
 * `pieceArt`, `skinArt`, `stampArt`, `displayArt`, `shellArt`, `keepsakeArt`. An id with no art yet draws as a
 * grey, ink-outlined box of its size (`house-placeholder.ts`) and is listed in `ART_PENDING`, which is empty
 * when every pack is in. Nothing else in the game reads the packs.
 */
import { housing, type HousingContent } from '@creatures/game';
import type { SpriteDef } from '../sprites/sprite-data';
import { registerHouseIcons } from './house-icon';
import { placeholderSprite, placeholderTile } from './house-placeholder';

/** One piece of furniture: its picture and the layers that go with it. All layers share the picture's size and origin, except `glow`. */
export interface PieceArt {
  sprite: SpriteDef;
  /** Drawn over the housemate (the bed's blanket, the sofa's arm): same size and origin as `sprite`. */
  front?: SpriteDef;
  /** A bed: where a sleeping 16x16 creature's top-left goes, in the bed's own pixels. */
  sleep?: { x: number; y: number };
  /** A night glow (a lamp, the hearth, the lantern post). Centred on the piece, its top 4 px below the piece's top. */
  glow?: SpriteDef;
}

export type SkinArt = { tile: SpriteDef; ridge?: SpriteDef; eave?: SpriteDef };

export type DisplayName =
  | 'plaque'
  | 'plaque-empty'
  | 'bench'
  | 'badge-slot'
  | 'case'
  | 'shelf'
  | 'books'
  | 'marker'
  | 'cabinet';

export type ShellName =
  'slab' | 'earth' | 'chimney' | 'door' | 'mailbox' | 'mailbox-empty' | 'workbench' | 'vent' | 'z';

export interface HouseArtPack {
  /** By piece id. */
  pieces?: Record<string, PieceArt>;
  /** By skin id: wall and floor tiles, roofs (with ridge and eave), wall frames and the ground tiles. */
  skins?: Record<string, SkinArt>;
  /** 16x16, by stamp id. */
  stamps?: Record<string, SpriteDef>;
  /** 12x12, by set id. */
  keepsakes?: Record<string, SpriteDef>;
  displays?: Partial<Record<DisplayName, SpriteDef>>;
  shell?: Partial<Record<ShellName, SpriteDef>>;
}

const modules = import.meta.glob<{ HOUSE_ART?: HouseArtPack }>(
  ['../sprites/data/house/*.ts', '!../sprites/data/house/*.test.ts'],
  { eager: true },
);

/** The packs found (stable order, by file name). */
const packs: readonly HouseArtPack[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([, m]) => (m.HOUSE_ART === undefined ? [] : [m.HOUSE_ART]));

function find<T>(pick: (pack: HouseArtPack) => T | undefined): T | undefined {
  for (const pack of packs) {
    const hit = pick(pack);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** A lookup by own property only, so an id such as "constructor" never reaches `Object.prototype`. */
function own<T>(table: Readonly<Record<string, T>> | undefined, id: string): T | undefined {
  return table !== undefined && Object.hasOwn(table, id) ? table[id] : undefined;
}

/** The picture of a piece, or a grey box of its form's size when no pack has it. */
export function pieceArt(id: string, content: HousingContent = housing): PieceArt {
  const art = find((p) => own(p.pieces, id));
  if (art !== undefined) return art;
  const piece = content.pieces.find((x) => x.id === id);
  const form = piece === undefined ? undefined : content.forms.find((f) => f.id === piece.form);
  return { sprite: placeholderSprite(form?.box.w ?? 16, form?.box.h ?? 16) };
}

/** True when a pack has the piece's picture. */
export function hasPieceArt(id: string): boolean {
  return find((p) => own(p.pieces, id)) !== undefined;
}

/** What a skin kind's tile measures when no pack has it. */
const TILE_SIZE: Readonly<Record<string, { w: number; h: number }>> = {
  wall: { w: 16, h: 52 },
  floor: { w: 16, h: 8 },
  roof: { w: 16, h: 8 },
  walls: { w: 8, h: 8 },
  ground: { w: 16, h: 8 },
};

/** The tiles of a skin (wallpaper, floor, roof, wall frame or ground), or a grey tile of its kind's size. */
export function skinArt(id: string, kind: string): SkinArt {
  const art = find((p) => own(p.skins, id));
  if (art !== undefined) return art;
  const size = TILE_SIZE[kind] ?? { w: 16, h: 8 };
  return { tile: placeholderTile(size.w, size.h) };
}

export function hasSkinArt(id: string): boolean {
  return find((p) => own(p.skins, id)) !== undefined;
}

/** A stamp's 16x16 picture, or a grey box. */
export function stampArt(id: string): SpriteDef {
  return find((p) => own(p.stamps, id)) ?? placeholderSprite(16, 16);
}

export function hasStampArt(id: string): boolean {
  return find((p) => own(p.stamps, id)) !== undefined;
}

/** A finished set's 12x12 keepsake; undefined for a set with none drawn. */
export function keepsakeArt(setId: string): SpriteDef | undefined {
  return find((p) => own(p.keepsakes, setId));
}

/** A display's sprite (the plaque board, the bench ...), or a grey box of its usual size. */
export function displayArt(name: DisplayName): SpriteDef {
  return (
    find((p) => p.displays?.[name]) ??
    placeholderSprite(DISPLAY_FALLBACK[name].w, DISPLAY_FALLBACK[name].h)
  );
}

const DISPLAY_FALLBACK: Readonly<Record<DisplayName, { w: number; h: number }>> = {
  plaque: { w: 28, h: 32 },
  'plaque-empty': { w: 28, h: 32 },
  bench: { w: 26, h: 16 },
  'badge-slot': { w: 12, h: 12 },
  case: { w: 26, h: 22 },
  shelf: { w: 26, h: 8 },
  books: { w: 26, h: 16 },
  marker: { w: 12, h: 24 },
  cabinet: { w: 26, h: 32 },
};

const SHELL_FALLBACK: Readonly<Record<ShellName, { w: number; h: number }>> = {
  slab: { w: 16, h: 4 },
  earth: { w: 16, h: 16 },
  chimney: { w: 14, h: 28 },
  door: { w: 16, h: 30 },
  mailbox: { w: 14, h: 21 },
  'mailbox-empty': { w: 14, h: 21 },
  workbench: { w: 32, h: 22 },
  vent: { w: 12, h: 9 },
  z: { w: 7, h: 7 },
};

/** A part of the building (slab, earth, chimney, door ...), or a grey box. */
export function shellArt(name: ShellName): SpriteDef {
  // The flag-down mailbox is drawn after the first one: until it is in a pack, the flag-up one stands for both.
  if (name === 'mailbox-empty') return find((p) => p.shell?.[name]) ?? shellArt('mailbox');
  return (
    find((p) => p.shell?.[name]) ??
    placeholderSprite(SHELL_FALLBACK[name].w, SHELL_FALLBACK[name].h)
  );
}

/**
 * Ids with no art yet: pieces, skins and stamps by their id, and a set's keepsake as `keepsake:<set>`. Empty when every
 * pack is in (the lead checks it at integration); the scene and the panels still draw a grey box for each.
 */
export function pendingArt(content: HousingContent = housing): ReadonlySet<string> {
  const out = new Set<string>();
  for (const piece of content.pieces) if (!hasPieceArt(piece.id)) out.add(piece.id);
  for (const skin of content.skins) if (!hasSkinArt(skin.id)) out.add(skin.id);
  for (const stamp of content.stamps) if (!hasStampArt(stamp.id)) out.add(stamp.id);
  for (const set of content.sets)
    if (keepsakeArt(set.id) === undefined) out.add(`keepsake:${set.id}`);
  return out;
}

export const ART_PENDING: ReadonlySet<string> = pendingArt();

/** A skin's tile as an icon: at most 16 rows, from the middle of a tall wallpaper. */
function skinIcon(tile: SpriteDef): SpriteDef {
  return tile.rows.length <= 16 ? tile : { ...tile, rows: tile.rows.slice(8, 24) };
}

// `ui/GameIcon` draws `{ kind: 'house' }` icons through this, so the main bundle never imports the art.
registerHouseIcons((id) => {
  const piece = find((p) => own(p.pieces, id));
  if (piece !== undefined) return piece.sprite;
  const skin = find((p) => own(p.skins, id));
  if (skin !== undefined) return skinIcon(skin.tile);
  return find((p) => own(p.stamps, id));
});
