import { Hud } from '../../Hud';
import { PopoverHost } from '../../PopoverHost';
import { TABS } from '../../tabs';
import { LAYOUTS, MENUS, MainNavDemo } from '../main-nav-demo/MainNavDemo';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const PLACE_IDS = [...TABS.map((t) => t.id), 'market'];

const mainNav: Entry = {
  name: 'MainNav',
  file: 'apps/activity/src/MainNav.tsx',
  group: 'Controls',
  description:
    'The main navigation: on a phone a game-style dock fixed to the bottom edge with three buttons (a group, the Lounge, a group; a picture over a word) and a slim HUD on top (the place name, the currencies with numbers, "?"); on a wide window a rail down the left with every place under its group heading and the HUD across the top. The left group (Creatures: Creatures, Workshop) and the right group (Adventure: Expeditions, Dungeon, Raid, Games) open a tray of big buttons above the dock (picture, word, why it has a pip, the current place gold) and carry the roll-up of their places\' pips; the active group is gold. The middle Lounge button is the primary one (gold, larger, raised above the bar) and opens the living room in a bottom sheet (a close button, Escape, pull down); the room is not at the top of the phone layout any more. Tap outside, Escape or the group button again closes a tray. One list of places, each with a group, feeds the dock and the rail. Shown in a frame (the dock under the screen, not fixed to the window) with the real Creatures, Games and Expeditions screens on fixture data (other places show a stand-in); use 360 or 390 for the phone and the full width for the desktop; the layout control forces one (not in the presets: a desktop layout is not meant for a narrow window). "Open" starts a tray or the Lounge sheet open (phone); "Extra place in Creatures" shows a group growing; "Lounge pip" shows the Lounge button with a pip.',
  controls: {
    place: { kind: 'select', options: PLACE_IDS },
    menu: { kind: 'select', options: MENUS },
    pips: { kind: 'toggle' },
    extra: { kind: 'toggle' },
    loungePip: { kind: 'toggle' },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: {
    place: 'collection',
    menu: 'none',
    pips: true,
    extra: false,
    loungePip: false,
    layout: 'auto',
  },
  presets: [
    { name: 'Creatures group active (Creatures)', props: {} },
    { name: 'Creatures group active (Workshop)', props: { place: 'workshop' } },
    { name: 'Adventure group active (Expeditions)', props: { place: 'expeditions' } },
    { name: 'Adventure group active (Dungeon)', props: { place: 'dungeon' } },
    { name: 'Adventure group active (Raid)', props: { place: 'raid' } },
    { name: 'Adventure group active (Games)', props: { place: 'games' } },
    { name: 'Creatures tray open', props: { menu: 'creatures' } },
    { name: 'Adventure tray open', props: { menu: 'adventure', place: 'expeditions' } },
    { name: 'Adventure tray open, no pips', props: { menu: 'adventure', pips: false } },
    { name: 'Lounge sheet open', props: { menu: 'lounge' } },
    { name: 'Lounge with a pip', props: { loungePip: true } },
    { name: 'No pips', props: { pips: false } },
    { name: 'Extra place in Creatures, tray open', props: { menu: 'creatures', extra: true } },
  ],
  render: (p) => (
    <MainNavDemo
      key={JSON.stringify(p)}
      place={str(p, 'place')}
      menu={str(p, 'menu')}
      pips={bool(p, 'pips')}
      extra={bool(p, 'extra')}
      loungePip={bool(p, 'loungePip')}
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
