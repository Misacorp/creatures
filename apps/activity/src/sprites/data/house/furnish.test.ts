import { describe, expect, it } from 'vitest';
import { spriteSize, validateSprite } from '../../sprite-data';
import { HOUSE_ART as COSY } from './cosy';
import { HOUSE_ART as GARDEN } from './garden';
import { HOUSE_ART as WILD } from './wild';

/** The form boxes of `docs/design/housing.md` 2.5 for the pieces of these packs. */
const BOX: Record<string, [number, number]> = {
  'cosy-sofa': [64, 36],
  'cosy-table': [44, 18],
  'cosy-chair': [18, 18],
  'cosy-stool': [16, 12],
  'cosy-lamp': [20, 16],
  'cosy-plant': [16, 20],
  'cosy-hearth': [36, 36],
  'cosy-rug': [56, 10],
  'cosy-seat': [20, 12],
  'cosy-beanbag': [20, 12],
  'cosy-cushion': [20, 12],
  'cosy-shelf': [30, 36],
  'cosy-clock': [16, 16],
  'cosy-frame': [24, 16],
  'cosy-curtains': [36, 26],
  'cosy-bed': [48, 26],
  'cosy-cupboard': [30, 36],
  'cosy-shelf-wall': [40, 20],
  'rocking-chair': [18, 18],
  hammock: [48, 26],
  'reef-tank': [20, 40],
  'tall-clock': [20, 40],
  'cuckoo-clock': [16, 16],
  'wayfarer-globe': [16, 12],
  'music-box': [16, 12],
  'moss-terrarium': [16, 20],
  'star-chart': [40, 20],
  'old-map': [40, 20],
  'wind-chime': [20, 16],
  'paper-mobile': [20, 16],
  'stone-fountain': [40, 40],
  'mossback-topiary': [40, 40],
  'rose-arbor': [40, 40],
  flowerbed: [20, 20],
  'lantern-post': [20, 20],
  birdbath: [20, 20],
  'garden-bench': [20, 20],
  sundial: [20, 20],
  hedge: [16, 12],
  'picket-fence': [16, 12],
  lounger: [32, 20],
  'swim-ring': [24, 10],
};

const PACKS = { cosy: COSY, wild: WILD, garden: GARDEN };

describe('housing furniture art (batch E4)', () => {
  it('has a piece for every id of the plan: 18 Cosy, 12 wild, 12 garden', () => {
    expect(Object.keys(COSY.pieces ?? {})).toHaveLength(18);
    expect(Object.keys(WILD.pieces ?? {})).toHaveLength(12);
    expect(Object.keys(GARDEN.pieces ?? {})).toHaveLength(12);
  });

  it('fits every piece in its form box and parses every layer', () => {
    for (const [pack, art] of Object.entries(PACKS)) {
      for (const [id, piece] of Object.entries(art.pieces ?? {})) {
        const box = BOX[id];
        expect(box, `${pack}/${id} has a box`).toBeDefined();
        validateSprite(piece.sprite);
        const { width, height } = spriteSize(piece.sprite);
        expect(width, `${id} width`).toBeLessThanOrEqual(box?.[0] ?? 0);
        expect(height, `${id} height`).toBeLessThanOrEqual(box?.[1] ?? 0);
        if (piece.front !== undefined) {
          validateSprite(piece.front, { width, height });
        }
        if (piece.glow !== undefined) validateSprite(piece.glow);
      }
    }
  });

  it('gives beds a sleep anchor that fits a 16x16 creature inside the piece', () => {
    for (const id of ['cosy-bed', 'hammock']) {
      const piece = COSY.pieces?.[id] ?? WILD.pieces?.[id];
      const { width, height } = spriteSize(piece?.sprite ?? { rows: ['.'], palette: {} });
      expect(piece?.sleep, id).toBeDefined();
      expect((piece?.sleep?.x ?? 0) + 16).toBeLessThanOrEqual(width);
      expect((piece?.sleep?.y ?? 0) + 16).toBeLessThanOrEqual(height);
      expect(piece?.front, id).toBeDefined();
    }
  });

  it('cuts the starter wallpaper (16x52) and floor (16x8) from the room', () => {
    expect(spriteSize(COSY.skins?.['cosy-wall']?.tile ?? { rows: ['.'], palette: {} })).toEqual({
      width: 16,
      height: 52,
    });
    expect(spriteSize(COSY.skins?.['cosy-floor']?.tile ?? { rows: ['.'], palette: {} })).toEqual({
      width: 16,
      height: 8,
    });
  });
});
