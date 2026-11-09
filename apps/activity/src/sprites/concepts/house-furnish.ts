/**
 * The house's furniture, concept art (batch E4 of `docs/design/housing.md`, section 5): the Cosy starter
 * set (mapped from the living room's shipped props plus three new pieces), the twelve wild pieces that
 * belong to no set, and the twelve garden and pool pieces. The game will read the packs in
 * `data/house/`; this file only lets the studio draw, lint and catalogue them (`pnpm art house-cosy`,
 * `house-wild`, `house-garden`), and goes when Misa likes the packs.
 *
 * Every piece is `free` art (up to 64 wide, an ink outline, 16 colours). Front layers (drawn over a
 * creature on the piece), glows (drawn behind a lit piece at night) and the two Cosy skins are listed as
 * sprites of their own, so they are linted and seen too. The `night` row of the indoor sets is the
 * living room's own night palette where the piece is mapped from it, and a plain dusk recolour for the
 * rest (the house colours its pieces by phase itself); the garden's night row keeps its lights lit.
 */
import type { SpriteDef } from '../sprite-data';
import { ROOM_SPRITE_DATA } from '../data/room-sprites';
import type { PieceArt } from '../../housing/house-art';
import { HOUSE_ART as COSY, cosyPieces } from '../data/house/cosy';
import { HOUSE_ART as WILD } from '../data/house/wild';
import { HOUSE_ART as GARDEN } from '../data/house/garden';
import { WORLD_MAP_SPRITE_DATA } from '../data/world-map-sprites';
import type { Concept, ConceptSet } from './index';

type Palette = Readonly<Record<string, string>>;

/** A dusk recolour: every colour a third of the way to deep blue, the keys in `keep` (lights) untouched. */
function nightOf(sprite: SpriteDef, keep: readonly string[] = []): Palette {
  const mix = (hex: string): string => {
    const n = parseInt(hex.slice(1), 16);
    const to = [0x1a, 0x1f, 0x4a];
    const channels = [n >> 16, (n >> 8) & 255, n & 255].map((c, i) =>
      Math.round(c * 0.62 + (to[i] ?? 0) * 0.38),
    );
    return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };
  return Object.fromEntries(
    Object.entries(sprite.palette).map(([key, colour]) => [
      key,
      key === 'k' || keep.includes(key) ? colour : mix(colour),
    ]),
  );
}

/** The palette overrides for the keys a sprite has. */
function restrict(palette: Palette, sprite: SpriteDef): Palette {
  return Object.fromEntries(Object.entries(palette).filter(([key]) => key in sprite.palette));
}

interface PieceNote {
  note: string;
  /** Palette keys that are lights and stay lit in the night row. */
  lit?: readonly string[];
  /** Overrides the night row (the living room's own night palette). */
  night?: Palette;
  nightRows?: SpriteDef;
}

/** The sheet's entries for one pack: each piece, its front layer, its glow. */
function entriesOf(
  pieces: Readonly<Record<string, PieceArt>>,
  notes: Readonly<Record<string, PieceNote>>,
): Record<string, Concept> {
  const out: Record<string, Concept> = {};
  for (const [id, art] of Object.entries(pieces)) {
    const info = notes[id];
    if (info === undefined) throw new Error(`No note for ${id}`);
    const night = restrict(info.night ?? nightOf(art.sprite, info.lit), art.sprite);
    out[id] = {
      kind: 'free',
      note: info.note,
      sprite: art.sprite,
      alts: { night },
      ...(info.nightRows === undefined ? {} : { variants: { night: info.nightRows } }),
    };
    if (art.front !== undefined) {
      out[`${id}-front`] = {
        kind: 'free',
        note: `The front layer of ${id}: drawn over the creature that sits or sleeps on it, same size and origin as the piece.`,
        sprite: art.front,
        alts: { night: restrict(info.night ?? nightOf(art.front, info.lit), art.front) },
      };
    }
    if (art.glow !== undefined) {
      out[`${id}-glow`] = {
        kind: 'free',
        note: `The glow of ${id} at night, drawn behind it.`,
        sprite: art.glow,
      };
    }
  }
  return out;
}

/** A room's wall in the three lights, as the backdrop of the indoor sets (the stripes, 16x8). */
const WALL = COSY.skins?.['cosy-wall']?.tile;
if (WALL === undefined) throw new Error('No cosy wall.');
const WALL_BACKDROP = {
  tile: { rows: WALL.rows.slice(3, 11), palette: WALL.palette },
  alts: { night: ROOM_SPRITE_DATA.edge.night?.palette ?? {} },
};

const COSY_NIGHT = cosyPieces('night');
const nightOfCosy = (id: string): Palette => COSY_NIGHT[id]?.sprite.palette ?? {};

const COSY_NOTES: Record<string, PieceNote> = {
  'cosy-sofa': {
    note: 'The living room couch: coral with cream cushions and gold buttons, two room props stacked (back and seat front); the front layer is the arms and seat front.',
    night: nightOfCosy('cosy-sofa'),
  },
  'cosy-table': {
    note: 'The room table with a teal cloth and a cream runner; the living room prop with its legs given feet.',
    night: nightOfCosy('cosy-table'),
  },
  'cosy-chair': {
    note: 'The room chair: a wicker back in warm wood.',
    night: nightOfCosy('cosy-chair'),
  },
  'cosy-stool': {
    note: 'The room stool: a coral cushion on a wooden frame.',
    night: nightOfCosy('cosy-stool'),
  },
  'cosy-lamp': {
    note: 'The hanging lamp: a cream shade on a cord, it glows at night.',
    night: nightOfCosy('cosy-lamp'),
  },
  'cosy-plant': {
    note: 'The room plant: leaves in a clay pot.',
    night: nightOfCosy('cosy-plant'),
  },
  'cosy-hearth': {
    note: 'The fireplace: a stone chimney breast with the fire lit, its night glow behind.',
    night: nightOfCosy('cosy-hearth'),
  },
  'cosy-rug': { note: 'The room rug: teal with a cream border.', night: nightOfCosy('cosy-rug') },
  'cosy-seat': {
    note: 'The teal pouf; the front layer is the rim in front of whoever sits on it.',
    night: nightOfCosy('cosy-seat'),
  },
  'cosy-beanbag': {
    note: 'The violet beanbag with gold stitching; the front layer is the slumped front.',
    night: nightOfCosy('cosy-beanbag'),
  },
  'cosy-cushion': {
    note: 'The floor cushion with a gold tassel.',
    night: nightOfCosy('cosy-cushion'),
  },
  'cosy-shelf': {
    note: 'The room bookshelf, form cupboard: three shelves of coloured books.',
    night: nightOfCosy('cosy-shelf'),
  },
  'cosy-clock': { note: 'The wall clock.', night: nightOfCosy('cosy-clock') },
  'cosy-frame': {
    note: 'The picture frame: a green hill under a blue sky.',
    night: nightOfCosy('cosy-frame'),
  },
  'cosy-curtains': {
    note: 'The window with its drapes and sill; the night row is the room window at night (its own rows).',
    night: nightOfCosy('cosy-curtains'),
    nightRows: ROOM_SPRITE_DATA.window.night ??
      ROOM_SPRITE_DATA.window.day ?? { rows: [], palette: {} },
  },
  'cosy-bed': {
    note: 'NEW. A wooden bed with a coral quilt: a tall headboard, a low footboard, a pillow. The front layer is the quilt, over a creature asleep at the pillow (sleep anchor x 10, y 1).',
  },
  'cosy-cupboard': {
    note: 'NEW. A wooden cupboard with two panelled doors, a hanging pair of gold knobs, a coral heart on each door and a drawer.',
  },
  'cosy-shelf-wall': {
    note: 'NEW. A wall shelf on two brackets with leaning books, a cream mug and a small plant.',
  },
};

export const HOUSE_COSY_CONCEPTS: ConceptSet = {
  id: 'house-cosy',
  title: 'House: the Cosy starter set',
  requested:
    '2026-11-09: player housing, art batch E4: the starter set mapped from the living room and its three new pieces.',
  status: 'draft',
  notes: [
    'Fifteen of the eighteen pieces are the living room props (`data/room-sprites.ts`) shared, not copied; the sofa, pouf and beanbag stack their back and front prop into one piece plus a front layer.',
    'New: bed, cupboard, wall shelf, and the cut-apart wallpaper and floor.',
    'The backdrop is the starter wallpaper; the night row of each piece is the room at night.',
    'A front layer has the same size and origin as its piece. The content (package D) and the scene (C1) need the housing content before this art is used.',
  ],
  backdrop: WALL_BACKDROP,
  sprites: {
    ...entriesOf(COSY.pieces ?? {}, COSY_NOTES),
    'cosy-wall': {
      kind: 'free',
      note: 'The starter wallpaper, 16x52, repeats across: the living room wall cut down to its trim, stripes and wainscot.',
      sprite: COSY.skins?.['cosy-wall']?.tile ?? WALL,
    },
    'cosy-floor': {
      kind: 'free',
      note: 'The starter floor, 16x8: two rows of the living room planks.',
      sprite: COSY.skins?.['cosy-floor']?.tile ?? WALL,
    },
  },
};

const WILD_NOTES: Record<string, PieceNote> = {
  'rocking-chair': {
    note: 'A spindle-backed rocking chair with long curved runners, a coral cushion and a cream blanket over the back. Starter blueprint.',
  },
  hammock: {
    note: 'A sea-blue striped hammock slung between two posts with brass hooks; the near side of the cloth is the front layer, so a creature lies inside it (sleep anchor x 16, y 6). Blueprint from the Tidepools.',
  },
  'reef-tank': {
    note: 'A tall aquarium on a wooden cabinet: a light bar, coral, weed, an orange fish and bubbles in teal water. Blueprint from Moonlit Reef.',
  },
  'tall-clock': {
    note: 'A grandfather clock: pediment and finial, a round cream face, a glass door with a brass pendulum. Blueprint from a cleared raid finale.',
  },
  'cuckoo-clock': {
    note: 'A chalet clock with shingled roof, a round face, a small bird calling from its door, and two pinecone weights on chains. Blueprint from the dungeon.',
  },
  'wayfarer-globe': {
    note: 'A blue globe with green lands in a brass meridian on a tripod. Feat: the Wayfarer stamp.',
  },
  'music-box': {
    note: 'A wooden music box with a gold inlay band, its lid open on a dancer in a pink tutu, and a brass crank. Blueprint from a Games gold.',
  },
  'moss-terrarium': {
    note: 'A glass dome on a wooden base holding moss, a fern and a red mushroom. Blueprint from Verdant Hollow.',
  },
  'star-chart': {
    note: 'A framed night sky: navy ground, a gold constellation joined by lines, a crescent moon, brass corners. Blueprint from Storm Ridge.',
    lit: ['m', 'f'],
  },
  'old-map': {
    note: 'A parchment map between two rolled ends, with green islands, a dashed route and a red cross. Blueprint from the Old Crossroads.',
  },
  'wind-chime': {
    note: 'Four teal tubes hang from a wooden ring on a brass hook, with a cream sail below the striker. Blueprint from Storm Ridge.',
  },
  'paper-mobile': {
    note: 'A bar with three strings: a coral paper crane, a gold star and a teal lantern. Blueprint from the Festival Grounds.',
  },
};

export const HOUSE_WILD_CONCEPTS: ConceptSet = {
  id: 'house-wild',
  title: 'House: the wild pieces',
  requested:
    '2026-11-09: player housing, art batch E4: twelve one-off pieces that belong to no set, each with character.',
  status: 'draft',
  notes: [
    'Twelve pieces, one palette for the pack. Each is a different form (chair, bed, tall, clock, stool, plant, shelf, hanging) so it fits its spot box (`docs/design/housing.md`, 2.5).',
    'The hammock is a bed: it has a sleep anchor and a front layer.',
    'The night row is a plain dusk recolour (the house colours its pieces by phase itself).',
    'The content (package D) needs the housing content before this art is used; the ids are the names in kebab case.',
  ],
  backdrop: WALL_BACKDROP,
  sprites: entriesOf(WILD.pieces ?? {}, WILD_NOTES),
};

/** The world map's grass tile recoloured for night (as `valley-glow` does); the backdrop's `night` alt. */
const NIGHT_GRASS: Palette = {
  a: '#1f3a3e',
  b: '#182e33',
  c: '#28484a',
  d: '#12262b',
  e: '#9fb0d8',
  f: '#c9a64e',
  g: '#a76a90',
};

const GARDEN_NOTES: Record<string, PieceNote> = {
  'stone-fountain': {
    note: 'A two-tier stone fountain: a wide basin, a pedestal, an upper bowl and a finial, with water falling in thin lines.',
  },
  'mossback-topiary': {
    note: 'A hedge clipped into a Mossback: a leafy shell with scutes cut in, a head, four stubby legs, three flowers growing on its back, in a stone tub. Blueprint from Verdant Hollow.',
  },
  'rose-arbor': {
    note: 'A white trellis arch on two posts, pink and red roses climbing it; open in the middle so a path runs under.',
  },
  flowerbed: {
    note: 'A log-edged bed with five flowers (pink, gold, violet, orange, cream). Starter blueprint.',
  },
  'lantern-post': {
    note: 'An iron post with a lit lantern and a scroll bracket; its glow is a pool of light on the ground. Blueprint from the Festival Grounds.',
    lit: ['z', 'm'],
  },
  birdbath: {
    note: 'A pedestal bird bath with water in the bowl and a small blue bird on the rim.',
  },
  'garden-bench': {
    note: 'A wooden slat bench with iron legs and arms.',
  },
  sundial: {
    note: 'A round stone plinth with a pale dial plate, hour ticks and a brass gnomon.',
  },
  hedge: {
    note: 'A hedge segment, 16x12, with a lumpy top; the left and right edges are open so segments join. Starter blueprint.',
  },
  'picket-fence': {
    note: 'A white picket fence segment, 16x12: two pointed pickets on two rails, open at both edges so segments join.',
  },
  lounger: {
    note: 'A pool lounger: a raised back and seat in blue and white stripes on a wooden frame, a coral towel folded on it.',
  },
  'swim-ring': {
    note: 'A red and white swim ring floating on a ripple, seen from slightly above. Blueprint from Tidepools.',
  },
};

export const HOUSE_GARDEN_CONCEPTS: ConceptSet = {
  id: 'house-garden',
  title: 'House: garden and pool pieces',
  requested:
    '2026-11-09: player housing, art batch E4: twelve garden and pool pieces that sit on grass and by water and read from a distance.',
  status: 'draft',
  notes: [
    'Drawn for the valley grass (the sheet stands them on the world map grass tile, night on the night tile). Stone is pale and the leaves are lighter than the grass so they read against it.',
    'The hedge and picket fence are repeating segments; their side edges are open so neighbours join.',
    'The lantern post has a glow sprite for night. The night row keeps the lantern lit.',
    'The content (package D) needs the housing content before this art is used; the ids are the names in kebab case.',
  ],
  backdrop: {
    tile: { palette: WORLD_MAP_SPRITE_DATA.grass.palette, rows: WORLD_MAP_SPRITE_DATA.grass.rows },
    alts: { night: NIGHT_GRASS },
  },
  sprites: entriesOf(GARDEN.pieces ?? {}, GARDEN_NOTES),
};
