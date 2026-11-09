/**
 * Housing furniture, batch E3: the Stormglass, Fenkeeper, Ancient and Lantern Night sets (nine pieces, a
 * wallpaper, a floor and a keepsake each). The art lives in `../data/house/<set>.ts`; this file only wraps
 * it so the studio can draw, lint and catalogue it (`pnpm art house-stormglass`). Nothing in the game
 * imports the concepts folder.
 */
import { expandRows, type SpriteDef } from '../sprite-data';
import { HOUSE_ART as stormglass } from '../data/house/stormglass';
import { HOUSE_ART as fenkeeper } from '../data/house/fenkeeper';
import { HOUSE_ART as ancient } from '../data/house/ancient';
import { HOUSE_ART as lanternNight } from '../data/house/lantern-night';
import type { HouseArtPack } from '../data/house/stormglass';
import type { Concept, ConceptSet } from './index';

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

function conceptsOf(pack: HouseArtPack, set: string): Record<string, Concept> {
  const out: Record<string, Concept> = {};
  for (const [id, art] of Object.entries(pack.pieces ?? {})) {
    const form = id.slice(set.length + 1);
    const note = FORM_NOTES[form] ?? form;
    out[id] = {
      kind: 'free',
      note,
      sprite: art.sprite,
      ...(art.front ? { variants: { made: overlay(art.sprite, art.front) } } : {}),
    };
    if (art.front) {
      out[`${id}-front`] = {
        kind: 'free',
        note: `${form}: the layer drawn over the sleeper`,
        sprite: art.front,
      };
    }
    if (art.glow) {
      out[`${id}-glow`] = {
        kind: 'free',
        note: `${form}: night glow, drawn over the lamp`,
        sprite: art.glow,
      };
    }
  }
  for (const [id, skin] of Object.entries(pack.skins ?? {})) {
    const wall = id.endsWith('-wall');
    out[id] = {
      kind: 'free',
      note: wall
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

export const HOUSE_STORMGLASS: ConceptSet = {
  id: 'house-stormglass',
  title: 'House: Stormglass set',
  requested:
    '2026-11-09: player housing furniture, batch E3 (Stormglass, Fenkeeper, Ancient, Lantern Night), see docs/design/housing.md section 5.',
  status: 'draft',
  notes: [
    'Spark set: pale ash wood, slate, copper zigzag trim, storm-violet glass beads; angular, chamfered, splayed legs.',
    'Needs the housing content (piece, skin and set ids as drawn); the pack goes to data/house/stormglass.ts and is read by house-art.ts.',
  ],
  sprites: conceptsOf(stormglass, 'stormglass'),
};

export const HOUSE_FENKEEPER: ConceptSet = {
  id: 'house-fenkeeper',
  title: 'House: Fenkeeper set',
  requested:
    '2026-11-09: player housing furniture, batch E3 (Stormglass, Fenkeeper, Ancient, Lantern Night), see docs/design/housing.md section 5.',
  status: 'draft',
  notes: [
    'Mire set: dark bog oak, reed binding, murky teal and an opal drop; squat, round, bulb legs, uneven drips.',
    'Needs the housing content (piece, skin and set ids as drawn); the pack goes to data/house/fenkeeper.ts and is read by house-art.ts.',
  ],
  sprites: conceptsOf(fenkeeper, 'fenkeeper'),
};

export const HOUSE_ANCIENT: ConceptSet = {
  id: 'house-ancient',
  title: 'House: Ancient set',
  requested:
    '2026-11-09: player housing furniture, batch E3 (Stormglass, Fenkeeper, Ancient, Lantern Night), see docs/design/housing.md section 5.',
  status: 'draft',
  notes: [
    'Neutral set: sandstone, faded gold, patina teal; stepped ziggurat tops, thick square legs, spirals carved in every piece.',
    'Needs the housing content (piece, skin and set ids as drawn); the pack goes to data/house/ancient.ts and is read by house-art.ts.',
  ],
  sprites: conceptsOf(ancient, 'ancient'),
};

export const HOUSE_LANTERN_NIGHT: ConceptSet = {
  id: 'house-lantern-night',
  title: 'House: Lantern Night set',
  requested:
    '2026-11-09: player housing furniture, batch E3 (Stormglass, Fenkeeper, Ancient, Lantern Night), see docs/design/housing.md section 5.',
  status: 'draft',
  notes: [
    'Neutral set: festival red, gold, cream; round lantern shapes, bunting and tassels hanging from every piece.',
    'Needs the housing content (piece, skin and set ids as drawn); the pack goes to data/house/lantern-night.ts and is read by house-art.ts.',
  ],
  sprites: conceptsOf(lanternNight, 'lantern-night'),
};
