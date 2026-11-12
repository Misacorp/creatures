import { describe, expect, it } from 'vitest';
import { housing } from '../src/content/housing';
import {
  checkLook,
  defaultLook,
  groundChoices,
  ownedByRule,
  skinFitsRoom,
  HOUSING_RULES,
  knownBlueprints,
  loadHousingContent,
  lookValue,
  ownsSkin,
  parseLook,
  rollHouseDrops,
  createSeededRng,
  skinPrice,
  type HousingContent,
} from '../src/index';
import { FIXTURE_CTX, fixtureResources, housingFixtureRaw } from './housing-fixture';

/** The generated room layers (`docs/design/housing-interior.md`, housing C5): looks, ownership by pattern, prices and sources. */
const skin = (id: string) => {
  const s = housing.skins.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no skin ${id}`);
  return s;
};

describe('look values', () => {
  it('reads a drawn skin and a generated skin in a colour', () => {
    expect(parseLook('cosy-wall')).toEqual({ skin: 'cosy-wall', colour: null });
    expect(parseLook('paper-damask:rose')).toEqual({ skin: 'paper-damask', colour: 'rose' });
    expect(parseLook('trim-wainscot:paint-white')).toEqual({
      skin: 'trim-wainscot',
      colour: 'paint-white',
    });
    expect(lookValue('paper-damask', 'rose')).toBe('paper-damask:rose');
    expect(lookValue('cosy-wall', null)).toBe('cosy-wall');
  });

  it('rejects anything not of the shape id or id:colour', () => {
    for (const bad of [
      '',
      'A',
      'a:b:c',
      'paper-damask:',
      ':rose',
      'a b',
      'a:B',
      `a:${'x'.repeat(70)}`,
    ]) {
      expect(parseLook(bad), bad).toBeNull();
    }
  });

  it('checks the skin, its kind and its colour', () => {
    expect(checkLook(housing, 'paper-damask:rose', 'wall')).toBeNull();
    expect(checkLook(housing, 'cosy-wall', 'wall')).toBeNull();
    expect(checkLook(housing, 'paper-damask', 'wall')).toBe('bad_colour');
    expect(checkLook(housing, 'paper-damask:oak', 'wall')).toBe('bad_colour');
    expect(checkLook(housing, 'cosy-wall:rose', 'wall')).toBe('bad_colour');
    expect(checkLook(housing, 'paper-damask:rose', 'floor')).toBe('skin_mismatch');
    expect(checkLook(housing, 'paper-nothing:rose', 'wall')).toBe('not_found');
    expect(checkLook(housing, 'frame-stone:grey', 'frame')).toBeNull();
    expect(checkLook(housing, 'frame-stone:rose', 'frame')).toBe('bad_colour');
  });

  it('keeps starry to dark colours', () => {
    expect(checkLook(housing, 'paper-starry:midnight', 'wall')).toBeNull();
    expect(checkLook(housing, 'paper-starry:cream', 'wall')).toBe('bad_colour');
  });

  it('owns a starter by rule and anything else by a held row', () => {
    expect(ownsSkin(skin('paper-plain'), false)).toBe(true);
    expect(ownsSkin(skin('paper-damask'), false)).toBe(false);
    expect(ownsSkin(skin('paper-damask'), true)).toBe(true);
  });

  it('shows a pattern in its first colour', () => {
    expect(defaultLook(skin('paper-plain'))).toBe('paper-plain:cream');
    expect(defaultLook(skin('cosy-wall'))).toBe('cosy-wall');
  });
});

describe('generated skins in the content', () => {
  const gen = housing.skins.filter((s) => s.gen !== undefined);

  it('has the starters of the plan: plain and pinstripe, long boards, skirting, a plain ceiling, timber', () => {
    expect(gen.filter((s) => s.unlock.kind === 'starter').map((s) => s.id)).toEqual([
      'paper-plain',
      'paper-pinstripe',
      'floor-boards',
      'trim-skirting',
      'ceiling-plain',
      'frame-timber',
    ]);
  });

  it('leaves out the cobble floor and harlequin paper', () => {
    expect(gen.some((s) => s.gen?.pattern === 'cobble' || s.gen?.pattern === 'harlequin')).toBe(
      false,
    );
  });

  it('prices a pattern once by its tier, for every colour; starters are free', () => {
    const p = HOUSING_RULES.price.pattern;
    expect(skinPrice(housing, 'paper-plain')).toEqual([]);
    expect(skinPrice(housing, 'paper-stripes')).toEqual([
      { kind: 'bait', amount: p[1].bait },
      { kind: 'scrap', amount: p[1].scrap },
    ]);
    expect(skinPrice(housing, 'paper-brick')).toEqual([
      { kind: 'bait', amount: p[2].bait },
      { kind: 'scrap', amount: p[2].scrap },
      { kind: 'family', family: 'stone', amount: p[2].family },
    ]);
    expect(skinPrice(housing, 'paper-damask')).toEqual([
      { kind: 'bait', amount: p[3].bait },
      { kind: 'scrap', amount: p[3].scrap },
      { kind: 'family', family: 'cloth', amount: p[3].family },
    ]);
    for (const s of gen) {
      if (s.unlock.kind !== 'starter')
        expect(skinPrice(housing, s.id).length, s.id).toBeGreaterThan(0);
    }
  });

  it('makes the workbench patterns known with the hut, the rest from drops and feats', () => {
    const known = knownBlueprints(housing, new Set(), new Set(['hut']));
    expect(known.has('paper-stripes')).toBe(true);
    expect(known.has('frame-painted')).toBe(true);
    expect(known.has('paper-damask')).toBe(false);
    expect(known.has('paper-starry')).toBe(false);
  });

  it('drops a wild pattern blueprint from its own sources', () => {
    const only = (id: string): HousingContent => ({
      ...housing,
      pieces: housing.pieces.filter((p) => p.unlock.kind !== 'drop'),
      skins: housing.skins.filter((s) => s.unlock.kind !== 'drop' || s.id === id),
    });
    const rule = HOUSING_RULES.drops.raid;
    let seen = 0;
    for (let seed = 1; seed < 200 && seen === 0; seed++) {
      const drop = rollHouseDrops(
        createSeededRng(`looks-${String(seed)}`),
        only('paper-damask'),
        {
          kind: 'raid',
          key: 'k',
          weekId: 'w',
          bossId: 'tidal-colossus',
          rank: 1,
          cleared: true,
          festival: null,
        },
        { blueprints: new Set(), stamps: new Set() },
      );
      if (drop.blueprint === 'paper-damask') seen++;
    }
    expect(rule.blueprintPct).toBeGreaterThan(0);
    expect(seen).toBe(1);
    // a dungeon never drops it
    for (let seed = 1; seed < 200; seed++) {
      const drop = rollHouseDrops(
        createSeededRng(`looks-${String(seed)}`),
        only('paper-damask'),
        { kind: 'dungeon', key: 'k', depth: 10, cleared: true },
        { blueprints: new Set(), stamps: new Set() },
      );
      expect(drop.blueprint).toBeNull();
    }
  });
});

describe('the loader checks generated skins', () => {
  const base = {
    id: 'trim-test',
    name: 'Test Trim',
    kind: 'trim',
    set: null,
    unlock: { kind: 'part', part: 'hut' },
    gen: { pattern: 'skirting', colours: ['paint-white'], tier: 1 },
    hint: 'A test.',
  };
  const load = (extra: object) => () => {
    const raw = housingFixtureRaw();
    (raw.skins as unknown[]).push(extra);
    return loadHousingContent(raw, fixtureResources(), FIXTURE_CTX);
  };

  it('accepts a well-formed one', () => {
    expect(load(base)).not.toThrow();
  });

  it('wants a pattern on a trim, ceiling or frame skin', () => {
    const bare: Partial<typeof base> = { ...base };
    delete bare.gen;
    expect(load(bare)).toThrow(/without a pattern/);
  });

  it('never generates a roof or ground', () => {
    expect(load({ ...base, kind: 'roof' })).toThrow(/cannot be generated/);
  });

  it('rejects a colour listed twice, a tier 2 without a family and a drop without sources', () => {
    expect(load({ ...base, gen: { ...base.gen, colours: ['a', 'a'] } })).toThrow(/colour twice/);
    expect(load({ ...base, gen: { ...base.gen, tier: 2 } })).toThrow(/material family/);
    expect(load({ ...base, unlock: { kind: 'drop' } })).toThrow(/no sources/);
  });
});

describe('ground skins fit room kinds', () => {
  it('lists only the skins that fit, by the content (what the picker shows)', () => {
    const ids = (room: string) => groundChoices(housing, room).map((s) => s.id);
    expect(ids('garden')).toEqual(['lawn']);
    expect(ids('pond')).toEqual(['lawn']);
    expect(ids('terrace')).toEqual(['deck']);
    expect(ids('balcony')).toEqual(['deck']);
    expect(ids('pool')).toEqual(['pool-tile']);
    expect(ids('orchard')).toEqual(['orchard-apple', 'orchard-plum', 'orchard-pear']);
    expect(ids('hearth')).toEqual([]);
  });

  it('refuses a ground skin on a room kind it does not fit', () => {
    expect(checkLook(housing, 'lawn', 'ground', 'garden')).toBeNull();
    expect(checkLook(housing, 'orchard-plum', 'ground', 'garden')).toBe('skin_mismatch');
    expect(checkLook(housing, 'orchard-apple', 'ground', 'balcony')).toBe('skin_mismatch');
    expect(checkLook(housing, 'lawn', 'ground', 'pool')).toBe('skin_mismatch');
    expect(skinFitsRoom(skin('cosy-wall'), 'hearth')).toBe(true);
  });

  it('every room default is a drawn skin of the right kind that fits its room', () => {
    for (const room of housing.rooms) {
      for (const id of [room.wall, room.floor]) {
        expect(
          checkLook(
            housing,
            id,
            room.outdoor ? 'ground' : id === room.wall ? 'wall' : 'floor',
            room.id,
          ),
        ).toBeNull();
      }
    }
  });

  it('owns a starter always and a part ground skin once the part is built', () => {
    expect(ownedByRule(skin('lawn'))).toBe(true);
    expect(ownedByRule(skin('orchard-plum'))).toBe(false);
    expect(ownedByRule(skin('orchard-plum'), (id) => id === 'orchard')).toBe(true);
    expect(ownedByRule(skin('orchard-plum'), (id) => id === 'pond')).toBe(false);
    expect(ownsSkin(skin('orchard-plum'), true)).toBe(true);
    expect(ownedByRule(skin('slate'), () => true)).toBe(false);
  });
});

describe('the loader checks fits, room defaults and look length', () => {
  const load = (edit: (raw: ReturnType<typeof housingFixtureRaw>) => void) => () => {
    const raw = housingFixtureRaw();
    edit(raw);
    return loadHousingContent(raw, fixtureResources(), FIXTURE_CTX);
  };
  const skinOf = (raw: ReturnType<typeof housingFixtureRaw>, id: string) => {
    const found = raw.skins.find((x) => x.id === id);
    if (found === undefined) throw new Error(id);
    return found as Record<string, unknown>;
  };

  it('wants a ground skin to fit at least one known outdoor room, and no other skin to list rooms', () => {
    expect(load(() => undefined)).not.toThrow();
    const moss = (fits?: string[]) => (raw: ReturnType<typeof housingFixtureRaw>) => {
      const extra: Record<string, unknown> = { ...skinOf(raw, 'lawn'), id: 'moss' };
      if (fits === undefined) delete extra.fits;
      else extra.fits = fits;
      raw.skins.push(extra as never);
    };
    expect(load(moss(['paddock']))).not.toThrow();
    expect(load(moss())).toThrow(/fits no room/);
    expect(load(moss(['nowhere']))).toThrow(/unknown room kind/);
    expect(load(moss(['hearth']))).toThrow(/not an outdoor room/);
    expect(load((raw) => (skinOf(raw, 'plain-wall').fits = ['paddock']))).toThrow(
      /cannot list room kinds/,
    );
  });

  it('checks a room default is of the right kind, drawn, and fits', () => {
    expect(load((raw) => (raw.rooms[0]!.wall = 'lawn'))).toThrow(
      /default wall "lawn" is a ground skin, not wall/,
    );
    expect(load((raw) => (raw.rooms[0]!.floor = 'thatch'))).toThrow(/default floor "thatch"/);
    expect(load((raw) => (raw.rooms[2]!.floor = 'plain-floor'))).toThrow(/not ground/);
    expect(load((raw) => (skinOf(raw, 'lawn').fits = ['paddock']))).not.toThrow();
    expect(
      load((raw) => {
        skinOf(raw, 'lawn').fits = ['paddock'];
        raw.rooms[2]!.wall = 'deck';
        raw.skins.push({ ...skinOf(raw, 'lawn'), id: 'deck', fits: ['nook'] } as never);
      }),
    ).toThrow();
    const gen = { pattern: 'p', colours: ['paint-white'], tier: 1 };
    expect(
      load((raw) => {
        raw.skins.push({ ...skinOf(raw, 'plain-wall'), id: 'gen-wall', gen } as never);
        raw.rooms[0]!.wall = 'gen-wall';
      }),
    ).toThrow(/is generated/);
  });

  it('keeps a generated skin look within 64 characters', () => {
    const long = 'a'.repeat(31);
    const make = (id: string, colour: string) =>
      load((raw) => {
        raw.skins.push({
          id,
          name: 'x',
          kind: 'trim',
          set: null,
          unlock: { kind: 'starter' },
          gen: { pattern: 'p', colours: [colour], tier: 1 },
          hint: 'x',
        } as never);
      });
    expect(make(long, 'a'.repeat(32))).not.toThrow(); // 31 + 1 + 32 = 64
    expect(make('a'.repeat(32), 'a'.repeat(32))).toThrow(/longer than 64/); // 65
  });
});
