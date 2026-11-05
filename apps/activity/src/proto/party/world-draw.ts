/**
 * The clearing drawn as placements: the Games' grass tile over the whole window, a dirt road (out of the
 * window's edges), sparse tufts, and each station's art from the game's own sprites (world map landmarks,
 * living room props, the boss). One scale for the whole scene.
 */
import { bossArt } from '../../art';
import { glyphOrUnknown } from '../../glyphs';
import { ROOM_SPRITE_DATA, type RoomPropName } from '../../sprites/data/room-sprites';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import type { SpriteDef } from '../../sprites/sprite-data';
import { PixelGrid, gridPlacements, type Placement } from '../../games/art/pixel';
import { TILE, tileFrame } from '../../games/art/tiles';
import { RAMPS } from '../../games/art/tint';
import type { StationId } from './party-state';
import { ANVIL, CAVE_MOUTH, CHEST_FRAMES, INK, TUFT, pathPiece, upscale } from './sprites';
import { tuftSpots, type Box, type WorldLayout } from './world-layout';

export function roomProp(name: RoomPropName): SpriteDef {
  const sprite = ROOM_SPRITE_DATA[name].day;
  if (sprite === undefined) throw new Error(`no day art for ${name}`);
  return sprite;
}

/** A flat oval of sand (the arena's floor seen from the clearing). */
function sandOval(x: number, y: number, w: number, h: number): Placement[] {
  const g = new PixelGrid(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const d = ((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2;
      if (d <= 1) g.set(xx, yy, d > 0.7 ? 'd' : 'b');
    }
  }
  return gridPlacements(g, { b: RAMPS.sand[1], d: RAMPS.sand[3] }, x, y);
}

/** A pitched roof `w` x `h` (after the valley prototype's `roofPlacements`). */
function roof(w: number, h: number, x: number, y: number): Placement[] {
  const ramp = RAMPS.red;
  const g = new PixelGrid(w, h);
  const slope = Math.floor(h / 2);
  for (let yy = 0; yy < h; yy++) {
    const inset = Math.max(0, slope - Math.floor(yy / 2));
    const to = w - inset - 1;
    for (let xx = inset; xx <= to; xx++) {
      let key = 'c';
      if (yy === 0 || xx === inset || xx === to || yy === h - 1) key = 'k';
      else if (yy === 1) key = 'a';
      else if (yy % 4 === 0) key = 'd';
      else if (yy % 4 === 1) key = 'b';
      g.set(xx, yy, key);
    }
  }
  return gridPlacements(g, { a: ramp[0], b: ramp[1], c: ramp[2], d: ramp[3], k: INK }, x, y);
}

/** The cottage's wall (44 x 22): planks, a lit window and a door. */
function cottageWall(x: number, y: number): Placement[] {
  const g = new PixelGrid(44, 22);
  g.rect(0, 0, 44, 22, 'k');
  g.rect(1, 0, 42, 21, 'b');
  for (let yy = 3; yy < 21; yy += 4) g.rect(1, yy, 42, 1, 'c');
  g.rect(5, 4, 14, 10, 'k');
  g.rect(6, 5, 12, 8, 'y');
  g.rect(11, 5, 1, 8, 'k');
  g.rect(6, 9, 12, 1, 'k');
  g.rect(27, 6, 11, 15, 'k');
  g.rect(28, 7, 9, 14, 'd');
  g.set(35, 14, 'y');
  return gridPlacements(
    g,
    { b: RAMPS.wood[1], c: RAMPS.wood[2], d: RAMPS.wood[3], y: '#ffd25a', k: INK },
    x,
    y,
  );
}

/** One station's art, its top-left at the box's. */
export function stationPlacements(id: StationId, box: Box, bossId: string): Placement[] {
  const at = (sprite: SpriteDef, dx: number, dy: number): Placement => ({
    sprite,
    x: box.x + dx,
    y: box.y + dy,
  });
  const rock = WORLD_MAP_SPRITE_DATA.rock;
  switch (id) {
    case 'road':
      return [at(WORLD_MAP_SPRITE_DATA.oldCrossroads, 0, 0)];
    case 'forge':
      return [at(roomProp('fireplace'), 0, 0), at(ANVIL, 38, 19)];
    case 'arena':
      return [
        ...sandOval(box.x, box.y + 20, 48, 16),
        at(bossArt(bossId).sprite, 12, 2),
        at(rock, 0, 24),
        at(rock, 40, 24),
        at(rock, 6, 31),
        at(rock, 34, 31),
      ];
    case 'cave':
      return [at(CAVE_MOUTH, 0, 0)];
    case 'house':
      return [...cottageWall(box.x + 2, box.y + 18), ...roof(48, 20, box.x, box.y)];
    case 'chest':
      return [at(upscale(CHEST_FRAMES[0] ?? ANVIL, 2), 0, 0)];
    case 'lectern':
      return [at(roomProp('bookshelf'), 0, 4), at(glyphOrUnknown('journal'), 31, 20)];
    case 'fair':
      return [at(WORLD_MAP_SPRITE_DATA.festivalGrounds, 0, 0)];
  }
}

/**
 * Everything of the clearing for a canvas `cols` x `rows` tiles, with the world's top-left at
 * (`ox`, `oy`) world pixels inside it.
 */
export function clearingPlacements(
  layout: WorldLayout,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
  bossId: string,
): Placement[] {
  const out: Placement[] = [];
  const grass = tileFrame('grass');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push({ sprite: grass, x: c * TILE, y: r * TILE });
  }
  const W = cols * TILE;
  const H = rows * TILE;
  const road = layout.road;
  const roadBox =
    layout.mode === 'phone'
      ? { x: ox + road.x, y: 0, width: road.width, height: H }
      : { x: 0, y: oy + road.y, width: W, height: road.height };
  // The road runs on to the window's edges.
  out.push(...pathPiece(roadBox.x, roadBox.y, roadBox.width, roadBox.height));
  const boxes = Object.values(layout.stations).map((b) => ({ ...b, x: b.x + ox, y: b.y + oy }));
  for (const t of tuftSpots(W, H, [...boxes, roadBox])) {
    out.push({ sprite: TUFT, x: t.x, y: t.y });
  }
  for (const [id, box] of Object.entries(layout.stations) as [StationId, Box][]) {
    out.push(...stationPlacements(id, { ...box, x: box.x + ox, y: box.y + oy }, bossId));
  }
  return out;
}
