import { HomePage, LAYOUTS, VARIANTS } from '../home-mockups/HomePage';
import { HOME_STATES } from '../home-mockups/home-data';
import { bool, str } from '../props';
import type { Entry } from '../types';

const homePage: Entry = {
  name: 'HomePage',
  file: 'apps/activity/src/workbench/home-mockups/HomePage.tsx',
  group: 'Creatures & game pieces',
  description:
    'Design round for the Home page, the dock’s middle button (not in the game yet): the living room at the top and, below it, a board of what needs the player. Two variants to pick from. "Today board": a notice board with "Needs you" (a big button per place with something waiting, its picture, the reason and a pip), "Coming up" (the next things on the clock with their times) and "The valley today" (the sky and the Games lineup); with nothing waiting, one calm line. "Place cards": a grid of six cards (Expeditions, Workshop, Raid, Games, Dungeon, Creatures), each a button with the place’s picture, a one-line status and its pip. Drawn in the real HUD and dock (middle button "Home") or the real rail, on fixture data with a fixed clock (Saturday 10:00 Helsinki). "Raid schedule" off shows the page without the raid week’s times, which the game screen does not hold yet.',
  controls: {
    variant: { kind: 'select', options: VARIANTS },
    state: { kind: 'select', options: HOME_STATES },
    raid: { kind: 'toggle' },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: { variant: 'today board', state: 'busy', raid: true, layout: 'auto' },
  presets: [
    { name: 'A: Today board', props: {} },
    { name: 'A: Today board, nothing waiting', props: { state: 'nothing waiting' } },
    { name: 'A: Today board, crowded', props: { state: 'crowded' } },
    { name: 'A: Today board, no raid schedule', props: { raid: false } },
    { name: 'B: Place cards', props: { variant: 'place cards' } },
    {
      name: 'B: Place cards, nothing waiting',
      props: { variant: 'place cards', state: 'nothing waiting' },
    },
    { name: 'B: Place cards, crowded', props: { variant: 'place cards', state: 'crowded' } },
    { name: 'B: Place cards, no raid schedule', props: { variant: 'place cards', raid: false } },
  ],
  render: (p) => (
    <HomePage
      key={JSON.stringify(p)}
      variant={str(p, 'variant')}
      state={str(p, 'state')}
      raid={bool(p, 'raid')}
      layout={str(p, 'layout')}
    />
  ),
};

export const homePageEntries: readonly Entry[] = [homePage];
