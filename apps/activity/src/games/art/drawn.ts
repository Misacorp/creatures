/**
 * Games art drawn by code, where a shape is round, sized by a number or built from boxes: the rolling
 * watermelon, the hauls' birch log (tilting) and giant pumpkin (rolling) and a lane's finish strip, the podium blocks, the scoreboard, the sauna door, the host desk, the frosty window and
 * the ice block (each a `SpriteDef` of at most 64x64, made once), and the shapes that change with the
 * show (the thermometer's fill, the shrinking ice floe, the lane-rope ellipse, a sagging garland of
 * bunting), which return placements and are memoised by their numbers.
 *
 * Everything is pure and deterministic: no randomness, the same numbers give the same pixels.
 */
import type { SpriteDef } from '../../sprites/sprite-data';
import { RAMPS, tintSprite, type Ramp, type RampName } from './tint';
import { rampPalette } from './data/games-tiles';
import { GAMES_PROP_DATA } from './data/games-props';
import { PixelGrid, gridPlacements, type Placement } from './pixel';

const INK = '#0d0a1a';
const WHITE = '#ffffff';

// ---------------------------------------------------------------------------------------------
// The watermelon (32x32, four rolling frames)

export const MELON_SIZE = 32;

/**
 * One frame of the melon: a lit sphere with zigzag stripes from pole to pole, turned `angle` radians
 * clockwise (it rolls to the right). The pattern repeats every half turn, so four frames a quarter of
 * that apart loop smoothly.
 */
function melonFrame(angle: number): SpriteDef {
  const g = new PixelGrid(MELON_SIZE, MELON_SIZE);
  const c = MELON_SIZE / 2;
  const radius = 14.6;
  const light = normalise([-0.55, -0.65, 0.55]);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const stripes = 10;
  for (let y = 0; y < MELON_SIZE; y++) {
    for (let x = 0; x < MELON_SIZE; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > radius + 1.1) continue;
      if (d > radius) {
        g.set(x, y, 'k');
        continue;
      }
      const px = dx / radius;
      const py = dy / radius;
      const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));
      const shade = px * light[0] + py * light[1] + pz * light[2];
      // In the melon's own frame (turned back by the angle), the stripes run along its u axis.
      const u = px * cos - py * sin;
      const v = px * sin + py * cos;
      const lon = Math.atan2(pz, v);
      const wave = 0.09 * Math.sin(u * 14);
      const t = (((lon + wave) * stripes) / (2 * Math.PI)) % 1;
      const stripe = t < 0.45;
      let key: string;
      if (stripe) key = shade > 0.5 ? 'c' : 'd';
      else key = shade > 0.78 ? 'a' : shade > 0.3 ? 'b' : 'c';
      g.set(x, y, key);
    }
  }
  // A soft shine on the top left.
  for (const [x, y] of [
    [9, 7],
    [10, 7],
    [8, 8],
    [9, 8],
    [8, 9],
  ] as const)
    g.set(x, y, 'w');
  return g.toSprite(rampPalette(RAMPS.green, undefined, { k: INK, w: WHITE }));
}

function normalise(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export const MELON_FRAMES: readonly SpriteDef[] = [0, 1, 2, 3].map((i) =>
  melonFrame((i * Math.PI) / 4 / 1),
);

// ---------------------------------------------------------------------------------------------
// Boxes: podium blocks, scoreboard, door, host desk, window, ice block

/** A 3x5 digit (1 to 3) for the podium fronts. */
const DIGITS: Readonly<Record<number, readonly string[]>> = {
  1: ['.w.', 'ww.', '.w.', '.w.', 'www'],
  2: ['ww.', '..w', '.w.', 'w..', 'www'],
  3: ['ww.', '..w', '.w.', '..w', 'ww.'],
};

export const PODIUM_WIDTH = 20;
/** The height of each podium block (1st is tallest). */
export const PODIUM_HEIGHTS: Readonly<Record<1 | 2 | 3, number>> = { 1: 24, 2: 18, 3: 14 };

function podiumBlock(place: 1 | 2 | 3): SpriteDef {
  const w = PODIUM_WIDTH;
  const h = PODIUM_HEIGHTS[place];
  const g = new PixelGrid(w, h);
  g.rect(0, 0, w, h, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 1, 'b');
  g.set(w - 2, 1, 'b');
  g.set(w - 2, 2, 'c');
  g.rect(1, 3, w - 2, 1, 'k');
  g.rect(1, 4, w - 2, h - 5, 'c');
  g.rect(1, 4, 1, h - 5, 'b');
  g.rect(w - 3, 4, 2, h - 5, 'd');
  g.rect(1, 4, w - 2, 1, 'd');
  const digit = DIGITS[place] ?? [];
  const dx = Math.floor((w - 3) / 2);
  const dy = place === 3 ? 6 : 7;
  for (const [y, row] of digit.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch !== 'w') continue;
      g.set(dx + x + 1, dy + y + 1, 'd');
    }
  }
  g.stamp(digit, dx, dy);
  g.set(0, 0, '.');
  g.set(w - 1, 0, '.');
  const ramp = place === 1 ? RAMPS.gold : place === 2 ? RAMPS.silver : RAMPS.bronze;
  return g.toSprite(rampPalette(ramp, undefined, { k: INK, w: WHITE }));
}

export const PODIUM_BLOCKS: Readonly<Record<1 | 2 | 3, SpriteDef>> = {
  1: podiumBlock(1),
  2: podiumBlock(2),
  3: podiumBlock(3),
};

/** The scoreboard: a framed dark screen with chasing bulbs (two frames) on two posts. */
function scoreboardFrame(phase: 0 | 1): SpriteDef {
  const w = 48;
  const h = 30;
  const g = new PixelGrid(w, h);
  const board = 24;
  g.rect(0, 0, w, board, 'k');
  g.rect(1, 1, w - 2, board - 2, 'c');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 1, 1, board - 2, 'b');
  g.rect(w - 2, 2, 1, board - 3, 'd');
  g.rect(2, board - 2, w - 4, 1, 'd');
  g.rect(4, 4, w - 8, board - 8, 'k');
  g.rect(5, 5, w - 10, board - 10, 'n');
  for (let y = 6; y < board - 5; y += 2) g.rect(5, y, w - 10, 1, 'm');
  // Bulbs round the frame.
  let i = 0;
  for (let x = 3; x < w - 3; x += 3) {
    g.set(x, 2, (i + phase) % 2 === 0 ? 'y' : 'o');
    g.set(w - 1 - x, board - 3, (i + phase) % 2 === 0 ? 'y' : 'o');
    i++;
  }
  for (let y = 5; y < board - 4; y += 3) {
    g.set(2, y, (i + phase) % 2 === 0 ? 'y' : 'o');
    g.set(w - 3, y, (i + phase + 1) % 2 === 0 ? 'y' : 'o');
    i++;
  }
  // Posts.
  for (const px of [8, w - 12]) {
    g.rect(px, board, 4, h - board, 'k');
    g.rect(px + 1, board, 2, h - board - 1, 'g');
  }
  return g.toSprite(
    rampPalette(RAMPS.purple, RAMPS.wood, {
      k: INK,
      n: '#17132b',
      m: '#241e42',
      y: '#fff2a8',
      o: '#c8952b',
    }),
  );
}

export const SCOREBOARD_FRAMES: readonly SpriteDef[] = [scoreboardFrame(0), scoreboardFrame(1)];
/** The scoreboard's dark screen, in its own pixels, for text laid over it. */
export const SCOREBOARD_SCREEN = { x: 5, y: 5, width: 38, height: 14 } as const;

/** A plank door with a small window and a gold handle (the sauna's exit). */
function door(): SpriteDef {
  const w = 16;
  const h = 44;
  const g = new PixelGrid(w, h);
  g.rect(0, 0, w, h, 'k');
  g.rect(1, 1, w - 2, h - 1, 'd');
  g.rect(2, 2, w - 4, h - 2, 'b');
  g.rect(2, 2, 1, h - 2, 'a');
  g.rect(w - 3, 2, 1, h - 2, 'c');
  for (const x of [6, 10]) g.rect(x, 2, 1, h - 2, 'c');
  // Window.
  g.rect(4, 5, 8, 8, 'k');
  g.rect(5, 6, 6, 6, 'i');
  g.set(5, 6, 'w');
  g.set(6, 6, 'w');
  g.set(5, 7, 'w');
  g.rect(5, 9, 6, 1, 'j');
  // Cross braces.
  g.rect(3, 18, w - 6, 2, 'c');
  g.rect(3, 34, w - 6, 2, 'c');
  for (let i = 0; i < 14; i++) g.set(4 + Math.floor((i * 8) / 14), 33 - i, 'c');
  // Handle.
  g.rect(11, 25, 3, 2, 'k');
  g.set(12, 25, 'y');
  g.set(11, 25, 'y');
  return g.toSprite(
    rampPalette(RAMPS.wood, undefined, {
      k: INK,
      i: '#bfe6f5',
      j: '#9cd8fb',
      w: WHITE,
      y: '#ffd25a',
    }),
  );
}

export const DOOR = door();

/** The host's desk with a star on its front and a microphone on a gooseneck. */
function hostDesk(): SpriteDef {
  const w = 34;
  const h = 26;
  const g = new PixelGrid(w, h);
  const top = 9;
  // Microphone.
  g.stamp(['.kkk.', 'kmmnk', 'kmnnk', '.kkk.'], 4, 0);
  for (const [x, y] of [
    [6, 4],
    [7, 5],
    [8, 6],
    [8, 7],
  ] as const)
    g.set(x, y, 'k');
  g.rect(6, 8, 5, 1, 'k');
  // Desk top.
  g.rect(0, top, w, 4, 'k');
  g.rect(1, top + 1, w - 2, 1, 'e');
  g.rect(1, top + 2, w - 2, 1, 'f');
  // Front.
  g.rect(1, top + 4, w - 2, h - top - 5, 'c');
  g.rect(0, top + 4, 1, h - top - 4, 'k');
  g.rect(w - 1, top + 4, 1, h - top - 4, 'k');
  g.rect(0, h - 1, w, 1, 'k');
  g.rect(1, top + 4, 1, h - top - 5, 'b');
  g.rect(w - 3, top + 4, 2, h - top - 5, 'd');
  g.rect(1, top + 4, w - 2, 1, 'd');
  g.stamp(['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', '.y...y.'], 13, top + 6);
  return g.toSprite(
    rampPalette(RAMPS.purple, RAMPS.wood, { k: INK, m: '#d4d8e8', n: '#6e6490', y: '#ffd25a' }),
  );
}

export const HOST_DESK = hostDesk();

/** A small cabin window: a frame (`a b c d`) round four panes of sky, frosted at the corners when cold. */
function cabinWindow(frosted: boolean): SpriteDef {
  const w = 22;
  const h = 18;
  const g = new PixelGrid(w, h);
  g.rect(0, 0, w, h, 'k');
  g.rect(1, 1, w - 2, h - 2, 'b');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(w - 2, 1, 1, h - 2, 'c');
  g.rect(1, h - 2, w - 2, 1, 'd');
  g.rect(3, 3, w - 6, h - 6, 'k');
  g.rect(4, 4, w - 8, h - 8, 'i');
  g.rect(4, 4, w - 8, 2, 'j');
  g.rect(10, 4, 2, h - 8, 'k');
  g.rect(4, 8, w - 8, 1, 'k');
  if (frosted) {
    // Frost creeping in from the corners and a snowflake.
    g.stamp(['ww.', 'w..'], 4, 4);
    g.stamp(['.ww', '..w'], w - 7, 4);
    g.stamp(['w..', 'ww.', 'www'], 4, h - 7);
    g.stamp(['..w', '.ww', 'www'], w - 7, h - 7);
    g.stamp(['.w.', 'www', '.w.'], 13, 10);
  } else {
    // A shine on the glass and green treetops outside.
    g.stamp(['w.', '.w'], 5, 5);
    g.stamp(['w.', '.w'], 13, 5);
    g.rect(4, h - 6, 6, 2, 'g');
    g.rect(12, h - 6, 6, 2, 'g');
    g.stamp(['.gg...', 'gggg.g'], 4, h - 8);
    g.stamp(['..gg..', '.ggggg'], 12, h - 8);
  }
  const ramp = frosted ? RAMPS.frost : RAMPS.pine;
  return g.toSprite(
    rampPalette(ramp, undefined, { k: INK, i: '#9cd8fb', j: '#c4ebff', w: WHITE, g: '#57ad52' }),
  );
}

export const FROSTY_WINDOW = cabinWindow(true);
export const WINDOW = cabinWindow(false);

/** The cold plunge's "stove": a big clear ice block with a frozen fish inside. */
function iceBlock(): SpriteDef {
  const w = 26;
  const h = 30;
  const g = new PixelGrid(w, h);
  const side = 5;
  // Top face (a parallelogram).
  g.rect(side, 0, w - side, 1, 'k');
  for (let y = 1; y < side; y++) {
    g.set(side - y, y, 'k');
    g.rect(side - y + 1, y, w - side - 1, 1, 'a');
    g.set(w - y, y, 'k');
    g.rect(w - y + 1, y, y - 1, 1, 'd');
    g.set(w - 1, y, 'k');
  }
  g.rect(0, side, w - side + 1, 1, 'k');
  // Front face.
  g.rect(0, side + 1, 1, h - side - 2, 'k');
  g.rect(1, side + 1, w - side - 1, h - side - 2, 'b');
  g.rect(w - side, side, 1, h - side - 1, 'k');
  g.rect(w - side + 1, side, side - 2, h - side - 1, 'd');
  g.rect(w - 1, 1, 1, h - 1, 'k');
  for (let y = side; y < h - 1; y++) g.set(w - 1 - Math.max(0, y - (h - side)), y, 'k');
  g.rect(0, h - 1, w - side + 1, 1, 'k');
  for (let i = 0; i < side - 1; i++) g.set(w - side + 1 + i, h - 2 - i, 'k');
  for (let i = 0; i < side - 1; i++)
    for (let j = i + 1; j < side - 1; j++) g.set(w - side + 1 + j, h - 2 - i, '.');
  // Inside: a fish and some shine.
  g.stamp(['..ff..f', '.fffff.', 'fkffff.', '.fffff.', '..ff..f'], 6, 14);
  g.rect(2, side + 2, 1, 8, 'w');
  g.rect(3, side + 2, 1, 4, 'w');
  g.rect(1, h - 4, w - side - 1, 1, 'c');
  g.rect(1, h - 3, w - side - 1, 1, 'c');
  g.stamp(['c...', '.c..', '.cc.', '...c'], 14, 9);
  return g.toSprite(rampPalette(RAMPS.ice, undefined, { k: INK, w: WHITE, f: '#ff9a4a' }));
}

export const ICE_BLOCK = iceBlock();

// ---------------------------------------------------------------------------------------------
// Shapes that change with the show

/** The thermometer's tube: where `thermometerFill` goes, in the thermometer's own pixels. */
export const THERMO_TUBE = { x: 4, y: 3, width: 3, height: 29 } as const;

const fillCache = new Map<string, SpriteDef>();

/**
 * The thermometer's fill for a heat level of 0 to 100 (clamped, rounded): a column of the secondary
 * ramp rising from the bulb, with a lit meniscus. Draw it at the thermometer's `THERMO_TUBE` offset.
 */
export function thermometerFill(heat: number, ramp: RampName = 'red'): SpriteDef {
  const level = Math.max(0, Math.min(100, Math.round(heat)));
  const key = `${String(level)}:${ramp}`;
  const hit = fillCache.get(key);
  if (hit !== undefined) return hit;
  const h = THERMO_TUBE.height;
  const filled = 1 + Math.round((level / 100) * (h - 1));
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    if (y < h - filled) rows.push('...');
    else if (y === h - filled) rows.push('eff');
    else rows.push('fgh');
  }
  const r: Ramp = RAMPS[ramp];
  const sprite: SpriteDef = { rows, palette: { e: r[0], f: r[1], g: r[2], h: r[3] } };
  fillCache.set(key, sprite);
  return sprite;
}

/** The floe's centre in scene pixels, its widest radius and the ratio of its height to its width. */
export const FLOE_CENTRE = { x: 96, y: 62 } as const;
export const FLOE_MAX_RADIUS = 84;
export const FLOE_MIN_RADIUS = 10;
export const FLOE_ASPECT = 0.52;
/** How thick the floe's side is below its top. */
export const FLOE_DEPTH = 5;

const floeCache = new Map<number, Placement[]>();

/** The floe's vertical radius for a horizontal one. */
export function floeRy(rx: number): number {
  return rx * FLOE_ASPECT;
}

/** True when a scene point lies on the floe's top at this radius (for standing and for cracks). */
export function onFloe(x: number, y: number, rx: number): boolean {
  const ry = floeRy(rx);
  const nx = (x - FLOE_CENTRE.x) / rx;
  const ny = (y - FLOE_CENTRE.y) / ry;
  return nx * nx + ny * ny <= 1;
}

/**
 * The ice floe at a radius (clamped to `FLOE_MIN_RADIUS..FLOE_MAX_RADIUS`, rounded): its snowy top lit
 * along the top-left rim, a darker side `FLOE_DEPTH` deep, an ink outline, a ring of foam where it meets
 * the water and a few cracks that fit inside it. Placements in scene pixels.
 */
export function floePlacements(radius: number): Placement[] {
  const rx = Math.max(FLOE_MIN_RADIUS, Math.min(FLOE_MAX_RADIUS, Math.round(radius)));
  const hit = floeCache.get(rx);
  if (hit !== undefined) return hit;
  const ry = floeRy(rx);
  const left = Math.floor(FLOE_CENTRE.x - rx) - 2;
  const top = Math.floor(FLOE_CENTRE.y - ry) - 2;
  const w = Math.ceil(2 * rx) + 5;
  const h = Math.ceil(2 * ry) + FLOE_DEPTH + 6;
  const g = new PixelGrid(w, h);
  const inside = (x: number, y: number): boolean => {
    const nx = (left + x + 0.5 - FLOE_CENTRE.x) / rx;
    const ny = (top + y + 0.5 - FLOE_CENTRE.y) / ry;
    return nx * nx + ny * ny <= 1;
  };
  const body = (x: number, y: number): boolean => {
    for (let d = 0; d <= FLOE_DEPTH; d++) if (inside(x, y - d)) return true;
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        const rim = !inside(x - 2, y - 1) || !inside(x - 1, y - 2);
        const shade = !inside(x + 2, y + 1) || !inside(x + 1, y + 2);
        g.set(x, y, rim ? 'a' : shade ? 'c' : (x * 5 + y * 3) % 23 === 0 ? 'c' : 'b');
      } else if (body(x, y)) {
        g.set(x, y, body(x, y + 2) ? 's' : 't');
      }
    }
  }
  // Outline and foam.
  const filled = (x: number, y: number): boolean => g.get(x, y) !== '.' && g.get(x, y) !== 'x';
  const outline: [number, number][] = [];
  const foam: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled(x, y)) continue;
      const near = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
      if (near) outline.push([x, y]);
    }
  }
  for (const [x, y] of outline) g.set(x, y, 'k');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g.get(x, y) !== '.') continue;
      if (g.get(x, y - 1) === 'k' || (g.get(x - 1, y) === 'k' && y > h / 2)) foam.push([x, y]);
    }
  }
  for (const [x, y] of foam) if ((x + y) % 3 !== 0) g.set(x, y, 'x');
  const out = gridPlacements(
    g,
    rampPalette(RAMPS.snow, undefined, { k: INK, x: '#d4f2fb', s: '#9ad8f0', t: '#5aa4d4' }),
    left,
    top,
  );
  // Cracks, where they fit.
  const cracks = GAMES_PROP_DATA.crack;
  const spots: readonly [number, number, number][] = [
    [-0.55, -0.15, 0],
    [0.3, 0.25, 1],
    [0.05, -0.5, 2],
    [-0.2, 0.45, 0],
  ];
  for (const [fx, fy, i] of spots) {
    const sprite = cracks[i];
    if (sprite === undefined) continue;
    const cw = sprite.rows[0]?.length ?? 0;
    const ch = sprite.rows.length;
    const x = Math.round(FLOE_CENTRE.x + fx * rx);
    const y = Math.round(FLOE_CENTRE.y + fy * ry);
    const fits =
      onFloe(x - 1, y - 1, rx - 3) &&
      onFloe(x + cw + 1, y + ch + 1, rx - 3) &&
      onFloe(x + cw, y, rx - 3);
    if (fits) out.push({ sprite, x, y });
  }
  floeCache.set(rx, out);
  return out;
}

/** The swim track: an ellipse of lane-rope floats round the lake. */
export const TRACK = { cx: 96, cy: 62, rx: 72, ry: 34 } as const;

/** A point on the track at a fraction of a lap (0 is the start, at the bottom, going anticlockwise). */
export function trackPoint(t: number): { x: number; y: number } {
  const angle = Math.PI / 2 - t * 2 * Math.PI;
  return {
    x: Math.round(TRACK.cx + TRACK.rx * Math.cos(angle)),
    y: Math.round(TRACK.cy + TRACK.ry * Math.sin(angle)),
  };
}

const ropeCache = new Map<string, Placement[]>();

/**
 * A lane rope along an ellipse: floats three pixels long, alternating the ramp's colour and white,
 * each with a darker pixel under it. The inner and outer ropes of the track use `inset`.
 */
export function ropeEllipse(
  ellipse: { cx: number; cy: number; rx: number; ry: number },
  ramp: RampName = 'red',
): Placement[] {
  const key = `${String(ellipse.cx)},${String(ellipse.cy)},${String(ellipse.rx)},${String(ellipse.ry)},${ramp}`;
  const hit = ropeCache.get(key);
  if (hit !== undefined) return hit;
  const left = Math.floor(ellipse.cx - ellipse.rx) - 1;
  const top = Math.floor(ellipse.cy - ellipse.ry) - 1;
  const g = new PixelGrid(Math.ceil(ellipse.rx * 2) + 3, Math.ceil(ellipse.ry * 2) + 4);
  const steps = Math.ceil(2 * Math.PI * Math.max(ellipse.rx, ellipse.ry) * 2);
  let last = '';
  let run = 0;
  let colour = 0;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const x = Math.round(ellipse.cx + ellipse.rx * Math.cos(a)) - left;
    const y = Math.round(ellipse.cy + ellipse.ry * Math.sin(a)) - top;
    const here = `${String(x)},${String(y)}`;
    if (here === last) continue;
    last = here;
    run++;
    if (run > 3) {
      run = 1;
      colour = 1 - colour;
    }
    if (g.get(x, y + 1) === '.' || g.get(x, y + 1) === 'v' || g.get(x, y + 1) === 'd') {
      g.set(x, y + 1, colour === 0 ? 'd' : 'v');
    }
    g.set(x, y, colour === 0 ? 'b' : 'w');
  }
  const r = RAMPS[ramp];
  const out = gridPlacements(g, { b: r[1], d: r[3], w: WHITE, v: '#9aa0bc' }, left, top);
  ropeCache.set(key, out);
  return out;
}

const garlandCache = new Map<string, Placement[]>();

/**
 * Bunting on a sagging rope from (`x0`, `y`) to (`x1`, `y`), sagging `sag` pixels in the middle, with a
 * little flag every 8 pixels in the ramps' colours, in turn.
 */
export function garland(
  x0: number,
  x1: number,
  y: number,
  sag: number,
  ramps: readonly RampName[],
): Placement[] {
  const key = `${String(x0)},${String(x1)},${String(y)},${String(sag)},${ramps.join('/')}`;
  const hit = garlandCache.get(key);
  if (hit !== undefined) return hit;
  const w = x1 - x0 + 1;
  const g = new PixelGrid(w, sag + 9);
  const ropeY = (x: number): number => {
    const t = (x / (w - 1)) * 2 - 1;
    return Math.round(sag * (1 - t * t));
  };
  for (let x = 0; x < w; x++) {
    g.set(x, ropeY(x), 'k');
    if (x > 0 && Math.abs(ropeY(x) - ropeY(x - 1)) > 1) g.set(x, ropeY(x) - 1, 'k');
  }
  const flag = ['kABk', 'kABk', '.kBk', '.kk.'];
  const pal: Record<string, string> = { k: INK };
  const keys = 'ABCDEFGHIJKL';
  ramps.forEach((name, i) => {
    const r = RAMPS[name];
    const light = keys[(2 * i) % keys.length] ?? 'A';
    const dark = keys[(2 * i + 1) % keys.length] ?? 'B';
    pal[light] = r[1];
    pal[dark] = r[2];
  });
  let n = 0;
  for (let x = 3; x + 4 < w; x += 8) {
    const i = n % Math.max(1, ramps.length);
    const light = keys[(2 * i) % keys.length] ?? 'A';
    const dark = keys[(2 * i + 1) % keys.length] ?? 'B';
    const rows = flag.map((r) => r.replaceAll('A', light).replaceAll('B', dark));
    g.stamp(rows, x, ropeY(x + 1) + 1);
    n++;
  }
  const out = gridPlacements(g, pal, x0, y);
  garlandCache.set(key, out);
  return out;
}

/** A sprite tinted per seat colour, for the workbench and the scenes (`tintSprite`, memoised). */
export function tinted(def: SpriteDef, ramp: RampName, ramp2?: RampName): SpriteDef {
  return tintSprite(def, ramp, ramp2);
}

// ---------------------------------------------------------------------------------------------
// The haul loads: a log (30x10, three tilts) and a giant pumpkin (18x18, eight rolling frames)

export const LOG_WIDTH = 30;
/** The log body's height (outline included); the sprite is taller by the tilt. */
export const LOG_BODY = 6;
const LOG_HEIGHT = LOG_BODY + 4;

/**
 * One frame of the log: a birch trunk (the compendium's), pale bark in the primary ramp (`a` lit top to
 * `d` shadow, the cream ramp by default) with the birch's dark dashes in ink, an ink outline and a
 * rounded left end, its sawn end on the right in the secondary ramp (rings round a dark heart), tilted
 * `tilt` px end to end (0 level, positive: the right end up), so a wobble shows as a see-saw.
 */
function logFrame(tilt: number): SpriteDef {
  const g = new PixelGrid(LOG_WIDTH, LOG_HEIGHT);
  const w = LOG_WIDTH;
  const lift = (x: number): number => Math.round(((x - (w - 1) / 2) / (w - 1)) * -tilt);
  const shade = ['k', 'a', 'b', 'c', 'd', 'k'];
  // Birch dashes: short dark marks across the bark, at fixed spots.
  const dashes = new Set([
    '3,2',
    '4,2',
    '8,3',
    '9,3',
    '14,2',
    '15,2',
    '16,2',
    '19,3',
    '20,4',
    '23,2',
  ]);
  for (let x = 0; x < w; x++) {
    const top = 2 + lift(x);
    for (let y = 0; y < LOG_BODY; y++) {
      let key = shade[y] ?? 'k';
      // The rounded left end and the outline of the right end.
      if (x === 0 || x === w - 1) key = y === 0 || y === LOG_BODY - 1 ? '.' : 'k';
      else if (dashes.has(`${String(x)},${String(y)}`)) key = 'k';
      g.set(x, top + y, key);
    }
  }
  // The sawn end: rings in the secondary ramp, the heart dark.
  for (let y = 1; y < LOG_BODY - 1; y++) {
    const ring = y === 1 || y === LOG_BODY - 2 ? 'f' : 'e';
    g.set(w - 4, 2 + lift(w - 4) + y, 'k');
    g.set(w - 3, 2 + lift(w - 3) + y, ring);
    g.set(w - 2, 2 + lift(w - 2) + y, y === 1 || y === LOG_BODY - 2 ? 'f' : 'g');
  }
  g.set(w - 2, 2 + lift(w - 2) + 2, 'h');
  return g.toSprite(rampPalette(RAMPS.cream, RAMPS.pine, { k: INK }));
}

/** The log level, tilted both ways (a wobble); on the ground it is the level one, drawn lower. */
export const LOG_FRAMES: readonly SpriteDef[] = [logFrame(0), logFrame(3), logFrame(-3)];

export const PUMPKIN_SIZE = 18;
export const PUMPKIN_FRAMES_COUNT = 8;

/**
 * One frame of the giant pumpkin: a lit, slightly squat sphere with deep ribs from the stem to the
 * bottom (primary ramp, orange by default), its green stem (secondary ramp) on the rim, the whole
 * turned `angle` radians clockwise as it rolls to the right.
 */
function pumpkinFrame(angle: number): SpriteDef {
  const s = PUMPKIN_SIZE;
  const g = new PixelGrid(s, s);
  const c = s / 2;
  const radius = 7.7;
  const light = normalise([-0.55, -0.65, 0.55]);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      // In the pumpkin's own frame (turned back), it is a little wider than tall.
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      const d = Math.hypot(u / 1.06, v / 0.94);
      if (d > radius + 1.1) continue;
      if (d > radius) {
        g.set(x, y, 'k');
        continue;
      }
      const px = dx / (radius + 0.6);
      const py = dy / (radius + 0.6);
      const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));
      const lit = px * light[0] + py * light[1] + pz * light[2];
      // Ribs: meridians through the stem's axis (the pumpkin's own v axis).
      const lon = Math.atan2(u / radius, Math.sqrt(Math.max(0, 1 - (v / radius) ** 2)) * 0.9 + 0.1);
      const rib = Math.abs(Math.sin(lon * 3.2)) < 0.22;
      let key = lit > 0.78 ? 'a' : lit > 0.42 ? 'b' : lit > 0.1 ? 'c' : 'd';
      if (rib) key = key === 'a' ? 'b' : key === 'b' ? 'c' : 'd';
      g.set(x, y, key);
    }
  }
  // The stem on the rim (its own "up"), two pixels of green with an ink edge.
  const stem = (k: number): [number, number] => [
    Math.round(c - 0.5 + sin * (radius - k)),
    Math.round(c - 0.5 - cos * (radius - k)),
  ];
  const [sx, sy] = stem(-0.4);
  const [tx, ty] = stem(-1.8);
  const [ix, iy] = stem(1);
  g.set(ix, iy, 'k');
  g.set(sx, sy, 'f');
  g.set(tx, ty, 'g');
  g.set(tx + 1, ty, 'h');
  g.set(7, 5, 'w');
  g.set(6, 6, 'w');
  return g.toSprite(rampPalette(RAMPS.orange, RAMPS.grove, { k: INK, w: WHITE }));
}

export const PUMPKIN_FRAMES: readonly SpriteDef[] = Array.from(
  { length: PUMPKIN_FRAMES_COUNT },
  (_, i) => pumpkinFrame((i * 2 * Math.PI) / PUMPKIN_FRAMES_COUNT),
);

/** A haul lane's finish mark: a short chequered strip across the lane (4 x 10). */
function finishBand(): SpriteDef {
  const h = 10;
  const g = new PixelGrid(4, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 4; x++) {
      const dark = (Math.floor(y / 2) + Math.floor(x / 2)) % 2 === 0;
      g.set(x, y, dark ? 'k' : 'w');
    }
  }
  return g.toSprite({ k: '#2f2a5c', w: WHITE });
}

export const FINISH_BAND = finishBand();
