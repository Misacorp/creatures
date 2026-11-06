import { bool, str } from '../props';
import type { Entry } from '../types';
import {
  VALLEY_DAYS,
  VALLEY_COMMONS,
  VALLEY_FORGE,
  VALLEY_MARKET,
  VALLEY_SCHOOL,
  VALLEY_VISITOR,
  VALLEY_OPEN,
  VALLEY_PAPERS,
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
    "The valley shell (the `VALLEY` flag, phase 4 steps 1 and 2): the real HUD with the valley in place of the dock and the tab pages. The map of eleven places (west to east: Cave, Fairground, School, House, Paddock, Market, Forge, Bonfire, Arena, Visitor, Signpost) with the creature tray under it and the Places button (a flag, top left); a phone pans the map sideways and shows edge chips for places out of view. The seven open places (Cave, Fairground, House, Paddock, Forge, Arena, Signpost) open one of today's pages under \"‹ Valley\"; the four new ones (School, Bonfire, Visitor, Market) show their scene and one line of what they will be. Each place with something waiting has a speech bubble (its glyph, and a count where it counts), also on its edge chip; the list under the Places button says what happens next at each place. `day` picks the fixture day (a busy one, nothing waiting, nothing going on). `start` picks where it opens; tap around as in the game. The Cave, Arena, Fairground, House and Paddock each open with their scene above today's page (the creatures that are really there: the dungeon team at the cave mouth, the raid party and boss in the arena, the entered creatures at their events, the creatures at home and the waiting catches at the paddock gate; the House shows only its house, with Journal and Stats under it and no living room). Every creature in a scene wears a nameplate under its feet (level in yellow, then the name), and a scene draws only as many creatures as fit with their plates side by side, so fewer on a phone. The one action of each scene goes to the page under it. Forge shows the Workshop on fixture data; the other pages are drawn by their own workbench pages, so they stay empty here. `paper` plays the welcome-back Gazette on the server's real paper (phase 5 step 4: a short absence, a long one, and one in which a scout found a way deeper, the paper's one choice at its end). `resting` turns the valley's base systems on (phase 5 step 1, `VALLEY_SYSTEMS`): the Bonfire opens with a rotating few of the resting creatures round the fire, each with its \"+N\" experience of this visit on its nameplate, and \"+N more\" (a tap lists them all with their gains); the tray marks each resting creature with a small z; the Places list says how many rest and what they gained; the Gazette's coming-home flight adds the Acorns the allowance brought. `commons` (phase 5 step 6b) adds the valley's shared projects: each place that has one shows a project board in its page (the Signpost, Forge and Paddock; the Bonfire opens it in a drawer from the pinned button): its level, the project's bar and what is still needed, your own part, one Give button (the list of parts, then the amount and one confirm), the plaque of the last finished level, the place's collection of five sockets, and your helper slot (the shared creature picker, or drag from the tray); the scene shows scaffolding that rises as the project fills and a helper working; the Forge shows its fire (a flame that grows, the next step, its numbers in a drawer); the Bonfire's art grows with its level and shows the hearth's bonus; the House shelves your keepsakes; the Places list says when a project is being built. `open` also picks which of those drawers starts open. `school` (phase 5 step 9b) turns on the School and the trials: its place becomes a scene and a page (the yard with the bench, the lectern and bell while the teacher is announced, the teacher at the lectern while here; the visiting teacher's card with the days, your students with one Send each or Take off, the graduation card), the map gets a bubble over it, and every creature card shows its next trial as pips (a tap lists the boxes) with a title, a badge and a ribbon for an honour.",
  controls: {
    start: { kind: 'select', options: VALLEY_STARTS },
    away: { kind: 'toggle' },
    day: { kind: 'select', options: VALLEY_DAYS },
    resting: { kind: 'select', options: VALLEY_RESTING },
    scouts: { kind: 'select', options: VALLEY_SCOUTS },
    open: { kind: 'select', options: VALLEY_OPEN },
    forge: { kind: 'select', options: VALLEY_FORGE },
    commons: { kind: 'select', options: VALLEY_COMMONS },
    market: { kind: 'select', options: VALLEY_MARKET },
    visitor: { kind: 'select', options: VALLEY_VISITOR },
    school: { kind: 'select', options: VALLEY_SCHOOL },
    paper: { kind: 'select', options: VALLEY_PAPERS },
  },
  defaults: {
    start: 'valley',
    away: false,
    day: 'busy',
    resting: 'off',
    scouts: 'off',
    open: 'nothing',
    forge: 'off',
    commons: 'off',
    market: 'off',
    visitor: 'off',
    school: 'off',
    paper: 'off',
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
      name: 'Forge, systems on: no anvil bought yet',
      props: { start: 'forge', forge: 'no anvils' },
    },
    { name: 'Forge, systems on: one smith at work', props: { start: 'forge', forge: 'one smith' } },
    { name: 'Forge, systems on: two anvils', props: { start: 'forge', forge: 'two anvils' } },
    {
      name: 'Forge, systems on: a smith tinkering (waiting for shards)',
      props: { start: 'forge', forge: 'tinkering' },
    },
    { name: 'Forge, systems on: a full floor', props: { start: 'forge', forge: 'full floor' } },
    {
      name: 'Forge: the order editor (a new order)',
      props: { start: 'forge', forge: 'two anvils', open: 'order editor' },
    },
    {
      name: 'Forge: change an order',
      props: { start: 'forge', forge: 'two anvils', open: 'edit an order' },
    },
    {
      name: 'Forge: the shard exchange',
      props: { start: 'forge', forge: 'tinkering', open: 'exchange' },
    },
    {
      name: 'Forge: floor and pace',
      props: { start: 'forge', forge: 'two anvils', open: 'floor and pace' },
    },
    { name: 'Forge: anvil kit', props: { start: 'forge', forge: 'two anvils', open: 'anvil kit' } },
    {
      name: 'Forge: the smith picker',
      props: { start: 'forge', forge: 'two anvils', open: 'smith picker' },
    },
    {
      name: 'Forge: buy an anvil',
      props: { start: 'forge', forge: 'one smith', open: 'buy an anvil' },
    },
    {
      name: 'Forge: the bag with filter and sort',
      props: { start: 'forge', forge: 'two anvils', open: 'bag filter' },
    },
    {
      name: 'Signpost, commons: its project open (28%), plaque, collection, your helper slot',
      props: { start: 'signpost', scouts: 'one scout', commons: 'young server' },
    },
    {
      name: 'Signpost, commons: a helper posted (seen in the scene and the tray)',
      props: { start: 'signpost', scouts: 'one scout', commons: 'helpers posted' },
    },
    {
      name: 'Signpost: give, the list of parts',
      props: { start: 'signpost', scouts: 'one scout', commons: 'young server', open: 'give list' },
    },
    {
      name: 'Signpost: give, the amount and the one confirm',
      props: {
        start: 'signpost',
        scouts: 'one scout',
        commons: 'young server',
        open: 'give amount',
      },
    },
    {
      name: 'Signpost: the plaque of a finished level (names, no amounts)',
      props: { start: 'signpost', scouts: 'one scout', commons: 'young server', open: 'plaque' },
    },
    {
      name: 'Signpost: its collection board, complete (five sockets)',
      props: {
        start: 'signpost',
        scouts: 'one scout',
        commons: 'full collection',
        open: 'collection',
      },
    },
    {
      name: 'Signpost: the helper picker',
      props: {
        start: 'signpost',
        scouts: 'one scout',
        commons: 'young server',
        open: 'helper picker',
      },
    },
    {
      name: 'Forge, commons: the fire and a project being built (2 days left)',
      props: { start: 'forge', forge: 'two anvils', commons: 'young server' },
    },
    {
      name: 'Forge: the fire grown (flame and what comes next)',
      props: { start: 'forge', forge: 'two anvils', commons: 'the fire grown' },
    },
    {
      name: 'Forge: the fire, its numbers and what warmed it',
      props: {
        start: 'forge',
        forge: 'two anvils',
        commons: 'the fire grown',
        open: 'fire numbers',
      },
    },
    {
      name: 'Paddock, commons: its project board above the creatures',
      props: { start: 'paddock', day: 'crowded', commons: 'young server' },
    },
    {
      name: 'House, commons: the keepsake shelf',
      props: { start: 'house', commons: 'young server' },
    },
    {
      name: 'Bonfire, commons: level 1, the hearth being built (scaffolding)',
      props: { start: 'bonfire', resting: 'few', commons: 'young server' },
    },
    {
      name: 'Bonfire, commons: level 3 (the grand hearth, +8%)',
      props: { start: 'bonfire', resting: 'few', commons: 'bonfire level 3' },
    },
    {
      name: 'Bonfire: the hearth board in its drawer',
      props: { start: 'bonfire', resting: 'few', commons: 'bonfire level 3', open: 'give list' },
    },
    {
      name: 'Bonfire: the lamplighter (a helper) posted',
      props: { start: 'bonfire', resting: 'few', commons: 'helpers posted' },
    },
    {
      name: 'The valley, commons: the grand bonfire on the map, the Forge building in the Places list',
      props: { resting: 'few', commons: 'bonfire level 3' },
    },
    {
      name: 'Market, not open yet (the guided start has not reached it)',
      props: { start: 'market' },
    },
    {
      name: 'Market, systems on: not open yet',
      props: { start: 'market', market: 'not open' },
    },
    {
      name: 'Market, systems on: its project being built (scaffolding, the board)',
      props: { start: 'market', market: 'being built' },
    },
    {
      name: 'Market, systems on: built, a free broker seat',
      props: { start: 'market', market: 'open, free seat' },
    },
    {
      name: 'Market, systems on: a broker at work',
      props: { start: 'market', market: 'open with a broker' },
    },
    {
      name: 'Market, systems on: a broker with no spare shards to trade',
      props: { start: 'market', market: 'broker stuck' },
    },
    {
      name: 'Market: the broker picker',
      props: { start: 'market', market: 'open with a broker', open: 'broker picker' },
    },
    {
      name: 'Market: what the broker trades toward',
      props: { start: 'market', market: 'master broker', open: 'trade toward' },
    },
    {
      name: "Market: the broker's rates and next step",
      props: { start: 'market', market: 'open with a broker', open: 'broker rates' },
    },
    {
      name: 'The valley, systems on, with the Gazette (Acorns fly in too)',
      props: { resting: 'few', away: true },
    },
    {
      name: 'Visitor, systems off: not open yet',
      props: { start: 'visitor' },
    },
    {
      name: 'Visitor here: his stall, the reroll and the week\u2019s blueprint',
      props: { start: 'visitor', visitor: 'here' },
    },
    {
      name: 'Visitor here: a blueprint you know (a copy adds a mark)',
      props: { start: 'visitor', visitor: 'here, known blueprint' },
    },
    {
      name: 'Visitor away: the shuttered stall and one line',
      props: { start: 'visitor', visitor: 'away' },
    },
    {
      name: 'Visitor: the reroll picker',
      props: { start: 'visitor', visitor: 'here', open: 'reroll picker' },
    },
    {
      name: 'Visitor: a piece chosen, its price and the odds',
      props: { start: 'visitor', visitor: 'here', open: 'reroll piece' },
    },
    {
      name: 'The valley with the visitor here (his stall open on the map)',
      props: { visitor: 'here' },
    },
    {
      name: 'The valley with the visitor away (his stall shuttered on the map)',
      props: { visitor: 'away' },
    },
    {
      name: 'School, systems off: not open yet',
      props: { start: 'school' },
    },
    {
      name: 'School: the teacher here, the faces that would learn, one Send each',
      props: { start: 'school', school: 'here' },
    },
    {
      name: 'School: a student seated (learns it by morning), the ribbon on its sprite',
      props: { start: 'school', school: 'here, a student seated' },
    },
    {
      name: 'School: none of yours this time',
      props: { start: 'school', school: 'here, none of yours' },
    },
    {
      name: 'School: the teacher announced (the bell and the lectern at the door)',
      props: { start: 'school', school: 'announced' },
    },
    {
      name: 'School: no teacher, creatures ready to graduate, the next ceremony',
      props: { start: 'school', school: 'away, ready to graduate' },
    },
    {
      name: 'Paddock with trials: pips on each card, a title and a ribbon for the honoured',
      props: { start: 'paddock', school: 'here', day: 'crowded' },
    },
    {
      name: 'The valley with the School\u2019s news on the map (a bubble over it)',
      props: { school: 'away, ready to graduate' },
    },
    {
      name: 'Gazette on real output: a short absence',
      props: { resting: 'few', paper: 'short absence' },
    },
    {
      name: 'Gazette on real output: a long absence (a week and more, no longer)',
      props: { resting: 'few', paper: 'long absence' },
    },
    {
      name: 'Gazette on real output: push on (a scout found a way deeper)',
      props: { resting: 'few', paper: 'push on' },
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
      forge={str(p, 'forge')}
      commons={str(p, 'commons')}
      market={str(p, 'market')}
      visitor={str(p, 'visitor')}
      school={str(p, 'school')}
      paper={str(p, 'paper')}
    />
  ),
};

export const valleyShellEntries: readonly Entry[] = [valleyShell];
