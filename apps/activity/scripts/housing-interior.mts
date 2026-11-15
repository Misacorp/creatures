// `pnpm housing interior-sheets [--out dir]` (docs/design/housing-interior.md): the review sheets of the room
// interior, one per layer, a sheet of eight mixed rooms and a whole-house mock. Each is written at 1x
// (`<name>-1x.png`) and enlarged 3x (`<name>.png`). Default folder: apps/activity/scratch/housing/interior (git ignores it).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { png } from './png.mts';

const sheets = await import('../src/sprites/workshop/interior/sheets.ts');
const { collisionTable } = await import('../src/sprites/workshop/interior/report.ts');
type Raster = ReturnType<typeof sheets.mixSheet>;

const ROOT = join(import.meta.dirname, '..');
const ROOMS = join(
  ROOT,
  '..',
  '..',
  'packages',
  'game',
  'src',
  'content',
  'data',
  'housing',
  'rooms.json',
);

function write(dir: string, name: string, r: Raster, scale = 3): string[] {
  const one = join(dir, `${name}-1x.png`);
  writeFileSync(one, png(r.px, r.w, r.h));
  const big = r.scaled(scale);
  const file = join(dir, `${name}.png`);
  writeFileSync(file, png(big.px, big.w, big.h));
  return [file, one];
}

export function main(args: string[]): void {
  const i = args.indexOf('--out');
  const dir = resolve(i >= 0 ? (args[i + 1] ?? '') : join(ROOT, 'scratch', 'housing', 'interior'));
  mkdirSync(dir, { recursive: true });
  const rooms = JSON.parse(readFileSync(ROOMS, 'utf8')) as Parameters<typeof sheets.waysSheet>[0];
  const out: string[] = [];
  out.push(...write(dir, '1-wallpaper', sheets.wallpaperSheet()));
  out.push(...write(dir, '2-floors', sheets.floorSheet()));
  out.push(...write(dir, '3-trim', sheets.trimSheet()));
  out.push(...write(dir, '4-frame', sheets.frameSheet()));
  out.push(...write(dir, '5-ways-through', sheets.waysSheet(rooms)));
  out.push(...write(dir, '6-ceilings', sheets.ceilingSheet()));
  out.push(...write(dir, '7-mix', sheets.mixSheet()));
  out.push(...write(dir, '7-mix-night', sheets.nightStrip('Parlour'), 4));
  const house = sheets.houseMock();
  out.push(...write(dir, '8-house', house));
  // phone: a 390 px wide screen at device pixel ratio 2 shows the house at 1 css px a pixel, 2 image pixels
  const phone = house.scaled(2);
  writeFileSync(join(dir, '8-house-phone.png'), png(phone.px, phone.w, phone.h));
  out.push(join(dir, '8-house-phone.png'));
  console.log(out.join('\n'));
  console.log(`\n${collisionTable(rooms)}`);
}

if (process.argv[1] === import.meta.filename) main(process.argv.slice(2));
