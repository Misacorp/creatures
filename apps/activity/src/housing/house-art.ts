/**
 * The art registry of the house: every pack in `sprites/data/house/*.ts` exports `HOUSE_ART` and this file collects them
 * (`docs/design/housing.md` section 5), so a pack never edits a shared list.
 *
 * NOTE (package C2): this is the small version the panels need (`pieceArt`, `skinArt`, `stampArt` and `ART_PENDING`
 * of the C1 contract, with a plain grey box for what has no art yet). Package C1 owns this file and adds the scene's
 * lookups (`displayArt`, `shellArt`, the form-sized placeholder). On merge keep C1's file, and keep its one call to
 * `registerHouseIcons(...)` that lets `GameIcon` draw an item id without importing the art.
 */
import { housing } from '@creatures/game';
import type { SpriteDef } from '../sprites/sprite-data';
import { registerHouseIcons } from './house-icon';

export interface PieceArt {
  sprite: SpriteDef;
  front?: SpriteDef;
  sleep?: { x: number; y: number };
  glow?: SpriteDef;
}

export interface SkinArt {
  tile: SpriteDef;
  ridge?: SpriteDef;
  eave?: SpriteDef;
}

export interface HouseArtPack {
  pieces?: Record<string, PieceArt>;
  skins?: Record<string, SkinArt>;
  stamps?: Record<string, SpriteDef>;
  keepsakes?: Record<string, SpriteDef>;
  displays?: Partial<Record<string, SpriteDef>>;
  shell?: Partial<Record<string, SpriteDef>>;
}

const PACKS = import.meta.glob<{ HOUSE_ART?: HouseArtPack }>(
  ['../sprites/data/house/*.ts', '!../sprites/data/house/*.test.ts'],
  { eager: true },
);

const PIECES = new Map<string, PieceArt>();
const SKINS = new Map<string, SkinArt>();
const STAMPS = new Map<string, SpriteDef>();

for (const mod of Object.values(PACKS)) {
  const pack = mod.HOUSE_ART;
  if (pack === undefined) continue;
  for (const [id, art] of Object.entries(pack.pieces ?? {})) PIECES.set(id, art);
  for (const [id, art] of Object.entries(pack.skins ?? {})) SKINS.set(id, art);
  for (const [id, art] of Object.entries(pack.stamps ?? {})) STAMPS.set(id, art);
}

/** A plain grey box with the ink edge, for anything with no art yet. */
const PLACEHOLDER: SpriteDef = {
  palette: { k: '#0d0a1a', g: '#8a8798' },
  rows: [
    'kkkkkkkk',
    'kggggggk',
    'kggggggk',
    'kggggggk',
    'kggggggk',
    'kggggggk',
    'kggggggk',
    'kkkkkkkk',
  ],
};

/** A piece's art, or a grey box while it has none. */
export function pieceArt(id: string): PieceArt {
  return PIECES.get(id) ?? { sprite: PLACEHOLDER };
}

/** A skin's art, or a grey box while it has none. */
export function skinArt(id: string): SkinArt {
  return SKINS.get(id) ?? { tile: PLACEHOLDER };
}

/** A stamp's 16 x 16 picture, or a grey box while it has none. */
export function stampArt(id: string): SpriteDef {
  return STAMPS.get(id) ?? PLACEHOLDER;
}

/** Ids of the content that has no art yet. */
export const ART_PENDING: ReadonlySet<string> = new Set([
  ...housing.pieces.filter((p) => !PIECES.has(p.id)).map((p) => p.id),
  ...housing.skins.filter((s) => !SKINS.has(s.id)).map((s) => s.id),
  ...housing.stamps.filter((s) => !STAMPS.has(s.id)).map((s) => s.id),
]);

registerHouseIcons((id) => PIECES.get(id)?.sprite ?? SKINS.get(id)?.tile ?? STAMPS.get(id));
