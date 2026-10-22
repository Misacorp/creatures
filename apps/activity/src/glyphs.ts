/**
 * 8x8 UI glyphs, in the same data format as the other sprites (draw them with `<Sprite>`): boss
 * gimmicks, turn orders, the mark on the boss, shields, sparkles and the loot reveal's orb and
 * gem. Every glyph has its own shape, so the meaning never depends on colour alone. Pure data.
 */
import { DUNGEON_MAP_GLYPHS } from './dungeon-map-glyphs';
import { EXPEDITION_GLYPHS } from './expedition-glyphs';
import type { SpriteDef } from './sprites/sprite-data';

export const GLYPH_SIZE = { width: 8, height: 8 } as const;

const INK = '#0d0a1a';
const BONE = '#f4eedc';
const GOLD = '#ffd25a';
const HAZE = '#a69fc8';
const BAD = '#ff5f6d';
const GOOD = '#6fdc8c';
const TIDE = '#4f8fe6';
const MUD = '#b8864a';
const MUD_DARK = '#6b4a2e';

// --- Boss gimmicks (one per gimmick op in the content schema, plus the chain's bolt) ---

/** A heavy blow on the ground: an arrow slamming into a floor. */
const hitZone: SpriteDef = {
  palette: { r: BAD, w: BONE },
  rows: [
    '...rr...',
    '...rr...',
    '...rr...',
    '.r.rr.r.',
    '..rrrr..',
    '...rr...',
    '........',
    'wwwwwwww',
  ],
};

/** A speaker with a cross over it: the creatures at the ends cannot act. */
const silenceEnds: SpriteDef = {
  palette: { k: HAZE, b: BAD },
  rows: [
    '...k....',
    '..kk....',
    'kkkk.b.b',
    'kkkk..b.',
    'kkkk.b.b',
    '..kk....',
    '...k....',
    '........',
  ],
};

/** An arrow that turns back on itself. */
const reflectFirstReaction: SpriteDef = {
  palette: { r: BAD },
  rows: [
    '...rr...',
    '..rrrrrr',
    '...rr..r',
    '.......r',
    'r......r',
    'r.....r.',
    '.rrrrr..',
    '........',
  ],
};

/** A spiky ball: the Thorns room modifier, every hit on the foe pricks the hitter. */
const spikes: SpriteDef = {
  palette: { r: BAD },
  rows: [
    'r..r..r.',
    '.r.rr.r.',
    '..rrrr..',
    'rrrrrrrr',
    '..rrrr..',
    '.r.rr.r.',
    'r..r..r.',
    '........',
  ],
};

/** A shield with a gleam: a reaction may bounce off it (the Slag Tyrant's Molten Shell). */
const reflectChance: SpriteDef = {
  palette: { r: BAD },
  rows: [
    '.rrrrrr.',
    'rr....rr',
    'r..rr..r',
    'r.rrrr.r',
    'r..rr..r',
    '.r....r.',
    '..r..r..',
    '...rr...',
  ],
};

/** A sword: the boss goes for the strongest creature. */
const strikeHighestAtk: SpriteDef = {
  palette: { w: BONE, g: GOLD, k: INK },
  rows: [
    '......ww',
    '.....www',
    '....www.',
    '...www..',
    'g.www...',
    '.ggw....',
    '.kgg....',
    'k..g....',
  ],
};

/** Three waves rolling across the rows: a sweep hits a whole row. */
const sweep: SpriteDef = {
  palette: { r: BAD },
  rows: [
    '.rr..rr.',
    'r..rr..r',
    '........',
    '.rr..rr.',
    'r..rr..r',
    '........',
    '.rr..rr.',
    'r..rr..r',
  ],
};

/** Shells dropping on scattered spots: a barrage on random creatures. */
const barrage: SpriteDef = {
  palette: { r: BAD },
  rows: [
    '.r......',
    'rrr...r.',
    '.r...rrr',
    '......r.',
    '........',
    '...r....',
    '..rrr...',
    '...r....',
  ],
};

/** A fist with the ripples of its impact: a slam, with a share for the creatures beside the victim. */
const slam: SpriteDef = {
  palette: { r: BAD, w: BONE },
  rows: [
    '..rrrr..',
    '..rwwr..',
    '..rrrr..',
    '...rr...',
    'rr.rr.rr',
    '..r..r..',
    '.r....r.',
    '........',
  ],
};

/** An arrow driven through three rows: a lance cuts one lane, front to back. */
const lance: SpriteDef = {
  palette: { r: BAD, w: BONE },
  rows: [
    '...rr...',
    '..rrrr..',
    '...rr...',
    'wwwrrwww',
    '...rr...',
    'wwwrrwww',
    '...rr...',
    'wwwrrwww',
  ],
};

/** A bolt that jumps on: a strike on the strongest that chains to the next. */
const chain: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '.....gg.',
    '....gg..',
    '...gg...',
    '..gggg..',
    '....gg..',
    '...gg...',
    '..gg....',
    '.g......',
  ],
};

/** Two arrows closing on the ends of a row: a pincer. */
const pincer: SpriteDef = {
  mirror: true,
  palette: { r: BAD, w: BONE },
  rows: ['....', 'r...', 'rr..', 'rrrw', 'rrrw', 'rr..', 'r...', '....'],
};

/** A droplet with a spark beside it: the boss washes its debuffs off. */
const purge: SpriteDef = {
  palette: { w: BONE, g: GOLD },
  rows: [
    '...w...g',
    '..www.gg',
    '..www..g',
    '.wwwww..',
    '.wwwww..',
    '.wwwww..',
    '..www...',
    '........',
  ],
};

/** An hourglass: a move that is gathering and lands next round. */
const charge: SpriteDef = {
  palette: { w: BONE, g: GOLD },
  rows: [
    'wwwwwwww',
    '.gggggg.',
    '..gggg..',
    '...gg...',
    '...gg...',
    '..g..g..',
    '.gggggg.',
    'wwwwwwww',
  ],
};

// --- Turn orders ---

const leftToRight: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '.g..g...',
    '..g..g..',
    '...g..g.',
    '....g..g',
    '...g..g.',
    '..g..g..',
    '.g..g...',
    '........',
  ],
};

const rightToLeft: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '...g..g.',
    '..g..g..',
    '.g..g...',
    'g..g....',
    '.g..g...',
    '..g..g..',
    '...g..g.',
    '........',
  ],
};

/** A stopwatch: the fastest creature goes first. */
const speed: SpriteDef = {
  palette: { g: GOLD, b: BONE },
  rows: [
    '...gg...',
    '.gggggg.',
    'gg..b.gg',
    'g...b..g',
    'g...bb.g',
    'gg....gg',
    '.gggggg.',
    '........',
  ],
};

/** A zigzag snake: the rows run one way, then the other. */
const serpentine: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '.ggggg..',
    '.g......',
    '.ggggg..',
    '......g.',
    '.ggggg..',
    '.g......',
    '.ggggg..',
    '........',
  ],
};

// --- Fight stage ---

/** A ring with a dot in it, the mark on the boss. `m` is the element colour (gold by default). */
const mark: SpriteDef = {
  mirror: true,
  palette: { k: INK, m: GOLD, b: BONE },
  rows: ['...k', '.kkm', '.kmk', 'kmkb', 'kmkb', '.kmk', '.kkm', '...k'],
};

const shield: SpriteDef = {
  palette: { k: INK, w: BONE, s: HAZE, d: '#6b6396' },
  rows: [
    'kkkkkkkk',
    'kwsssssk',
    'kwssssdk',
    'kssssddk',
    '.kssssk.',
    '.kssddk.',
    '..ksdk..',
    '...kk...',
  ],
};

/** A four-point star: shiny creatures and "first on server". */
const sparkle: SpriteDef = {
  mirror: true,
  palette: { g: GOLD, y: BONE },
  rows: ['...g', '...g', '..gy', 'ggyy', 'ggyy', '..gy', '...g', '...g'],
};

/** A star on a wand: a finale ability firing. */
const ability: SpriteDef = {
  mirror: true,
  palette: { k: INK, g: GOLD, y: BONE },
  rows: ['...k', '..kg', 'kkgy', 'kggy', '.kgg', '.kgk', 'kg.k', 'k...'],
};

/** A warning triangle with an exclamation mark: the boss will do something next round. */
const warning: SpriteDef = {
  palette: { y: GOLD, k: INK },
  rows: [
    '...yy...',
    '..yyyy..',
    '..ykky..',
    '.yykkyy.',
    '.yykkyy.',
    'yyyyyyyy',
    'yyykkyyy',
    'yyyyyyyy',
  ],
};

/** A blue disc with an "i": an info alert (`ui/Alert`). */
const info: SpriteDef = {
  palette: { b: TIDE, k: INK },
  rows: [
    '..bbbb..',
    '.bbkkbb.',
    'bbbbbbbb',
    'bbbkkbbb',
    'bbbkkbbb',
    'bbbkkbbb',
    '.bbkkbb.',
    '..bbbb..',
  ],
};

/** A green disc with a tick: a success alert (`ui/Alert`). */
const success: SpriteDef = {
  palette: { g: GOOD, k: INK },
  rows: [
    '..gggg..',
    '.gggggk.',
    'gggggkkg',
    'gkggkkgg',
    'gkkkkggg',
    'ggkkgggg',
    '.gggggg.',
    '..gggg..',
  ],
};

/** A red stop sign with an "!": an alert (`ui/Alert`, the most serious level). */
const alert: SpriteDef = {
  palette: { r: BAD, k: INK },
  rows: [
    '..rrrr..',
    '.rrkkrr.',
    'rrrkkrrr',
    'rrrkkrrr',
    'rrrkkrrr',
    'rrrrrrrr',
    '.rrkkrr.',
    '..rrrr..',
  ],
};

/** Crosshairs: the boss is about to hit this creature. */
const reticle: SpriteDef = {
  mirror: true,
  palette: { r: BAD, k: INK },
  rows: ['..rr', '.r.r', 'r..r', 'rrr.', 'rrr.', 'r..r', '.r.r', '..rr'],
};

/** Shown for anything that has no glyph of its own. */
const unknown: SpriteDef = {
  mirror: true,
  palette: { k: INK, h: HAZE },
  rows: ['...k', '..kh', '.khh', 'khhk', 'khhk', '.khh', '..kh', '...k'],
};

// --- Loot reveal ---

const orb: SpriteDef = {
  mirror: true,
  palette: { k: INK, c: '#b48cff', w: BONE, b: '#6b3fa0' },
  rows: ['..kk', '.kcc', 'kcww', 'kcwc', 'kccc', 'kccb', '.kbb', '..kk'],
};

/** A cut gem: Essence. */
const gem: SpriteDef = {
  mirror: true,
  palette: { k: INK, w: BONE, c: '#7fe0d0' },
  rows: ['..kk', '.kwc', 'kwcc', 'kccc', '.kcc', '..kc', '...k', '....'],
};

/** A plain grey crystal: a shard of any element (the same shape as the Tide Shard, with no element colour). */
const shardAny: SpriteDef = {
  mirror: true,
  palette: { k: INK, b: '#9a98ae', h: '#c9c7d8', w: '#eeeef5' },
  rows: ['...k', '..kb', '.kbh', 'kbwh', 'kbbh', '.kbb', '..kb', '...k'],
};

// --- Creature states on the stage ---

/** A skull: the creature is knocked out. */
const skull: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '..wwww..',
    '.wwwwww.',
    'wwwwwwww',
    'wkkwwkkw',
    'wkkwwkkw',
    '.wwkkww.',
    '..wwww..',
    '..w.w.w.',
  ],
};

/** A cracked skull in dark blood red with glowing eyes: a curse (a keepsake whose effect is a cost). */
const curse: SpriteDef = {
  palette: { r: '#b3303f', d: '#6e1a28', k: INK, e: BAD },
  rows: [
    '..rrrr..',
    '.rrkrrr.',
    'rrkrrrrr',
    'rkekkekr',
    'rrrkkrrr',
    '.rrrrrd.',
    '..rkrkd.',
    '..d..d..',
  ],
};

/** A hand with a pointing finger: auto fire is off, the ability waits for its owner. */
const hand: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '...kk...',
    '..kwwk..',
    '..kwwk.k',
    '..kwwkwk',
    '.kkwwwwk',
    'kwwwwwwk',
    '.kwwwwk.',
    '..kkkk..',
  ],
};

/** A tick: the ability has been used. */
const check: SpriteDef = {
  palette: { h: HAZE },
  rows: [
    '........',
    '......hh',
    '.....hh.',
    'h...hh..',
    'hh.hh...',
    '.hhh....',
    '..h.....',
    '........',
  ],
};

/**
 * A pixel tick for a packed supply: a gold tick on an ink badge (the ink is its outline), so it reads on
 * any picture. Unlike `check` it is a badge of its own.
 */
const tick: SpriteDef = {
  palette: { k: INK, g: GOLD },
  rows: [
    'kkkkkkkk',
    'kkkkkkgk',
    'kkkkkggk',
    'kgkkggkk',
    'kggkggkk',
    'kkgggkkk',
    'kkkgkkkk',
    'kkkkkkkk',
  ],
};

// --- Workshop ---

/** An anvil: the Workshop tab and its jobs. */
const anvil: SpriteDef = {
  palette: { k: INK, m: HAZE, w: BONE },
  rows: [
    '........',
    'kkkkkkk.',
    'kwwmmmmk',
    '.kkmmkk.',
    '...kmk..',
    '...kmk..',
    '..kmmmk.',
    '.kkkkkkk',
  ],
};

// --- Creature experience ---

/*
  The treat icon (decisions.md 2026-10-19, follow-up): the prefix of the "Treat" line in an XP gain's
  breakdown and the picture of the glossary's Treat entry. Four designs in the game's own colours (the
  tokens' red, grove, bone, haze, gold, ember and the Crafting leather, with a darker step of one where it
  needs a shade); `TREAT_ICON` picks the one the game shows as `treat`. The melon slice of the first round
  is gone (its pinks and greens were not the game's).
*/

/** A pair of cherries on one stem: the default treat (a fruit, as Misa first asked, in the game's red). */
const treatCherries: SpriteDef = {
  palette: { r: BAD, d: '#c23a52', w: BONE, g: '#5cbf5a' },
  rows: [
    '.....gg.',
    '....gg..',
    '...g.g..',
    '..g...g.',
    '.rrr.rrr',
    'rwrrrwrr',
    'rrrdrrrd',
    '.dd..dd.',
  ],
};

/** A round cookie with a small bite and dark chips, in the Crafting leather. */
const treatCookie: SpriteDef = {
  palette: { l: '#c08552', h: '#e0aa72', d: '#8c5c35', k: INK },
  rows: [
    '..lll...',
    '.hhlld..',
    'hhklllld',
    'hlllkldl',
    'llllllll',
    'lkllklld',
    '.llllld.',
    '..dddd..',
  ],
};

/** A bone-shaped biscuit, bone on top and haze underneath. */
const treatBone: SpriteDef = {
  palette: { w: BONE, h: HAZE },
  rows: [
    '........',
    'ww....ww',
    'wwwwwwww',
    '.wwwwww.',
    '.wwwwww.',
    'hhhhhhhh',
    'hh....hh',
    '........',
  ],
};

/** A wrapped sweet: an ember candy with a bone shine, its gold wrapper twisted at both ends. */
const treatCandy: SpriteDef = {
  palette: { g: GOLD, s: '#c8952b', r: '#ef6a3a', d: '#b8452a', w: BONE },
  rows: [
    '........',
    'g......g',
    'gg.rr.gg',
    'gsrwrrsg',
    'gsrrrrsg',
    'gg.dd.gg',
    'g......g',
    '........',
  ],
};

/** The four treat icons by name, for the workbench's comparison; the game shows `TREAT_ICON`. */
export const TREAT_ICONS = {
  cherries: treatCherries,
  cookie: treatCookie,
  bone: treatBone,
  candy: treatCandy,
} as const satisfies Record<string, SpriteDef>;

export type TreatIconName = keyof typeof TREAT_ICONS;

/** The treat icon the game shows (glyph id `treat`). Change this one name to swap it. */
export const TREAT_ICON: TreatIconName = 'cherries';

const treat: SpriteDef = TREAT_ICONS[TREAT_ICON];

// --- Tabs (one colour, key `w`, so a tab can tint it for its selected state) ---

/** A paw print: the Collection tab. */
const paw: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '.ww..ww.',
    '.ww..ww.',
    'w..ww..w',
    'ww.ww.ww',
    '..wwww..',
    '.wwwwww.',
    '.wwwwww.',
    '..w..w..',
  ],
};

/** A compass: the Expeditions tab. */
const compass: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '..wwww..',
    '.w....w.',
    'w...ww.w',
    'w..www.w',
    'w.www..w',
    'w.ww...w',
    '.w....w.',
    '..wwww..',
  ],
};

/** A sword pointing up and right: the Raid tab. */
const blade: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '......ww',
    '.....www',
    '....www.',
    'w..www..',
    '.wwww...',
    '..ww....',
    '.w.ww...',
    'w....w..',
  ],
};

/** A door: the Dungeon tab. */
const door: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '..wwww..',
    '.w....w.',
    'w......w',
    'w......w',
    'w....w.w',
    'w......w',
    'w......w',
    'wwwwwwww',
  ],
};

// --- The dungeon ---

/** A round lure: Bait, in the rewards. */
const bait: SpriteDef = {
  palette: { g: '#c8952b', y: GOLD, w: BONE },
  rows: [
    '..gggg..',
    '.gyyyyg.',
    'gyywwyyg',
    'gywyyyyg',
    'gywyyyyg',
    'gyyyyyyg',
    '.gyyyyg.',
    '..gggg..',
  ],
};

/** A wrapped gift with a bow: a day that pays a reward (the streak's 3rd and 7th). */
const gift: SpriteDef = {
  palette: { r: BAD, g: GOLD },
  rows: [
    '.gg..gg.',
    'g..gg..g',
    '.gggggg.',
    'rrrggrrr',
    'rrrggrrr',
    'rrrggrrr',
    'rrrggrrr',
    'rrrggrrr',
  ],
};

/** A flag on a pole: the landmark depths. */
const flag: SpriteDef = {
  palette: { g: GOLD, k: HAZE },
  rows: [
    '.kggggg.',
    '.kgggggg',
    '.kggggg.',
    '.k......',
    '.k......',
    '.k......',
    '.k......',
    'kkk.....',
  ],
};

// --- Gear slots: one silhouette each, for the slot tag and the corner of an item in the bag ---

/** A cap with a brim: the Hat slot. */
const slotHat: SpriteDef = {
  palette: { w: BONE, k: HAZE },
  rows: [
    '........',
    '...ww...',
    '..wwww..',
    '.wwwwww.',
    '.wwwwww.',
    'kkkkkkkk',
    '........',
    '........',
  ],
};

/** A scarf wrapped round once, one end hanging: the Scarf slot. */
const slotScarf: SpriteDef = {
  palette: { w: BONE, k: HAZE },
  rows: [
    '........',
    '.wwwwww.',
    'ww....ww',
    '.wwwwww.',
    '...kk...',
    '...kk...',
    '...k.k..',
    '........',
  ],
};

/** A gem hanging on a cord: the Charm slot. */
const slotCharm: SpriteDef = {
  palette: { w: BONE, k: HAZE },
  rows: [
    'k......k',
    '.k....k.',
    '..k..k..',
    '...ww...',
    '..wwww..',
    '.wwwwww.',
    '..wwww..',
    '...ww...',
  ],
};

// --- Status effects and room modifiers ---

/** A down arrow sinking into mud: the Mired status (slower and weaker). */
const mired: SpriteDef = {
  palette: { r: BAD, o: MUD, d: MUD_DARK },
  rows: [
    '..rrrr..',
    '..rrrr..',
    'rrrrrrrr',
    '.rrrrrr.',
    '..rrrr..',
    '...rr...',
    'oodooodo',
    'dddddddd',
  ],
};

/** A puddle of mud with two drops falling in: the Mud room modifier (the team's Speed is down). */
const mud: SpriteDef = {
  palette: { o: MUD, d: MUD_DARK, h: '#e0b878' },
  rows: [
    '..o..o..',
    '..d..d..',
    '........',
    '..oooo..',
    '.oohooo.',
    'oooooood',
    'odooodoo',
    '.dddddd.',
  ],
};

export const BUNDLED_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  hit_zone: hitZone,
  silence_ends: silenceEnds,
  reflect_first_reaction: reflectFirstReaction,
  reflect_chance: reflectChance,
  spikes,
  strike_highest_atk: strikeHighestAtk,
  sweep,
  barrage,
  slam,
  lance,
  pincer,
  purge,
  charge,
  chain,
  left_to_right: leftToRight,
  right_to_left: rightToLeft,
  speed,
  serpentine,
  mark,
  shield,
  sparkle,
  ability,
  unknown,
  orb,
  gem,
  'shard-any': shardAny,
  skull,
  curse,
  hand,
  check,
  tick,
  warning,
  info,
  success,
  alert,
  reticle,
  anvil,
  treat,
  paw,
  compass,
  blade,
  door,
  bait,
  flag,
  gift,
  mired,
  mud,
  'slot-hat': slotHat,
  'slot-scarf': slotScarf,
  'slot-charm': slotCharm,
  ...EXPEDITION_GLYPHS,
  ...DUNGEON_MAP_GLYPHS,
};

/** A glyph by id, or undefined. */
export function glyph(id: string): SpriteDef | undefined {
  return Object.hasOwn(BUNDLED_GLYPHS, id) ? BUNDLED_GLYPHS[id] : undefined;
}

/** A glyph by id, or the plain diamond. */
export function glyphOrUnknown(id: string): SpriteDef {
  return glyph(id) ?? unknown;
}

/** The glyph for a boss gimmick's `op`; a plain diamond for an op that has none yet. */
export function gimmickGlyph(op: string): SpriteDef {
  return glyph(op) ?? unknown;
}

/** The glyph for a boss's turn order. */
export function turnOrderGlyph(order: string): SpriteDef {
  return glyph(order) ?? unknown;
}

export const GIMMICK_GLYPH_OPS = [
  'hit_zone',
  'silence_ends',
  'reflect_first_reaction',
  'reflect_chance',
  'spikes',
  'strike_highest_atk',
  'sweep',
  'barrage',
  'slam',
  'lance',
  'pincer',
  'purge',
  'charge',
] as const;

/**
 * The glyph key of a strike on the strongest that jumps on to more creatures (`jumps` above 0): the
 * same op as the plain strike, drawn as a bolt so a boss card tells the two apart.
 */
export const CHAIN_GLYPH = 'chain';
export const TURN_ORDER_GLYPHS = ['left_to_right', 'right_to_left', 'speed', 'serpentine'] as const;
