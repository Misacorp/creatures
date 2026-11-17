import { describe, expect, it } from 'vitest';
import { FLOOR_PLATE_X, FURNACE_PLATE_X, PLATE_AT, PLATE_H_PX, backPlateAt } from './forge-canvas';
import { INTERIOR_SCALE_MAX, doorPlateAt, interiorLayout, interiorScale } from './forge-interior';
import { sceneGeometry } from './SceneFrame';

/**
 * The cue of every clickable thing is its name plate (`CanvasTarget`'s `plate`): at no window size may two plates, or a plate and an
 * anvil's speech bubble, run into each other (Misa, 2026-11-16: "Stormr" and "Mistnewt" ran together, "Bag", "Plans" and "Floor"
 * touched, the bubbles covered the "Furnace" and "Valley" plates). Plates are CSS px (the pixel font does not scale), their places
 * scale with the room, so this is checked on the real layout at the sizes a Discord Activity gets.
 */

/** The window sizes (CSS px, the scene's box: the window less the HUD and the strip under the scene). */
const SIZES: [number, number][] = [
  [390, 700],
  [1100, 650],
  [1440, 760],
  [1920, 900],
  [2560, 900],
  [3200, 1200],
];

interface Rect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The widest plate a name of `chars` letters makes (the pixel font is about 8 px a letter, 5 px of padding each side). */
const plateW = (chars: number): number => Math.min(120, chars * 8 + 10);
/** An anvil's speech bubble (`.vy-bubble`): about 40 x 30 CSS px, standing 10 px over the smith's top. */
const BUBBLE = { w: 40, h: 30, lift: 10 };

function plates(w: number, h: number, owned: number): Rect[] {
  const s = interiorScale(w, h);
  const g = sceneGeometry(w, h, s);
  const lay = interiorLayout(g, Math.min(4, owned + 1));
  const out: Rect[] = [];
  const plate = (name: string, cx: number, top: number, chars: number): void => {
    out.push({ name, x: cx * s - plateW(chars) / 2, y: top * s, w: plateW(chars), h: PLATE_H_PX });
  };
  plate(
    'Furnace',
    lay.furnace.x + lay.furnace.w / 2 + FURNACE_PLATE_X,
    lay.furnace.y + lay.furnace.h,
    7,
  );
  plate('Valley', lay.door.x + lay.door.w / 2, lay.door.y + doorPlateAt(), 6);
  plate('Plans', lay.plans.x + lay.plans.w / 2, lay.plans.y + lay.plans.h, 5);
  plate('Bag', lay.chest.x + lay.chest.w / 2, lay.chest.y + lay.chest.h, 3);
  plate('Floor', lay.crate.x + lay.crate.w / 2 + FLOOR_PLATE_X, lay.crate.y + lay.crate.h, 5);
  for (const [i, cell] of lay.cells.entries()) {
    plate(`Anvil ${String(i)}`, cell.x + cell.w / 2, cell.y + PLATE_AT, 12);
    if (i < owned) {
      // A smith's bubble: over the smith's head, centred on its sprite (16 wide).
      const cx = (cell.smith.x + 8) * s;
      out.push({
        name: `Bubble ${String(i)}`,
        x: cx - BUBBLE.w / 2,
        y: cell.smith.y * s - BUBBLE.lift - BUBBLE.h,
        w: BUBBLE.w,
        h: BUBBLE.h,
      });
    }
  }
  for (const [i, spot] of lay.backSpots.entries()) {
    // Target: 14 x 16 at (x - 7, y - 14); its plate sits `backPlateAt` down from the target's top.
    plate(`Smith ${String(i)}`, spot.x, spot.y - 14 + backPlateAt(i, s), 10);
  }
  return out;
}

const apart = (a: Rect, b: Rect): boolean =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

describe('the Forge: plates and bubbles never run into each other', () => {
  for (const [w, h] of SIZES) {
    for (const owned of [0, 2, 4]) {
      it(`at ${String(w)} x ${String(h)} with ${String(owned)} anvils`, () => {
        const rects = plates(w, h, owned);
        const clashes: string[] = [];
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            if (a === undefined || b === undefined) continue;
            if (!apart(a, b)) clashes.push(`${a.name} / ${b.name}`);
          }
        }
        expect(clashes).toEqual([]);
      });
    }
  }
});

describe('the Forge scale fills the window', () => {
  it('takes the largest whole scale at which the room fits, up to the cap', () => {
    expect(interiorScale(390, 700)).toBe(3);
    // Wide and tall: the room grows with the window (it was held at 4 however big the window was).
    expect(interiorScale(1920, 900)).toBe(5);
    expect(interiorScale(2560, 1080)).toBe(6);
    expect(interiorScale(3200, 1800)).toBe(INTERIOR_SCALE_MAX);
    // Wide and short: the height decides, so the working height is never cut.
    expect(interiorScale(2560, 400)).toBe(2);
  });
});
