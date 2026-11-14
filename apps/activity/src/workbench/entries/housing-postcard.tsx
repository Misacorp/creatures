import { housing } from '@creatures/game/housing-content';
import { HousePhaseContext } from '../../housing/house-phase';
import { HousePostcard } from '../../housing/HousePostcard';
import { COTTAGE, ESTATE, HUT, MANSION, THREE_FLOORS } from '../../housing/house-scene-sample';
import { num, str } from '../props';
import type { Entry, Props } from '../types';
import { phaseControl, phaseOf } from './housing';

const HOUSES: Readonly<Record<string, readonly string[]>> = {
  hut: HUT,
  cottage: COTTAGE,
  house: THREE_FLOORS,
  'house and cellar': [...THREE_FLOORS, 'cellar'],
  'house and terrace': [...THREE_FLOORS, 'terrace'],
  'house and garden': [...THREE_FLOORS, 'garden'],
  'house, garden and pool': [...THREE_FLOORS, 'garden', 'pool'],
  'house and west wing': [...THREE_FLOORS, 'west-wing'],
  'house and east wing': [...THREE_FLOORS, 'east-wing'],
  'west wing, upper floor': [...THREE_FLOORS, 'west-wing', 'west-upper'],
  'east wing, upper floor': [...THREE_FLOORS, 'east-wing', 'east-upper'],
  mansion: MANSION,
  'house and tower': [...THREE_FLOORS, 'tower'],
  'house and balcony': [...THREE_FLOORS, 'balcony'],
  'house, garden and orchard': [...THREE_FLOORS, 'garden', 'orchard'],
  'house, terrace and pond': [...THREE_FLOORS, 'terrace', 'pond'],
  estate: ESTATE,
};
const ROOFS = housing.skins.filter((s) => s.kind === 'roof').map((s) => s.id);
const WALLS = housing.skins.filter((s) => s.kind === 'walls').map((s) => s.id);

const Caption = ({ text }: { text: string }) => <p class="muted">{text}</p>;

function Gallery({ p }: { p: Props }) {
  return (
    <HousePhaseContext.Provider value={phaseOf(p)}>
      <Pictures p={p} />
    </HousePhaseContext.Provider>
  );
}

function Pictures({ p }: { p: Props }) {
  const width = num(p, 'width');
  const roof = str(p, 'roof');
  const walls = str(p, 'walls');
  const view = str(p, 'view');
  if (view === 'one') {
    return (
      <HousePostcard
        house={{ parts: HOUSES[str(p, 'house')] ?? HUT, roof, walls }}
        maxWidth={width}
      />
    );
  }
  if (view === 'stages') {
    return (
      <div>
        {Object.entries(HOUSES).map(([name, parts]) => (
          <div key={name}>
            <Caption text={name} />
            <HousePostcard house={{ parts, roof, walls }} maxWidth={width} />
          </div>
        ))}
      </div>
    );
  }
  // skins: the mansion in each roof (on the chosen walls), then in each wall skin (under the chosen roof)
  return (
    <div>
      {ROOFS.map((id) => (
        <div key={`roof-${id}`}>
          <Caption text={`roof: ${id}`} />
          <HousePostcard house={{ parts: MANSION, roof: id, walls }} maxWidth={width} />
        </div>
      ))}
      {WALLS.map((id) => (
        <div key={`walls-${id}`}>
          <Caption text={`walls: ${id}`} />
          <HousePostcard house={{ parts: MANSION, roof, walls: id }} maxWidth={width} />
        </div>
      ))}
    </div>
  );
}

const housePostcard: Entry = {
  name: 'HousePostcard',
  file: 'apps/activity/src/housing/HousePostcard.tsx',
  group: 'Creatures & game pieces',
  description:
    'A whole house seen from outside, small enough for a phone: one facade piece with a window for every room, the door on the Hearth, a roof over each run of rooms, a stone course for the cellar, and the terrace, garden and pool beside it, all in the player’s own roof and wall skins. Drawn at the largest whole scale that fits the width, crisp. At twilight and night (the phase control; in the game it is the living room’s phase) it is drawn in that light: the valley’s sky behind, dark walls and roof, warm lit windows, the porch lamp and a lantern post. The page can show one house, every stage and extension, or the mansion in every skin.',
  controls: {
    view: { kind: 'select', options: ['one', 'stages', 'skins'] },
    house: { kind: 'select', options: Object.keys(HOUSES) },
    roof: { kind: 'select', options: ROOFS },
    walls: { kind: 'select', options: WALLS },
    width: { kind: 'number', min: 56, max: 1100, step: 1 },
    ...phaseControl,
  },
  defaults: {
    view: 'one',
    house: 'mansion',
    roof: 'thatch',
    walls: 'plaster',
    width: 390,
    phase: 'day',
  },
  presets: [
    { name: 'The mansion on a phone (390)', props: {} },
    { name: 'The mansion on a desktop (1100)', props: { width: 1100 } },
    { name: 'Every stage and extension, phone', props: { view: 'stages' } },
    { name: 'Every stage and extension, desktop', props: { view: 'stages', width: 1100 } },
    { name: 'The mansion in every skin, phone', props: { view: 'skins' } },
    { name: 'The mansion in every skin, desktop', props: { view: 'skins', width: 1100 } },
    { name: 'The hut', props: { house: 'hut' } },
    { name: 'The mansion at twilight', props: { phase: 'twilight' } },
    { name: 'The mansion at night', props: { phase: 'night' } },
    { name: 'The estate (all fifteen parts)', props: { house: 'estate' } },
    { name: 'The estate at night', props: { house: 'estate', phase: 'night' } },
    { name: 'The estate at twilight', props: { house: 'estate', phase: 'twilight' } },
    { name: 'The estate on a desktop', props: { house: 'estate', width: 1100 } },
    { name: 'The hut at night', props: { house: 'hut', phase: 'night' } },
    { name: 'Every stage and extension at night', props: { view: 'stages', phase: 'night' } },
    {
      name: 'The cottage, slate and timber',
      props: { house: 'cottage', roof: 'slate', walls: 'timber' },
    },
  ],
  render: (p) => <Gallery p={p} />,
};

export const housingPostcardEntries: readonly Entry[] = [housePostcard];
