/**
 * The house shell (housing art batch E1), concept wrapper: the building's fixtures, the roof and
 * wall-frame skins and the ground skins of `data/house/shell.ts`, so the studio can draw, lint and
 * catalogue them. Day is the main palette; `alts.night` recolours the same pixels (the door's window
 * and the glass light up). Every tile also has a `tiled` variant (2 x 2) to check its seams.
 */
import type { SpriteDef } from '../sprite-data';
import { HOUSE_ART } from '../data/house/shell';
import type { Concept, ConceptSet } from './index';

const LIT: Readonly<Record<string, string>> = { y: '#ffd966', g: '#fff6c8', p: '#fff6c8' };

function channel(hex: string, at: number): number {
  return Number.parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
}

/** A palette in the night light: darker, pulled toward the night blue; lit keys stay warm. */
function nightPalette(def: SpriteDef, lit: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, colour] of Object.entries(def.palette)) {
    if (key === 'k') continue;
    const warm = LIT[key];
    if (lit && warm !== undefined) {
      out[key] = warm;
      continue;
    }
    const mixed = [0, 1, 2].map((i) => {
      const night = [0x1c, 0x1a, 0x48][i] ?? 0;
      return Math.round((channel(colour, i) * 0.62 + night * 0.38) * 0.82);
    });
    out[key] = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return out;
}

function tiled(def: SpriteDef): SpriteDef {
  const twice = [...def.rows, ...def.rows].map((r) => r + r);
  return { palette: def.palette, rows: twice };
}

const sprites: Record<string, Concept> = {};

function add(
  id: string,
  note: string,
  sprite: SpriteDef,
  options: { tile?: boolean; lit?: boolean } = {},
): void {
  sprites[id] = {
    kind: 'free',
    note,
    sprite,
    alts: { night: nightPalette(sprite, options.lit === true) },
    ...(options.tile === true ? { variants: { tiled: tiled(sprite) } } : {}),
  };
}

const ROOF_NOTES: Record<string, string> = {
  thatch: 'Thatch (starter): straw strands slanting down, a twine band, a bundled ridge.',
  slate: 'Slate: square plates, cool blue-grey.',
  'red-tile': 'Red Tile: barrel tiles with scalloped bottoms, the valley house roof.',
  'copper-green': 'Copper Green: standing seams with copper rivets.',
  moss: 'Moss: brown shingles with moss creeping along the seams.',
};
const WALL_NOTES: Record<string, string> = {
  plaster: 'Plaster (starter): cream, speckled.',
  timber: 'Timber: upright boards, 4 px wide so a 4 px wall shows a whole board.',
  fieldstone: 'Fieldstone: uneven stones in dark mortar.',
  brick: 'Brick: running bond with light mortar.',
  shingle: 'Shingle: sea-blue wall shingles.',
};
const GROUND_NOTES: Record<string, string> = {
  lawn: 'Lawn (garden default): grass, the lit top row is the ground line.',
  deck: 'Deck (terrace default): planks, top row lit.',
  'pool-tile': 'Pool Tile: white tiles with grout, the basin wall and floor.',
  'pool-water': 'Pool water: wraps sideways without a seam; the scene lays it inside the basin.',
};

const skins = HOUSE_ART.skins ?? {};
for (const [id, note] of Object.entries(ROOF_NOTES)) {
  const skin = skins[id];
  if (skin?.ridge === undefined || skin.eave === undefined) continue;
  add(`roof-${id}`, `${note} Tile 16 x 8.`, skin.tile, { tile: true });
  add(`roof-${id}-ridge`, `${note} The ridge cap, 16 x 4.`, skin.ridge, { tile: true });
  add(`roof-${id}-eave`, `${note} The eave hem, 16 x 4.`, skin.eave, { tile: true });
}
for (const [id, note] of Object.entries(WALL_NOTES)) {
  const skin = skins[id];
  if (skin !== undefined) add(`walls-${id}`, `${note} Tile 8 x 8.`, skin.tile, { tile: true });
}
for (const [id, note] of Object.entries(GROUND_NOTES)) {
  const skin = skins[id];
  if (skin !== undefined) add(`ground-${id}`, `${note} Tile 16 x 8.`, skin.tile, { tile: true });
}

const shell = HOUSE_ART.shell ?? {};
const SHELL_NOTES: Record<string, string> = {
  slab: 'The floor slab between storeys, 16 x 4 (tiles sideways).',
  earth: 'Earth around the cellar, 16 x 16 (tiles both ways).',
  chimney: 'A brick chimney with a stone cap, 12 x 22; the scene sinks its foot into the roof.',
  door: 'The front door with its step, 16 x 30, standing on the ground line.',
  mailbox: 'The mailbox on its post, flag up (gifts wait), 14 x 21.',
  'mailbox-empty': 'The same mailbox with the flag down (nothing waits), 14 x 21.',
  workbench: "The Hearth's workbench: a vise, a saw and a hammer.",
  vent: 'The cellar vent window.',
  z: 'The sleeping "z" over a housemate.',
};
for (const [id, note] of Object.entries(SHELL_NOTES)) {
  const sprite = shell[id as keyof typeof shell];
  if (sprite !== undefined) {
    add(id, note, sprite, { tile: id === 'slab' || id === 'earth', lit: id === 'door' });
  }
}

export const HOUSE_SHELL: ConceptSet = {
  id: 'house-shell',
  title: 'House shell (housing E1)',
  requested: '2026-11-09: housing art batch E1, the building, roofs, walls and ground skins.',
  status: 'draft',
  notes: [
    'Pack: `src/sprites/data/house/shell.ts` (`HOUSE_ART`). Roof skins thatch, slate, red-tile, copper-green, moss; wall skins plaster, timber, fieldstone, brick, shingle; ground skins lawn, deck, pool-tile, pool-water.',
    'Skin colour keys are always L M D A B (light, mid, shade, accents); fixtures have their own keys.',
  ],
  sprites,
};
