import { useState } from 'preact/hooks';
import { houseGrid, type RoomPhase } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { HousePhaseContext } from '../../housing/house-phase';
import { HouseRows } from '../../housing/HouseRows';
import { YourHouseRow } from '../../valley/YourHouseRow';
import { HouseScene } from '../../housing/HouseScene';
import { RoomFocus } from '../../housing/RoomFocus';
import { VisitHouse } from '../../housing/VisitHouse';
import {
  COTTAGE,
  ESTATE,
  HUT,
  MANSION,
  THREE_FLOORS,
  sceneHouse,
  sceneOwn,
} from '../../housing/house-scene-sample';
import { num, str } from '../props';
import type { Entry, Props } from '../types';

const HOUSES: Readonly<Record<string, readonly string[]>> = {
  hut: HUT,
  cottage: COTTAGE,
  'three floors': THREE_FLOORS,
  mansion: MANSION,
  estate: ESTATE,
  'house and tower': [...THREE_FLOORS, 'tower'],
  'house and balcony': [...THREE_FLOORS, 'balcony'],
  'house, garden and orchard': [...THREE_FLOORS, 'garden', 'orchard'],
  'house, terrace and pond': [...THREE_FLOORS, 'terrace', 'pond'],
};
const HOUSE_OPTIONS = Object.keys(HOUSES);
const ROOFS = housing.skins.filter((s) => s.kind === 'roof').map((s) => s.id);
const WALLS = housing.skins.filter((s) => s.kind === 'walls').map((s) => s.id);

function houseOf(p: Props) {
  return sceneHouse({
    parts: HOUSES[str(p, 'house')] ?? HUT,
    housemates: num(p, 'housemates'),
    roof: str(p, 'roof'),
    walls: str(p, 'walls'),
  });
}

const PHASES: readonly RoomPhase[] = ['day', 'twilight', 'night'];

/** The phase control of the house entries: the house is drawn in this light (in the game it is the living room's phase). */
export const phaseControl = { phase: { kind: 'select', options: PHASES } } as const;

export function phaseOf(p: Props): RoomPhase {
  const v = str(p, 'phase');
  return PHASES.find((x) => x === v) ?? 'day';
}

const common = {
  house: { kind: 'select', options: HOUSE_OPTIONS },
  housemates: { kind: 'number', min: 0, max: 3 },
  roof: { kind: 'select', options: ROOFS },
  walls: { kind: 'select', options: WALLS },
} as const;
const commonDefaults = { house: 'hut', housemates: 0, roof: 'thatch', walls: 'plaster' } as const;

const houseScene: Entry = {
  name: 'HouseScene',
  file: 'apps/activity/src/housing/HouseScene.tsx',
  group: 'Creatures & game pieces',
  description:
    'The player’s house as one cutaway picture on the valley’s grass: a hut, a cottage, a three-floor house or the whole mansion, drawn at the largest whole scale at which the building fits (3 on a wide window, 2 on a phone, down to 1) in a box that pans both ways. A house that fits at no scale is centred on the building with the grass line near the bottom, and the whole house shows above it as a postcard. Every room is a button (tap to focus it, its name says who sleeps in it); the mailbox is a button in your own house and its flag is up when gifts wait. The walls skin shows as a thick band on the cut edges and as a plinth. Housemates sleep in their beds.',
  controls: {
    ...common,
    mode: { kind: 'select', options: ['own', 'visit'] },
    mail: { kind: 'toggle' },
    ...phaseControl,
  },
  defaults: { ...commonDefaults, mode: 'own', mail: false, phase: 'day' },
  presets: [
    { name: 'The hut', props: {} },
    { name: 'The cottage, a housemate', props: { house: 'cottage', housemates: 1 } },
    { name: 'Three floors, three housemates', props: { house: 'three floors', housemates: 3 } },
    { name: 'The mansion', props: { house: 'mansion', housemates: 3 } },
    { name: 'The mansion, visited', props: { house: 'mansion', housemates: 2, mode: 'visit' } },
    { name: 'The hut at twilight', props: { phase: 'twilight' } },
    { name: 'The hut at night', props: { phase: 'night', housemates: 1 } },
    {
      name: 'Three floors at night',
      props: { house: 'three floors', housemates: 3, phase: 'night' },
    },
    { name: 'The mansion at night', props: { house: 'mansion', housemates: 3, phase: 'night' } },
    { name: 'The estate (all fifteen parts)', props: { house: 'estate', housemates: 3 } },
    { name: 'The estate at night', props: { house: 'estate', housemates: 3, phase: 'night' } },
    { name: 'The house and its tower', props: { house: 'house and tower', housemates: 1 } },
    { name: 'The house and its balcony', props: { house: 'house and balcony' } },
    { name: 'The garden and its orchard', props: { house: 'house, garden and orchard' } },
    { name: 'The terrace and its pond', props: { house: 'house, terrace and pond' } },
    {
      name: 'The mansion with a slate roof and brick walls',
      props: { house: 'mansion', roof: 'slate', walls: 'brick' },
    },
  ],
  render: (p) => (
    <HousePhaseContext.Provider value={phaseOf(p)}>
      <HouseScene
        house={houseOf(p)}
        mode={str(p, 'mode') === 'visit' ? 'visit' : 'own'}
        mailWaiting={p['mail'] === true}
        onRoom={() => undefined}
        {...(str(p, 'mode') === 'visit' ? {} : { onFixture: () => undefined })}
      />
    </HousePhaseContext.Provider>
  ),
};

const ROOM_OPTIONS = [...new Set(houseGrid(housing, new Set(ESTATE)).map((r) => r.kind))];

function RoomDemo({ p }: { p: Props }) {
  const house = sceneHouse({
    parts: ESTATE,
    housemates: num(p, 'housemates'),
    roof: str(p, 'roof'),
    walls: str(p, 'walls'),
  });
  const kind = str(p, 'room');
  const room = house.rooms.find((r) => r.kind === kind) ?? house.rooms[0];
  const [spot, setSpot] = useState<string | null>(null);
  if (room === undefined) return null;
  return (
    <RoomFocus
      house={house}
      roomId={room.id}
      mode={str(p, 'mode') === 'visit' ? 'visit' : 'own'}
      selectedSpot={spot}
      onSpot={setSpot}
      onSkin={() => undefined}
    />
  );
}

const roomFocus: Entry = {
  name: 'RoomFocus',
  file: 'apps/activity/src/housing/RoomFocus.tsx',
  group: 'Creatures & game pieces',
  description:
    'One room of the house at a larger scale (up to 4). In your own house every spot is a button over the picture (an empty one shows a small pixel plus, and a dashed outline only while hovered or focused) and the wallpaper and floor are two dropdown triggers under it; in a visit pieces and displays are tappable pictures that open a popover. The housemate sleeps in its bed.',
  controls: {
    room: { kind: 'select', options: ROOM_OPTIONS },
    housemates: common.housemates,
    roof: common.roof,
    walls: common.walls,
    mode: { kind: 'select', options: ['own', 'visit'] },
    ...phaseControl,
  },
  defaults: {
    room: 'hearth',
    housemates: 1,
    roof: 'thatch',
    walls: 'plaster',
    mode: 'own',
    phase: 'day',
  },
  presets: [
    { name: 'The Hearth', props: {} },
    { name: 'A bedroom with a housemate', props: { room: 'kitchen', housemates: 3 } },
    { name: 'The trophy hall', props: { room: 'hall' } },
    { name: 'The attic (two cells wide)', props: { room: 'attic' } },
    { name: 'The cellar', props: { room: 'cellar' } },
    { name: 'The garden', props: { room: 'garden' } },
    { name: 'The pool', props: { room: 'pool' } },
    { name: 'The hall, visited', props: { room: 'hall', mode: 'visit' } },
    { name: 'The Hearth at night', props: { phase: 'night' } },
    { name: 'A bedroom at night', props: { room: 'kitchen', housemates: 3, phase: 'night' } },
    { name: 'The Hearth at twilight', props: { phase: 'twilight' } },
    { name: 'The garden at night', props: { room: 'garden', phase: 'night' } },
    { name: 'The landing', props: { room: 'landing' } },
    { name: 'The observatory', props: { room: 'observatory' } },
    { name: 'The observatory at night', props: { room: 'observatory', phase: 'night' } },
    { name: 'The balcony', props: { room: 'balcony' } },
    { name: 'The balcony at night', props: { room: 'balcony', phase: 'night' } },
    { name: 'The orchard', props: { room: 'orchard' } },
    { name: 'The orchard at night', props: { room: 'orchard', phase: 'night' } },
    { name: 'The pond', props: { room: 'pond' } },
    { name: 'The pond at night', props: { room: 'pond', phase: 'night' } },
  ],
  render: (p) => (
    <HousePhaseContext.Provider value={phaseOf(p)}>
      <RoomDemo p={p} />
    </HousePhaseContext.Provider>
  ),
};

const houseRows: Entry = {
  name: 'HouseRows',
  file: 'apps/activity/src/housing/HouseRows.tsx',
  group: 'Creatures & game pieces',
  description:
    'The house page’s five rows (Build, Workbench, Catalogue, Mailbox, Visit), each a place row with the line of what is next there; the Mailbox has a gold pip while gifts wait.',
  controls: { house: common.house },
  defaults: { house: 'cottage' },
  presets: [
    { name: 'The cottage', props: {} },
    { name: 'The hut', props: { house: 'hut' } },
    { name: 'The mansion (everything built)', props: { house: 'mansion' } },
  ],
  render: (p) => {
    const house = sceneHouse({ parts: HOUSES[str(p, 'house')] ?? HUT });
    return <HouseRows house={house} own={sceneOwn(house)} houses={7} onOpen={() => undefined} />;
  },
};

const yourHouseRow: Entry = {
  name: 'YourHouseRow',
  file: 'apps/activity/src/valley/YourHouseRow.tsx',
  group: 'Creatures & game pieces',
  description:
    'The valley House’s “Your house” row, which opens the house page. It lives apart from the house page’s rows so the valley does not load the housing content.',
  controls: {},
  defaults: {},
  presets: [{ name: 'The row', props: {} }],
  render: () => <YourHouseRow onClick={() => undefined} />,
};

const visitHouse: Entry = {
  name: 'VisitHouse',
  file: 'apps/activity/src/housing/VisitHouse.tsx',
  group: 'Creatures & game pieces',
  description:
    'Someone else’s house, read-only: the same scene, rooms that open read-only, the guestbook and, pinned at the bottom, the visitor’s gift and stamp (the panels come from the housing panels file). Back leaves a room, then the house.',
  controls: { house: common.house, housemates: common.housemates, ...phaseControl },
  defaults: { house: 'three floors', housemates: 2, phase: 'day' },
  presets: [
    { name: 'A three-floor house', props: {} },
    { name: 'The mansion', props: { house: 'mansion', housemates: 3 } },
    { name: 'A three-floor house at night', props: { phase: 'night' } },
  ],
  render: (p) => (
    <HousePhaseContext.Provider value={phaseOf(p)}>
      <VisitHouse
        userId="111111111111111111"
        name="Aino"
        house={sceneHouse({
          parts: HOUSES[str(p, 'house')] ?? HUT,
          housemates: num(p, 'housemates'),
        })}
        today={{ gifted: false, stamped: false }}
        giftLeft
        ownedStamps={['paw-print']}
        now={Date.now()}
        onBack={() => undefined}
      />
    </HousePhaseContext.Provider>
  ),
};

export const housingEntries: readonly Entry[] = [
  houseScene,
  roomFocus,
  houseRows,
  yourHouseRow,
  visitHouse,
];
