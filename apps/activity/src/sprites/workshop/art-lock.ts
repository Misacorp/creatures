/**
 * The second table of the art lock (`docs/design/housing-workshop.md`, "Render, compare, lock"): a hash of every other picture
 * the house is drawn from, so a change to the drawing library or a pack that changes shipped art fails a test until someone has
 * looked at it and run `pnpm housing lock`. `shipped-art.json` (by `lockOf` in `sets.ts`) holds the sets' pieces; this table,
 * `art-digest.json`, holds:
 *
 * - every hand-drawn pack's pieces (with their `light`), skins, stamps, keepsakes, displays and shell art, and each set's
 *   pack beyond its nine forms (its wallpaper, floor and keepsake), all as the game loads them (`HOUSE_ART`);
 * - the postcard's hand pieces;
 * - every generated interior tile: each wallpaper, floor, trim and ceiling pattern in each of its colours (a trim under each
 *   ceiling depth, a ceiling for a one- and a two-cell room), and each frame material's post and slab.
 *
 * Pure: imported by the Vitest suite and by `scripts/housing.mts` under Node's type stripping.
 */
import type { HouseArtPack, PieceArt } from '../../housing/house-art';
import { HOUSE_ART as COSY } from '../data/house/cosy';
import { HOUSE_ART as DISPLAYS } from '../data/house/displays';
import { HOUSE_ART as GARDEN } from '../data/house/garden';
import { HOUSE_ART as NEW_GROUNDS } from '../data/house/new-grounds';
import { HOUSE_ART as NEW_PARTS } from '../data/house/new-parts';
import { POSTCARD_ART } from '../data/house/postcard';
import { HOUSE_ART as ROOMS } from '../data/house/rooms';
import { HOUSE_ART as SHELL } from '../data/house/shell';
import { HOUSE_ART as WILD } from '../data/house/wild';
import type { SpriteDef } from '../sprite-data';
import { fnv, pieceHash, spriteHash } from './compare';
import { CEILING_COLOURS, CEILING_KINDS, ceilingHeight, ceilingOverlay } from './interior/ceilings';
import { FLOOR_PATTERNS, floorTile } from './interior/floors';
import { FRAMES } from './interior/frame';
import { CELL_W } from './interior/kit';
import { FLOOR_COLOURS, TRIM_COLOURS, WALL_COLOURS } from './interior/palettes';
import { TRIM_KINDS, trimOverlay } from './interior/trim';
import { WALL_PATTERNS, wallpaper } from './interior/wallpaper';
import { setPack } from './pack';
import { SHIPPED_SETS } from './sets';
import { SET_FORMS } from './style';

/** The packs drawn by hand (not a set made from a style), by file name in `sprites/data/house/`. */
export const HAND_PACKS: Readonly<Record<string, HouseArtPack>> = {
  cosy: COSY,
  displays: DISPLAYS,
  garden: GARDEN,
  'new-grounds': NEW_GROUNDS,
  'new-parts': NEW_PARTS,
  rooms: ROOMS,
  shell: SHELL,
  wild: WILD,
};

const sprites = (
  out: Record<string, string>,
  prefix: string,
  table: Readonly<Record<string, SpriteDef | undefined>> | undefined,
): void => {
  for (const [id, def] of Object.entries(table ?? {})) {
    if (def !== undefined) out[`${prefix}/${id}`] = spriteHash(def);
  }
};

/** Every picture of a pack, keyed `<pack>/<kind>/<id>`; `skip` leaves out pieces another table holds. */
function packDigest(
  out: Record<string, string>,
  name: string,
  pack: HouseArtPack,
  skip: ReadonlySet<string> = new Set(),
): void {
  for (const [id, art] of Object.entries(pack.pieces ?? {})) {
    if (!skip.has(id)) out[`${name}/piece/${id}`] = pieceHash(art satisfies PieceArt);
  }
  for (const [id, skin] of Object.entries(pack.skins ?? {})) {
    out[`${name}/skin/${id}`] = fnv(
      [
        spriteHash(skin.tile),
        skin.ridge === undefined ? '-' : spriteHash(skin.ridge),
        skin.eave === undefined ? '-' : spriteHash(skin.eave),
        (skin.scenery ?? []).map((s) => `${spriteHash(s.sprite)}@${String(s.x)}`).join(','),
      ].join('|'),
    );
  }
  sprites(out, `${name}/stamp`, pack.stamps);
  sprites(out, `${name}/keepsake`, pack.keepsakes);
  sprites(out, `${name}/display`, pack.displays);
  sprites(out, `${name}/shell`, pack.shell);
}

/** The generated interior tiles: every pattern in every colour of the workshop's libraries. */
function interiorDigest(out: Record<string, string>): void {
  for (const pattern of WALL_PATTERNS) {
    for (const tones of WALL_COLOURS)
      out[`interior/wall/${pattern.id}/${tones.id}`] = spriteHash(wallpaper(pattern, tones));
  }
  for (const pattern of FLOOR_PATTERNS) {
    for (const tones of FLOOR_COLOURS)
      out[`interior/floor/${pattern.id}/${tones.id}`] = spriteHash(floorTile(pattern, tones));
  }
  const depths = [...new Set([4, ...CEILING_KINDS.map((k) => ceilingHeight(k.id))])].sort(
    (a, b) => a - b,
  );
  for (const kind of TRIM_KINDS) {
    for (const tones of TRIM_COLOURS) {
      const tiles = depths.map((d) => {
        const tile = trimOverlay(kind.id, tones, d);
        return tile === undefined ? '-' : spriteHash(tile);
      });
      out[`interior/trim/${kind.id}/${tones.id}`] = fnv(tiles.join('|'));
    }
  }
  for (const kind of CEILING_KINDS) {
    for (const colours of CEILING_COLOURS) {
      const tiles = [CELL_W, 2 * CELL_W].map((w) =>
        spriteHash(ceilingOverlay(kind.id, colours, w)),
      );
      out[`interior/ceiling/${kind.id}/${colours.id}`] = fnv(tiles.join('|'));
    }
  }
  for (const frame of FRAMES) {
    out[`interior/frame/${frame.id}`] = fnv(`${spriteHash(frame.post)}|${spriteHash(frame.slab)}`);
  }
}

/** The second table of the lock: see the file comment. Keys are sorted, so the file is stable. */
export function artDigest(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, pack] of Object.entries(HAND_PACKS)) packDigest(out, name, pack);
  for (const [id, source] of Object.entries(SHIPPED_SETS)) {
    // the nine form pieces are in shipped-art.json; the rest of the set's pack is here
    const forms = new Set(SET_FORMS.map((form) => `${source.style.id}-${form}`));
    packDigest(out, `set:${id}`, setPack(source), forms);
  }
  sprites(out, 'postcard', POSTCARD_ART);
  interiorDigest(out);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
