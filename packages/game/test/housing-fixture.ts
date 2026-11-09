/**
 * A small hand-made housing content for the housing tests (not the shipped content): three parts, two room kinds, one set,
 * two materials and three stamps, plus the wild and starter pieces the rules need. Each call returns a fresh copy, so a test
 * may break it on purpose.
 */
import {
  loadHousingContent,
  type HousingContent,
  type HousingLoadContext,
  type ResourceDef,
} from '../src/index';

export const FIXTURE_CTX: HousingLoadContext = {
  journalSets: ['ledger'],
  bosses: ['colossus'],
  destinations: ['reef'],
};

export function fixtureResources(): ResourceDef[] {
  return [
    {
      id: 'oak',
      kind: 'luxury',
      name: 'Oak',
      plural: 'Oak',
      icon: { kind: 'glyph', id: 'lux-oak' },
    },
    {
      id: 'opal',
      kind: 'luxury',
      name: 'Opal',
      plural: 'Opals',
      icon: { kind: 'glyph', id: 'lux-opal' },
    },
    {
      id: 'gold',
      kind: 'luxury',
      name: 'Gold',
      plural: 'Gold',
      icon: { kind: 'glyph', id: 'lux-gold' },
    },
  ];
}

const text = { line: 'A line.', hint: 'A hint.' };

/** The raw files, as `loadHousingContent` takes them. */
export function housingFixtureRaw() {
  return {
    forms: [
      {
        id: 'bed',
        name: 'Bed',
        spot: 'floor-large',
        box: { w: 48, h: 26 },
        bed: true,
        size: 'large',
      },
      { id: 'stool', name: 'Stool', spot: 'floor-small', box: { w: 16, h: 12 }, size: 'small' },
      { id: 'lamp', name: 'Lamp', spot: 'ceiling', box: { w: 20, h: 16 }, size: 'small' },
      { id: 'curtains', name: 'Curtains', spot: 'window', box: { w: 36, h: 26 }, size: 'small' },
    ],
    rooms: [
      {
        id: 'hearth',
        name: 'Hearth',
        outdoor: false,
        cells: { w: 1, h: 1 },
        spots: [
          { id: 'window', type: 'window', x: 4, w: 36, y: 8 },
          { id: 'ceiling', type: 'ceiling', x: 44, w: 20, y: 0 },
          { id: 'floor-a', type: 'floor-large', x: 60, w: 48 },
          { id: 'floor-b', type: 'floor-small', x: 8, w: 16 },
          {
            id: 'mantel',
            type: 'display',
            x: 40,
            w: 20,
            y: 20,
            display: 'raid-plaques',
            layout: 'one',
          },
        ],
        fixtures: ['workbench', 'mailbox'],
        wall: 'plain-wall',
        floor: 'plain-floor',
      },
      {
        id: 'nook',
        name: 'Nook',
        outdoor: false,
        cells: { w: 1, h: 1 },
        spots: [
          { id: 'window', type: 'window', x: 4, w: 36, y: 8 },
          { id: 'floor-a', type: 'floor-large', x: 60, w: 48 },
        ],
        fixtures: [],
        wall: 'plain-wall',
        floor: 'plain-floor',
      },
    ],
    parts: [
      {
        id: 'hut',
        name: 'Hut',
        kind: 'core',
        requires: [],
        rooms: [{ key: 'hearth', kind: 'hearth', col: 0, floor: 0 }],
        price: [],
        unlocks: [],
        line: 'One room.',
        order: 0,
      },
      {
        id: 'cottage',
        name: 'Cottage',
        kind: 'core',
        requires: ['hut'],
        rooms: [{ key: 'nook', kind: 'nook', col: 1, floor: 0 }],
        price: [
          { kind: 'bait', amount: 10 },
          { kind: 'scrap', amount: 20 },
          { kind: 'shard', element: 'mire', amount: 4 },
          { kind: 'material', id: 'opal', amount: 2 },
          { kind: 'family', family: 'wood', amount: 3 },
        ],
        unlocks: ['slate'],
        line: 'Two rooms.',
        order: 1,
      },
      {
        id: 'wing',
        name: 'Wing',
        kind: 'wing',
        requires: ['cottage'],
        rooms: [{ key: 'nook', kind: 'nook', col: 0, floor: 0 }],
        price: [{ kind: 'bait', amount: 50 }],
        side: 'west',
        unlocks: [],
        line: 'A wing.',
        order: 2,
      },
    ],
    materials: [
      {
        id: 'oak',
        family: 'wood',
        element: 'tide',
        rare: false,
        places: ['reef'],
        fights: ['raid', 'dungeon'],
        ...text,
      },
      {
        id: 'opal',
        family: 'stone',
        element: 'tide',
        rare: true,
        places: ['reef'],
        fights: ['raid', 'games'],
        ...text,
      },
    ],
    sets: [
      {
        id: 'reef',
        name: 'Reef',
        element: 'tide',
        tier: 1,
        primary: { material: 'oak' },
        accent: { family: 'stone' },
        sources: { moments: ['trip', 'scout', 'raid'], places: ['reef'], bosses: ['colossus'] },
        keepsake: { name: 'Reef Shell', line: 'A shell.' },
        theme: 'Driftwood and shells.',
        line: 'From the reef.',
      },
    ],
    pieces: [
      piece('stool-plain', 'stool', null, { kind: 'starter' }),
      piece('lamp-plain', 'lamp', null, { kind: 'starter' }),
      piece('curtains-plain', 'curtains', null, { kind: 'starter' }),
      piece(
        'hammock',
        'bed',
        null,
        { kind: 'drop' },
        { moments: ['trip'], places: ['reef'], bosses: [] },
      ),
      piece('globe', 'stool', null, { kind: 'feat', stamp: 'wayfarer' }),
      piece('reef-bed', 'bed', 'reef', { kind: 'drop' }),
      piece('reef-stool', 'stool', 'reef', { kind: 'drop' }),
      piece('reef-lamp', 'lamp', 'reef', { kind: 'drop' }),
      piece('reef-curtains', 'curtains', 'reef', { kind: 'drop' }),
    ],
    skins: [
      skin('thatch', 'roof', null, { kind: 'starter' }),
      skin('plaster', 'walls', null, { kind: 'starter' }),
      skin('plain-wall', 'wall', null, { kind: 'starter' }),
      skin('plain-floor', 'floor', null, { kind: 'starter' }),
      skin('reef-wall', 'wall', 'reef', { kind: 'drop' }),
      skin('slate', 'roof', null, { kind: 'part', part: 'cottage' }),
      skin('lawn', 'ground', null, { kind: 'starter' }),
    ],
    stamps: [
      { id: 'paw', name: 'Paw', unlock: { kind: 'starter' }, ...text },
      {
        id: 'wayfarer',
        name: 'Wayfarer',
        unlock: { kind: 'stat', stat: 'places_visited', at: 7 },
        ...text,
      },
      {
        id: 'reef-shell',
        name: 'Reef Shell',
        unlock: { kind: 'drop', moments: ['trip', 'scout'] },
        ...text,
      },
    ],
    starter: {
      roof: 'thatch',
      walls: 'plaster',
      layout: { window: 'curtains-plain', ceiling: 'lamp-plain', 'floor-b': 'stool-plain' },
    },
  };
}

function piece(
  id: string,
  form: string,
  set: string | null,
  unlock: Record<string, unknown>,
  sources?: Record<string, unknown>,
) {
  const name = id.replace(/-/g, ' ');
  return { id, name, form, set, unlock, ...(sources === undefined ? {} : { sources }), ...text };
}

function skin(id: string, kind: string, set: string | null, unlock: Record<string, unknown>) {
  return { id, name: id.replace(/-/g, ' '), kind, set, unlock, hint: 'A hint.' };
}

/** A deep copy of plain data (the game package has no `structuredClone` typing). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The loaded fixture content. */
export function housingFixture(): HousingContent {
  return loadHousingContent(housingFixtureRaw(), fixtureResources(), FIXTURE_CTX);
}
