/**
 * Thirteen grounds pieces that came with the orchard, the pond and the balcony (`docs/design/housing-next.md` C3): a beehive,
 * a fruit crate, a garden swing and a scarecrow for the orchard; a duck, a lily cluster, a lantern boat, a fishing stool and
 * stepping stones for the pond; a sun umbrella, a gazing ball and a cone topiary for the garden and the pool; a bistro table
 * for the balcony. Drawn by code from the drawing library (`sprites/draw/`), like `new-parts.ts`, so any of them can be
 * changed and drawn again. They stand on their bottom row; the lantern boat is a light (`light` in its art: it glows at night).
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack } from '../../../housing/house-art';
import { canvas, put, toSprite } from '../../draw/canvas';
import { fill, hline, line, outline, vline, type Ramp } from '../../draw/shapes';
import { inEllipse, inRect, solid } from '../../draw/solid';
import { PAL } from './new-parts';

const P: Readonly<Record<string, string>> = {
  ...PAL,
  o: '#ef6a3a',
  n: '#8a4632',
  q: '#d27e5c',
  v: '#b45c42',
  '1': '#f0d98a',
  '2': '#d3ab52',
  '3': '#9a7434',
  '4': '#6e4a2a',
  '5': '#3aa6a0',
  '6': '#2a7e82',
  '7': '#5a5a78',
  '8': '#8a8aa8',
  '9': '#3a3a52',
  W: '#3b3b44',
  V: '#7a7a8c',
  Q: '#ffb23a',
};

const WOOD: Ramp = { hi: 'r', light: 'r', mid: 's', dark: 't', deep: 'u' };
const STRAW: Ramp = { hi: '1', light: '1', mid: '2', dark: '3', deep: '4' };
const STONE: Ramp = { hi: 'a', light: 'a', mid: 'b', dark: 'd' };
const IRON: Ramp = { light: '8', mid: '7', dark: '9' };
const LEAF: Ramp = { hi: 'h', light: 'i', mid: 'j', dark: 'l' };
const POT: Ramp = { light: 'q', mid: 'v', dark: 'n' };

const sprite = (c: ReturnType<typeof canvas>): SpriteDef => toSprite(c, P);

/** A straw skep on a little bench, bees at the door. 20 x 20. */
function beehive(): SpriteDef {
  const c = canvas(20, 20);
  // the bench
  fill(c, 3, 16, 2, 4, 'u');
  fill(c, 15, 16, 2, 4, 'u');
  solid(c, { x: 1, y: 14, w: 18, h: 3 }, inRect(1, 14, 18, 3), WOOD, { shade: 'rows' });
  // the skep: a dome of straw rings
  solid(c, { x: 3, y: 1, w: 14, h: 14 }, inEllipse(3, 1, 14, 28), STRAW);
  for (const y of [4, 7, 10, 13]) {
    for (let x = 4; x < 16; x++) {
      const k = c.px[y * c.w + x];
      if (k !== undefined && k !== '.' && k !== 'k') put(c, x, y, x < 8 ? '2' : '3');
    }
  }
  // the door and a few bees
  fill(c, 8, 10, 4, 4, 'k');
  fill(c, 9, 11, 2, 3, '4');
  for (const [x, y] of [
    [14, 5],
    [5, 9],
    [16, 11],
  ] as const) {
    put(c, x, y, 'm');
    put(c, x + 1, y, 'k');
  }
  return sprite(c);
}

/** A slatted crate of apples with a pear on top. 20 x 14. */
function fruitCrate(): SpriteDef {
  const c = canvas(20, 14);
  // the fruit heaped over the rim
  for (const [x, y] of [
    [3, 3],
    [8, 1],
    [13, 3],
    [6, 5],
    [11, 5],
  ] as const) {
    solid(c, { x, y, w: 4, h: 4 }, inEllipse(x, y, 4, 4), { light: 'F', mid: 'G', dark: 'H' });
  }
  // a pear
  solid(c, { x: 15, y: 4, w: 3, h: 4 }, inEllipse(15, 4, 3, 4), {
    light: 'h',
    mid: 'm',
    dark: 'y',
  });
  // the crate
  solid(c, { x: 0, y: 7, w: 20, h: 7 }, inRect(0, 7, 20, 7), WOOD, { shade: 'tl' });
  hline(c, 1, 10, 18, 'u');
  vline(c, 6, 8, 5, 'u');
  vline(c, 13, 8, 5, 'u');
  return sprite(c);
}

/** A swing in a frame: two leaning posts and a bar, two ropes and a plank seat. 40 x 38. */
function gardenSwing(): SpriteDef {
  const c = canvas(40, 38);
  // the frame: an A on each side, a bar across the top
  for (const [x1, x2] of [
    [3, 8],
    [36, 31],
  ] as const) {
    line(c, x1, 37, x2, 3, 's');
    line(c, x1 + 1, 37, x2 + 1, 3, 'r');
    line(c, x1 + 2, 37, x2 + 2, 3, 't');
  }
  fill(c, 5, 1, 30, 3, 's');
  hline(c, 5, 1, 30, 'r');
  hline(c, 5, 3, 30, 't');
  // ropes and the seat
  for (const x of [14, 26]) {
    vline(c, x, 4, 23, 'w');
    vline(c, x + 1, 4, 23, 'U');
  }
  solid(c, { x: 11, y: 27, w: 19, h: 4 }, inRect(11, 27, 19, 4), WOOD, { shade: 'rows' });
  outline(c, 'k');
  return sprite(c);
}

/** A scarecrow on a pole: a straw hat, a burlap face, a patched shirt, a crow on one arm. 28 x 40. */
function scarecrow(): SpriteDef {
  const c = canvas(28, 40);
  // the pole and the arms
  fill(c, 13, 14, 2, 26, 's');
  vline(c, 13, 14, 26, 'r');
  fill(c, 3, 19, 22, 2, 's');
  hline(c, 3, 19, 22, 'r');
  // the shirt
  solid(c, { x: 8, y: 17, w: 12, h: 13 }, inRect(8, 17, 12, 13), {
    light: 'F',
    mid: 'G',
    dark: 'H',
  });
  fill(c, 11, 23, 4, 4, 'f');
  hline(c, 11, 23, 4, 'g');
  for (let x = 9; x < 19; x += 2) put(c, x, 28, 'k');
  // the straw hands and the ragged hem
  for (const x of [1, 24]) {
    fill(c, x, 20, 3, 3, '2');
    put(c, x, 23, '3');
    put(c, x + 2, 23, '3');
  }
  for (const x of [9, 12, 15, 17]) {
    vline(c, x, 30, 3, '2');
    put(c, x, 33, '3');
  }
  // the head and the hat
  solid(c, { x: 9, y: 7, w: 10, h: 10 }, inEllipse(9, 7, 10, 10), {
    light: 'w',
    mid: 'U',
    dark: 'x',
  });
  put(c, 12, 11, 'k');
  put(c, 16, 11, 'k');
  hline(c, 12, 14, 5, 'k');
  put(c, 11, 13, 'k');
  put(c, 17, 13, 'k');
  solid(c, { x: 4, y: 5, w: 20, h: 4 }, inEllipse(4, 4, 20, 6), STRAW);
  solid(c, { x: 9, y: 0, w: 10, h: 7 }, inRect(9, 1, 10, 6), STRAW);
  fill(c, 9, 4, 10, 1, 'R');
  // the crow, on the right arm
  solid(c, { x: 19, y: 14, w: 7, h: 6 }, inEllipse(19, 14, 7, 6), {
    light: 'V',
    mid: 'W',
    dark: 'W',
  });
  put(c, 25, 16, 'o');
  put(c, 26, 16, 'o');
  put(c, 24, 15, 'c');
  return sprite(c);
}

/** A white duck afloat, a little ring on the water round it. 22 x 10. */
function duck(): SpriteDef {
  const c = canvas(22, 10);
  // the ripple
  hline(c, 1, 8, 20, 'g');
  hline(c, 3, 9, 16, 'e');
  // the body and tail
  solid(c, { x: 2, y: 3, w: 15, h: 6 }, inEllipse(2, 2, 15, 8), {
    light: 'p',
    mid: 'a',
    dark: 'b',
  });
  solid(c, { x: 0, y: 2, w: 6, h: 4 }, inEllipse(0, 1, 6, 5), { light: 'p', mid: 'a', dark: 'a' });
  // the neck, head and beak
  solid(c, { x: 13, y: 1, w: 5, h: 7 }, inRect(13, 1, 5, 7), { light: 'p', mid: 'a', dark: 'b' });
  solid(c, { x: 13, y: 0, w: 6, h: 5 }, inEllipse(13, 0, 6, 5), {
    light: 'p',
    mid: 'p',
    dark: 'a',
  });
  fill(c, 19, 2, 3, 2, 'o');
  put(c, 21, 3, 'Q');
  put(c, 16, 2, 'k');
  // the wing
  fill(c, 6, 4, 6, 2, 'b');
  put(c, 12, 5, 'b');
  outline(c, 'k');
  return sprite(c);
}

/** Three round pads and a pink flower. 24 x 9. */
function lilyCluster(): SpriteDef {
  const c = canvas(24, 9);
  for (const [x, y, w] of [
    [0, 4, 10],
    [12, 5, 11],
    [8, 1, 8],
  ] as const) {
    solid(c, { x, y, w, h: 4 }, inEllipse(x, y, w, 4), { light: 'h', mid: 'i', dark: 'j' });
    // the notch every pad has
    put(c, x + w - 3, y + 1, '.');
    put(c, x + w - 2, y + 1, '.');
  }
  // the flower
  fill(c, 15, 2, 4, 3, 'S');
  put(c, 16, 1, 'S');
  put(c, 17, 3, 'z');
  put(c, 15, 4, 'R');
  put(c, 18, 4, 'R');
  outline(c, 'k');
  return sprite(c);
}

/** A paper boat with a candle in it. 22 x 10; the candle is the light. */
function lanternBoat(): SpriteDef {
  const c = canvas(22, 10);
  // the candle and its flame
  fill(c, 10, 3, 2, 4, 'p');
  put(c, 10, 6, 'a');
  put(c, 10, 1, 'z');
  put(c, 11, 1, 'm');
  put(c, 10, 2, 'm');
  put(c, 11, 2, 'Q');
  // the hull: a paper trough folded up at both ends
  solid(
    c,
    { x: 0, y: 5, w: 22, h: 5 },
    (x, y) => y >= 5 && y <= 9 && x >= y - 5 && x <= 21 - (y - 5),
    { light: 'p', mid: 'a', dark: 'b' },
    { shade: 'rows' },
  );
  hline(c, 5, 7, 12, 'v');
  hline(c, 5, 8, 12, 'q');
  return sprite(c);
}

/**
 * A fishing stool on the bank: a three-legged stool and a tin bucket, a rod set in the stool reaching out over the water, and
 * its line hanging fine and straight to a red and white bobber. The stool and the bucket are inked; the rod is a thin inked
 * stick and the line is drawn after the ink, one pixel wide, so it reads as a line and not a post. 30 x 20.
 */
function fishingStool(): SpriteDef {
  const c = canvas(30, 20);
  // the stool
  solid(c, { x: 3, y: 9, w: 10, h: 3 }, inRect(3, 9, 10, 3), WOOD, { shade: 'rows' });
  line(c, 4, 12, 3, 19, 't');
  line(c, 11, 12, 12, 19, 't');
  vline(c, 7, 12, 8, 's');
  // a bucket
  solid(c, { x: 16, y: 13, w: 6, h: 7 }, inRect(16, 13, 6, 7), IRON);
  hline(c, 17, 14, 4, 'e');
  outline(c, 'k');
  // the rod: from its butt in the stool out over the water, dark wood under a light edge, a reel by the grip
  line(c, 10, 9, 26, 1, 'u');
  line(c, 11, 8, 26, 0, 'r');
  put(c, 12, 9, 'k');
  put(c, 13, 9, 'd');
  // the line from the tip, one pixel, and the bobber on the water
  vline(c, 27, 1, 13, 'b');
  put(c, 27, 0, 'u');
  put(c, 26, 14, 'k');
  put(c, 27, 14, 'c');
  put(c, 28, 14, 'k');
  fill(c, 26, 15, 3, 1, 'R');
  put(c, 27, 16, 'k');
  return sprite(c);
}

/** Four flat stones across the bank. 32 x 8. */
function steppingStones(): SpriteDef {
  const c = canvas(32, 8);
  for (const [x, y, w, h] of [
    [0, 3, 9, 5],
    [10, 1, 8, 5],
    [18, 3, 7, 5],
    [26, 1, 6, 5],
  ] as const) {
    solid(c, { x, y, w, h }, inEllipse(x, y, w, h), STONE);
  }
  put(c, 3, 5, 'd');
  put(c, 13, 3, 'd');
  put(c, 28, 3, 'd');
  return sprite(c);
}

/** A striped umbrella on a pole in a stone base. 30 x 20. */
function sunUmbrella(): SpriteDef {
  const c = canvas(30, 20);
  // the pole, leaning a little
  line(c, 14, 19, 16, 6, 'b');
  line(c, 15, 19, 17, 6, 'a');
  solid(c, { x: 10, y: 16, w: 10, h: 4 }, inRect(10, 16, 10, 4), STONE, { shade: 'rows' });
  // the canopy: a half ellipse in alternate stripes
  const canopy = inEllipse(1, 0, 28, 16);
  solid(c, { x: 1, y: 0, w: 28, h: 8 }, canopy, { light: 'p', mid: 'p', dark: 'a' });
  for (let y = 1; y < 8; y++) {
    for (let x = 2; x < 28; x++) {
      if (!canopy(x, y)) continue;
      const k = c.px[y * c.w + x];
      if (k === undefined || k === 'k') continue;
      if (Math.floor((x - 1) / 4) % 2 === 0) put(c, x, y, y > 5 ? '6' : '5');
    }
  }
  // the scalloped hem
  for (let x = 2; x < 28; x += 4) {
    put(c, x + 1, 8, Math.floor((x - 1) / 4) % 2 === 0 ? '6' : 'a');
    put(c, x + 2, 8, Math.floor((x - 1) / 4) % 2 === 0 ? '6' : 'a');
  }
  outline(c, 'k');
  return sprite(c);
}

/** A silver ball on a stone post: the garden, upside down and round. 14 x 20. */
function gazingBall(): SpriteDef {
  const c = canvas(14, 20);
  solid(c, { x: 2, y: 15, w: 10, h: 5 }, inRect(2, 15, 10, 5), STONE, { shade: 'rows' });
  solid(c, { x: 4, y: 11, w: 6, h: 5 }, inRect(4, 11, 6, 5), STONE);
  solid(c, { x: 0, y: 0, w: 14, h: 13 }, inEllipse(0, 0, 14, 13), {
    light: 'g',
    mid: 'e',
    dark: 'f',
  });
  // a bright window, the sky below it, a tuft of garden at the bottom
  fill(c, 3, 2, 4, 2, 'c');
  put(c, 3, 4, 'c');
  hline(c, 4, 9, 6, 'i');
  hline(c, 5, 8, 4, 'j');
  put(c, 8, 7, 'S');
  return sprite(c);
}

/** A hedge clipped to a cone, a band of lighter leaf spiralling up it, in a clay pot. 16 x 20. */
function coneTopiary(): SpriteDef {
  const c = canvas(16, 20);
  // the pot
  solid(c, { x: 3, y: 14, w: 10, h: 6 }, inRect(3, 14, 10, 6), POT, { shade: 'tl' });
  hline(c, 2, 14, 12, 'v');
  // the cone
  const cone = (x: number, y: number): boolean =>
    y >= 0 && y < 15 && Math.abs(x + 0.5 - 8) <= 0.5 + (y * 7) / 14;
  solid(c, { x: 0, y: 0, w: 16, h: 15 }, cone, LEAF);
  for (let y = 3; y < 14; y++) {
    for (let x = 1; x < 15; x++) {
      const k = c.px[y * c.w + x];
      if (k === undefined || k === '.' || k === 'k') continue;
      if ((x + y * 2) % 7 === 0 || (x + y * 2) % 7 === 1) put(c, x, y, 'h');
      else if ((x * 3 + y) % 11 === 0) put(c, x, y, 'l');
    }
  }
  return sprite(c);
}

/** A round iron table, two curled legs, a cup and a flower in a glass. 20 x 18. */
function bistroTable(): SpriteDef {
  const c = canvas(20, 18);
  // the cup and the flower
  fill(c, 4, 4, 4, 3, 'p');
  put(c, 8, 5, 'p');
  put(c, 5, 3, 'c');
  fill(c, 13, 3, 1, 4, 'j');
  fill(c, 12, 1, 3, 2, 'S');
  put(c, 13, 1, 'z');
  // the top
  solid(c, { x: 0, y: 6, w: 20, h: 3 }, inEllipse(0, 5, 20, 5), IRON, { shade: 'rows' });
  // the column and the feet
  fill(c, 9, 9, 2, 7, '7');
  vline(c, 9, 9, 7, '8');
  line(c, 9, 15, 3, 17, '9');
  line(c, 10, 15, 16, 17, '9');
  fill(c, 2, 17, 3, 1, '9');
  fill(c, 15, 17, 3, 1, '9');
  outline(c, 'k');
  return sprite(c);
}

export const HOUSE_ART: HouseArtPack = {
  pieces: {
    beehive: { sprite: beehive() },
    'fruit-crate': { sprite: fruitCrate() },
    'garden-swing': { sprite: gardenSwing() },
    scarecrow: { sprite: scarecrow() },
    duck: { sprite: duck() },
    'lily-cluster': { sprite: lilyCluster() },
    'lantern-boat': {
      sprite: lanternBoat(),
      light: { kind: 'lantern', at: { x: 10, y: 4 }, size: 0.7 },
    },
    'fishing-stool': { sprite: fishingStool() },
    'stepping-stones': { sprite: steppingStones() },
    'sun-umbrella': { sprite: sunUmbrella() },
    'gazing-ball': { sprite: gazingBall() },
    'cone-topiary': { sprite: coneTopiary() },
    'bistro-table': { sprite: bistroTable() },
  },
};
