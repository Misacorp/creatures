/**
 * The Valley Games tileset: 16x16 tiles as sprite data. Every tile keeps its material in the semantic
 * ramp keys of `../tint.ts` (`a b c d` light to dark, `e f g h` a second material), so one drawing is
 * re-themed by tinting: the sauna's pine wall is the frost cabin's wall in `frost`, the bleacher's riser
 * takes a team colour. Floor and ground tiles have no ink outline; tiles that are furniture or a fence
 * (the bench, the table cloth, the fence, the bunting) do, like the living room's furniture.
 *
 * The palettes here are the defaults (what an untinted tile looks like). Tiles derived from another one
 * (the shore turned to face each side, the second water frame) are made in `../tiles.ts`.
 */
import type { SpriteDef } from '../../../sprites/sprite-data';
import { RAMPS, type Ramp } from '../tint';

const INK = '#0d0a1a';

/** A palette from a primary ramp, an optional secondary ramp and fixed extras. */
export function rampPalette(
  primary: Ramp,
  secondary?: Ramp,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const pal: Record<string, string> = {
    a: primary[0],
    b: primary[1],
    c: primary[2],
    d: primary[3],
  };
  if (secondary !== undefined) {
    pal['e'] = secondary[0];
    pal['f'] = secondary[1];
    pal['g'] = secondary[2];
    pal['h'] = secondary[3];
  }
  return { ...pal, ...extra };
}

/** Only the palette keys a set of rows uses (so a sprite never carries a colour it does not draw). */
export function usedPalette(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): Record<string, string> {
  const used = new Set(rows.join('').replaceAll('.', ''));
  const out: Record<string, string> = {};
  for (const key of used) {
    const colour = palette[key];
    if (colour !== undefined) out[key] = colour;
  }
  return out;
}

function tile(rows: readonly string[], palette: Readonly<Record<string, string>>): SpriteDef {
  return { rows, palette: usedPalette(rows, palette) };
}

const grassRows = [
  'cccccccccccccccc',
  'ccccccaccccccccc',
  'cccccbcbcccccccc',
  'ccccccdccccccdcc',
  'cccccccccccccccc',
  'ccbccccccccacccc',
  'cccccccccccbcbcc',
  'ccccccbccccdcccc',
  'cccccccccccccccc',
  'ccccacccccccccbc',
  'cccbcbcccccccccc',
  'ccccdccccccccccc',
  'cccccccccccccacc',
  'ccccccdcccccbcbc',
  'cbcccccccccccdcc',
  'cccccccccbcccccc',
];

const grassEdgeRows = [
  'cccccccccccccccc',
  'cccccccccacccccc',
  'ccacccccbcbccccc',
  'cbcbcccccdcccccc',
  'cccccccccccccacc',
  'ccccccbccccccbcb',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'cdccccdcccdcccdc',
  'dddcddddcdddcddd',
  'hdhhhdhhhhdhhhdh',
  'ghhgghhhghhgghhg',
  'ffffffffffffffff',
  'ffffgfffffffffef',
  'fffffffffeffffgf',
  'ffgfffffffgfffff',
];

const dirtRows = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbabbbbbbbbbcbb',
  'bbbcbbbbbbbbbbbb',
  'bbbbbbbbcbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bcbbbbbbbbbbabbb',
  'bbbbbbbbbbbbcdbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbcbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbcbbbbcb',
  'bbbabbbbbbbbbbbb',
  'bbbcdbbbbbbbbbbb',
  'bbbbbbbbbbbabbbb',
  'bbbbbbbbbbbcbbbb',
];

const sandRows = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbcbbbbbbbbb',
  'bbabbbbbbbbbbbcb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbccbbbbb',
  'bcbbbbbbbbbbbbbb',
  'bbbbbabbbbbbcbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbcbbbbbbbabbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbcccbbcbbbbbbb',
  'bbbbbbbbbbbbbbbc',
  'bcbbbbbbbbbbbbbb',
  'bbbbbabbbbbbcbbb',
  'bbbbbbbbbbbbbbbb',
];

/** Shallow water: base `b`, crests `a`, troughs `c`. The second frame is this one drifted along. */
const waterRows = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbaaabbbbbbbbbb',
  'bbcbbbcbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbaabbb',
  'bbbbbbbbbbcbbcbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'baabbbbbbbbbbbbb',
  'cbbcbbbbbbaaabbb',
  'bbbbbbbbbcbbbcbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbaabbbbbbbbb',
  'bbbbcbbcbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
];

/** Deep water: one step darker, with a rare glint. */
const deepRows = [
  'cccccccccccccccc',
  'cccccccccccccacc',
  'cccbbbcccccccccc',
  'ccdcccdccccccccc',
  'cccccccccccccccc',
  'cccccccccccbbccc',
  'ccccccccccdccdcc',
  'cccccccccccccccc',
  'ccccccaccccccccc',
  'cbbccccccccccccc',
  'dccdccccccbbbccc',
  'cccccccccdcccdcc',
  'cccccccccccccccc',
  'cccccbbccccccccc',
  'ccccdccdcccccccc',
  'cccccccccccccccc',
];

/**
 * A shore with the land (sand, `e f g h`) at the top and the water (`a b c d`) below, a wet band and a
 * line of foam (`w`) between. The other sides and the corners are derived from it.
 */
const shoreRows = [
  'ffffffffffffffff',
  'fffgffffffffefff',
  'ffffffffffffffff',
  'fffffffgffffffff',
  'feffffffffffffff',
  'fffffffggfffffff',
  'gggfffgggggggfff',
  'gggggggggggggggg',
  'hhhhhhhhhhhhhhhh',
  'wwhhhwwwhhhhwwwh',
  'bwwwwbawwwwwwbaw',
  'bbaabbbbbaabbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbcbbbbbbbbb',
  'bbbbbbbbbbbbbcbb',
  'bbbbbbbbbbbbbbbb',
];

/** Floor boards seen from the front: four boards with staggered joints. */
const planksRows = [
  'aaaaaaadaaaaaaaa',
  'bbbbbbbdabbbbbbb',
  'cccccccdbccccccc',
  'dddddddddddddddd',
  'aadaaaaaaaaaaaaa',
  'bbdabbbbbbbbbbbb',
  'ccdbcccccccccdcc',
  'dddddddddddddddd',
  'aaaaaaaaaaaadaaa',
  'bbbbbbbbbbbbdabb',
  'ccccdcccccccdbcc',
  'dddddddddddddddd',
  'aaaaaadaaaaaaaaa',
  'bbbbbbdabbbbbbbb',
  'ccccccdbcccccccc',
  'dddddddddddddddd',
];

/** The sauna's wall: two upright boards per tile, a lit left edge, grain, a knot and a joint. */
const woodWallRows = [
  'abbbbbcdabbbbbcd',
  'abbbbbcdabbcbbcd',
  'abbcbbcdabbcbbcd',
  'abbcbbcdabbbbbcd',
  'abbbbbcddddddddd',
  'abbbbbcdaaaaaacd',
  'abbbbbcdabbbbbcd',
  'abbbbbcdabbbbbcd',
  'abbbcbcdabbbbbcd',
  'abbccbcdabbbbbcd',
  'abcdcbcdabbbcbcd',
  'abbccbcdabbbcbcd',
  'abbbbbcdabbbbbcd',
  'abbbbbcdabbbbbcd',
  'abbcbbcdabbbbbcd',
  'abbcbbcdabbbbbcd',
];

/**
 * A bench seat: the ink top edge, the seat's top (rows 1 to 3; a creature's feet rest on row 3), its lit
 * front edge and face, then the shadow under it and the slats of its front.
 */
const benchSeatRows = [
  'kkkkkkkkkkkkkkkk',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'cccccccccccccccc',
  'kkkkkkkkkkkkkkkk',
  'xxxxxxxxxxxxxxxx',
  'dddxdddxdddxdddx',
  'bccxbccxbccxbccx',
  'bccxbccxbccxbccx',
  'bccxbccxbccxbccx',
  'bcdxbcdxbcdxbcdx',
  'bccxbccxbccxbccx',
  'bccxbccxbccxbccx',
];

const benchSkirtRows = [
  'bccxbccxbccxbccx',
  'bccxbccxbccxbccx',
  'bcdxbccxbccxbcdx',
  'bccxbccxbccxbccx',
  'bccxbccxbcdxbccx',
  'bccxbccxbccxbccx',
  'bccxbcdxbccxbccx',
  'bccxbccxbccxbccx',
  'bccxbccxbccxbccx',
  'bccxbccxbccxbcdx',
  'bcdxbccxbccxbccx',
  'bccxbccxbccxbccx',
  'bccxbccxbcdxbccx',
  'bccxbccxbccxbccx',
  'bccxbcdxbccxbccx',
  'bccxbccxbccxbccx',
];

/** Stone blocks in staggered courses, lit on their top-left. */
const stoneWallRows = [
  'aaaaaaadaaaaaaad',
  'abbbbbcdabbbbbcd',
  'bccccccdbcccbccd',
  'dddddddddddddddd',
  'aaadaaaaaaadaaaa',
  'bbcdabbbbbcdabbb',
  'cccdbccccccdbccc',
  'dddddddddddddddd',
  'aaaaaaadaaaaaaad',
  'abbbbbcdabbbbbcd',
  'bcccbccdbccccccd',
  'dddddddddddddddd',
  'aaadaaaaaaadaaaa',
  'bbcdabbbbbcdabbb',
  'cccdbccccccdbccc',
  'dddddddddddddddd',
];

const snowRows = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbabb',
  'bbbaabbbbbbbbbbb',
  'bbcbbcbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbaaabbbb',
  'bbbbbbbbcbbbcbbb',
  'babbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbaaabbbbbbbbb',
  'bbbcbbbcbbbbbbab',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
];

const iceRows = [
  'bbbbbbbbbbbbbbbb',
  'bbabbbbbbbbbbbbb',
  'bbbabbbbbbbbbbbb',
  'bbbbabbbbbbbcbbb',
  'bbbbbbbbbbbcbbbb',
  'bbbbbbbbbbcbbbbb',
  'bbbbbbbbbccbbbbb',
  'bbbbbbbbbbbcbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbab',
  'bbbbbbbbbbbbbabb',
  'bbabbbbbbbbbabbb',
  'babbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
];

/**
 * A gingham table cloth seen from the front: the ink top edge, the cloth's top, the lit fold, three bands
 * of checks (the colour `b c d`, cream `w`) and an ink hem. The ends get an ink side (`../tiles.ts`).
 */
const clothRows = [
  'kkkkkkkkkkkkkkkk',
  'bbwwbbwwbbwwbbww',
  'ccbbccbbccbbccbb',
  'aaaaaaaaaaaaaaaa',
  'ccccbbbbccccbbbb',
  'ccccbbbbccccbbbb',
  'ccccbbbbccccbbbb',
  'bbbbwwwwbbbbwwww',
  'bbbbwwwwbbbbwwww',
  'bbbbwwwwbbbbwwww',
  'ddddccccddddcccc',
  'ddddccccddddcccc',
  'ddddccccddddcccc',
  'kkkkkkkkkkkkkkkk',
  '................',
  '................',
];

/** A wooden fence: a post on the left of each tile and two rails running into the next post. */
const fenceRows = [
  '.kkk............',
  'kaabk...........',
  'kabck...........',
  'kabckkkkkkkkkkkk',
  'kabckaaaaaaaaaaa',
  'kabckbbbbcbbbbbb',
  'kabckccccccccccc',
  'kabckkkkkkkkkkkk',
  'kabck...........',
  'kabckkkkkkkkkkkk',
  'kabckaaaaaaaaaaa',
  'kabckbbbbbbbbcbb',
  'kabckccccccccccc',
  'kabckkkkkkkkkkkk',
  'kbcdk...........',
  'kkkkk...........',
];

/** The sky: deepest at the top, dithered down to the pale horizon. */
const skyRows = [
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'cdddcdddcdddcddd',
  'dcdcdcdcdcdcdcdc',
  'cccdcccdcccdcccd',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'bcccbcccbcccbccc',
  'cbcbcbcbcbcbcbcb',
  'bbbcbbbcbbbcbbbc',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'abbbabbbabbbabbb',
  'babababababababa',
];

const skyLowRows = [
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
];

/**
 * A bleacher step seen from the front: the seat plank (`a b c d`, wood) over a painted riser (`e f g h`,
 * a team colour) with board joints. Crowds and players sit on row 2.
 */
const bleacherRows = [
  'kkkkkkkkkkkkkkkk',
  'aaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbb',
  'cccccccccccccccc',
  'kkkkkkkkkkkkkkkk',
  'hhhhhhhhhhhhhhhh',
  'fgggggghfggggggh',
  'fgggggghfggggggh',
  'fgggggghfggggggh',
  'fggfggghfggggggh',
  'fgggggghfggggggh',
  'fgggggghfgggfggh',
  'fgggggghfggggggh',
  'fgggggghfggggggh',
  'hhhhhhhhhhhhhhhh',
  'hhhhhhhhhhhhhhhh',
];

/** Bunting on a straight rope: two little flags per tile, primary then secondary. */
const buntingRows = [
  '................',
  '................',
  'kkkkkkkkkkkkkkkk',
  '.kaabk...keefk..',
  '.kabck...kefgk..',
  '..kbk.....kfk...',
  '..kck.....kgk...',
  '...k.......k....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const SHADOW = '#2a1a14';
const FOAM = '#ffffff';
const CREAM = '#fbf3df';

export const GAMES_TILE_DATA = {
  grass: tile(grassRows, rampPalette(RAMPS.grass)),
  grassEdge: tile(grassEdgeRows, rampPalette(RAMPS.grass, RAMPS.dirt)),
  dirt: tile(dirtRows, rampPalette(RAMPS.dirt)),
  sand: tile(sandRows, rampPalette(RAMPS.sand)),
  water: tile(waterRows, rampPalette(RAMPS.water)),
  deepWater: tile(deepRows, rampPalette(RAMPS.deep)),
  shore: tile(shoreRows, rampPalette(RAMPS.water, RAMPS.sand, { w: FOAM })),
  planks: tile(planksRows, rampPalette(RAMPS.wood)),
  woodWall: tile(woodWallRows, rampPalette(RAMPS.pine)),
  benchSeat: tile(benchSeatRows, rampPalette(RAMPS.pine, undefined, { k: INK, x: SHADOW })),
  benchSkirt: tile(benchSkirtRows, rampPalette(RAMPS.pine, undefined, { x: SHADOW })),
  stoneWall: tile(stoneWallRows, rampPalette(RAMPS.stone)),
  snow: tile(snowRows, rampPalette(RAMPS.snow)),
  ice: tile(iceRows, rampPalette(RAMPS.ice)),
  cloth: tile(clothRows, rampPalette(RAMPS.red, undefined, { k: INK, w: CREAM })),
  fence: tile(fenceRows, rampPalette(RAMPS.wood, undefined, { k: INK })),
  sky: tile(skyRows, rampPalette(RAMPS.sky)),
  skyLow: tile(skyLowRows, rampPalette(RAMPS.sky)),
  bleacher: tile(bleacherRows, rampPalette(RAMPS.wood, RAMPS.red, { k: INK })),
  bunting: tile(buntingRows, rampPalette(RAMPS.red, RAMPS.yellow, { k: INK })),
} as const satisfies Readonly<Record<string, SpriteDef>>;

export type BaseTileName = keyof typeof GAMES_TILE_DATA;
