/**
 * The room layers in the scene (housing C5, `docs/design/housing-interior.md`): a house that chose nothing paints exactly as before
 * (the digests below were taken from the scene before the layers existed), and a chosen wallpaper, floor, trim, ceiling and frame draw
 * from the workshop's generators with the materials the night pass shades by.
 */
import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import { ART_PENDING, hasSkinArt, skinArt } from './house-art';
import { itemName } from './house-names';
import { rasterize } from './house-paint';
import { composeHouse, composeRoom, type Placement } from './house-scene';
import { COTTAGE, ESTATE, HUT, MANSION, THREE_FLOORS, sceneHouse } from './house-scene-sample';
import {
  canDrawPattern,
  ceilingTile,
  colourName,
  floorTileOf,
  frameArt,
  lookPicture,
  trimTile,
  wallTile,
} from './interior-art';

function fnv(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The day picture of the sample houses and every room of the estate, as painted before the room layers existed. */
const BEFORE: Readonly<Record<string, string>> = {
  hut: 'c515791f',
  cottage: 'dfdadcde',
  three: 'a3a4bcf6',
  mansion: '38638f22',
  estate: 'a1167f7b',
  'tower:observatory': '58d4f33c',
  'tower:landing': 'e3a40875',
  'house:attic': '735dfb18',
  'west-upper:gallery': '046dd7ae',
  'cottage:loft': '9ede8851',
  'house:study': '0e15d2e7',
  'east-upper:bath': 'c3342bb6',
  'east-upper:guest': 'fb3c8af6',
  'balcony:balcony': '327457ce',
  'pond:pond': '94867156',
  'terrace:terrace': '33a9bedf',
  'west-wing:hall': '8637ebff',
  'hut:hearth': '2c22e712',
  'cottage:kitchen': '110bdac8',
  'east-wing:conservatory': '3f1f29d6',
  'garden:garden': '4d3d00f8',
  'pool:pool': 'be8681ec',
  'orchard:orchard': 'fc68ea7d',
  'cellar:cellar': '83424e71',
};

const HEARTH = 'hut:hearth';

describe('a house that chose no layers', () => {
  it('paints exactly as before, house and rooms, by day', () => {
    const seen: Record<string, string> = {};
    for (const [name, parts] of [
      ['hut', HUT],
      ['cottage', COTTAGE],
      ['three', THREE_FLOORS],
      ['mansion', MANSION],
      ['estate', ESTATE],
    ] as const) {
      const house = sceneHouse({ parts, housemates: 3 });
      const m = composeHouse(house);
      seen[name] = fnv(rasterize([...m.back, ...m.front], m.width, m.height));
      if (name !== 'estate') continue;
      for (const room of house.rooms) {
        const r = composeRoom(house, room.id);
        if (r !== null) seen[room.id] = fnv(rasterize([...r.back, ...r.front], r.width, r.height));
      }
    }
    expect(seen).toEqual(BEFORE);
  });
});

describe('the layers in the scene', () => {
  const looks = {
    [HEARTH]: {
      wall: 'paper-damask:sage',
      floor: 'floor-parquet:walnut',
      trim: 'trim-wainscot:dark-walnut',
      ceiling: 'ceiling-beamed:white-oak',
    },
  };
  const house = sceneHouse({ parts: COTTAGE, frame: 'frame-painted:blue', looks });
  const room = composeRoom(house, HEARTH);
  const has = (list: readonly Placement[], sprite: unknown, mat: string): boolean =>
    list.some((p) => p.sprite === sprite && p.mat === mat);

  it('draws the generated paper and floor tiles, tagged wall and floor', () => {
    if (room === null) throw new Error('no room');
    expect(has(room.back, wallTile('paper-damask:sage'), 'wall')).toBe(true);
    expect(has(room.back, floorTileOf('floor-parquet:walnut'), 'floor')).toBe(true);
  });

  it('draws the ceiling and the trim over the paper and under the furniture, tagged wall', () => {
    if (room === null) throw new Error('no room');
    const ceiling = ceilingTile('ceiling-beamed:white-oak', 112);
    const trim = trimTile('trim-wainscot:dark-walnut', 11);
    expect(has(room.back, ceiling, 'wall')).toBe(true);
    expect(has(room.back, trim, 'wall')).toBe(true);
    const at = (s: unknown) => room.back.findIndex((p) => p.sprite === s);
    const paper = at(wallTile('paper-damask:sage'));
    const firstPiece = room.back.findIndex((p) => p.mat === 'window' || p.mat === 'light');
    expect(paper).toBeLessThan(at(ceiling));
    expect(at(ceiling)).toBeLessThan(at(trim));
    expect(at(trim)).toBeLessThan(firstPiece);
  });

  it('draws the frame for the slabs and the inner posts, tagged exterior; the cut edge keeps the walls skin', () => {
    const model = composeHouse(house);
    const frame = frameArt('frame-painted:blue');
    if (frame === undefined) throw new Error('no frame');
    expect(has(model.back, frame.slab, 'exterior')).toBe(true);
    expect(has(model.front, frame.post, 'exterior')).toBe(true);
    const walls = skinArt(house.exterior.walls, 'walls').tile;
    expect(has(model.front, walls, 'exterior')).toBe(true);
  });

  it('changes the picture only where a layer was chosen, and the night pass shades it', () => {
    const plain = sceneHouse({ parts: COTTAGE });
    const a = composeRoom(plain, HEARTH);
    if (a === null || room === null) throw new Error('no room');
    const day = (m: typeof a) => fnv(rasterize([...m.back, ...m.front], m.width, m.height));
    expect(day(room)).not.toBe(day(a));
    const night = composeRoom(house, HEARTH, { phase: 'night' });
    if (night === null) throw new Error('no room');
    expect(
      fnv(rasterize([...night.back, ...night.front], night.width, night.height, night.lighting)),
    ).not.toBe(day(room));
  });

  it('a top-floor rafters ceiling and a ceiling in a two-cell room are as wide as the room', () => {
    const wide = ceilingTile('ceiling-rafters:dark', 224);
    expect(wide?.rows[0]?.length).toBe(224);
    expect(ceilingTile('ceiling-plain:stone', 112)?.rows[0]?.length).toBe(112);
  });

  it('keeps generated tiles once per pattern and colour', () => {
    expect(wallTile('paper-floral:rose')).toBe(wallTile('paper-floral:rose'));
    expect(wallTile('paper-floral:rose')).not.toBe(wallTile('paper-floral:sky'));
  });
});

describe('the art of the patterns', () => {
  it('can draw every generated skin of the content in every colour it lists', () => {
    for (const skin of housing.skins.filter((s) => s.gen !== undefined)) {
      expect(canDrawPattern(skin), skin.id).toBe(true);
      expect(hasSkinArt(skin.id), skin.id).toBe(true);
      expect(ART_PENDING.has(skin.id), skin.id).toBe(false);
      for (const colour of skin.gen?.colours ?? []) {
        expect(lookPicture(`${skin.id}:${colour}`)?.rows.length, `${skin.id}:${colour}`).toBe(16);
      }
    }
  });

  it('a pattern alone pictures its first colour', () => {
    expect(lookPicture('paper-damask')).toBe(lookPicture('paper-damask:cream'));
    expect(lookPicture('cosy-wall')).toBeUndefined();
    expect(lookPicture('paper-damask:oak')).toBeUndefined();
  });

  it('names a look by its pattern and colour', () => {
    expect(itemName('paper-damask:rose')).toBe('Damask Paper, Rose');
    expect(itemName('trim-wainscot:dark-walnut')).toBe('Wainscot, Walnut panelling');
    expect(itemName('ceiling-beamed:white-oak')).toBe('Beamed Ceiling, White and oak');
    expect(itemName('frame-timber:oak')).toBe('Timber Frame, Oak');
    expect(itemName('cosy-wall')).toBe('Cosy Wallpaper');
    expect(colourName('floor', 'walnut')).toBe('Walnut');
  });
});
