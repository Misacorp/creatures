/**
 * The art library's concept wrapper of a furniture set (`sprites/concepts/house-<set>.ts`): every sprite of the
 * set's pack with a line on what it is, so the studio can draw, lint and catalogue it (`pnpm art house-<set>`).
 * `pnpm housing new-set` writes a three-line wrapper that calls this.
 */
import type { HouseArtPack } from '../../housing/house-art';
import type { Concept, ConceptSet } from '../concepts/index';
import { expandRows, type SpriteDef } from '../sprite-data';

const FORM_NOTES: Readonly<Record<string, string>> = {
  bed: 'bed, 48x26, floor-large: headboard, mattress, pillow; the blanket is the front layer over the sleeper',
  cupboard: 'cupboard, 30x36, floor-large: two doors, a plinth',
  table: 'table, 44x18, floor-large: a top on legs',
  shelf: 'wall shelf, 40x20, wall-large: a board on brackets with a few things on it',
  stool: 'stool, 16x12, floor-small',
  lamp: 'hanging lamp, 20x16, ceiling: hangs from the top row; the glow sprite is drawn over it at night',
  rug: 'rug, 56x10, rug spot: flat, seen from the front',
  frame: 'picture frame, 24x16, wall-small',
  curtains: 'window with its dressing, 36x26, window spot',
};

/** The front layer laid over the back one: how the made bed looks with nobody in it. */
function overlay(back: SpriteDef, front: SpriteDef): SpriteDef {
  const a = expandRows(back).map((row) => [...row]);
  expandRows(front).forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') a[y]![x] = ch;
    }),
  );
  return { rows: a.map((row) => row.join('')), palette: { ...back.palette, ...front.palette } };
}

/** The concepts of a pack: pieces (with their front and glow layers), skins and the keepsake, by id. */
export function conceptsOf(pack: HouseArtPack, set: string): Record<string, Concept> {
  const out: Record<string, Concept> = {};
  for (const [id, art] of Object.entries(pack.pieces ?? {})) {
    const form = id.slice(set.length + 1);
    out[id] = {
      kind: 'free',
      note: FORM_NOTES[form] ?? form,
      sprite: art.sprite,
      ...(art.front ? { variants: { made: overlay(art.sprite, art.front) } } : {}),
    };
    if (art.front)
      out[`${id}-front`] = {
        kind: 'free',
        note: `${form}: the layer drawn over the sleeper`,
        sprite: art.front,
      };
    if (art.glow)
      out[`${id}-glow`] = {
        kind: 'free',
        note: `${form}: night glow, drawn over the lamp`,
        sprite: art.glow,
      };
  }
  for (const [id, skin] of Object.entries(pack.skins ?? {})) {
    out[id] = {
      kind: 'free',
      note: id.endsWith('-wall')
        ? 'wallpaper tile 16x52, repeats across, no outline'
        : 'floor tile 16x8, repeats across, no outline',
      sprite: skin.tile,
    };
  }
  for (const [id, sprite] of Object.entries(pack.keepsakes ?? {})) {
    out[`${id}-keepsake`] = {
      kind: 'free',
      note: 'keepsake 12x12, shown in the trophy hall cabinet when the set is complete',
      sprite,
    };
  }
  return out;
}

/** A furniture set as a concept set, `house-<id>`. */
export function houseSetConcept(
  id: string,
  name: string,
  pack: HouseArtPack,
  theme: string,
): ConceptSet {
  return {
    id: `house-${id}`,
    title: `House: ${name} set`,
    requested:
      '2026-11-11: player housing furniture, a set made in the workshop (pnpm housing new-set).',
    status: 'draft',
    notes: [
      `${theme} Drawn from its style (apps/activity/src/sprites/workshop/styles/${id}.ts); the pack is data/house/${id}.ts.`,
      'Needs the housing content (piece, skin and set ids as drawn).',
    ],
    sprites: conceptsOf(pack, id),
  };
}
