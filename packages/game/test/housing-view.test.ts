import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  BuildAnswerSchema,
  SkinAnswerSchema,
  CatalogueViewSchema,
  CollectAnswerSchema,
  CraftAnswerSchema,
  DisplayViewSchema,
  GiftAnswerSchema,
  GuestbookEntrySchema,
  HouseAnswerSchema,
  HouseListViewSchema,
  HousePaySchema,
  HousemateAnswerSchema,
  HousemateViewSchema,
  OwnHouseViewSchema,
  PartProgressViewSchema,
  PlaceAnswerSchema,
  RoomViewSchema,
  SeenAnswerSchema,
  StampAnswerSchema,
  HouseViewSchema,
  parseHouseAnswer,
  parseHouseView,
} from '../src/index';

const owner = { userId: '123456789012345678', name: 'Aino' };
const room = {
  id: 'hut:hearth',
  kind: 'hearth',
  wall: 'cosy-wall',
  floor: 'cosy-floor',
  spots: { window: 'cosy-curtains', ceiling: null },
};
const displays = [
  {
    roomId: 'hut:hearth',
    spotId: 'mantel',
    kind: 'raid-plaques',
    plaques: [{ bossId: 'colossus', best: 1, wins: 2 }],
    current: 'wyrm',
  },
  {
    roomId: 'west-wing:hall',
    spotId: 'bench',
    kind: 'games-medals',
    gold: 1,
    silver: 0,
    bronze: 2,
    pins: 3,
  },
  {
    roomId: 'west-wing:hall',
    spotId: 'badges',
    kind: 'games-badges',
    events: [{ eventId: 'relay', wins: 2 }],
  },
  { roomId: 'west-wing:hall', spotId: 'case', kind: 'festival', species: ['sprite'] },
  {
    roomId: 'west-wing:hall',
    spotId: 'shelf',
    kind: 'keepsakes',
    places: [{ place: 'tidepools', count: 2 }],
  },
  { roomId: 'west-wing:hall', spotId: 'books', kind: 'journal', sets: ['tide-ledger'], pages: 9 },
  { roomId: 'west-wing:hall', spotId: 'marker', kind: 'dungeon', depth: 10, clears: 1 },
  { roomId: 'west-wing:hall', spotId: 'cabinet', kind: 'set-keepsakes', sets: ['cosy'] },
];
const housemate = {
  roomId: 'hut:hearth',
  spotId: 'bed',
  home: true,
  creature: { id: 'c1', species: 'zipmouse', shiny: false, nickname: null, level: 12 },
};
const house = {
  owner,
  built: ['hut'],
  exterior: { roof: 'thatch', walls: 'plaster' },
  rooms: [room],
  displays,
  housemates: [housemate],
  guestbook: [{ visitor: owner, stampId: 'paw', at: 1_700_000_000_000 }],
  setsComplete: ['cosy'],
};
const progress = {
  partId: 'cottage',
  paid: [{ kind: 'bait', amount: 4 }],
  remaining: [{ kind: 'family', family: 'wood', amount: 2 }],
};
const own = {
  progress: [progress],
  buildable: ['cottage'],
  items: {
    pieces: { 'cosy-bed': 1 },
    skins: ['cosy-wall'],
    stamps: ['paw'],
    blueprints: ['reef-bed'],
  },
  free: { 'cosy-bed': 1 },
  materials: { oak: { have: 3, fresh: 1 } },
  purse: { bait: 5, scrap: 10, shards: { tide: 0, ember: 1, grove: 2, spark: 3, mire: 4 } },
  mailbox: { gifts: 1, acorns: 5, from: [owner] },
  recent: [{ at: 1, materials: { oak: 1 }, blueprint: null, stamp: 'paw' }],
};
const purse = own.purse;
const materials = { oak: { have: 2, fresh: 0 } };
const list = {
  houses: [
    {
      userId: '2',
      name: 'Bea',
      built: ['hut'],
      updatedAt: 5,
      today: { gifted: false, stamped: true },
    },
  ],
  me: { giftLeft: true },
};
const catalogue = {
  pieces: [{ id: 'cosy-bed', owned: 1, placed: 1, known: true }],
  skins: [{ id: 'cosy-wall', owned: true, known: true }],
  stamps: [{ id: 'paw', owned: true }],
  materials: [{ id: 'oak', have: 3 }],
  parts: [{ id: 'hut', built: true }],
  sets: [{ id: 'cosy', complete: false }],
};

/** A copy of a sample with one key added at the top, to prove the schema rejects unknown keys. */
const withExtra = (sample: object): object => ({ ...sample, extra: 1 });

describe('housing view schemas', () => {
  const samples: [string, v.GenericSchema, object][] = [
    ['RoomView', RoomViewSchema, room],
    ['HousemateView', HousemateViewSchema, housemate],
    ['GuestbookEntry', GuestbookEntrySchema, house.guestbook[0] ?? {}],
    ['HouseView', HouseViewSchema, house],
    ['PartProgressView', PartProgressViewSchema, progress],
    ['OwnHouseView', OwnHouseViewSchema, own],
    ['HouseListView', HouseListViewSchema, list],
    ['CatalogueView', CatalogueViewSchema, catalogue],
    ['house answer', HouseAnswerSchema, { house, own }],
    [
      'build answer (not built)',
      BuildAnswerSchema,
      { part: progress, built: false, purse, materials },
    ],
    [
      'build answer (built)',
      BuildAnswerSchema,
      {
        part: progress,
        built: true,
        purse,
        materials,
        grown: {
          parts: ['hut', 'cottage'],
          buildable: ['cellar'],
          learned: ['slate'],
          rooms: [room],
          displays: [],
        },
      },
    ],
    [
      'craft answer',
      CraftAnswerSchema,
      { itemId: 'reef-bed', kind: 'piece', count: 1, purse, materials },
    ],
    ['skin answer (room)', SkinAnswerSchema, { target: 'room', room }],
    [
      'skin answer (exterior)',
      SkinAnswerSchema,
      { target: 'exterior', exterior: { roof: 'slate', walls: 'timber' } },
    ],
    [
      'place answer',
      PlaceAnswerSchema,
      { room, from: null, own: { free: { 'cosy-bed': 0 } }, housemates: [] },
    ],
    ['housemate answer', HousemateAnswerSchema, { housemates: [housemate] }],
    [
      'gift answer',
      GiftAnswerSchema,
      { gift: { amount: 5 }, today: { gifted: true, stamped: false } },
    ],
    [
      'stamp answer',
      StampAnswerSchema,
      { guestbook: house.guestbook, today: { gifted: false, stamped: true } },
    ],
    ['collect answer', CollectAnswerSchema, { collected: 5, balance: 20 }],
    ['seen answer', SeenAnswerSchema, { ok: true }],
  ];
  for (const [name, schema, sample] of samples) {
    it(`${name} accepts a sample and rejects an unknown key`, () => {
      expect(v.safeParse(schema, sample).success).toBe(true);
      expect(v.safeParse(schema, withExtra(sample)).success).toBe(false);
    });
  }

  it('every display kind parses, and an unknown key or kind is rejected', () => {
    for (const d of displays) {
      expect(v.safeParse(DisplayViewSchema, d).success).toBe(true);
      expect(v.safeParse(DisplayViewSchema, { ...d, extra: 1 }).success).toBe(false);
    }
    expect(
      v.safeParse(DisplayViewSchema, { roomId: 'a:b', spotId: 'c', kind: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects nested unknown keys and bad values', () => {
    expect(
      v.safeParse(HouseViewSchema, { ...house, exterior: { roof: 'a', walls: 'b', x: 1 } }).success,
    ).toBe(false);
    expect(v.safeParse(HouseViewSchema, { ...house, owner: { ...owner, extra: 1 } }).success).toBe(
      false,
    );
    expect(
      v.safeParse(OwnHouseViewSchema, { ...own, purse: { ...own.purse, scrap: -1 } }).success,
    ).toBe(false);
    expect(
      v.safeParse(OwnHouseViewSchema, { ...own, purse: { ...own.purse, shards: { tide: 0 } } })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(HouseListViewSchema, {
        ...list,
        houses: Array.from({ length: 16 }, () => list.houses[0]),
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(HousemateViewSchema, {
        ...housemate,
        creature: { ...housemate.creature, level: 1.5 },
      }).success,
    ).toBe(false);
  });

  it('parse helpers return undefined on a bad shape', () => {
    expect(parseHouseView(house)?.owner.name).toBe('Aino');
    expect(parseHouseView({ ...house, built: 'hut' })).toBeUndefined();
    expect(parseHouseView(null)).toBeUndefined();
    expect(parseHouseAnswer(CollectAnswerSchema, { collected: 1 })).toBeUndefined();
  });
});

describe('HousePaySchema', () => {
  it('accepts any part of a payment, and an empty one', () => {
    expect(v.safeParse(HousePaySchema, {}).success).toBe(true);
    expect(
      v.safeParse(HousePaySchema, {
        bait: 5,
        scrap: 40,
        shards: { mire: 3 },
        materials: { oak: 2 },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown keys, bad amounts, unknown elements and big records', () => {
    for (const bad of [
      { gold: 1 },
      { bait: -1 },
      { bait: 1.5 },
      { scrap: 1_000_001 },
      { shards: { fire: 1 } },
      { shards: { mire: -1 } },
      { materials: { oak: -1 } },
      { materials: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`m${String(i)}`, 1])) },
    ]) {
      expect(v.safeParse(HousePaySchema, bad).success).toBe(false);
    }
  });
});
