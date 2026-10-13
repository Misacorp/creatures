import { describe, expect, it } from 'vitest';
import { content, dungeonContent } from '@creatures/game';
import { BOSS_SCALE, FALLBACK_BOSS_SCALE, bossArt } from '../art';
import {
  BOSS_SIZE,
  BUNDLED_DUNGEON_BOSS_SPRITES,
  BUNDLED_DUNGEON_FOE_SPRITES,
  CREATURE_SIZE,
  FALLBACK_SILHOUETTE,
  bossSprite,
  creatureSprite,
  dungeonBossSprite,
  dungeonFoeSprite,
} from './creature-sprites';
import { expandRows, parseSprite, type SpriteDef } from './sprite-data';

const INK = '#0d0a1a';

const foes = dungeonContent.foes.filter((f) => f.kind === 'foe');
const roomBosses = dungeonContent.foes.filter((f) => f.kind === 'boss');

const entries: { id: string; element: string; kind: 'foe' | 'boss'; def: SpriteDef | undefined }[] =
  [
    ...foes.map((f) => ({
      id: f.id,
      element: f.element,
      kind: 'foe' as const,
      def: dungeonFoeSprite(f.id),
    })),
    ...roomBosses.map((f) => ({
      id: f.id,
      element: f.element,
      kind: 'boss' as const,
      def: dungeonBossSprite(f.id),
    })),
  ];

function silhouette(def: SpriteDef): string {
  return expandRows(def)
    .map((row) => row.replace(/[^.]/g, '#'))
    .join('/');
}

/** Hue (0-360) and saturation (0-1) of a `#rrggbb` colour. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, sat: d / max };
}

/** The hue range of each element's colour (the same hues as its creatures and the stylesheet). */
const ELEMENT_HUES: Readonly<Record<string, readonly [number, number]>> = {
  tide: [180, 235],
  ember: [0, 40],
  grove: [80, 150],
  spark: [40, 65],
};

describe('daily-dungeon sprites', () => {
  it('has 8 foes and 4 room bosses in the content, each with a sprite', () => {
    expect(foes).toHaveLength(8);
    expect(roomBosses).toHaveLength(4);
    for (const { id, kind, def } of entries) expect(def, `${kind} ${id}`).toBeDefined();
  });

  it('has no sprite for an id that is not in the dungeon content', () => {
    const foeIds = new Set(foes.map((f) => f.id));
    const bossIds = new Set(roomBosses.map((f) => f.id));
    for (const id of Object.keys(BUNDLED_DUNGEON_FOE_SPRITES))
      expect(foeIds.has(id), id).toBe(true);
    for (const id of Object.keys(BUNDLED_DUNGEON_BOSS_SPRITES))
      expect(bossIds.has(id), id).toBe(true);
  });

  it('draws foes at creature size and room bosses at boss size, with no unused palette keys', () => {
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      expect(() => parseSprite(def, kind === 'boss' ? BOSS_SIZE : CREATURE_SIZE), id).not.toThrow();
      const used = new Set(expandRows(def).join(''));
      for (const key of Object.keys(def.palette))
        expect(used.has(key), `${id} key ${key}`).toBe(true);
    }
  });

  it('has the shared ink outline, and no body colour reaches the canvas edge', () => {
    // A foe's legs, antennae or wing tips may touch the edge in a feature colour; a boss only in ink.
    const bodyKeys = ['b', 'h', 's'];
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      expect(def.palette.k, id).toBe(INK);
      const rows = expandRows(def);
      const last = rows.length - 1;
      for (const [y, row] of rows.entries()) {
        for (const [x, ch] of [...row].entries()) {
          if (x === 0 || y === 0 || x === row.length - 1 || y === last) {
            const where = `${id} ${String(x)},${String(y)}`;
            if (kind === 'boss') expect(['.', 'k'], where).toContain(ch);
            else expect(bodyKeys, where).not.toContain(ch);
          }
        }
      }
    }
  });

  it('uses a small palette and fills a sensible part of its canvas', () => {
    for (const { id, kind, def } of entries) {
      if (def === undefined) continue;
      expect(Object.keys(def.palette).length, id).toBeLessThanOrEqual(11);
      const { width, height, cells } = parseSprite(def);
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      const w = Math.max(...xs) - Math.min(...xs) + 1;
      const h = Math.max(...ys) - Math.min(...ys) + 1;
      expect(w, `${id} width`).toBeGreaterThanOrEqual(kind === 'boss' ? 16 : 10);
      expect(h, `${id} height`).toBeGreaterThanOrEqual(kind === 'boss' ? 16 : 10);
      expect(w).toBeLessThanOrEqual(width);
      expect(h).toBeLessThanOrEqual(height);
    }
  });

  it("is coloured in its foe's element (some saturated colour in the element's hue range)", () => {
    for (const { id, element, def } of entries) {
      if (def === undefined) continue;
      const range = ELEMENT_HUES[element];
      expect(range, `${id} element ${element}`).toBeDefined();
      if (range === undefined) continue;
      const fits = Object.values(def.palette).some((colour) => {
        const { hue, sat } = hueSat(colour);
        return sat >= 0.5 && hue >= range[0] && hue <= range[1];
      });
      expect(fits, id).toBe(true);
    }
  });

  it('has a different silhouette from every other sprite of the same size', () => {
    const seen = new Map<string, string>();
    const others: [string, SpriteDef | undefined][] = [
      ...content.creatures.map((c): [string, SpriteDef | undefined] => [
        c.id,
        creatureSprite(c.id),
      ]),
      ...content.bosses.map((b): [string, SpriteDef | undefined] => [b.id, bossSprite(b.id)]),
      ...entries.map((e): [string, SpriteDef | undefined] => [e.id, e.def]),
    ];
    for (const [id, def] of others) {
      if (def === undefined) continue;
      const shape = silhouette(def);
      expect(seen.get(shape), `${id} repeats ${seen.get(shape) ?? ''}`).toBeUndefined();
      seen.set(shape, id);
    }
  });

  it('draws room bosses with more pixels than any foe', () => {
    const count = (def: SpriteDef | undefined): number =>
      def === undefined ? 0 : parseSprite(def).cells.length;
    const biggestFoe = Math.max(...foes.map((f) => count(dungeonFoeSprite(f.id))));
    for (const b of roomBosses)
      expect(count(dungeonBossSprite(b.id)), b.id).toBeGreaterThan(biggestFoe);
  });

  it('finds sprites only for own ids, never through the prototype', () => {
    expect(dungeonFoeSprite('constructor')).toBeUndefined();
    expect(dungeonBossSprite('toString')).toBeUndefined();
    expect(dungeonFoeSprite('slag-tyrant')).toBeUndefined();
    expect(dungeonBossSprite('puddle-imp')).toBeUndefined();
  });
});

describe('the stage art for a dungeon room', () => {
  it('uses the foe or room boss sprite for every dungeon foe, never the silhouette', () => {
    for (const f of dungeonContent.foes) {
      const art = bossArt(f.id);
      expect(art.sprite, f.id).not.toBe(FALLBACK_SILHOUETTE);
      expect(art.sprite, f.id).toBe(
        f.kind === 'boss' ? dungeonBossSprite(f.id) : dungeonFoeSprite(f.id),
      );
    }
  });

  it('gives every sprite the same space on the stage (16x16 is drawn bigger than 24x24)', () => {
    const size = (id: string): number => {
      const art = bossArt(id);
      return parseSprite(art.sprite).width * art.scale;
    };
    const first = foes[0];
    const boss = roomBosses[0];
    expect(first).toBeDefined();
    expect(boss).toBeDefined();
    if (first === undefined || boss === undefined) return;
    expect(bossArt(first.id).scale).toBe(FALLBACK_BOSS_SCALE);
    expect(bossArt(boss.id).scale).toBe(BOSS_SCALE);
    expect(size(first.id)).toBe(size(boss.id));
  });

  it('still draws raid bosses as before, and unknown ids as the silhouette', () => {
    const raid = content.bosses[0];
    expect(raid).toBeDefined();
    if (raid !== undefined)
      expect(bossArt(raid.id)).toEqual({ sprite: bossSprite(raid.id), scale: BOSS_SCALE });
    expect(bossArt('no-such-boss')).toEqual({
      sprite: FALLBACK_SILHOUETTE,
      scale: FALLBACK_BOSS_SCALE,
    });
  });
});
