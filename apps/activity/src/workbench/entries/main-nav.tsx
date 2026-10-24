import { Hud } from '../../Hud';
import { PopoverHost } from '../../PopoverHost';
import { TABS } from '../../tabs';
import { LAYOUTS, MainNavDemo } from '../main-nav-demo/MainNavDemo';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const PLACE_IDS = [...TABS.map((t) => t.id), 'market', 'camp', 'garden', 'harbour'];

const mainNav: Entry = {
  name: 'MainNav',
  file: 'apps/activity/src/MainNav.tsx',
  group: 'Controls',
  description:
    'The main navigation: on a phone a game-style dock of pixel buttons fixed to the bottom edge with a slim HUD on top (the place name, the currencies with numbers, "?"), on a wide window a rail down the left with a word beside each picture and the HUD across the top. A place with something waiting has a pip. When more places exist than the dock holds, the last button is More: it opens a drawer with the rest, carries a roll-up pip, and the place you are in is always in the dock. One list of places feeds the dock, the rail and More. Shown in a frame (the dock under the screen, not fixed to the window) with the real Creatures, Games and Expeditions screens on fixture data (other places show a stand-in); use 360 or 390 for the phone and the full width for the desktop; the layout control forces one (not in the presets: a desktop layout is not meant for a narrow window).',
  controls: {
    place: { kind: 'select', options: PLACE_IDS },
    count: { kind: 'number', min: 3, max: 10 },
    pips: { kind: 'toggle' },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: { place: 'collection', count: 6, pips: true, layout: 'auto' },
  presets: [
    { name: 'Creatures', props: {} },
    { name: 'Workshop', props: { place: 'workshop' } },
    { name: 'Expeditions', props: { place: 'expeditions' } },
    { name: 'Games', props: { place: 'games' } },
    { name: 'Dungeon', props: { place: 'dungeon' } },
    { name: 'Raid', props: { place: 'raid' } },
    { name: 'No pips', props: { pips: false } },
    { name: 'Nine places: More (use 360 or 390 px)', props: { count: 9 } },
    { name: 'Nine places, one from More is active', props: { count: 9, place: 'market' } },
    { name: 'Nine places, no pips', props: { count: 9, pips: false } },
    { name: 'Ten places (full width: the rail lists them all)', props: { count: 10 } },
  ],
  render: (p) => (
    <MainNavDemo
      key={JSON.stringify(p)}
      place={str(p, 'place')}
      count={num(p, 'count')}
      pips={bool(p, 'pips')}
      layout={str(p, 'layout')}
    />
  ),
};

const NO_REF = { current: null };

const hud: Entry = {
  name: 'Hud',
  file: 'apps/activity/src/Hud.tsx',
  group: 'Controls',
  description:
    'The slim bar along the top of the game: the name of the place you are in (the page heading), the Bait and Essence balances with their numbers (tap for the exact amounts and their glossary tags) and the "?" that opens How to play. On a phone it stays at the top edge while the page scrolls. Large amounts are shortened (12.3K); the exact numbers are in the spoken label.',
  covers: ['HelpButton'],
  controls: {
    title: { kind: 'text', maxLength: 24 },
    bait: { kind: 'number', min: 0, max: 99999999 },
    essence: { kind: 'number', min: 0, max: 99999999 },
  },
  defaults: { title: 'Creatures', bait: 1240, essence: 36 },
  presets: [
    { name: 'Typical', props: {} },
    { name: 'Expeditions', props: { title: 'Expeditions' } },
    { name: 'Nothing yet', props: { bait: 0, essence: 0 } },
    { name: 'Big numbers (shortened)', props: { bait: 123456, essence: 9876 } },
    { name: 'Huge numbers', props: { bait: 48_500_000, essence: 1_200_000 } },
  ],
  render: (p) => (
    <PopoverHost onOpenHowTo={() => undefined}>
      <Hud
        title={str(p, 'title')}
        balances={{ bait: num(p, 'bait'), essence: num(p, 'essence') }}
        helpRef={NO_REF}
        onHelp={() => undefined}
      />
    </PopoverHost>
  ),
};

export const mainNavEntries: readonly Entry[] = [mainNav, hud];
