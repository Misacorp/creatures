import { describe, expect, it } from 'vitest';
import { RESOURCE_KINDS, canPlace, loadHousingContent } from '../src/index';
import {
  FIXTURE_CTX,
  fixtureResources,
  housingFixture,
  housingFixtureRaw,
} from './housing-fixture';

type Raw = ReturnType<typeof housingFixtureRaw>;

function load(mutate: (raw: Raw) => void, resources = fixtureResources()) {
  const raw = housingFixtureRaw();
  mutate(raw);
  return () => loadHousingContent(raw, resources, FIXTURE_CTX);
}

describe('housing content loader', () => {
  it('loads the fixture and knows the luxury resource kind', () => {
    const content = housingFixture();
    expect(content.parts.map((p) => p.id)).toEqual(['hut', 'cottage', 'wing']);
    expect(RESOURCE_KINDS).toContain('luxury');
  });

  it('rejects an unknown key (strict objects)', () => {
    expect(load((r) => Object.assign(r.forms[0] ?? {}, { extra: 1 }))).toThrow(
      /housing content: forms\.0/,
    );
  });

  it('rejects control characters in a name', () => {
    expect(load((r) => ((r.forms[0] ?? { name: '' }).name = 'Be‮d'))).toThrow(/plain text/);
  });

  const cases: [string, (r: Raw) => void, RegExp][] = [
    [
      'a duplicate id across pieces and skins',
      (r) => ((r.skins[0] ?? { id: '' }).id = 'stool-plain'),
      /appears twice/,
    ],
    [
      'a piece with an unknown form',
      (r) => ((r.pieces[0] ?? { form: '' }).form = 'nope'),
      /unknown form "nope"/,
    ],
    [
      'a piece with an unknown set',
      (r) => ((r.pieces[0] ?? { set: '' }).set = 'nope'),
      /unknown set "nope"/,
    ],
    [
      'a room with a repeated spot id',
      (r) => ((r.rooms[0]?.spots[1] ?? { id: '' }).id = 'window'),
      /spot id "window" appears twice/,
    ],
    [
      'a spot outside its cells',
      (r) => ((r.rooms[0]?.spots[2] ?? { x: 0 }).x = 100),
      /past its 112 px/,
    ],
    [
      'a display spot without a display kind',
      (r) => delete (r.rooms[0]?.spots[4] as { display?: string } | undefined)?.display,
      /without a display kind/,
    ],
    [
      'a part with an unknown room kind',
      (r) => ((r.parts[1]?.rooms[0] ?? { kind: '' }).kind = 'nope'),
      /unknown room kind "nope"/,
    ],
    [
      'two parts claiming one cell',
      (r) => ((r.parts[1]?.rooms[0] ?? { col: 0 }).col = 0),
      /both claim column 0, floor 0/,
    ],
    [
      'a requires that names no part',
      (r) => ((r.parts[1] ?? { requires: [] as string[] }).requires = ['nope']),
      /requires unknown part "nope"/,
    ],
    [
      'a requires cycle',
      (r) => {
        const hut = r.parts[0];
        if (hut !== undefined) hut.requires = ['cottage'];
      },
      /cycle/,
    ],
    [
      'a wing without a side',
      (r) => delete (r.parts[2] as { side?: string } | undefined)?.side,
      /needs a side/,
    ],
    [
      'a price naming an unknown material',
      (r) => (((r.parts[1]?.price[3] ?? { id: '' }) as { id: string }).id = 'nope'),
      /unknown material "nope"/,
    ],
    [
      'a part price with the same line twice',
      (r) => r.parts[1]?.price.push({ kind: 'bait', amount: 1 }),
      /price has the line "bait" twice/,
    ],
    [
      'a part other than the hut with an empty price',
      (r) => ((r.parts[1] ?? { price: [] as unknown[] }).price = []),
      /part "cottage" has an empty price/,
    ],
    [
      'a piece with an empty price',
      (r) => Object.assign(r.pieces[0] ?? {}, { price: [] }),
      /has an empty price/,
    ],
    [
      'a stamp naming an unknown journal set',
      (r) => {
        r.stamps.push({
          id: 'page',
          name: 'Page',
          unlock: { kind: 'journal-set', set: 'nope' } as never,
          line: 'x',
          hint: 'x',
        });
      },
      /unknown journal set "nope"/,
    ],
    [
      'a stamp naming an unknown boss',
      (r) => {
        r.stamps.push({
          id: 'boss',
          name: 'Boss',
          unlock: { kind: 'raid-boss', boss: 'nope' } as never,
          line: 'x',
          hint: 'x',
        });
      },
      /unknown boss "nope"/,
    ],
    [
      'a stamp naming an unknown part',
      (r) => {
        r.stamps.push({
          id: 'built',
          name: 'Built',
          unlock: { kind: 'house-part', part: 'nope' } as never,
          line: 'x',
          hint: 'x',
        });
      },
      /unknown part "nope"/,
    ],
    [
      'a feat piece naming no stamp',
      (r) => ((r.pieces[4] ?? { unlock: {} }).unlock = { kind: 'feat', stamp: 'nope' }),
      /unknown stamp "nope"/,
    ],
    [
      'a material at an unknown place',
      (r) => ((r.materials[0] ?? { places: [] as string[] }).places = ['nowhere']),
      /unknown place "nowhere"/,
    ],
    [
      'a set at an unknown boss',
      (r) => ((r.sets[0] ?? { sources: { bosses: [] as string[] } }).sources.bosses = ['nobody']),
      /unknown boss "nobody"/,
    ],
    [
      'a part teaching an unknown item',
      (r) => ((r.parts[1] ?? { unlocks: [] as string[] }).unlocks = ['nope']),
      /unknown item "nope"/,
    ],
    [
      'a starter layout piece that does not fit',
      (r) => (r.starter.layout['floor-b'] = 'reef-bed'),
      /does not fit spot "floor-b"/,
    ],
    [
      'a starter layout piece that does not exist',
      (r) => (r.starter.layout['floor-b'] = 'nope'),
      /unknown piece "nope"/,
    ],
    ['a starter roof that is not a roof', (r) => (r.starter.roof = 'plaster'), /not a roof skin/],
  ];
  for (const [name, mutate, message] of cases) {
    it(`rejects ${name}`, () => {
      expect(load(mutate)).toThrow(message);
    });
  }

  it('rejects a material with no resource entry, and one of the wrong kind', () => {
    expect(
      load(
        () => undefined,
        fixtureResources().filter((r) => r.id !== 'oak'),
      ),
    ).toThrow(/material "oak" has no resources.json entry/);
    const wrong = fixtureResources().map((r) =>
      r.id === 'oak' ? { ...r, kind: 'material' as const } : r,
    );
    expect(load(() => undefined, wrong)).toThrow(/not "luxury"/);
  });

  it('canPlace checks the spot type, the width and display spots', () => {
    const c = housingFixture();
    expect(canPlace(c, 'hearth', 'floor-a', 'reef-bed')).toBe(true);
    expect(canPlace(c, 'hearth', 'floor-b', 'reef-bed')).toBe(false); // wrong type
    expect(canPlace(c, 'hearth', 'floor-b', 'stool-plain')).toBe(true);
    expect(canPlace(c, 'hearth', 'mantel', 'stool-plain')).toBe(false); // display spot
    expect(canPlace(c, 'hearth', 'nope', 'stool-plain')).toBe(false);
    expect(canPlace(c, 'hearth', 'ceiling', 'lamp-plain')).toBe(true);
    const narrow = housingFixtureRaw();
    (narrow.rooms[0]?.spots[3] as { w: number }).w = 10;
    delete (narrow.starter.layout as Record<string, string>)['floor-b'];
    const loaded = loadHousingContent(narrow, fixtureResources(), FIXTURE_CTX);
    expect(canPlace(loaded, 'hearth', 'floor-b', 'stool-plain')).toBe(false); // 16 px box in a 10 px spot
  });
});
