/**
 * The review sheets of the room interior (`pnpm housing interior-sheets`): one per layer, every sample in a real room
 * cell with shipped furniture and a creature, then a sheet of eight mixed rooms and a whole-house mock. Each builder
 * returns a raster at 1x; the command writes it at 1x and enlarged.
 */
import { CEILING_COLOURS, CEILING_KINDS, ceilingOverlay, type CeilingKind } from './ceilings';
import { FLOOR_PATTERNS, floorPatternById, floorTile } from './floors';
import { FRAMES, frameById, type FrameMaterial } from './frame';
import { CELL_H, CELL_W, FEET, Raster, type Tones } from './kit';
import { FLOOR_COLOURS, TRIM_COLOURS, WALL_COLOURS } from './palettes';
import {
  drawRoom,
  MARGIN,
  nightRaster,
  renderRoom,
  shippedFrame,
  type RoomLook,
  type RoomOpts,
} from './scene';
import { TRIM_KINDS, trimOverlay, type TrimKind } from './trim';
import {
  doorway,
  DOOR_STYLES,
  stair,
  STAIR_STYLES,
  type DoorStyle,
  type RoomLike,
  type StairStyle,
} from './ways';
import { WALL_PATTERNS, wallPatternById, wallpaper } from './wallpaper';

const BACK = '#241e42';
/** Floors and trim are judged with the big pieces out of the way. */
const LIGHT: RoomOpts = { furnish: 'light' };
const PANEL = '#2f2857';
const MUTED = '#8f86b8';
const TEXT = '#f4eedc';

const tonesIn = (list: readonly Tones[], id: string): Tones => {
  const t = list.find((x) => x.id === id);
  if (t === undefined) throw new RangeError(`No palette "${id}".`);
  return t;
};
const wallTones = (id: string): Tones => tonesIn(WALL_COLOURS, id);
const floorTones = (id: string): Tones => tonesIn(FLOOR_COLOURS, id);
const trimTones = (id: string): Tones => tonesIn(TRIM_COLOURS, id);

/** What a layer sample is built from: ids into the libraries. Anything left out is the neutral default. */
export interface Mix {
  wall?: [pattern: string, colour: string];
  floor?: [pattern: string, colour: string];
  trim?: [kind: TrimKind, colour: string];
  ceiling?: [kind: CeilingKind, colour: string];
  frame?: string;
  door?: { style: DoorStyle; side: 'left' | 'right' };
  stair?: { style: StairStyle; x: number };
}

const NEUTRAL: Required<Pick<Mix, 'wall' | 'floor'>> = {
  wall: ['plain', 'cream'],
  floor: ['planks-long', 'oak'],
};

const WOOD: Tones = {
  id: 'wood',
  name: 'Wood',
  a: '#b07a4c',
  b: '#82553a',
  c: '#d29c68',
  d: '#5e3a28',
};

/** The look of a mix: the layers' own sprites (cells wide for a ceiling that depends on the room's width). */
export function lookOf(mix: Mix, cells = 1): RoomLook {
  const [wp, wc] = mix.wall ?? NEUTRAL.wall;
  const [fp, fc] = mix.floor ?? NEUTRAL.floor;
  const ceilingColours = CEILING_COLOURS.find((c) => c.id === mix.ceiling?.[1]);
  const ceilingKind = mix.ceiling?.[0];
  const ceilingH =
    ceilingKind === undefined ? 4 : (CEILING_KINDS.find((k) => k.id === ceilingKind)?.height ?? 4);
  const look: RoomLook = {
    wall: wallpaper(wallPatternById(wp), wallTones(wc)),
    floor: floorTile(floorPatternById(fp), floorTones(fc)),
  };
  if (ceilingKind !== undefined && ceilingColours !== undefined)
    look.ceiling = ceilingOverlay(ceilingKind, ceilingColours, cells * CELL_W);
  if (mix.trim !== undefined) {
    // a rafters ceiling has no cornice to hang: the trim keeps to the skirting and the panelling
    look.trim = trimOverlay(
      mix.trim[0],
      trimTones(mix.trim[1]),
      ceilingKind === 'rafters' ? 40 : ceilingH,
    );
  }
  if (mix.frame !== undefined) look.frame = frameById(mix.frame);
  const cloth = wallTones('rose');
  if (mix.door !== undefined) {
    const d = doorway(mix.door.style, trimTones('paint-white'), cloth);
    if (mix.door.side === 'left') look.doorLeft = d;
    else look.doorRight = d;
  }
  if (mix.stair !== undefined) look.stair = { stair: stair(mix.stair.style, WOOD), x: mix.stair.x };
  return look;
}

// ---------------------------------------------------------------------------------------------------------------
// Sheet layout

interface Sample {
  label: string;
  /** Second line, smaller. */
  note?: string | readonly string[];
  raster: Raster;
}

/** Samples in a grid with a label under each (at 1x: 5 x 7 capitals). */
function grid(samples: readonly Sample[], cols: number, top = 0): Raster {
  const cellW = Math.max(...samples.map((s) => s.raster.w)) + 8;
  const noteLines = (s: Sample): readonly string[] =>
    s.note === undefined ? [] : typeof s.note === 'string' ? [s.note] : s.note;
  const cellH =
    Math.max(...samples.map((s) => s.raster.h)) +
    13 +
    9 * Math.max(1, ...samples.map((s) => noteLines(s).length));
  const rows = Math.ceil(samples.length / cols);
  const img = new Raster(cols * cellW + 8, top + rows * cellH + 8, BACK);
  for (const [i, s] of samples.entries()) {
    const x = 8 + (i % cols) * cellW;
    const y = top + 4 + Math.floor(i / cols) * cellH;
    img.put(s.raster, x - 4 + Math.floor((cellW - s.raster.w) / 2), y);
    img.text(s.label, x, y + s.raster.h + 3, 1, TEXT);
    for (const [k, line] of noteLines(s).entries())
      img.text(line, x, y + s.raster.h + 12 + 9 * k, 1, MUTED);
  }
  return img;
}

/** Stacks sheets (each is a titled grid) one under another with a heading line. */
function stack(parts: readonly { heading: string; raster: Raster }[]): Raster {
  const w = Math.max(...parts.map((p) => p.raster.w));
  const h = parts.reduce((n, p) => n + p.raster.h + 14, 4);
  const img = new Raster(w, h, BACK);
  let y = 4;
  for (const p of parts) {
    img.text(p.heading, 8, y + 2, 1, '#ffd25a');
    img.put(p.raster, 0, y + 12);
    y += p.raster.h + 14;
  }
  return img;
}

function room(label: string, mix: Mix, opts: RoomOpts = {}, note?: string): Sample {
  const { raster } = renderRoom(lookOf(mix, opts.cells ?? 1), opts);
  return note === undefined ? { label, raster } : { label, note, raster };
}

// ---------------------------------------------------------------------------------------------------------------
// 1 Wallpaper

/** The colour each pattern is shown in on sheet 1 (so the sheet shows the range, not one colour). */
const WALL_SHOWN: Readonly<Record<string, string>> = {
  plain: 'cream',
  pinstripe: 'sage',
  stripes: 'rose',
  damask: 'lavender',
  panels: 'white',
  tiles: 'sky',
  brick: 'terracotta',
  planks: 'ochre',
  starry: 'midnight',
  floral: 'cream',
  polka: 'sky',
  harlequin: 'slate',
  split: 'forest',
};

export function wallpaperSheet(): Raster {
  const patterns = WALL_PATTERNS.map((p) =>
    room(p.id, { wall: [p.id, WALL_SHOWN[p.id] ?? 'cream'] }, {}, WALL_SHOWN[p.id] ?? 'cream'),
  );
  const colours = WALL_COLOURS.map((c) => room(c.id, { wall: ['damask', c.id] }, {}, 'damask'));
  return stack([
    {
      heading: `PATTERNS (${String(WALL_PATTERNS.length)}) x COLOURS (${String(WALL_COLOURS.length)}) = ${String(WALL_PATTERNS.length * WALL_COLOURS.length)}`,
      raster: grid(patterns, 4),
    },
    { heading: 'ONE PATTERN IN ALL COLOURS', raster: grid(colours, 4) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 2 Floors

const FLOOR_SHOWN: Readonly<Record<string, string>> = {
  'planks-long': 'oak',
  'planks-short': 'walnut',
  herringbone: 'ash',
  checker: 'slate',
  flags: 'whitewash',
  cobble: 'slate',
  carpet: 'moss',
  'carpet-border': 'burgundy',
  tatami: 'ash',
};

export function floorSheet(): Raster {
  const base: Mix = { wall: ['plain', 'white'], trim: ['skirting', 'paint-white'] };
  const patterns = FLOOR_PATTERNS.map((p) =>
    room(
      p.id,
      { ...base, floor: [p.id, FLOOR_SHOWN[p.id] ?? 'oak'] },
      LIGHT,
      FLOOR_SHOWN[p.id] ?? 'oak',
    ),
  );
  const colours = FLOOR_COLOURS.map((c) =>
    room(c.id, { ...base, floor: ['planks-short', c.id] }, LIGHT, 'planks short'),
  );
  return stack([
    {
      heading: `PATTERNS (${String(FLOOR_PATTERNS.length)}) x COLOURS (${String(FLOOR_COLOURS.length)}) = ${String(FLOOR_PATTERNS.length * FLOOR_COLOURS.length)}`,
      raster: grid(patterns, 4),
    },
    { heading: 'ONE PATTERN IN ALL COLOURS', raster: grid(colours, 4) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 3 Trim

export function trimSheet(): Raster {
  const wall: Mix['wall'] = ['plain', 'cream'];
  const kinds = TRIM_KINDS.map((k) =>
    room(
      k.id,
      { wall, trim: [k.id, 'paint-white'], ceiling: ['plain', 'white-oak'] },
      LIGHT,
      'white paint',
    ),
  );
  const wainscot = TRIM_COLOURS.map((c) =>
    room(
      c.id,
      { wall, trim: ['wainscot', c.id], ceiling: ['plain', 'white-oak'] },
      LIGHT,
      'wainscot',
    ),
  );
  const panelled = TRIM_COLOURS.map((c) =>
    room(
      c.id,
      { wall: ['plain', 'sage'], trim: ['panelled', c.id], ceiling: ['plain', 'white-oak'] },
      LIGHT,
      'panelled',
    ),
  );
  const classic = TRIM_COLOURS.map((c) =>
    room(
      c.id,
      { wall: ['plain', 'rose'], trim: ['classic', c.id], ceiling: ['plain', 'white-oak'] },
      LIGHT,
      'classic',
    ),
  );
  return stack([
    {
      heading: `FIVE KINDS (${String(TRIM_KINDS.length)}) x EIGHT COLOURWAYS`,
      raster: grid(kinds, 4),
    },
    { heading: 'WAINSCOT', raster: grid(wainscot, 4) },
    { heading: 'PANELLED', raster: grid(panelled, 4) },
    { heading: 'CLASSIC', raster: grid(classic, 4) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 4 Frame

/** Two rooms by two floors in one frame material: the posts, the middle post and the slabs between floors. */
function frameMock(frame: FrameMaterial): Raster {
  const r = new Raster(2 * CELL_W + 2 * MARGIN, 2 * CELL_H, BACK);
  const look: RoomLook = {
    wall: wallpaper(wallPatternById('plain'), wallTones('cream')),
    floor: floorTile(floorPatternById('planks-long'), floorTones('ash')),
    frame,
  };
  for (let f = 0; f < 2; f++) {
    for (let c = 0; c < 2; c++) {
      drawRoom(r, MARGIN + c * CELL_W, f * CELL_H, look, {
        furnish: f === 1 ? 'light' : 'none',
        creature: f === 1 ? 'sproutle' : null,
      });
    }
  }
  return r;
}

/** The post and the slab tile of a material magnified, to judge the two pixels the house is built of. */
function swatch(frame: FrameMaterial): Raster {
  const s = new Raster(2, 8);
  s.tileFill(frame.post, 0, 0, 2, 8);
  const slab = new Raster(16, 4);
  slab.tileFill(frame.slab, 0, 0, 16, 4);
  const out = new Raster(96, 46, PANEL);
  out.put(s.scaled(5), 6, 3);
  out.put(slab.scaled(4), 26, 4);
  out.put(slab.scaled(4), 26, 24);
  return out;
}

export function frameSheet(): Raster {
  const samples: Sample[] = [
    { label: 'shipped', note: 'timber walls', raster: frameMock(shippedFrame()) },
    ...FRAMES.map((f) => ({ label: f.id, note: f.name, raster: frameMock(f) })),
  ];
  const swatches: Sample[] = [
    { label: 'shipped', raster: swatch(shippedFrame()) },
    ...FRAMES.map((f) => ({ label: f.id, raster: swatch(f) })),
  ];
  return stack([
    {
      heading: `HOUSE FRAME: ${String(FRAMES.length)} MATERIALS (POSTS AND SLABS), SHIPPED FIRST`,
      raster: grid(samples, 3),
    },
    { heading: 'POST AND SLAB MAGNIFIED', raster: grid(swatches, 5) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 5 Ways through

/** Two neighbouring rooms with a doorway on the post between them. */
function doorPair(style: DoorStyle, place: 'straddle' | 'left-room' | 'notch'): Raster {
  const margin = 4;
  const r = new Raster(2 * CELL_W + 2 * margin, CELL_H, BACK);
  const look: RoomLook = {
    wall: wallpaper(wallPatternById('stripes'), wallTones('sage')),
    floor: floorTile(floorPatternById('planks-short'), floorTones('walnut')),
    trim: trimOverlay('skirting', trimTones('paint-white'), 4),
  };
  // the left room has the hearth's window at its left, the right room its lamp: furniture where the real spots are
  drawRoom(r, margin, 0, look, { furnish: 'full', creature: null });
  drawRoom(r, margin + CELL_W, 0, look, { furnish: 'full', creature: 'cindle' });
  const d = doorway(style, trimTones('paint-white'), wallTones('rose'));
  const boundary = margin + CELL_W;
  const y = FEET + 1 - 38;
  if (place === 'straddle') r.sprite(d.sprite, boundary - 10, y, 'wall');
  else if (place === 'left-room') r.sprite(d.sprite, boundary - 18, y, 'wall');
  else {
    // a notch in the post only: the opening is the 2 px between the inks, with a lintel
    r.rect(boundary - 1, 24, 2, FEET - 24 + 1, '#2a2038', 'wall');
    r.rect(boundary - 3, 22, 6, 3, '#f4efe4', 'wall');
    r.rect(boundary - 3, 25, 6, 1, '#b8af9b', 'wall');
  }
  return r;
}

/** A room's spots drawn over it: wall spots blue, floor spots green, the door's reach red. */
function spotMap(room: RoomLike, zone: [number, number][]): Raster {
  const { raster, ox } = renderRoom(lookOf({ wall: ['plain', 'cream'] }), {
    furnish: 'none',
    creature: null,
  });
  const r = raster;
  for (const s of room.spots) {
    const wallish = ['window', 'wall-large', 'wall-small', 'display'].includes(s.type);
    const floorish = ['floor-large', 'floor-small'].includes(s.type);
    const colour = wallish
      ? '#4a90e2'
      : floorish
        ? '#3cc47c'
        : s.type === 'rug'
          ? '#8f86b8'
          : '#ffd25a';
    const y = wallish ? 8 : floorish ? 30 : s.type === 'rug' ? 56 : 0;
    const h = wallish ? 28 : floorish ? 28 : s.type === 'rug' ? 3 : 8;
    r.rect(ox + s.x, y, s.w, 1, colour);
    r.rect(ox + s.x, y + h - 1, s.w, 1, colour);
    r.rect(ox + s.x, y, 1, h, colour);
    r.rect(ox + s.x + s.w - 1, y, 1, h, colour);
  }
  for (const [a, b] of zone) {
    r.rect(ox + a, 22, b - a, 1, '#ff4d6d');
    r.rect(ox + a, FEET, b - a, 1, '#ff4d6d');
    r.rect(ox + a, 22, 1, FEET - 22, '#ff4d6d');
    r.rect(ox + b - 1, 22, 1, FEET - 22, '#ff4d6d');
  }
  return r;
}

/** An upper and a lower room with a stair climbing from the lower through a hole in the upper's floor. */
function stairStack(style: StairStyle, x: number): Raster {
  const margin = MARGIN;
  const r = new Raster(CELL_W + 2 * margin, 2 * CELL_H, BACK);
  const s = stair(style, WOOD);
  const upper: RoomLook = {
    wall: wallpaper(wallPatternById('stripes'), wallTones('lavender')),
    floor: floorTile(floorPatternById('planks-short'), floorTones('walnut')),
    hole: { x: x + s.hole.x, w: s.hole.w },
  };
  const lower: RoomLook = {
    wall: wallpaper(wallPatternById('stripes'), wallTones('sage')),
    floor: floorTile(floorPatternById('planks-short'), floorTones('walnut')),
    stair: { stair: s, x },
  };
  drawRoom(r, margin, 0, upper, { furnish: 'light', creature: null });
  drawRoom(r, margin, CELL_H, lower, { furnish: 'full', creature: 'cindle' });
  return r;
}

export interface RoomJson {
  id: string;
  cells: { w: number };
  spots: { id: string; type: string; x: number; w: number }[];
}

export function waysSheet(rooms: readonly RoomJson[]): Raster {
  const styles = DOOR_STYLES.map((d) => ({
    label: d.id,
    note: 'straddles the post',
    raster: doorPair(d.id, 'straddle'),
  }));
  const places: Sample[] = [
    { label: 'A straddle', note: '20 wide, 10 each side', raster: doorPair('arch', 'straddle') },
    { label: 'B in left room', note: 'ends at the post', raster: doorPair('arch', 'left-room') },
    {
      label: 'C notch in post',
      note: 'no collisions, reads as a gap',
      raster: doorPair('arch', 'notch'),
    },
  ];
  const hearth = rooms.find((r) => r.id === 'hearth');
  const maps: Sample[] = [];
  if (hearth !== undefined) {
    const like: RoomLike = { id: hearth.id, cells: hearth.cells.w, spots: hearth.spots };
    maps.push({
      label: 'hearth: spots and doors',
      note: 'blue wall, green floor, red door reach',
      raster: spotMap(like, [
        [0, 10],
        [CELL_W - 18, CELL_W],
      ]),
    });
  }
  const stairs = STAIR_STYLES.map((s) => ({
    label: s.id,
    note: 'floor above cut',
    raster: stairStack(
      s.id,
      s.id === 'straight' ? CELL_W - s.w - 4 : s.id === 'ladder' ? CELL_W - 20 : CELL_W - 34,
    ),
  }));
  return stack([
    { heading: 'DOORWAY STYLES (ON THE POST BETWEEN TWO ROOMS)', raster: grid(styles, 2) },
    { heading: 'WHERE A DOORWAY SITS: THREE OPTIONS', raster: grid(places, 2) },
    { heading: 'WHERE THE FURNITURE SPOTS ARE', raster: grid(maps, 2) },
    { heading: 'STAIRS: THREE OPTIONS, UPPER FLOOR CUT OPEN', raster: grid(stairs, 4) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 6 Ceilings

export function ceilingSheet(): Raster {
  const samples: Sample[] = [];
  for (const k of CEILING_KINDS) {
    for (const c of CEILING_COLOURS) {
      samples.push(
        room(
          k.id,
          { wall: ['plain', 'cream'], ceiling: [k.id, c.id], trim: ['skirting', 'paint-white'] },
          LIGHT,
          c.name,
        ),
      );
    }
  }
  return stack([
    {
      heading: `${String(CEILING_KINDS.length)} KINDS x ${String(CEILING_COLOURS.length)} COLOURWAYS`,
      raster: grid(samples, 4),
    },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 7 Mix

export interface NamedMix {
  name: string;
  mix: Mix;
  /** Three short lines for the sheet. */
  lines: [string, string, string];
}

export const MIXES: readonly NamedMix[] = [
  {
    name: 'Cottage',
    mix: {
      wall: ['floral', 'cream'],
      floor: ['planks-short', 'oak'],
      trim: ['wainscot', 'paint-white'],
      ceiling: ['beamed', 'white-oak'],
      frame: 'timber-oak',
      door: { style: 'arch', side: 'left' },
    },
    lines: ['floral cream', 'short planks oak', 'wainscot, beams, arch'],
  },
  {
    name: 'Library',
    mix: {
      wall: ['panels', 'forest'],
      floor: ['herringbone', 'walnut'],
      trim: ['panelled', 'dark-walnut'],
      ceiling: ['coffered', 'cream-walnut'],
      frame: 'timber-dark',
      door: { style: 'square', side: 'right' },
    },
    lines: ['panels forest', 'parquet walnut', 'panelled, coffered'],
  },
  {
    name: 'Nursery',
    mix: {
      wall: ['polka', 'sky'],
      floor: ['carpet', 'moss'],
      trim: ['skirting', 'paint-white'],
      ceiling: ['plain', 'white-oak'],
      frame: 'painted-white',
      door: { style: 'curtain', side: 'left' },
    },
    lines: ['polka sky', 'carpet moss', 'skirting, curtain'],
  },
  {
    name: 'Observatory',
    mix: {
      wall: ['starry', 'midnight'],
      floor: ['checker', 'slate'],
      trim: ['classic', 'dark-ebony'],
      ceiling: ['rafters', 'dark'],
      frame: 'iron-dark',
      stair: { style: 'spiral', x: 78 },
    },
    lines: ['starry midnight', 'checker slate', 'ebony, rafters, spiral'],
  },
  {
    name: 'Bakery',
    mix: {
      wall: ['tiles', 'ochre'],
      floor: ['checker', 'terracotta'],
      trim: ['wainscot', 'paint-blue'],
      ceiling: ['plain', 'cream-walnut'],
      frame: 'brick-red',
      door: { style: 'ajar', side: 'right' },
    },
    lines: ['tiles ochre', 'checker terracotta', 'blue wainscot, ajar'],
  },
  {
    name: 'Dojo',
    mix: {
      wall: ['pinstripe', 'sage'],
      floor: ['tatami', 'ash'],
      trim: ['skirting', 'dark-walnut'],
      ceiling: ['beamed', 'dark'],
      frame: 'timber-dark',
      door: { style: 'beads', side: 'left' },
    },
    lines: ['thin stripes sage', 'tatami ash', 'dark skirting, beads'],
  },
  {
    name: 'Parlour',
    mix: {
      wall: ['damask', 'rose'],
      floor: ['carpet-border', 'burgundy'],
      trim: ['classic', 'paint-white'],
      ceiling: ['coffered', 'white-oak'],
      frame: 'painted-rose',
      stair: { style: 'ladder', x: 90 },
    },
    lines: ['damask rose', 'bordered carpet', 'rail, coffers, ladder'],
  },
  {
    name: 'Undercroft',
    mix: {
      wall: ['brick', 'charcoal'],
      floor: ['cobble', 'slate'],
      trim: ['wainscot', 'stone-grey'],
      ceiling: ['plain', 'stone'],
      frame: 'stone-grey',
      stair: { style: 'straight', x: 66 },
    },
    lines: ['brick charcoal', 'cobble slate', 'stone, straight stair'],
  },
];

export function mixRoom(m: NamedMix, opts: RoomOpts = {}): ReturnType<typeof renderRoom> {
  return renderRoom(lookOf(m.mix), opts);
}

export function mixSheet(): Raster {
  const samples: Sample[] = MIXES.map((m) => {
    const { raster } = mixRoom(m);
    return { label: m.name, note: m.lines, raster };
  });
  return stack([{ heading: 'EIGHT ROOMS, ALL SIX LAYERS', raster: grid(samples, 2) }]);
}

/** One mix room by day, at twilight and at night (the house's own lighting pass, called read only). */
export function nightStrip(name = 'Parlour'): Raster {
  const m = MIXES.find((x) => x.name === name) ?? MIXES[0];
  if (m === undefined) throw new Error('No mixes.');
  const { raster, lights } = mixRoom(m);
  const samples: Sample[] = [
    { label: 'day', raster },
    {
      label: 'twilight',
      raster: nightRaster(raster, 'twilight', lights),
    },
    {
      label: 'night',
      raster: nightRaster(raster, 'night', lights),
    },
  ];
  return grid(samples, 3);
}

// ---------------------------------------------------------------------------------------------------------------
// 8 House

const SKY = '#8fd0ee';
const LAWN = '#7cb05c';
const LAWN_TOP = '#9ccc6c';

/** A gable roof of `w` wide and `h` tall, in a red tile, ink edged. */
function roof(w: number, h: number): Raster {
  const r = new Raster(w, h, SKY);
  const tile = new Raster(w, h, '#c8684a');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const row = y % 8;
      const col = (x + (Math.floor(y / 8) % 2) * 8) % 16;
      const colour =
        row === 7 ? '#9a4a3a' : col === 15 ? '#9a4a3a' : row === 0 ? '#e8876a' : '#c8684a';
      tile.rect(x, y, 1, 1, colour);
    }
  }
  for (let y = 0; y < h; y++) {
    const half = Math.round(((w / 2) * (y + 1)) / h);
    const x0 = Math.floor(w / 2) - half;
    const x1 = Math.floor(w / 2) + half;
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const edge = x === Math.max(0, x0) || x === Math.min(w, x1) - 1 || y === 0;
      for (let k = 0; k < 3; k++)
        r.px[(y * w + x) * 3 + k] = edge
          ? ([0x0d, 0x0a, 0x1a][k] ?? 0)
          : (tile.px[(y * w + x) * 3 + k] ?? 0);
      r.mat[y * w + x] = 0;
    }
  }
  return r;
}

export interface HouseOpts {
  frame: string;
}

/** Three floors of two rooms: doorways between the rooms of every floor, stairs between floors, a roof, a lawn. */
export function houseMock(opts: HouseOpts = { frame: 'timber-dark' }): Raster {
  const side = 28;
  const roofH = 40;
  const top = roofH + 6;
  const bodyW = 2 * CELL_W + 4;
  const w = bodyW + 2 * side;
  const h = top + 3 * CELL_H + 22;
  const r = new Raster(w, h, SKY);
  const ground = top + 3 * CELL_H;
  r.rect(0, ground, w, h - ground, LAWN);
  r.rect(0, ground, w, 1, LAWN_TOP);
  r.put(roof(bodyW + 14, roofH), side - 7, top - roofH + 2);
  const x0 = side + 2;
  const frame = opts.frame;
  const floors: Mix[][] = [
    [
      {
        wall: ['stripes', 'lavender'],
        floor: ['planks-short', 'walnut'],
        trim: ['classic', 'paint-white'],
        ceiling: ['rafters', 'dark'],
        frame,
      },
      {
        wall: ['starry', 'midnight'],
        floor: ['carpet', 'burgundy'],
        trim: ['skirting', 'paint-white'],
        ceiling: ['rafters', 'dark'],
        frame,
      },
    ],
    [
      {
        wall: ['damask', 'rose'],
        floor: ['carpet-border', 'burgundy'],
        trim: ['wainscot', 'paint-white'],
        ceiling: ['coffered', 'white-oak'],
        frame,
      },
      {
        wall: ['panels', 'forest'],
        floor: ['herringbone', 'walnut'],
        trim: ['panelled', 'dark-walnut'],
        ceiling: ['beamed', 'cream-walnut'],
        frame,
      },
    ],
    [
      {
        wall: ['floral', 'cream'],
        floor: ['flags', 'whitewash'],
        trim: ['wainscot', 'paint-sage'],
        ceiling: ['beamed', 'white-oak'],
        frame,
      },
      {
        wall: ['tiles', 'ochre'],
        floor: ['checker', 'terracotta'],
        trim: ['wainscot', 'paint-blue'],
        ceiling: ['plain', 'cream-walnut'],
        frame,
      },
    ],
  ];
  const doors: DoorStyle[] = ['curtain', 'arch', 'square'];
  const spec: { f: number; c: number }[] = [];
  for (const f of [0, 1, 2]) for (const c of [0, 1]) spec.push({ f, c });
  // floor 0 (top) col 0 receives a stair from floor 1 col 0; floor 1 (middle) col 1 receives one from floor 2 col 1
  const holeIn = (f: number, c: number): { x: number; w: number } | undefined => {
    if (f === 0 && c === 0) return { x: 6 + 4, w: 17 };
    if (f === 1 && c === 1) return { x: CELL_W - 50 + 28, w: 14 };
    return undefined;
  };
  for (const { f, c } of spec) {
    const mix = floors[f]?.[c];
    if (mix === undefined) continue;
    const look = lookOf(mix);
    const hole = holeIn(f, c);
    if (hole !== undefined) look.hole = hole;
    if (f === 1 && c === 0) look.stair = { stair: stair('spiral', WOOD_DARK), x: 6 };
    if (f === 2 && c === 1) look.stair = { stair: stair('straight', WOOD_DARK), x: CELL_W - 50 };
    drawRoom(r, x0 + c * CELL_W, top + f * CELL_H, look, {
      furnish: f === 2 ? 'full' : 'light',
      creature: c === 1 ? 'cindle' : f === 1 ? 'sproutle' : null,
    });
  }
  for (const f of [0, 1, 2]) {
    const d = doorway(doors[f] ?? 'arch', trimTones('paint-white'), wallTones('rose'));
    r.sprite(d.sprite, x0 + CELL_W - 10, top + f * CELL_H + FEET + 1 - 38, 'wall');
  }
  // the ground floor's door, the step, a plinth
  r.rect(x0 - 2, ground - 3, bodyW, 3, '#706b60');
  r.rect(x0 - 2, ground - 3, bodyW, 1, '#0d0a1a');
  return r;
}

const WOOD_DARK: Tones = {
  id: 'wood-dark',
  name: 'Wood',
  a: '#9a6a40',
  b: '#6e4630',
  c: '#c08a58',
  d: '#4a2e20',
};
