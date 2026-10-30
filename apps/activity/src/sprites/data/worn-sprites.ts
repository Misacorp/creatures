/**
 * Worn sprites: the small versions of the items as a 16x16 creature wears them (`../wearing.ts`
 * puts them on). Every item look (`itemLookId`) maps to a worn shape class of its slot; a class is
 * a few pixel rows, not one drawing per item, and the item's own tint paints it.
 *
 * Keys: `k` ink; `t` main, `u` shade, `h` highlight (the tint swaps these three, as on the 12x12
 * item sprites); `c` the tan cord of a charm. Three trim keys change with the piece: `x` is a
 * band (the shade `u` on a plain piece, gold on a set piece), `y` a spark (the highlight `h`, or
 * cream) and `z` a rim (ink, or gold). `.` is transparent.
 *
 * Hats and charms store the left half and mirror (so they are always centred on x 7.5); the scarf
 * band is a full-width row that is clipped to the body, and its tail is a separate 2-wide patch.
 */

export type WornSlot = 'hat' | 'scarf' | 'charm';

export const HAT_CLASSES = ['cap', 'hood', 'crown', 'pointed', 'brimmed'] as const;
export const SCARF_CLASSES = ['scarf', 'mantle'] as const;
export const CHARM_CLASSES = ['pendant', 'bell', 'token'] as const;

export type HatClass = (typeof HAT_CLASSES)[number];
export type ScarfClass = (typeof SCARF_CLASSES)[number];
export type CharmClass = (typeof CHARM_CLASSES)[number];
export type WornClass = HatClass | ScarfClass | CharmClass;

/** Left-half rows of a hat or charm, drawn mirrored. */
export interface HalfShape {
  rows: readonly string[];
}

/** A scarf: a band of full-width rows (16 wide, clipped to the body from row `SCARF_TOP`) and a tail. */
export interface ScarfShape {
  /** The band, drawn from the first row under the mouth. 8 characters: the left half, mirrored. */
  band: readonly string[];
  /** The tail: rows of the same width, hung under the band at x `SCARF_TAIL_X`; empty for none. */
  tail: readonly string[];
}

/** Hats sit on the head top. Every hat is an even number of columns wide, centred on x 7.5. */
export const HAT_SHAPES: Readonly<Record<HatClass, HalfShape>> = {
  // A round cap with a band.
  cap: { rows: ['..kk', '.kht', 'kttt', 'kxxx'] },
  // A hood: wider, it hangs a little over the sides.
  hood: { rows: ['..kkk', '.khtt', 'kthtt', 'ktttt', 'kxxxx'] },
  // A band with three points and a gem.
  crown: { rows: ['k.k.', 'ktkt', 'ktyt', 'kxxx'] },
  // A tall cone.
  pointed: { rows: ['..k', '.kh', '.kt', 'ktt', 'kxx'] },
  // A low crown with a wide brim.
  brimmed: { rows: ['..kkk', '.khtt', '.kxxx', 'kuuuu'] },
};

/** Charms hang on the belly; the bottom row sits on the body's bottom outline. Four columns wide. */
export const CHARM_SHAPES: Readonly<Record<CharmClass, HalfShape>> = {
  // A ring on a cord.
  pendant: { rows: ['.c', 'zt', '.z'] },
  // A bell with a clapper.
  bell: { rows: ['.k', 'kt', 'xk'] },
  // A flat coin.
  token: { rows: ['.z', 'zy', '.z'] },
};

export const SCARF_SHAPES: Readonly<Record<ScarfClass, ScarfShape>> = {
  // A wound band with a short tail.
  scarf: { band: ['ththtttt', 'xxxxxxxx'], tail: ['th', 'tu'] },
  // A flat cape over the shoulders with a fringed edge, and no tail.
  mantle: { band: ['tttttttt', 'xuxuxuxu'], tail: [] },
};

/** The column the scarf tail hangs from (two columns wide). */
export const SCARF_TAIL_X = 10;

/** The worn class of every item look (`itemLookId`), one row per look. Checked against the content by a test. */
export const LOOK_CLASS: Readonly<Record<string, WornClass>> = {
  // Hats
  'trail-cap': 'cap',
  'felt-hat': 'brimmed',
  'wayfarers-hood': 'hood',
  'coal-warm-cap': 'cap',
  'forge-hood': 'hood',
  'emberkeepers-crown': 'crown',
  'acorn-cap': 'cap',
  'bark-hood': 'hood',
  'greenwardens-crown': 'crown',
  'static-hood': 'hood',
  'storm-cowl': 'hood',
  'tidepool-cowl': 'hood',
  'forge-warm-bonnet': 'cap',
  'hollow-weave-cap': 'cap',
  'ridge-copper-cap': 'cap',
  'watchmans-cap': 'pointed',
  'helpers-bonnet': 'cap',
  'firstfoot-cap': 'cap',
  'pouncers-cap': 'pointed',
  'wanderers-hat': 'brimmed',
  'festival-lantern-cap': 'pointed',
  'reed-hood': 'hood',
  'bogwardens-crown': 'crown',
  // Scarves
  'patch-scarf': 'scarf',
  'woolen-wrap': 'scarf',
  'travellers-mantle': 'mantle',
  'leafknit-scarf': 'scarf',
  'bark-shawl': 'mantle',
  'greenwardens-mantle': 'mantle',
  'static-wrap': 'scarf',
  'copper-wrap': 'scarf',
  'stormcallers-mantle': 'mantle',
  'festival-hearth-scarf': 'scarf',
  'tidepool-stole': 'mantle',
  'forge-warm-sash': 'scarf',
  'hollow-weave-shawl': 'mantle',
  'ridge-copper-scarf': 'scarf',
  'watchmans-cloak': 'mantle',
  'helpers-kerchief': 'scarf',
  'firstfoot-scarf': 'scarf',
  'pouncers-wrap': 'scarf',
  'wanderers-scarf': 'scarf',
  'fen-wrap': 'scarf',
  'bogkeepers-mantle': 'mantle',
  // Charms
  'trail-charm': 'pendant',
  'crossroads-compass': 'pendant',
  'wardens-bell': 'bell',
  'hearth-bell': 'bell',
  'footprint-charm': 'pendant',
  'pounce-charm': 'token',
  'festival-lantern-charm': 'pendant',
  'tidepool-locket': 'pendant',
  'forge-warm-token': 'token',
  'hollow-weave-knot': 'token',
  'ridge-copper-bead': 'token',
  'watchmans-whistle': 'bell',
  'helpers-ladle': 'pendant',
  'firstfoot-print': 'pendant',
  'pouncers-tooth': 'pendant',
  'wanderers-coin': 'token',
};

/** The slot a worn class belongs to. */
export function classSlot(cls: WornClass): WornSlot {
  if ((HAT_CLASSES as readonly string[]).includes(cls)) return 'hat';
  if ((SCARF_CLASSES as readonly string[]).includes(cls)) return 'scarf';
  return 'charm';
}
