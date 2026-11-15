/**
 * Props for the valley place canvases (valley session request, 2026-11-15), concept art (not in the game):
 * the weekly visitor's blueprint, the School's graduation stage, the Market under construction and the
 * Paddock's gate sign. Same look as `valley-glow`: ink, night main palette with warm stepped light on the
 * ground where something is lit (keys `1 2 3`), `alts.day` recolours the same pixels, materials from
 * `valley-tiers.ts`. Drawn with the small helpers below (boxes, stamps, a light spill), then kept as the
 * rows they make. Market pieces start from a copy of `valley-levels-signpost/market-1`.
 */
import type { SpriteDef } from '../sprite-data';
import { INK, tierPalette } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import { VALLEY_LEVELS_SIGNPOST_CONCEPTS } from './valley-levels-signpost';
import type { ConceptSet } from './index';

type Grid = string[][];
type Pal = Record<string, string>;
interface Parts {
  night: Pal;
  day: Pal;
}

const grid = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
const put = (g: Grid, x: number, y: number, c: string): void => {
  const row = g[y];
  if (row !== undefined && x >= 0 && x < row.length) row[x] = c;
};
const at = (g: Grid, x: number, y: number): string => g[y]?.[x] ?? '.';
const fill = (g: Grid, x: number, y: number, w: number, h: number, c: string): void => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
};
/** A filled box with an ink border. */
const box = (g: Grid, x: number, y: number, w: number, h: number, c: string): void => {
  fill(g, x, y, w, h, 'k');
  fill(g, x + 1, y + 1, w - 2, h - 2, c);
};
/** Draws `rows` with its top left at (x, y); `.` keeps what is there. */
const stamp = (g: Grid, x: number, y: number, rows: readonly string[]): void => {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch !== '.') put(g, x + i, y + j, ch === '_' ? '.' : ch);
    });
  });
};
/** The light on the ground: 3 inner and solid, 2 middle, 1 outer and dithered; only on empty pixels. */
const spill = (g: Grid, cx: number, cy: number, rx: number, ry: number): void => {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < (g[y]?.length ?? 0); x++) {
      if (at(g, x, y) !== '.') continue;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 0.3) put(g, x, y, '3');
      else if (d < 0.65) put(g, x, y, '2');
      else if (d < 1 && (x + y) % 2 === 0) put(g, x, y, '1');
    }
  }
};
/** A cast shadow row on empty pixels. */
const shadow = (g: Grid, x0: number, x1: number, y: number): void => {
  for (let x = x0; x <= x1; x++) if (at(g, x, y) === '.') put(g, x, y, 'x');
};
const lines = (g: Grid): string[] => g.map((r) => r.join(''));

const OWN: Parts = {
  night: { k: INK, x: '#112430', '1': '#55703f', '2': '#8a8a40', '3': '#d09a3c', G: '#ffd966' },
  day: { x: '#2f5a38', '1': '#467a4c', '2': '#4e864e', '3': '#4a8250', G: '#a8b8b0' },
};
const merge = (...parts: Parts[]): Parts => ({
  night: Object.assign({}, ...parts.map((p) => p.night)) as Pal,
  day: Object.assign({}, ...parts.map((p) => p.day)) as Pal,
});
const fromTier = (t: { palette: Pal; day: Pal }): Parts => ({ night: t.palette, day: t.day });

/** A sprite with only the palette keys its rows use, and the matching day recolour. */
function finish(parts: Parts, rows: string[]): { sprite: SpriteDef; day: Pal } {
  const used = new Set(rows.join(''));
  const keep = (p: Pal): Pal => Object.fromEntries(Object.entries(p).filter(([k]) => used.has(k)));
  return { sprite: { palette: keep(parts.night), rows }, day: keep(parts.day) };
}

// ---------------------------------------------------------------------------------------------------
// 1. The visitor's blueprint, 16x10.

const BLUEPRINT_PARTS = merge(OWN, fromTier(tierPalette(4, { f: 'brass', g: 'brassShade' })), {
  night: { B: '#3a6ab0', b: '#27487e', w: '#e6f0ff', R: '#7aa4e0', r: '#3f5f9e' },
  day: { B: '#4a86d0', b: '#3466a8', w: '#ffffff', R: '#9abcf0', r: '#5080c0' },
});

function blueprint(): { sprite: SpriteDef; day: Pal } {
  const g = grid(16, 10);
  // The roll at the left, curling out into the sheet.
  box(g, 0, 1, 5, 9, 'R');
  fill(g, 3, 2, 1, 7, 'r');
  put(g, 1, 3, 'r');
  put(g, 1, 4, 'r');
  // The sheet: paper, a white frame and a plan (two rooms, a door gap and a round table).
  box(g, 4, 2, 12, 8, 'B');
  fill(g, 5, 8, 10, 1, 'b');
  fill(g, 6, 3, 8, 1, 'w');
  fill(g, 6, 3, 1, 5, 'w');
  fill(g, 13, 3, 1, 5, 'w');
  fill(g, 6, 7, 8, 1, 'w');
  fill(g, 9, 4, 1, 3, 'w');
  put(g, 9, 5, 'B');
  stamp(g, 10, 4, ['.w', 'w.']);
  // The weight on the far corner: a small brass lump.
  stamp(g, 12, 5, ['kkkk', 'kffk', 'kfgk', 'kkkk']);
  return finish(BLUEPRINT_PARTS, lines(g));
}

// ---------------------------------------------------------------------------------------------------
// 2. The School's graduation: stage (main), B banner arch, C podium.

const STAGE_PARTS = merge(
  OWN,
  fromTier(tierPalette(2, { p: 'plank', P: 'plankShade', N: 'nail', S: 'shingleLight' })),
  fromTier(tierPalette(4, { t: 'teal', T: 'tealShade', c: 'cream', g: 'brass', h: 'brassShade' })),
);

/** A hanging flag, 3 wide and 2 tall. */
const flag = (g: Grid, x: number, y: number, c: string): void =>
  stamp(g, x, y, [c.repeat(3), `.${c}.`]);
/** A string of bunting from (x0, y0) to (x1, y0), sagging by `sag` in the middle. */
function bunting(g: Grid, x0: number, x1: number, y0: number, sag: number): void {
  const colours = ['t', 'c', 'S'];
  let n = 0;
  for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / (x1 - x0);
    const y = y0 + Math.round(sag * 4 * u * (1 - u));
    put(g, x, y, 'k');
    if ((x - x0) % 4 === 2 && x + 1 < x1) {
      flag(g, x - 1, y + 1, colours[n % 3] ?? 't');
      n++;
    }
  }
}

function lantern(g: Grid, x: number, y: number): void {
  stamp(g, x, y, ['.kk.', 'kGGk', 'kGGk', 'khhk', '.kk.']);
}

function stage(): { sprite: SpriteDef; day: Pal } {
  const g = grid(48, 24);
  // The platform: a two-row top face, front planks with seams, a step at the right.
  box(g, 3, 11, 38, 9, 'P');
  fill(g, 4, 12, 36, 2, 'p');
  for (let x = 8; x < 40; x += 8) put(g, x, 12, 'N');
  for (let x = 9; x < 40; x += 6) fill(g, x, 14, 1, 5, 'k');
  box(g, 40, 15, 6, 5, 'P');
  fill(g, 41, 16, 4, 1, 'p');
  // Two posts with lanterns, and a string of bunting between them.
  box(g, 4, 5, 4, 7, 'p');
  fill(g, 6, 6, 1, 5, 'P');
  box(g, 36, 5, 4, 7, 'p');
  fill(g, 38, 6, 1, 5, 'P');
  lantern(g, 4, 0);
  lantern(g, 36, 0);
  bunting(g, 7, 36, 6, 2);
  shadow(g, 4, 46, 20);
  spill(g, 24, 21, 28, 3.6);
  return finish(STAGE_PARTS, lines(g));
}

function archB(): SpriteDef {
  const g = grid(48, 24);
  const rope = (x: number, y: number): void => put(g, x, y, 'k');
  // Two poles on stones, a cross pole, the cloth banner hung from it.
  box(g, 5, 4, 4, 18, 'p');
  fill(g, 7, 5, 1, 16, 'P');
  box(g, 39, 4, 4, 18, 'p');
  fill(g, 41, 5, 1, 16, 'P');
  box(g, 3, 4, 42, 3, 'p');
  fill(g, 4, 5, 40, 1, 'P');
  box(g, 11, 6, 26, 13, 't');
  fill(g, 12, 7, 24, 1, 'c');
  fill(g, 12, 7, 1, 10, 'c');
  fill(g, 35, 7, 1, 10, 'c');
  fill(g, 13, 16, 22, 1, 'c');
  fill(g, 13, 8, 22, 1, 'T');
  // Notches along the bottom edge of the cloth.
  for (let x = 14; x < 36; x += 4) stamp(g, x, 19, ['kkk', '.k.']);
  // The mortarboard: a flat diamond on a cap, with a tassel.
  stamp(g, 16, 9, [
    '.....ccccc.....',
    '.ccccccccccccc.',
    '.....ccccc.....',
    '.....kkkkk.....',
    '.....kTTTk.....',
    '......kkk......',
  ]);
  stamp(g, 29, 10, ['c', 'c', 'c', 'S']);
  // Lanterns on the pole tops, ropes to the cross pole.
  lantern(g, 4, 0);
  lantern(g, 38, 0);
  rope(6, 3);
  rope(40, 3);
  // Stones at the feet.
  stamp(g, 3, 20, ['.kkkkkk.', 'kfffffgk', 'kkkkkkkk']);
  stamp(g, 37, 20, ['.kkkkkk.', 'kfffffgk', 'kkkkkkkk']);
  shadow(g, 3, 45, 23);
  spill(g, 24, 22, 27, 2);
  return finish(
    merge(STAGE_PARTS, fromTier(tierPalette(1, { f: 'fieldstone' })), {
      night: { g: '#2a2e52' },
      day: { g: '#4a4a58' },
    }),
    lines(g),
  ).sprite;
}

function podiumC(): SpriteDef {
  const g = grid(48, 24);
  const parts = merge(
    OWN,
    fromTier(tierPalette(2, { p: 'plank', P: 'plankShade', S: 'shingleLight', R: 'shingle' })),
    fromTier(tierPalette(3, { m: 'stone', n: 'stoneShade', l: 'stoneLight' })),
    fromTier(tierPalette(4, { t: 'teal', c: 'cream', h: 'brassShade' })),
  );
  // A low two-step stone podium.
  box(g, 2, 18, 44, 4, 'm');
  fill(g, 3, 19, 42, 1, 'l');
  fill(g, 3, 21, 42, 1, 'n');
  box(g, 7, 14, 34, 5, 'm');
  fill(g, 8, 15, 32, 1, 'l');
  fill(g, 8, 17, 32, 1, 'n');
  for (let x = 12; x < 40; x += 7) fill(g, x, 16, 1, 3, 'k');
  // The lectern: a slanted top with an open book, a plank body with a foot.
  stamp(g, 18, 3, ['..kkkkkkkkk..', '.kcccckcccck.', 'kpppppppppppk']);
  box(g, 19, 6, 11, 6, 'p');
  fill(g, 20, 7, 9, 1, 'P');
  box(g, 18, 12, 13, 3, 'P');
  // Ribbons hang down the lectern's front, ending in rosettes on the podium.
  stamp(g, 22, 8, ['t', 't', 't', 't']);
  stamp(g, 26, 8, ['c', 'c', 'c', 'S']);
  const rosette = (x: number, y: number): void =>
    stamp(g, x, y, ['.RR.', 'RSSR', 'RSSR', '.RR.', 'c..t', 'c..t']);
  rosette(11, 12);
  rosette(34, 12);
  // A swag of ribbon along the upper step.
  for (let x = 16; x < 33; x++) {
    const u = (x - 16) / 16;
    put(g, x, 16 + Math.round(2 * 4 * u * (1 - u)) - 0, x % 4 < 2 ? 't' : 'c');
  }
  // Lamps on the corners.
  lantern(g, 3, 13);
  lantern(g, 41, 13);
  shadow(g, 2, 46, 22);
  spill(g, 24, 22, 26, 2.2);
  return finish(parts, lines(g)).sprite;
}

// ---------------------------------------------------------------------------------------------------
// 3. The Market under construction: two variations of market-1, same canvas and palette keys.

const MARKET_1 = VALLEY_LEVELS_SIGNPOST_CONCEPTS.sprites['market-1'];
if (MARKET_1 === undefined) throw new Error('valley-place-props: market-1 is missing');
const MARKET_PALETTE: Pal = { ...MARKET_1.sprite.palette };
const MARKET_ROWS = MARKET_1.sprite.rows;
const MARKET_DAY = MARKET_1.alts?.['day'] ?? {};
const grab = (): Grid => MARKET_ROWS.map((r) => [...r]);

const MARKET_EXTRA: Parts = {
  night: { y: '#c0a468', F: '#9a9ab0', Y: '#5a5a70' },
  day: { y: '#d8bc80', F: '#b8b8c8', Y: '#8a8a9a' },
};

function marketB(): SpriteDef {
  const g = grab();
  // Scaffold: two poles stand on the beam and carry a working plank.
  box(g, 6, 3, 35, 3, 'u');
  fill(g, 7, 4, 33, 1, 'v');
  box(g, 7, 6, 3, 7, 'v');
  box(g, 37, 6, 3, 7, 'v');
  fill(g, 8, 7, 1, 5, 'w');
  fill(g, 38, 7, 1, 5, 'w');
  // A rope from the plank down to the awning's free end.
  for (let y = 6; y < 17; y++) put(g, 31, y, 'y');
  // The rolled awning stays on the right half; the left half hangs, striped, with a slanted edge.
  fill(g, 13, 9, 14, 3, '.');
  box(g, 26, 8, 12, 4, 'A');
  fill(g, 28, 9, 2, 2, 'a');
  fill(g, 32, 9, 2, 2, 'a');
  for (let x = 10; x <= 34; x++) {
    const bottom = x < 24 ? 21 : 21 - Math.round((x - 23) * 0.9);
    for (let y = 16; y <= bottom; y++) put(g, x, y, Math.floor((x - 10) / 2) % 2 === 0 ? 'A' : 'a');
    put(g, x, bottom + 1, 'k');
  }
  for (let x = 10; x < 24; x += 2) put(g, x, 22, 'k');
  // Diagonal braces inside the frame.
  for (let i = 0; i < 9; i++) {
    put(g, 11 + i, 31 - i, 'v');
    put(g, 33 - i, 31 - i, 'v');
  }
  return finish(
    merge(
      { night: MARKET_PALETTE, day: { ...MARKET_DAY } },
      { night: { y: '#c0a468' }, day: { y: '#d8bc80' } },
    ),
    lines(g),
  ).sprite;
}

function marketC(): SpriteDef {
  const g = grab();
  // The counter front, planked from the left: five boards laid, the rest still open frame.
  const board = (x1: number, y: number, tone: 'u' | 'v'): void => {
    fill(g, 10, y, x1 - 10, 1, 'k');
    fill(g, 10, y + 1, x1 - 10, 2, tone);
  };
  board(26, 33, 'u');
  board(28, 36, 'v');
  board(22, 30, 'u');
  // A saw lying on the boards and a hammer on the lowest beam.
  stamp(
    g,
    24,
    23,
    ['kvvk', 'kvvkFFFFFFFFk', 'kkkkYYYYYYYYk'].map((r) => r),
  );
  stamp(
    g,
    27,
    34,
    ['kFFk......', 'kFFkvvvvvk', 'kkkk......'].map((r) => r),
  );
  // A "coming soon" plank hung from the beam on two ropes, with an hourglass mark (no words).
  put(g, 21, 16, 'y');
  put(g, 21, 17, 'y');
  put(g, 30, 16, 'y');
  put(g, 30, 17, 'y');
  box(g, 18, 18, 16, 6, 'u');
  fill(g, 19, 22, 14, 1, 'v');
  stamp(g, 24, 19, ['AAAAA', '.AAA.', '..A..', '.AAA.']);
  return finish(merge({ night: MARKET_PALETTE, day: { ...MARKET_DAY } }, MARKET_EXTRA), lines(g))
    .sprite;
}

// ---------------------------------------------------------------------------------------------------
// 4. The Paddock's gate sign, 16x16, base row 15 (the foot of the post).

const SIGN_PARTS = merge(
  OWN,
  fromTier(tierPalette(2, { p: 'plank', P: 'plankShade' })),
  fromTier(tierPalette(1, { r: 'rope', f: 'fieldstone' })),
  { night: { c: '#f2e8c8' }, day: { c: '#fff6dc' } },
);
const PAW = ['.c.c.', 'c...c', '.ccc.', 'ccccc', '.ccc.'];

function signA(): { sprite: SpriteDef; day: Pal } {
  const g = grid(16, 16);
  box(g, 6, 5, 4, 11, 'p');
  fill(g, 8, 6, 1, 9, 'P');
  box(g, 1, 1, 14, 9, 'p');
  fill(g, 2, 8, 12, 1, 'P');
  stamp(g, 5, 3, PAW);
  shadow(g, 4, 12, 15);
  return finish(SIGN_PARTS, lines(g));
}

function signB(): SpriteDef {
  const g = grid(16, 16);
  // A crossbar over the gate on two posts, the plank hanging from it on two ropes.
  box(g, 0, 0, 16, 3, 'p');
  fill(g, 1, 1, 14, 1, 'P');
  box(g, 0, 2, 3, 14, 'p');
  fill(g, 1, 3, 1, 12, 'P');
  box(g, 13, 2, 3, 14, 'p');
  fill(g, 14, 3, 1, 12, 'P');
  put(g, 5, 3, 'r');
  put(g, 5, 4, 'r');
  put(g, 10, 3, 'r');
  put(g, 10, 4, 'r');
  box(g, 3, 5, 10, 8, 'p');
  fill(g, 4, 11, 8, 1, 'P');
  stamp(g, 5, 6, PAW);
  shadow(g, 0, 15, 15);
  return finish(SIGN_PARTS, lines(g)).sprite;
}

function signC(): SpriteDef {
  const g = grid(16, 16);
  // Two posts with an arch of planks over the gate, the sign set in the arch.
  box(g, 0, 6, 3, 10, 'p');
  fill(g, 1, 7, 1, 8, 'P');
  box(g, 13, 6, 3, 10, 'p');
  fill(g, 14, 7, 1, 8, 'P');
  stamp(g, 0, 0, [
    '....kkkkkkkk....',
    '..kkppppppppkk..',
    '.kppPPPPPPPPppk.',
    '.kpkkkkkkkkkkpk.',
    'kppk........kppk',
    'kpk..........kpk',
    'kpk..........kpk',
  ]);
  box(g, 3, 5, 10, 8, 'p');
  fill(g, 4, 11, 8, 1, 'P');
  stamp(g, 5, 6, PAW);
  shadow(g, 0, 15, 15);
  return finish(SIGN_PARTS, lines(g)).sprite;
}

// ---------------------------------------------------------------------------------------------------

const BP = blueprint();
const ST = stage();
const SA = signA();
const backdrop = VALLEY_GLOW_CONCEPTS.backdrop;

export const VALLEY_PLACE_PROPS_CONCEPTS: ConceptSet = {
  id: 'valley-place-props',
  title: 'Place props',
  requested:
    "2026-11-15 (via the release coordinator): props for the place canvases: the visitor's blueprint, the School's graduation, the Market under construction, the Paddock's gate sign.",
  status: 'draft',
  notes: [
    'Four optional props for the place canvases, in the valley-glow look: ink, night main palette with warm stepped light on the ground where something is lit (keys 1 2 3), `alts.day` recolours the same pixels, materials from `valley-tiers.ts`. No text anywhere, marks only.',
    "visitor-blueprint, 16x10: a rolled-out blue sheet with a white plan, the roll at the left and a brass weight on the far right corner. Not clickable by itself; it lies on the weekly visitor's stall counter (`valley-glow/visitor`, 60x48): the counter top is the first orange row, row 30 (rows 30 and 31 are the lip). Anchor: its bottom row sits on row 29 so the sheet rests on row 30; x 33 to 48 puts it on the counter, clear of the stall edges (x 27 and 54).",
    'graduation-stage, 48x24: a plank stage with a back wall, a step at the right, two lantern posts and bunting (a string between the posts and a swag along the front). Anchor: the base row is 19 (the platform foot, ink); row 20 holds the shadow and the lantern light lies on rows 20 to 23. Variation anchors: B base row 22, C base row 21. Clickable: the whole stage if it opens the graduation, nothing else on it.',
    'market-building, 60x48 (main is a copy of `valley-levels-signpost/market-1`): the Market staked out and begun. Anchor: base row 40, the ground rows of market-1, unchanged. Same palette keys as market-1 (B and C add only `y` rope, and C adds `F` and `Y` for tool steel). The shard sign (x 44 to 58) is untouched in both and still the landmark; clickable region is the counter frame, x 5 to 39, rows 12 to 39.',
    'paddock-gate-sign, 16x16: a plank sign on a post with a cream paw mark. Anchor: the base row is 15, the foot of the post (or posts), centred on x 8. Not lit, so no ground light, only the cast shadow. Clickable: the plank.',
  ],
  ...(backdrop === undefined ? {} : { backdrop }),
  sprites: {
    'visitor-blueprint': {
      kind: 'free',
      note: "The visitor's blueprint lying on the stall counter, 16x10: blue paper with a white plan, the roll at the left, a brass weight on the far corner. Rests on counter row 30 of `valley-glow/visitor` (bottom row of the sprite on row 29).",
      sprite: BP.sprite,
      alts: { day: BP.day },
    },
    'graduation-stage': {
      kind: 'free',
      note: "The graduation stage, 48x24, base row 19 (the platform foot; row 20 shadow, light on rows 20 to 23): a plank stage with a step at the right, two lantern posts and a string of bunting; the lanterns' light lies on the ground. Variations: A (this) a stage with bunting; B a banner arch over the School yard (two poles, a teal cloth banner with a cream mortarboard, lanterns, base row 22); C a low stone podium with a lectern, ribbons, rosettes and corner lamps (base row 21). Pick: B (lead's review, 2026-11-15), because the mortarboard banner says graduation at a glance while A reads as any wooden platform; the drawing agent picked A for its warm light and simplicity.",
      sprite: ST.sprite,
      alts: { day: ST.day },
      variants: { B: archB(), C: podiumC() },
    },
    'market-building': {
      kind: 'free',
      note: 'The Market under construction, 60x48, base row 40; the main is a copy of market-1. Variations: B the frame with scaffolding (a working plank on two poles over the beam, diagonal braces) and a half-hung striped awning, the rest still rolled and roped to the plank; C the counter half-planked from the left with a saw and a hammer and a "coming soon" plank (an hourglass, no words) hung from the beam. Pick: B, because the half-hung awning shows the stall the Market will become and the scaffold reads as building at 1x; C hides the frame behind its sign.',
      sprite: { palette: MARKET_PALETTE, rows: [...MARKET_ROWS] },
      alts: { day: { ...MARKET_DAY } },
      variants: { B: marketB(), C: marketC() },
    },
    'paddock-gate-sign': {
      kind: 'free',
      note: 'A gate sign, 16x16, base row 15: a plank on a post with a cream paw mark (no words). Variations: A (this) a plank on a post; B hanging on two ropes from a crossbar over the gate, two posts; C an arched gate top of planks with the sign set under it. Pick: C, because the arch is what says "gate" at 1x and keeps the paw mark clear; A is the fallback where one post is all the room there is.',
      sprite: SA.sprite,
      alts: { day: SA.day },
      variants: { B: signB(), C: signC() },
    },
  },
};
