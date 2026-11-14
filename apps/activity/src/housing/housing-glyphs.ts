/**
 * 8x8 glyphs of the player house, in the glyph format (draw them with `<Sprite>`): the 16 luxury
 * materials (`lux-<id>`), the House place of the dock (`house-nav`, one colour like the tab pictures),
 * the mailbox's letter (`mail`) and the guestbook's rubber stamp (`stamp`). Every material has its own
 * shape, so which one it is never depends on colour alone: woods are timber (a bent stick, a burning log,
 * a ringed log end, a plank, a stump), stones are gems cut five ways, metals are ingots and ore, cloth is
 * folded or rolled. Pure data; `glyphs.ts` adds them to the bundled glyphs.
 */
import type { SpriteDef } from '../sprites/sprite-data';

// --- Woods ---

/** A bent, bleached branch with a wet blue tip: wood the tide sanded smooth. */
const luxDriftwood: SpriteDef = {
  palette: { w: '#e2d6b8', d: '#a39673', b: '#4f8fe6' },
  rows: [
    'w.....w.',
    'ww...ww.',
    '.ww.ww..',
    '..www...',
    '...wd...',
    '...wd..b',
    '..bbd.bb',
    '........',
  ],
};

/** A charred log lying down with a flame on it and ember cracks. */
const luxCharwood: SpriteDef = {
  palette: { c: '#8a7480', e: '#ff6a2a', y: '#ffc23d', k: '#4a3c46' },
  rows: [
    '...y....',
    '..yey.y.',
    '..ee.ey.',
    '.cccccc.',
    'ckekcecc',
    'cekkcckc',
    'ckcccekc',
    '.cccccc.',
  ],
};

/** A round log end with a red heart in its rings and a green sprout at the top. */
const luxHeartbark: SpriteDef = {
  palette: { b: '#8a5a32', h: '#d9a066', r: '#d9534f', g: '#5cbf5a' },
  rows: [
    '.bbbbb.g',
    'bhhhhhbg',
    'bhrhrhb.',
    'bhrrrhb.',
    'bhhrhhb.',
    '.bbbbb..',
    '........',
    '........',
  ],
};

/** A tall pale plank with a lightning scar. */
const luxLightningAsh: SpriteDef = {
  palette: { w: '#d9d6e0', d: '#9a98ae', y: '#f2d43d' },
  rows: [
    '.wwwwwd.',
    '.wwwyyd.',
    '.wwyywd.',
    '.wyyyyd.',
    '.wwwywd.',
    '.wwyyyd.',
    '.wwywwd.',
    '.wwwwwd.',
  ],
};

/** A dark stump with root feet, dripping bog water. */
const luxBogOak: SpriteDef = {
  palette: { d: '#7a5f3e', m: '#a8885a', e: '#5a4630', t: '#3aa89a' },
  rows: [
    '........',
    '.ddddddd',
    'dmmddedd',
    'dmdmdddd',
    'dmmmddde',
    '.ddddddd',
    '.t.t..t.',
    '.t......',
  ],
};

// --- Stones ---

/** A frosted, chipped pebble of green glass, worn smooth by the sea. */
const luxSeaGlass: SpriteDef = {
  palette: { a: '#7fd8c8', h: '#e6fff8', d: '#3aa89a' },
  rows: [
    '..aaa...',
    '.ahhaa..',
    'ahhaaaa.',
    'aahaaaad',
    'aaaaaadd',
    '.aaaaadd',
    '..adddd.',
    '........',
  ],
};

/** A milky round cabochon with a bright crescent on it. */
const luxMoonstone: SpriteDef = {
  palette: { b: '#a9b4f0', w: '#f4f6ff', d: '#6a74c8' },
  rows: [
    '..dddd..',
    '.dwwbbd.',
    '.dwbbbd.',
    '.dwbbbd.',
    '.dwbbbd.',
    '.dwwbbd.',
    '..dbbd..',
    '..dddd..',
  ],
};

/** A cut gem: flat top, deep point. */
const luxCinderGarnet: SpriteDef = {
  palette: { r: '#d9402a', h: '#ff9a6a', d: '#7a1e1e' },
  rows: [
    '.hhhhhh.',
    'hhrrrrdd',
    'rhrrrrrd',
    '.rrrrrd.',
    '..rrrd..',
    '...rd...',
    '........',
    '........',
  ],
};

/** A tall six-sided quartz point. */
const luxStormQuartz: SpriteDef = {
  palette: { h: '#c9b8ff', w: '#f4f0ff', b: '#8a6ae0' },
  rows: [
    '.....h..',
    '....hwh.',
    '....hwh.',
    '.h..hwbh',
    'hwh.hwbh',
    'hwbhhbbh',
    'hbbhbbbh',
    'hhhhhhhh',
  ],
};

/** A dark opal speckled with teal, violet and pink fire. */
const luxFenOpal: SpriteDef = {
  palette: { o: '#4a6a76', t: '#7fe0d0', v: '#b48aff', p: '#ff8fab' },
  rows: [
    '........',
    '.ooooooo',
    'otoovoto',
    'oooooooo',
    'ovooopoo',
    'otooooo.',
    '.oooooo.',
    '........',
  ],
};

// --- Metals ---

/** A flat iron bar with a hot orange edge. */
const luxCinderIron: SpriteDef = {
  palette: { h: '#b5b3c8', g: '#6f6d82', e: '#ff6a2a' },
  rows: [
    '........',
    '.hhhhhh.',
    'hhhhhhhh',
    'hggggggg',
    'gggggggg',
    'geeeeeeg',
    '.gggggg.',
    '........',
  ],
};

/** A heap of raw copper lumps with a green crust. */
const luxBrightCopper: SpriteDef = {
  palette: { c: '#d9803a', h: '#ffc08a', d: '#8a4a22', g: '#3fbf9a' },
  rows: [
    '..ccc...',
    '.chccd..',
    '.cccdd..',
    '..ddd...',
    'ccc.ccc.',
    'chcdchcd',
    'cccdcccd',
    '.gg..gg.',
  ],
};

/** Gold bars stacked, worn and dull at the corners. */
const luxOldGold: SpriteDef = {
  palette: { y: '#ffd25a', g: '#c8952b', t: '#3a9a8a' },
  rows: [
    '..yyyy..',
    '.yyyyyg.',
    '.gggggg.',
    'yyyygyyy',
    'yyyyggyy',
    'ggggtggg',
    'ggggggtg',
    '........',
  ],
};

// --- Cloth ---

/** Rippled blue silk with a scalloped hem. */
const luxSeaSilk: SpriteDef = {
  palette: { b: '#4f8fe6', h: '#a6d0ff' },
  rows: [
    '........',
    'bbhhbbh.',
    'bhhbbhhb',
    'hhbbhhbb',
    'hbbhhbbh',
    'bbhhbbhb',
    'bhbbhb..',
    '.b.b.b..',
  ],
};

/** A bolt of green velvet, rolled up. */
const luxMossVelvet: SpriteDef = {
  palette: { g: '#5cbf5a', m: '#2f7a3a', h: '#b8f08a' },
  rows: [
    '........',
    '.mmm....',
    'mhhhmmmm',
    'mhmhhhhm',
    'mhhhgggm',
    'mgggmmmm',
    '.mmm....',
    '........',
  ],
};

/** Red festival silk with a gold diamond and tassels. */
const luxLanternSilk: SpriteDef = {
  palette: { r: '#d9402a', g: '#ffd25a', d: '#8a1e1e' },
  rows: [
    '.rrrrrr.',
    'rrrggrrr',
    'rrggggrr',
    'rrrggrrr',
    '.rrrrrr.',
    '..d..d..',
    '.g.gg.g.',
    '.g.gg.g.',
  ],
};

// --- The house ---

/** A cottage with a chimney and an open door: the House place (one colour, like the tab pictures). */
const houseNav: SpriteDef = {
  palette: { w: '#f4eedc' },
  rows: [
    '.....ww.',
    '...w.ww.',
    '..wwwww.',
    '.wwwwwww',
    '.wwwwww.',
    '.ww..ww.',
    '.ww..ww.',
    '.wwwwww.',
  ],
};

/** A letter with a red seal: the mailbox. */
const mail: SpriteDef = {
  palette: { w: '#f4eedc', h: '#a69fc8', r: '#ff5f6d' },
  rows: [
    '........',
    'wwwwwwww',
    'whwwwwhw',
    'wwhwwhww',
    'wwwrrwww',
    'wwwwwwww',
    'wwwwwwww',
    '........',
  ],
};

/** A rubber stamp, its mark in red ink below: the guestbook. */
const stamp: SpriteDef = {
  palette: { b: '#c98a4a', h: '#a69fc8', r: '#ff5f6d' },
  rows: [
    '...bb...',
    '..bbbb..',
    '..bbbb..',
    '...bb...',
    'hhhhhhhh',
    'hhhhhhhh',
    '.rrrrrr.',
    '........',
  ],
};

export const HOUSING_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  'lux-driftwood': luxDriftwood,
  'lux-charwood': luxCharwood,
  'lux-heartbark': luxHeartbark,
  'lux-lightning-ash': luxLightningAsh,
  'lux-bog-oak': luxBogOak,
  'lux-sea-glass': luxSeaGlass,
  'lux-moonstone': luxMoonstone,
  'lux-cinder-garnet': luxCinderGarnet,
  'lux-storm-quartz': luxStormQuartz,
  'lux-fen-opal': luxFenOpal,
  'lux-cinder-iron': luxCinderIron,
  'lux-bright-copper': luxBrightCopper,
  'lux-old-gold': luxOldGold,
  'lux-sea-silk': luxSeaSilk,
  'lux-moss-velvet': luxMossVelvet,
  'lux-lantern-silk': luxLanternSilk,
  'house-nav': houseNav,
  mail,
  stamp,
};
