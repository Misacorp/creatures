import { bool, str } from '../props';
import type { Entry } from '../types';
import {
  VALLEY_DAYS,
  VALLEY_OPEN,
  VALLEY_RESTING,
  VALLEY_SCOUTS,
  VALLEY_STARTS,
  ValleyDemo,
} from '../valley-demo/ValleyDemo';

const valleyShell: Entry = {
  name: 'ValleyFrame',
  file: 'apps/activity/src/valley/ValleyFrame.tsx',
  group: 'Controls',
  description:
    'The valley shell (the `VALLEY` flag, phase 4 steps 1 and 2): the real HUD with the valley in place of the dock and the tab pages. The map of eleven places (west to east: Cave, Fairground, School, House, Paddock, Market, Forge, Bonfire, Arena, Visitor, Signpost) with the creature tray under it and the Places button (a flag, top left); a phone pans the map sideways and shows edge chips for places out of view. The seven open places (Cave, Fairground, House, Paddock, Forge, Arena, Signpost) open one of today\'s pages under "‹ Valley"; the four new ones (School, Bonfire, Visitor, Market) show their scene and one line of what they will be. Each place with something waiting has a speech bubble (its glyph, and a count where it counts), also on its edge chip; the list under the Places button says what happens next at each place. `day` picks the fixture day (a busy one, nothing waiting, nothing going on). `start` picks where it opens; tap around as in the game. The Cave, Arena, Fairground, House and Paddock each open with their scene above today\'s page (the creatures that are really there: the dungeon team at the cave mouth, the raid party and boss in the arena, the entered creatures at their events, the creatures at home and the waiting catches at the paddock gate; the House shows only its house, with Journal and Stats under it and no living room). Every creature in a scene wears a nameplate under its feet (level in yellow, then the name), and a scene draws only as many creatures as fit with their plates side by side, so fewer on a phone. The one action of each scene goes to the page under it. Forge shows the Workshop on fixture data; the other pages are drawn by their own workbench pages, so they stay empty here. `resting` turns the valley\'s base systems on (phase 5 step 1, `VALLEY_SYSTEMS`): the Bonfire opens with a rotating few of the resting creatures round the fire, each with its "+N" experience of this visit on its nameplate, and "+N more" (a tap lists them all with their gains); the tray marks each resting creature with a small z; the Places list says how many rest and what they gained; the Gazette\'s coming-home flight adds the Acorns the allowance brought.',
  controls: {
    start: { kind: 'select', options: VALLEY_STARTS },
    away: { kind: 'toggle' },
    day: { kind: 'select', options: VALLEY_DAYS },
    resting: { kind: 'select', options: VALLEY_RESTING },
    scouts: { kind: 'select', options: VALLEY_SCOUTS },
    open: { kind: 'select', options: VALLEY_OPEN },
  },
  defaults: {
    start: 'valley',
    away: false,
    day: 'busy',
    resting: 'off',
    scouts: 'off',
    open: 'nothing',
  },
  presets: [
    { name: 'The valley', props: {} },
    { name: 'The valley, with the welcome-back Gazette', props: { away: true } },
    { name: 'The valley, a quiet day', props: { day: 'nothing going on' } },
    { name: 'The valley, nothing waiting', props: { day: 'nothing waiting' } },
    { name: 'Forge, the Workshop inside', props: { start: 'forge' } },
    { name: 'House (Journal and Stats)', props: { start: 'house' } },
    { name: 'Cave, busy', props: { start: 'cave' } },
    { name: 'Cave, quiet', props: { start: 'cave', day: 'nothing going on' } },
    { name: 'Arena, busy', props: { start: 'arena' } },
    { name: 'Fairground, busy', props: { start: 'fair' } },
    { name: 'Paddock, busy', props: { start: 'paddock', day: 'crowded' } },
    { name: 'School, not open yet', props: { start: 'school' } },
    { name: 'Bonfire, not open yet', props: { start: 'bonfire' } },
    { name: 'Bonfire, open: four resting', props: { start: 'bonfire', resting: 'few' } },
    { name: 'Bonfire, open: many resting (+N more)', props: { start: 'bonfire', resting: 'many' } },
    { name: 'The valley, systems on (the tray says Resting)', props: { resting: 'many' } },
    {
      name: 'Signpost, systems on: no seat bought yet',
      props: { start: 'signpost', scouts: 'no seats' },
    },
    {
      name: 'Signpost, systems on: one scout out',
      props: { start: 'signpost', scouts: 'one scout' },
    },
    {
      name: 'Signpost, systems on: two scouts out',
      props: { start: 'signpost', scouts: 'two scouts' },
    },
    {
      name: 'Signpost, systems on: a full pack',
      props: { start: 'signpost', scouts: 'a full pack' },
    },
    {
      name: 'Signpost: the scout picker',
      props: { start: 'signpost', scouts: 'two scouts', open: 'scout picker' },
    },
    {
      name: 'Signpost: where to scout',
      props: { start: 'signpost', scouts: 'two scouts', open: 'destination' },
    },
    { name: 'Signpost: kit', props: { start: 'signpost', scouts: 'two scouts', open: 'kit' } },
    {
      name: 'Signpost: the pack and its pace',
      props: { start: 'signpost', scouts: 'a full pack', open: 'pack and pace' },
    },
    {
      name: 'Signpost: buy a seat',
      props: { start: 'signpost', scouts: 'one scout', open: 'buy a seat' },
    },
    {
      name: 'The valley, systems on, with the Gazette (Acorns fly in too)',
      props: { resting: 'few', away: true },
    },
  ],
  render: (p) => (
    <ValleyDemo
      key={JSON.stringify(p)}
      start={str(p, 'start')}
      away={bool(p, 'away')}
      day={str(p, 'day')}
      resting={str(p, 'resting')}
      scouts={str(p, 'scouts')}
      open={str(p, 'open')}
    />
  ),
};

export const valleyShellEntries: readonly Entry[] = [valleyShell];
