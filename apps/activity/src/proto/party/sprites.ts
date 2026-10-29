/**
 * The few small sprites the party's places need that the game does not have: an anvil, a chest in three
 * frames, the explorer's sack opening, the slate cave mouth, a workbench, a grass tuft and a dirt path.
 * The anvil, chest, sack and cave mouth are copied from the valley prototype (round 1, `valley-art.ts`);
 * the prototypes do not import each other. Everything else is drawn from the game's tiles and props.
 */
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import { PixelGrid, gridPlacements, type Placement } from '../../games/art/pixel';
import { RAMPS } from '../../games/art/tint';

export const INK = '#0d0a1a';

/** The anvil (16 x 16): a dark iron horn and face on a stout foot. */
export const ANVIL: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  g.rect(0, 5, 15, 1, 'k');
  g.rect(1, 6, 14, 3, 'k');
  g.rect(2, 6, 12, 2, 'b');
  g.rect(2, 6, 12, 1, 'a');
  g.rect(0, 6, 2, 1, 'k');
  g.rect(5, 9, 6, 3, 'k');
  g.rect(6, 9, 4, 3, 'c');
  g.rect(3, 12, 10, 1, 'k');
  g.rect(3, 13, 10, 2, 'k');
  g.rect(4, 13, 8, 1, 'c');
  g.rect(2, 15, 12, 1, 'k');
  return g.toSprite({ a: '#c4bcd8', b: '#6e6490', c: '#463e66', k: INK });
})();

/** The chest (16 x 16) in three frames: shut, ajar, open. */
export const CHEST_FRAMES: readonly SpriteDef[] = [0, 1, 2].map((frame) => {
  const g = new PixelGrid(16, 16);
  g.rect(1, 8, 14, 8, 'k');
  g.rect(2, 9, 12, 6, 'c');
  g.rect(2, 9, 12, 1, 'b');
  g.rect(2, 12, 12, 1, 'd');
  g.rect(7, 9, 2, 3, 'y');
  if (frame === 0) {
    g.rect(1, 3, 14, 6, 'k');
    g.rect(2, 4, 12, 4, 'b');
    g.rect(2, 4, 12, 1, 'a');
    g.rect(7, 6, 2, 3, 'y');
  } else if (frame === 1) {
    g.rect(1, 2, 14, 5, 'k');
    g.rect(2, 3, 12, 3, 'b');
    g.rect(2, 3, 12, 1, 'a');
    g.rect(2, 7, 12, 1, 'y');
  } else {
    g.rect(1, 0, 14, 4, 'k');
    g.rect(2, 1, 12, 2, 'd');
    g.rect(2, 4, 12, 4, 'y');
    g.rect(3, 5, 2, 1, 'w');
    g.rect(9, 6, 2, 1, 'w');
  }
  return g.toSprite({
    a: RAMPS.wood[0],
    b: RAMPS.wood[1],
    c: RAMPS.wood[2],
    d: RAMPS.wood[3],
    y: '#ffd25a',
    w: '#ffffff',
    k: INK,
  });
});

/** The explorer's sack opening (the game's `PACK_ART` with its flap redrawn): tied, ajar, open, glinting. */
export const SACK_FRAMES: readonly SpriteDef[] = (() => {
  const base = PACK_ART;
  const pal = { ...base.palette, n: '#2a1a10', w: '#ffffff' };
  const edit = (changes: Readonly<Record<number, string>>): SpriteDef => ({
    mirror: true,
    palette: pal,
    rows: base.rows.map((r, i) => changes[i] ?? r),
  });
  return [
    base,
    edit({ 3: '...kkkkk', 4: '..kyyyyy', 5: '..kddddd' }),
    edit({ 1: '....hhhh', 2: '...khhhh', 3: '...knnnn', 4: '..knnyyn', 5: '..knyyyy' }),
    edit({
      0: '....hhhh',
      1: '...khhhh',
      2: '...knnwn',
      3: '..knyynn',
      4: '..knyyyy',
      5: '..kyyyyw',
    }),
  ];
})();

/** The Ember Caves landmark in slate, the fire turned to lantern gold: the Dungeon's mouth. */
export const CAVE_MOUTH: SpriteDef = swapPalette(WORLD_MAP_SPRITE_DATA.emberCaves, {
  n: '#2b2d3a',
  m: '#4a4c63',
  o: '#f2b84b',
});

/** A sprite drawn `n` times as big, pixel for pixel (at most 64 px). */
export function upscale(def: SpriteDef, n: number): SpriteDef {
  const rows = def.mirror === true ? def.rows.map((r) => r + [...r].reverse().join('')) : def.rows;
  const out: string[] = [];
  for (const row of rows) {
    const wide = [...row].map((ch) => ch.repeat(n)).join('');
    for (let i = 0; i < n; i++) out.push(wide);
  }
  return { rows: out, palette: def.palette };
}

/** A grass tuft (5 x 3): two blades and a flower dot, in the grass tile's greens. */
export const TUFT: SpriteDef = {
  rows: ['.a..b', 'aa.ab', '.c.c.'],
  palette: { a: RAMPS.grass[0], b: '#fff2a8', c: RAMPS.grass[3] },
};

/** A dirt path piece `w` x `h` with a darker rim on its long edges. */
export function pathPiece(x: number, y: number, w: number, h: number): Placement[] {
  const g = new PixelGrid(w, h);
  g.rect(0, 0, w, h, 'b');
  if (w >= h) {
    g.rect(0, 0, w, 1, 'd');
    g.rect(0, h - 1, w, 1, 'd');
    for (let i = 3; i < w; i += 7) g.set(i, Math.floor(h / 2), 'a');
  } else {
    g.rect(0, 0, 1, h, 'd');
    g.rect(w - 1, 0, 1, h, 'd');
    for (let i = 3; i < h; i += 7) g.set(Math.floor(w / 2), i, 'a');
  }
  return gridPlacements(g, { a: RAMPS.dirt[0], b: RAMPS.dirt[1], d: RAMPS.dirt[2] }, x, y);
}

/** A wooden workbench `w` px wide (8 tall): top, rim and two legs. */
export function bench(x: number, y: number, w: number): Placement[] {
  const g = new PixelGrid(w, 10);
  g.rect(0, 0, w, 5, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 2, 'b');
  g.rect(2, 5, 3, 5, 'k');
  g.rect(w - 5, 5, 3, 5, 'k');
  g.rect(3, 5, 1, 4, 'c');
  g.rect(w - 4, 5, 1, 4, 'c');
  return gridPlacements(g, { a: RAMPS.wood[0], b: RAMPS.wood[1], c: RAMPS.wood[2], k: INK }, x, y);
}
