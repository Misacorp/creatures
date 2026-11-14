/**
 * The silhouette variants of the forms (`docs/design/housing-workshop.md`, "Variants"): per form, a small menu of
 * named shapes a style picks from (`Style.shapes`), so a set drawn from a style alone still has its own outline (an
 * arched headboard, a domed cupboard, a trestle table, a chain shelf, a pouf). The first value of every list is the
 * form's plain drawing, the one a style that picks nothing gets.
 */

export const BED_HEADS = [
  'panel',
  'arched',
  'pointed',
  'posts',
  'ladder',
  'shell',
  'canopy',
] as const;
export const BED_FEET = ['board', 'low', 'none', 'post'] as const;
export const BLANKETS = ['band', 'sheet', 'quilt', 'hem'] as const;

export interface BedShape {
  /** The headboard's outline. `canopy` puts posts at both ends and a cloth canopy over the sleeper. */
  head?: (typeof BED_HEADS)[number];
  /** The footboard: as tall as now, low, none, or one post. Its top follows the headboard's. */
  foot?: (typeof BED_FEET)[number];
  /** How the blanket's top is folded: a light band, the sheet turned over it, a patchwork quilt, an accent hem. */
  blanket?: (typeof BLANKETS)[number];
  /** The style's motif in the middle of the blanket. */
  mark?: boolean;
}

export const CUPBOARD_TOPS = ['crest', 'cornice', 'arched', 'domed', 'rounded'] as const;
export const CUPBOARD_DOORS = [
  'panel',
  'glass',
  'lattice',
  'slatted',
  'round',
  'single',
  'drawers',
] as const;
export const CUPBOARD_BASES = ['legs', 'plinth', 'bun'] as const;

export interface CupboardShape {
  /** `crest` is the crown with the style's `top` above it; the others are the whole top's outline. */
  top?: (typeof CUPBOARD_TOPS)[number];
  /** Two panel doors, glass doors, glass in a lattice, louvred doors, a round window in each, one big door, or a chest of drawers. */
  doors?: (typeof CUPBOARD_DOORS)[number];
  /** Legs, a plinth to the floor, or short bun feet. */
  base?: (typeof CUPBOARD_BASES)[number];
  /** Iron straps across the doors, with rivets. */
  bands?: boolean;
  /** Six pixels narrower each side: a slim tall cabinet. */
  narrow?: boolean;
}

export const TABLE_KINDS = ['four-leg', 'trestle', 'pedestal', 'slab', 'log'] as const;
export const TABLE_SKIRTS = ['apron', 'swag', 'cloth', 'drawer', 'none'] as const;

export interface TableShape {
  /** What holds the top up: two legs and a stretcher, A-frame trestles, one pedestal, two solid slabs, or a log on roots. */
  kind?: (typeof TABLE_KINDS)[number];
  /** Under the top: the trim band, a cloth swag between the legs, a tablecloth, a drawer, or nothing. */
  skirt?: (typeof TABLE_SKIRTS)[number];
}

export const SHELF_BRACKETS = ['wedge', 'scroll', 'block', 'rope', 'chain', 'none'] as const;
export const SHELF_BOARDS = ['plank', 'thick', 'log'] as const;

export interface ShelfShape {
  /** Under (or above) the board: wedges, iron scrolls, square corbels, hanging ropes, hanging chains, or none. */
  bracket?: (typeof SHELF_BRACKETS)[number];
  /** A plank, a thick board with the trim, or a log with a bark edge. */
  board?: (typeof SHELF_BOARDS)[number];
}

export const STOOL_KINDS = ['two-leg', 'three-leg', 'drum', 'pouf', 'stump', 'spool'] as const;

export interface StoolShape {
  kind?: (typeof STOOL_KINDS)[number];
  /** The style's motif on the seat. */
  mark?: boolean;
}

export const FRAME_KINDS = ['picture', 'mirror', 'round', 'crest', 'banner', 'clock'] as const;

export interface FrameShape {
  /** A framed picture, an oval mirror, a round porthole picture, a shield with the motif, a hanging banner, or a clock. */
  kind?: (typeof FRAME_KINDS)[number];
}

export const CURTAIN_KINDS = ['tied', 'straight', 'shutters', 'beads', 'cafe', 'bare'] as const;
export const PANES = ['cross', 'round', 'arched', 'grid', 'plain'] as const;
export const VALANCES = ['band', 'scallop', 'none'] as const;

export interface CurtainShape {
  /** Tied-back drapes, straight drapes, wooden shutters, bead strings, a half-height café curtain, or no dressing. */
  kind?: (typeof CURTAIN_KINDS)[number];
  /** The window: a cross of bars, a round window, an arched one, a grid of small panes, or one pane. */
  pane?: (typeof PANES)[number];
  /** Over the window: the cloth band, a deep scalloped pelmet, or nothing. */
  valance?: (typeof VALANCES)[number];
}

/** What a style picks per form. Anything left out is the form's plain drawing. */
export interface FormShapes {
  bed?: BedShape;
  cupboard?: CupboardShape;
  table?: TableShape;
  shelf?: ShelfShape;
  stool?: StoolShape;
  frame?: FrameShape;
  curtains?: CurtainShape;
}

/**
 * Every variant axis per form, for the tests (each value draws in its box), the sheets and the doc. The lamp's and the
 * rug's variants are the style's `lamp`, `glow` and `rug` fields (`SHADE_KINDS`, `RUG_SHAPES` in `draw/parts.ts`).
 */
export const VARIANTS = {
  bed: { head: BED_HEADS, foot: BED_FEET, blanket: BLANKETS },
  cupboard: { top: CUPBOARD_TOPS, doors: CUPBOARD_DOORS, base: CUPBOARD_BASES },
  table: { kind: TABLE_KINDS, skirt: TABLE_SKIRTS },
  shelf: { bracket: SHELF_BRACKETS, board: SHELF_BOARDS },
  stool: { kind: STOOL_KINDS },
  frame: { kind: FRAME_KINDS },
  curtains: { kind: CURTAIN_KINDS, pane: PANES, valance: VALANCES },
} as const;
