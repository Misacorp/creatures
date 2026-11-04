import { bool, str } from '../props';
import type { Entry } from '../types';
import { VALLEY_DAYS, VALLEY_STARTS, ValleyDemo } from '../valley-demo/ValleyDemo';

const valleyShell: Entry = {
  name: 'ValleyFrame',
  file: 'apps/activity/src/valley/ValleyFrame.tsx',
  group: 'Controls',
  description:
    'The valley shell (the `VALLEY` flag, phase 4 steps 1 and 2): the real HUD with the valley in place of the dock and the tab pages. The map of eleven places (west to east: Cave, Fairground, School, House, Paddock, Market, Forge, Bonfire, Arena, Visitor, Signpost) with the creature tray under it and the Places button (a flag, top left); a phone pans the map sideways and shows edge chips for places out of view. The seven open places (Cave, Fairground, House, Paddock, Forge, Arena, Signpost) open one of today\'s pages under "‹ Valley"; the four new ones (School, Bonfire, Visitor, Market) show their scene and one line of what they will be. Each place with something waiting has a speech bubble (its glyph, and a count where it counts), also on its edge chip; the list under the Places button says what happens next at each place. `day` picks the fixture day (a busy one, nothing waiting, nothing going on). `start` picks where it opens; tap around as in the game. Forge shows the Workshop on fixture data; the other pages are drawn by their own workbench pages, so they stay empty here.',
  controls: {
    start: { kind: 'select', options: VALLEY_STARTS },
    away: { kind: 'toggle' },
    day: { kind: 'select', options: VALLEY_DAYS },
  },
  defaults: { start: 'valley', away: false, day: 'busy' },
  presets: [
    { name: 'The valley', props: {} },
    { name: 'The valley, with the away paper', props: { away: true } },
    { name: 'The valley, a quiet day', props: { day: 'nothing going on' } },
    { name: 'The valley, nothing waiting', props: { day: 'nothing waiting' } },
    { name: 'Forge, the Workshop inside', props: { start: 'forge' } },
    { name: 'House, the living room', props: { start: 'house' } },
    { name: 'School, not open yet', props: { start: 'school' } },
    { name: 'Bonfire, not open yet', props: { start: 'bonfire' } },
  ],
  render: (p) => (
    <ValleyDemo
      key={JSON.stringify(p)}
      start={str(p, 'start')}
      away={bool(p, 'away')}
      day={str(p, 'day')}
    />
  ),
};

export const valleyShellEntries: readonly Entry[] = [valleyShell];
