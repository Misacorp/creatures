/**
 * Sample houses for the scene's tests and the workbench: a `HouseView` of any set of built parts, with every room
 * dressed from the content (one set per room, so neighbours differ), the displays filled, and housemates asleep in
 * some beds. Pure and deterministic; every sample passes `HouseViewSchema` (the tests check). `sceneHouse` and `sceneOwn` build a
 * house of any parts for the scene; `house-sample.ts` (`sampleHouse`, `sampleOwn`, ...) holds the fixed samples of the panels.
 */
import {
  houseGrid,
  type DisplayView,
  type HousemateView,
  type HouseView,
  type HousingContent,
  type OwnHouseView,
  type RoomView,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';

/** The parts of a hut, a three-floor house and the whole mansion (the order is the build order). */
export const HUT: readonly string[] = ['hut'];
export const COTTAGE: readonly string[] = ['hut', 'cottage'];
export const THREE_FLOORS: readonly string[] = ['hut', 'cottage', 'house'];
export const MANSION: readonly string[] = [
  'hut',
  'cottage',
  'house',
  'cellar',
  'west-wing',
  'west-upper',
  'east-wing',
  'east-upper',
  'terrace',
  'garden',
  'pool',
];

/** The mansion and the four parts built after it: all fifteen. */
export const ESTATE: readonly string[] = [...MANSION, 'tower', 'balcony', 'orchard', 'pond'];

const SETS = [
  'cosy',
  'tidepool',
  'emberhold',
  'rootwood',
  'stormglass',
  'moonlit',
  'fenkeeper',
  'ancient',
  'lantern-night',
] as const;

/** The piece a form's spot takes in a room dressed in `set`; garden pieces by spot type outdoors. */
const OUTDOOR: Readonly<Record<string, readonly string[]>> = {
  'yard-large': ['stone-fountain', 'mossback-topiary', 'rose-arbor', 'garden-swing', 'scarecrow'],
  'yard-small': [
    'flowerbed',
    'birdbath',
    'lantern-post',
    'garden-bench',
    'sundial',
    'beehive',
    'fruit-crate',
    'bistro-table',
    'gazing-ball',
    'cone-topiary',
  ],
  fence: ['hedge', 'picket-fence'],
  poolside: ['lounger', 'fishing-stool', 'stepping-stones', 'sun-umbrella'],
  water: ['swim-ring', 'duck', 'lily-cluster', 'lantern-boat'],
};

const INDOOR_FORM: Readonly<Record<string, readonly string[]>> = {
  window: ['curtains'],
  'wall-large': ['shelf'],
  'wall-small': ['frame', 'clock'],
  ceiling: ['lamp'],
  'floor-large': ['bed', 'table', 'cupboard'],
  'floor-small': ['stool', 'chair', 'plant'],
  rug: ['rug'],
};

export interface SampleOptions {
  /** Built parts; default the hut. */
  parts?: readonly string[];
  /** Housemates asleep: how many of the beds get one (at most 3). */
  housemates?: number;
  /** Dress the rooms (default true); false leaves every spot empty (the hut keeps its starter layout). */
  furnished?: boolean;
  owner?: { userId: string; name: string };
  roof?: string;
  walls?: string;
  /** The house frame (default none: the posts and slabs as built). */
  frame?: string | null;
  /** Room layers by room id (housing C5): any of the wallpaper, floor, trim and ceiling. */
  looks?: Readonly<
    Record<string, { wall?: string; floor?: string; trim?: string | null; ceiling?: string | null }>
  >;
  content?: HousingContent;
}

/** Creatures of the sample's housemates. */
const SPECIES = ['splashet', 'cindle', 'sproutle'];

function pieceId(content: HousingContent, set: string, form: string): string | null {
  const id = `${set}-${form}`;
  return content.pieces.some((p) => p.id === id) ? id : null;
}

/** A house with `parts` built and its rooms dressed. */
export function sceneHouse(options: SampleOptions = {}): HouseView {
  const content = options.content ?? housing;
  const parts = options.parts ?? HUT;
  const grid = houseGrid(content, new Set(parts));
  const kinds = new Map(content.rooms.map((r) => [r.id, r]));
  const rooms: RoomView[] = [];
  const displays: DisplayView[] = [];
  const housemates: HousemateView[] = [];
  const wantMates = Math.min(3, options.housemates ?? 0);
  let n = 0;
  for (const [index, room] of grid.entries()) {
    const kind = kinds.get(room.kind);
    if (kind === undefined) continue;
    const spots: Record<string, string | null> = {};
    const set = SETS[index % SETS.length] ?? 'cosy';
    let bedUsed = false;
    for (const spot of kind.spots) {
      if (spot.type === 'display') {
        if (spot.display === 'raid-plaques')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'raid-plaques',
            plaques:
              room.kind === 'hearth'
                ? []
                : [
                    { bossId: 'tidal-colossus', best: 7, wins: 3 },
                    { bossId: 'cinder-wyrm', best: 4, wins: 1 },
                    { bossId: 'thornmother', best: 12, wins: 2 },
                  ],
            current: room.kind === 'hearth' ? 'storm-sovereign' : null,
          });
        if (spot.display === 'games-medals')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'games-medals',
            gold: 3,
            silver: 2,
            bronze: 4,
            pins: 1,
          });
        if (spot.display === 'games-badges')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'games-badges',
            events: [
              { eventId: 'race', wins: 2 },
              { eventId: 'show', wins: 1 },
              { eventId: 'quiz', wins: 1 },
            ],
          });
        if (spot.display === 'festival')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'festival',
            species: ['lantern-fox', 'paper-crane'],
          });
        if (spot.display === 'keepsakes')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'keepsakes',
            places: [
              { place: 'tidepools', count: 3 },
              { place: 'ember-caves', count: 1 },
              { place: 'storm-ridge', count: 5 },
            ],
          });
        if (spot.display === 'journal')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'journal',
            sets: ['tide-ledger', 'ash-records'],
            pages: 14,
          });
        if (spot.display === 'dungeon')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'dungeon',
            depth: 12,
            clears: 4,
          });
        if (spot.display === 'set-keepsakes')
          displays.push({
            roomId: room.roomId,
            spotId: spot.id,
            kind: 'set-keepsakes',
            sets: ['tidepool', 'ancient', 'emberhold'],
          });
        continue;
      }
      spots[spot.id] = null;
      if (options.furnished === false) continue;
      if (room.outdoor) {
        const choices = OUTDOOR[spot.type] ?? [];
        const pick = choices[(index + n) % Math.max(1, choices.length)];
        n += 1;
        spots[spot.id] =
          pick !== undefined && content.pieces.some((p) => p.id === pick) ? pick : null;
        continue;
      }
      const forms = INDOOR_FORM[spot.type] ?? [];
      let form = forms[(index + n) % Math.max(1, forms.length)];
      n += 1;
      if (spot.type === 'floor-large' && !bedUsed && room.kind !== 'hall') {
        form = 'bed';
        bedUsed = true;
      }
      if (form === undefined) continue;
      spots[spot.id] = pieceId(content, set, form);
      if (form === 'bed' && housemates.length < wantMates && spots[spot.id] !== null) {
        housemates.push({
          roomId: room.roomId,
          spotId: spot.id,
          home: true,
          creature: {
            id: `c${String(housemates.length + 1)}`,
            species: SPECIES[housemates.length] ?? 'splashet',
            shiny: housemates.length === 1,
            nickname: null,
            level: 5 + housemates.length,
          },
        });
      }
    }
    if (room.roomId === 'hut:hearth' && options.furnished !== false) {
      for (const [id, piece] of Object.entries(content.starter.layout)) spots[id] = piece;
    }
    const look = options.looks?.[room.roomId] ?? {};
    rooms.push({
      id: room.roomId,
      kind: room.kind,
      wall: look.wall ?? kind.wall,
      floor: look.floor ?? kind.floor,
      trim: look.trim ?? null,
      ceiling: look.ceiling ?? null,
      spots,
    });
  }
  return {
    owner: options.owner ?? { userId: '111111111111111111', name: 'Aino' },
    built: [...parts],
    exterior: {
      roof: options.roof ?? content.starter.roof,
      walls: options.walls ?? content.starter.walls,
      frame: options.frame ?? null,
    },
    rooms,
    displays,
    housemates,
    guestbook: [],
    setsComplete: ['tidepool'],
  };
}

/** An own view for the rows and the workbench: a part half paid, some pieces and skins held, two gifts in the mailbox. */
export function sceneOwn(house: HouseView, content: HousingContent = housing): OwnHouseView {
  const built = new Set(house.built);
  const buildable = content.parts
    .filter((p) => !built.has(p.id) && p.requires.every((r) => built.has(r)))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.id);
  const first = content.parts.find((p) => p.id === buildable[0]);
  const progress =
    first === undefined || first.price.length < 2
      ? []
      : [{ partId: first.id, paid: first.price.slice(0, 1), remaining: first.price.slice(1) }];
  const pieces: Record<string, number> = {};
  for (const room of house.rooms) {
    for (const piece of Object.values(room.spots)) {
      if (piece !== null) pieces[piece] = (pieces[piece] ?? 0) + 1;
    }
  }
  return {
    progress,
    buildable,
    items: {
      pieces,
      skins: content.skins.filter((s) => s.unlock.kind === 'starter').map((s) => s.id),
      stamps: ['paw-print'],
      blueprints: [],
    },
    free: {},
    materials: { driftwood: { have: 4, fresh: 2 }, 'sea-glass': { have: 1, fresh: 0 } },
    purse: { bait: 180, scrap: 640, shards: { tide: 4, ember: 0, grove: 12, spark: 0, mire: 0 } },
    mailbox: { gifts: 2, acorns: 10, from: [{ userId: '222222222222222222', name: 'Eero' }] },
    recent: [],
  };
}
