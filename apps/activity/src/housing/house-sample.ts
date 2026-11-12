/**
 * Sample answers of the housing endpoints for tests and the component workbench: a house a few weeks in, what its
 * owner holds (rich, poor or nothing), the catalogue, the visit list. They are built from the real content and pass
 * the strict view schemas (`house-sample.test.ts`). Pure.
 */
import {
  type CatalogueView,
  type GuestbookEntry,
  type HouseListView,
  type HouseView,
  type OwnHouseView,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';

/** The clock of the samples (epoch ms): guestbook times are relative to it. */
export const SAMPLE_NOW = 1_800_000_000_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const STARTER_LAYOUT = housing.starter.layout;
const STARTER_PIECES = housing.pieces.filter((p) => p.unlock.kind === 'starter').map((p) => p.id);

/** A guestbook of a few visitors, one with a very long name. */
export function sampleGuestbook(): GuestbookEntry[] {
  return [
    {
      visitor: { userId: '100000000000000002', name: 'Mika' },
      stampId: 'paw-print',
      at: SAMPLE_NOW - 5 * MINUTE,
    },
    {
      visitor: {
        userId: '100000000000000003',
        name: 'Bartholomew-Alexander the Third of Hollowmere',
      },
      stampId: 'housewarming',
      at: SAMPLE_NOW - 3 * HOUR,
    },
    {
      visitor: { userId: '100000000000000004', name: 'Juno' },
      stampId: 'ledger-shell',
      at: SAMPLE_NOW - 26 * HOUR,
    },
  ];
}

/** A house with the hut, the cottage, the house and the west wing built, the hearth furnished. */
export function sampleHouse(): HouseView {
  const built = ['hut', 'cottage', 'house', 'west-wing'];
  const rooms = built.flatMap((partId) => {
    const part = housing.parts.find((p) => p.id === partId);
    return (part?.rooms ?? []).map((r) => {
      const kind = housing.rooms.find((k) => k.id === r.kind);
      const spots: Record<string, string | null> = {};
      for (const spot of kind?.spots ?? []) {
        if (spot.type !== 'display') spots[spot.id] = null;
      }
      if (r.kind === 'hearth') Object.assign(spots, STARTER_LAYOUT);
      if (r.kind === 'loft') {
        spots['floor-large-a'] = 'cosy-bed';
      }
      return {
        id: `${partId}:${r.key}`,
        kind: r.kind,
        wall: kind?.wall ?? 'cosy-wall',
        floor: kind?.floor ?? 'cosy-floor',
        trim: null,
        ceiling: null,
        spots,
      };
    });
  });
  return {
    owner: { userId: '100000000000000001', name: 'Aino' },
    built,
    exterior: { roof: housing.starter.roof, walls: housing.starter.walls, frame: null },
    rooms,
    displays: [],
    housemates: [
      {
        roomId: 'cottage:loft',
        spotId: 'floor-large-a',
        home: true,
        creature: { id: 'c1', species: 'emberling', shiny: false, nickname: 'Pip', level: 7 },
      },
    ],
    guestbook: sampleGuestbook(),
    setsComplete: [],
  };
}

/** Only the hut: the first visit. */
export function sampleHut(): HouseView {
  const house = sampleHouse();
  return {
    ...house,
    built: ['hut'],
    rooms: house.rooms.filter((r) => r.id.startsWith('hut:')),
    housemates: [],
    guestbook: [],
  };
}

/** What the owner holds. `rich` can pay a lot, `poor` is short of most things, `empty` holds nothing. */
export function sampleOwn(mode: 'rich' | 'poor' | 'empty' = 'rich'): OwnHouseView {
  const rich = mode === 'rich';
  const none = mode === 'empty';
  const pieces: Record<string, number> = {};
  for (const id of STARTER_PIECES) pieces[id] = 1;
  pieces['cosy-chair'] = 2;
  if (!none) {
    pieces['tidepool-stool'] = 1;
    pieces['tidepool-lamp'] = 1;
  }
  const free: Record<string, number> = {};
  for (const id of STARTER_PIECES) free[id] = 1;
  for (const id of Object.values(STARTER_LAYOUT)) free[id] = Math.max(0, (pieces[id] ?? 1) - 1);
  free['cosy-chair'] = 1;
  free['cosy-bed'] = 0;
  // The cupboard stands in the kitchen: every copy is placed.
  free['cosy-cupboard'] = 0;
  if (!none) {
    free['tidepool-stool'] = 1;
    free['tidepool-lamp'] = 1;
  }
  return {
    progress: none
      ? []
      : [
          {
            partId: 'west-upper',
            paid: [
              { kind: 'bait', amount: 125 },
              { kind: 'family', family: 'wood', amount: 4 },
            ],
            remaining: [
              { kind: 'bait', amount: 100 },
              { kind: 'scrap', amount: 1500 },
              { kind: 'family', family: 'wood', amount: 6 },
              { kind: 'family', family: 'cloth', amount: 6 },
            ],
          },
        ],
    buildable: none ? ['cottage'] : ['west-upper', 'east-wing', 'cellar', 'garden'],
    items: {
      pieces,
      skins: none ? [] : ['tidepool-wall'],
      stamps: none ? ['paw-print'] : ['paw-print', 'ledger-shell', 'housewarming'],
      blueprints: none
        ? []
        : ['tidepool-stool', 'tidepool-lamp', 'tidepool-table', 'tidepool-wall', 'hammock'],
    },
    free,
    materials: none
      ? {}
      : {
          driftwood: { have: rich ? 14 : 1, fresh: rich ? 3 : 0 },
          charwood: { have: rich ? 5 : 0, fresh: 0 },
          'sea-glass': { have: rich ? 9 : 1, fresh: rich ? 2 : 0 },
          moonstone: { have: rich ? 3 : 0, fresh: 0 },
          'old-gold': { have: rich ? 2 : 0, fresh: 0 },
          'moss-velvet': { have: rich ? 6 : 0, fresh: 0 },
          'sea-silk': { have: rich ? 4 : 2, fresh: 0 },
        },
    purse: none
      ? { bait: 0, scrap: 0, shards: { tide: 0, ember: 0, grove: 0, spark: 0, mire: 0 } }
      : rich
        ? { bait: 640, scrap: 3200, shards: { tide: 12, ember: 4, grove: 11, spark: 0, mire: 10 } }
        : { bait: 35, scrap: 90, shards: { tide: 2, ember: 0, grove: 1, spark: 0, mire: 0 } },
    mailbox: none
      ? { gifts: 0, acorns: 0, from: [] }
      : {
          gifts: 2,
          acorns: 10,
          from: [
            { userId: '100000000000000002', name: 'Mika' },
            { userId: '100000000000000004', name: 'Juno' },
          ],
        },
    recent: none
      ? []
      : [
          {
            at: SAMPLE_NOW - 2 * HOUR,
            materials: { driftwood: 3 },
            blueprint: 'tidepool-table',
            stamp: null,
          },
        ],
  };
}

/** The catalogue of a player a few weeks in: the starters owned, a handful of finds, the rest unknown. */
export function sampleCatalogue(): CatalogueView {
  const own = sampleOwn('rich');
  const known = new Set(own.items.blueprints);
  return {
    pieces: housing.pieces.map((p) => {
      const owned = own.items.pieces[p.id] ?? 0;
      return {
        id: p.id,
        owned,
        placed: Math.max(0, owned - (own.free[p.id] ?? 0)),
        known: owned > 0 || known.has(p.id) || p.unlock.kind === 'starter',
      };
    }),
    skins: housing.skins.map((s) => ({
      id: s.id,
      owned: s.unlock.kind === 'starter' || own.items.skins.includes(s.id),
      known: s.unlock.kind === 'starter' || known.has(s.id),
    })),
    stamps: housing.stamps.map((s) => ({ id: s.id, owned: own.items.stamps.includes(s.id) })),
    materials: housing.materials.map((m) => ({ id: m.id, have: own.materials[m.id]?.have ?? 0 })),
    parts: housing.parts.map((p) => ({
      id: p.id,
      built: ['hut', 'cottage', 'house', 'west-wing'].includes(p.id),
    })),
    sets: housing.sets.map((s) => ({ id: s.id, complete: false })),
  };
}

/** The server's other houses: one already gifted and stamped today, one with a very long name. */
export function sampleList(): HouseListView {
  return {
    houses: [
      {
        userId: '100000000000000002',
        name: 'Mika',
        built: ['hut', 'cottage'],
        updatedAt: SAMPLE_NOW - HOUR,
        today: { gifted: true, stamped: true },
      },
      {
        userId: '100000000000000003',
        name: 'Bartholomew-Alexander the Third of Hollowmere',
        built: ['hut', 'cottage', 'house', 'garden', 'pool'],
        updatedAt: SAMPLE_NOW - 5 * HOUR,
        today: { gifted: false, stamped: false },
      },
      {
        userId: '100000000000000004',
        name: 'Juno',
        built: ['hut'],
        updatedAt: SAMPLE_NOW - 30 * HOUR,
        today: { gifted: false, stamped: true },
      },
    ],
    me: { giftLeft: true },
  };
}
