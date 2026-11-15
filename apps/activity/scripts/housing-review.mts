// The workshop's review sheets (docs/design/housing-workshop.md, "The room sheet" and "Variants"):
//
//   pnpm housing sheet <style> --room [--out dir]   the set in a room at 1x and phone scale, the catalogue tiles, the report
//        [--night]                                   adds the rooms at night, lit by their lamps (house-light.ts)
//   pnpm housing variants <style> [--out dir]       every silhouette variant of every form, drawn in the style
//
// Loaded by housing.mts (which registers the `.ts` resolver first); the pure work is in src/sprites/workshop/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PieceArt } from '../src/housing/house-art.ts';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import type { FormId, Style } from '../src/sprites/workshop/style.ts';
import type { RoomLayout, SetRoom } from '../src/sprites/workshop/room.ts';
import { AMBER, Image, MUTED, PANEL, RED, TEXT } from './housing-image.mts';

const { expandRows } = await import('../src/sprites/sprite-data.ts');
const { glyph } = await import('../src/sprites/world-map-font.ts');
const { SET_FORMS } = await import('../src/sprites/workshop/style.ts');
const { generatePiece, makePiece } = await import('../src/sprites/workshop/pack.ts');
const { SHIPPED_SETS, SAMPLE_STYLES } = await import('../src/sprites/workshop/sets.ts');
const { VARIANTS } = await import('../src/sprites/workshop/variants.ts');
const { SHADE_KINDS, RUG_SHAPES } = await import('../src/sprites/draw/parts.ts');
const room = await import('../src/sprites/workshop/room.ts');
const light = await import('../src/housing/house-light.ts');
const report = await import('../src/sprites/workshop/report.ts');
const { SPECIES_SPRITE_DATA } = await import('../src/sprites/data/species-sprites.ts');
const COSY_ART = (await import('../src/sprites/data/house/cosy.ts')).HOUSE_ART;
const SHELL_ART = (await import('../src/sprites/data/house/shell.ts')).HOUSE_ART;

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, '..', '..', 'packages', 'game', 'src', 'content', 'data', 'housing');

const rowsOf = (def: SpriteDef): string[] => expandRows(def);
const widthOf = (def: SpriteDef): number => rowsOf(def)[0]?.length ?? 0;

function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function outDir(args: readonly string[], name: string): string {
  const dir = resolve(flag(args, '--out') ?? join(ROOT, 'scratch', 'housing', name));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function styleOf(id: string): Style {
  const style = SAMPLE_STYLES[id] ?? SHIPPED_SETS[id]?.style;
  if (style === undefined) {
    console.error(
      `No style "${id}". Styles: ${[...Object.keys(SAMPLE_STYLES), ...Object.keys(SHIPPED_SETS)].join(', ')}`,
    );
    process.exit(1);
  }
  return style;
}

/** A piece with its glow behind (as the scene puts it) and its front layer. */
function drawPiece(
  img: Image,
  art: PieceArt,
  x: number,
  y: number,
  s: number,
  glow: boolean,
): void {
  if (glow && art.glow !== undefined) {
    const gx = x + Math.floor((widthOf(art.sprite) - widthOf(art.glow)) / 2) * s;
    img.sprite(art.glow, rowsOf(art.glow), gx, y + 4 * s, s);
  }
  img.sprite(art.sprite, rowsOf(art.sprite), x, y, s);
  if (art.front !== undefined) img.sprite(art.front, rowsOf(art.front), x, y, s);
}

// ---------------------------------------------------------------------------------------------------------------
// variants

function variantsSheet(args: readonly string[]): void {
  const style = styleOf(args[1] ?? '');
  const only = flag(args, '--form');
  const S = only === undefined ? 3 : 4;
  type Cell = { label: string; art: PieceArt };
  const rows: { title: string; cells: Cell[] }[] = [];
  for (const [form, axes] of Object.entries(VARIANTS) as [
    FormId,
    Record<string, readonly string[]>,
  ][]) {
    for (const [axis, values] of Object.entries(axes)) {
      const cells = values.map((value) => {
        const own = (style.shapes?.[form as keyof typeof style.shapes] ?? {}) as Record<
          string,
          unknown
        >;
        const shaped: Style = {
          ...style,
          shapes: { ...style.shapes, [form]: { ...own, [axis]: value } },
        };
        return { label: value, art: generatePiece(form, shaped) };
      });
      rows.push({ title: `${form} ${axis}`, cells });
    }
  }
  rows.push({
    title: 'lamp kind',
    cells: SHADE_KINDS.map((kind) => ({
      label: kind,
      art: generatePiece('lamp', { ...style, lamp: kind }),
    })),
  });
  rows.push({
    title: 'lamp glow',
    cells: (['ring', 'dither', 'stipple'] as const).map((kind) => ({
      label: kind,
      art: generatePiece('lamp', { ...style, glow: { ...style.glow, kind } }),
    })),
  });
  rows.push({
    title: 'rug shape',
    cells: RUG_SHAPES.map((shape) => ({
      label: shape,
      art: generatePiece('rug', { ...style, rug: { ...style.rug, shape, motifs: 'row' } }),
    })),
  });
  if (only !== undefined)
    rows.splice(0, rows.length, ...rows.filter((r) => r.title.startsWith(only)));
  const cellW = 56 * S + 16;
  const rowH = 36 * S + 34;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const img = new Image(cols * cellW + 32, rows.length * rowH + 50, glyph);
  img.text(`${style.name} variants`, 16, 12, 3);
  for (const [r, row] of rows.entries()) {
    const y = 46 + r * rowH;
    img.text(row.title, 16, y, 2, AMBER);
    for (const [i, cell] of row.cells.entries()) {
      const x = 16 + i * cellW;
      img.rect(x - 2, y + 16, cellW - 8, rowH - 20, PANEL);
      img.text(cell.label, x, y + 18, 1, MUTED);
      drawPiece(img, cell.art, x, y + 28, S, true);
    }
  }
  const file = join(
    outDir(args, style.id),
    `${style.id}-variants${only === undefined ? '' : `-${only}`}.png`,
  );
  img.save(file);
  console.log(file);
}

export async function run(args: readonly string[]): Promise<void> {
  if (args[0] === 'variants') variantsSheet(args);
  else await roomSheet(args);
}

// ---------------------------------------------------------------------------------------------------------------
// the room sheet

interface SetArt {
  style: Style;
  pieces: Record<FormId, PieceArt>;
  wall: SpriteDef;
  floor: SpriteDef;
  /** Where the paper and floor came from. */
  skins: string;
}

/** A set's finished pieces and skins: a shipped set as it ships, a sample style as it generates (on neutral skins). */
function setArt(id: string): SetArt {
  const source = SHIPPED_SETS[id];
  const style = source?.style ?? styleOf(id);
  const pieces = Object.fromEntries(
    SET_FORMS.map((form) => [
      form,
      source === undefined ? generatePiece(form, style) : makePiece(source, form),
    ]),
  ) as Record<FormId, PieceArt>;
  const own = source?.hand?.skins;
  const wall = own?.[`${id}-wall`]?.tile;
  const floor = own?.[`${id}-floor`]?.tile;
  if (wall !== undefined && floor !== undefined)
    return { style, pieces, wall, floor, skins: `${id}-wall, ${id}-floor` };
  const nWall = COSY_ART.skins?.['cosy-wall']?.tile;
  const nFloor = COSY_ART.skins?.['cosy-floor']?.tile;
  if (nWall === undefined || nFloor === undefined) throw new Error('the Cosy skins are missing');
  return {
    style,
    pieces,
    wall: nWall,
    floor: nFloor,
    skins: 'cosy-wall, cosy-floor (the set has none)',
  };
}

function paint(img: Image, model: SetRoom, x: number, y: number, s: number): void {
  for (const p of model.placements)
    img.sprite(p.sprite, rowsOf(p.sprite), x + p.x * s, y + p.y * s, s);
}

const rgbOf = (c: string): [number, number, number] => {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = (c: readonly number[]): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * The rooms at night as the house paints them (`house-light.ts`): every pixel through its material's ramp, the lamps'
 * stepped light on top. The material of a placement is told by what it is (the paper, the floor, a housemate, the
 * lamp, the window); the scene does the same from its spots. Stars in the window's night sky are not drawn.
 */
function paintNight(
  img: Image,
  model: SetRoom,
  set: SetArt,
  creature: SpriteDef,
  x: number,
  y: number,
  s: number,
): void {
  const g = room.ROOM_GEOMETRY;
  const roomW = g.cellW;
  const lights = model.pieces
    .filter((p) => p.form === 'lamp')
    .map((p) => ({
      kind: 'lamp' as const,
      x: p.x + Math.floor(p.w / 2),
      y: p.y + Math.floor(p.h * 0.8),
      clip: { x: g.wallT / 2 + p.room * roomW, y: 0, w: roomW, h: g.wallH + g.floorH },
    }));
  const levels = light.levelMap(lights, model.width, model.height);
  const materialOf = (def: SpriteDef): Parameters<typeof light.shade>[1] => {
    if (def.palette === set.wall.palette) return 'wall';
    if (def.palette === set.floor.palette) return 'floor';
    if (def === creature) return 'creature';
    if (def === set.pieces.lamp.sprite) return 'light';
    if (def === set.pieces.curtains.sprite) return 'window';
    return 'auto';
  };
  for (const p of model.placements) {
    const mat = materialOf(p.sprite);
    for (const [r, row] of rowsOf(p.sprite).entries()) {
      for (const [i, key] of [...row].entries()) {
        const colour = p.sprite.palette[key];
        if (key === '.' || colour === undefined) continue;
        const px = p.x + i;
        const py = p.y + r;
        if (px < 0 || py < 0 || px >= model.width || py >= model.height) continue;
        const c = rgbOf(colour);
        const sky = mat === 'window' ? light.windowPixel(c, 'night') : null;
        const level = (levels[py * model.width + px] ?? 0) as 0 | 1 | 2 | 3;
        const out = sky?.colour ?? light.shade(c, mat, 'night', level);
        img.rect(x + px * s, y + py * s, s, s, hexOf(out));
      }
    }
  }
}

async function roomSheet(args: readonly string[]): Promise<void> {
  const id = args[1] ?? '';
  const set = setArt(id);
  const rooms = JSON.parse(readFileSync(join(CONTENT, 'rooms.json'), 'utf8')) as {
    id: string;
    cells: { w: number };
    spots: RoomLayout['spots'];
  }[];
  const kind = rooms.find((r) => r.id === room.SHOW_ROOM);
  if (kind === undefined) throw new Error(`rooms.json has no ${room.SHOW_ROOM}`);
  const layout: RoomLayout = { id: kind.id, cells: kind.cells.w, spots: kind.spots };
  const creature = SPECIES_SPRITE_DATA[room.SHOW_CREATURE];
  const slab = SHELL_ART.shell?.slab;
  const walls = SHELL_ART.skins?.plaster?.tile;
  if (creature === undefined || slab === undefined || walls === undefined)
    throw new Error('missing scene art');
  const model = room.setRoom({
    layout,
    pieces: set.pieces,
    wall: set.wall,
    floor: set.floor,
    slab,
    walls,
    creature,
  });
  const phone = room.phoneRoomScale(
    layout.cells * room.ROOM_GEOMETRY.cellW + room.ROOM_GEOMETRY.wallT,
  );

  // the report
  const bg = {
    wall: report.averageColour(set.wall),
    floor: report.averageColour(set.floor),
  };
  const behind = (form: FormId): string =>
    bg[model.pieces.find((p) => p.form === form)?.on ?? 'wall'];
  const lines: string[] = [`${set.style.name} (${set.style.id}): paper and floor ${set.skins}`, ''];
  lines.push(
    'Readable at 1x (tones besides ink, inside contrast on its background, lone specks, fill):',
  );
  let flagged = 0;
  for (const form of SET_FORMS) {
    const r = report.readability(set.pieces[form].sprite, behind(form));
    if (r.flags.length > 0) flagged++;
    lines.push(
      `  ${form.padEnd(9)} ${String(r.tones).padStart(2)} tones  ${r.contrast.toFixed(2)}  ${(r.specks * 100).toFixed(0).padStart(2)}%  ${(r.fill * 100).toFixed(0).padStart(3)}%  ${r.flags.length === 0 ? 'ok' : `FLAG: ${r.flags.join('; ')}`}`,
    );
  }
  const mine = SET_FORMS.map((form) => ({
    id: `${id}-${form}`,
    form,
    sprite: set.pieces[form].sprite,
  }));
  const others = [...Object.keys(SHIPPED_SETS), ...Object.keys(SAMPLE_STYLES)]
    .filter((other) => other !== id)
    .flatMap((other) => {
      const art = setArt(other);
      return SET_FORMS.map((form) => ({
        id: `${other}-${form}`,
        form,
        sprite: art.pieces[form].sprite,
      }));
    });
  const close = report.closePairs(mine, others);
  lines.push(
    '',
    `Too close to another set's piece (outline overlap >= ${String(report.CLOSE.overlap)} and colour distance <= ${String(report.CLOSE.colour)}):`,
    ...(close.length === 0
      ? ['  none']
      : close.map(
          (p) =>
            `  ${p.a} ~ ${p.b}: overlap ${p.overlap.toFixed(2)}, colour ${p.colour.toFixed(3)}`,
        )),
    '',
    `${String(flagged)} of ${String(SET_FORMS.length)} pieces flagged for 1x, ${String(close.length)} close pairs. Phone scale ${String(phone)}.`,
  );

  // the sheet: 1x, phone scale, catalogue tiles (red label: flagged)
  const night = args.includes('--night');
  const W = Math.max(model.width * phone + 32, 760);
  const H =
    40 +
    model.height +
    24 +
    model.height * phone +
    26 +
    60 +
    16 +
    (night ? model.height * phone + 26 : 0);
  const img = new Image(W, H, glyph);
  img.text(`${set.style.name} in a room`, 16, 10, 3);
  let y = 40;
  img.text('1x', 16 + model.width + 12, y + 10, 1, MUTED);
  paint(img, model, 16, y, 1);
  y += model.height + 12;
  img.text(`phone ${String(phone)}x`, 16, y, 1, MUTED);
  y += 12;
  paint(img, model, 16, y, phone);
  y += model.height * phone + 14;
  if (night) {
    img.text(`night ${String(phone)}x, lit by the lamps`, 16, y, 1, MUTED);
    y += 12;
    paintNight(img, model, set, creature, 16, y, phone);
    y += model.height * phone + 14;
  }
  img.text('catalogue tiles', 16, y, 1, MUTED);
  y += 12;
  for (const [i, form] of SET_FORMS.entries()) {
    const art = set.pieces[form];
    const sc = room.catalogueScale(art.sprite);
    const tx = 16 + i * 56;
    img.rect(tx, y, 44, 44, PANEL);
    const w = widthOf(art.sprite) * sc;
    const h = rowsOf(art.sprite).length * sc;
    drawPiece(
      img,
      art,
      tx + 2 + Math.floor((40 - w) / 2),
      y + 2 + Math.floor((40 - h) / 2),
      sc,
      false,
    );
    const bad =
      report.readability(art.sprite, behind(form)).flags.length > 0 ||
      close.some((p) => p.a === `${id}-${form}`);
    img.text(form.slice(0, 8), tx, y + 48, 1, bad ? RED : TEXT);
  }
  const dir = outDir(args, id);
  const file = join(dir, `${id}-room.png`);
  const text = join(dir, `${id}-report.txt`);
  img.save(file);
  writeFileSync(text, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\n${file}\n${text}`);
}
