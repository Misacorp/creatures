import { content, roomModifier } from '@creatures/game';
import { DungeonPlayback } from '../../DungeonPlayback';
import { FinaleProgress } from '../../FinaleProgress';
import { Stage } from '../../Stage';
import dungeonReplay from '../../fixtures/dungeon-replay.json';
import liveMid from '../../fixtures/live-mid.json';
import { parseDungeonReplay } from '../../dungeon-parse';
import { mineIds, modifierGimmicks, replayInput, roomBoss, stageRow } from '../../dungeon-playback';
import { roomLine } from '../../dungeon-text';
import { parseLiveSnapshot } from '../../live-api';
import { finaleProgress } from '../../raid-progress';
import { phaseLine } from '../../raid-text';
import { raidMaxRounds, roomMaxRounds } from '../../stage-rounds';
import { StageHead, type StageModifier } from '../../ui/StageHead';
import { bool, num, str } from '../props';
import { PATTERN_SCENARIOS, patternFight, type PatternScenario } from '../pattern-fight';
import { bigRaidFight } from '../raid-fight';
import { staticFx } from '../../stage-fx';
import { cuesForEvents, windupCuesForEvents } from '../../stage';
import type { IntroView } from '../../stage-fx';
import type { Entry, Props } from '../types';

const REPLAY = parseDungeonReplay(dungeonReplay);

/** The sample raid fight: the finale of a party of nine, four rounds in (a fixture, not the API). */
function sampleFight() {
  const snapshot = parseLiveSnapshot(liveMid);
  if (snapshot.status !== 'live' && snapshot.status !== 'done') {
    throw new Error('the workbench raid fixture has no fight');
  }
  return snapshot;
}

/** The "Round N / M" overlay of a round that is opening, when the page asks for it. */
function introOf(p: Props, rounds: number | null): IntroView | null {
  return bool(p, 'roundIntro')
    ? { round: Math.min(rounds ?? 3, 3), rounds, ms: 6000, key: 1 }
    : null;
}

/** A modifier of the content as the head shows it, with the words the server would send. */
function modifier(id: string): StageModifier {
  const def = roomModifier(id);
  return { id, name: def?.name ?? id, description: def?.description ?? '' };
}

/** The sample modifiers of the head's page: real content ids. */
const MODIFIER_SETS: Readonly<Record<string, readonly StageModifier[]>> = {
  none: [],
  one: [modifier('flooded')],
  two: [modifier('flooded'), modifier('scorched')],
  three: [modifier('flooded'), modifier('scorched'), modifier('thorns')],
};

const stageHead: Entry = {
  name: 'StageHead',
  file: 'apps/activity/src/ui/StageHead.tsx',
  group: 'Headings & banners',
  description:
    'The head of the fight stage in the dungeon and the raid: the room or phase at the top left ("Room 1 / 3", "Phase 1 / 3"), then the room\'s modifiers as small tags that open their glossary entry (Flooded, Scorched...; several wrap on a narrow screen), and the round at the top right ("Round 2 / 6", the fight\'s limit and never how long the fight lasted), with the live finale\'s "?" button after the place.',
  controls: {
    place: { kind: 'text', maxLength: 40 },
    round: { kind: 'text', maxLength: 40 },
    modifiers: { kind: 'select', options: ['none', 'one', 'two', 'three'] },
    helpButton: { kind: 'toggle' },
  },
  defaults: { place: 'Room 1 / 3', round: 'Round 2 / 6', modifiers: 'none', helpButton: false },
  presets: [
    { name: 'Dungeon room', props: {} },
    { name: 'Dungeon room with its modifier', props: { modifiers: 'one' } },
    { name: 'Two modifiers', props: { modifiers: 'two' } },
    { name: 'Three modifiers (wraps on a phone)', props: { modifiers: 'three' } },
    { name: 'No limit known (just the round)', props: { round: 'Round 2' } },
    { name: 'Raid phase', props: { place: phaseLine('phase1'), round: 'Round 4 / 10' } },
    {
      name: 'Live finale (with the "?")',
      props: { place: phaseLine('finale'), round: 'Round 4 / 12', helpButton: true },
    },
    { name: 'Lobby', props: { place: phaseLine('finale'), round: 'Get ready' } },
    { name: 'No place', props: { place: '' } },
    {
      name: 'Long place',
      props: { place: 'Room 3 / 3, floor boss of the deep', round: 'Round 12 / 12' },
    },
  ],
  render: (p) => (
    <section class="stage">
      <StageHead
        {...(str(p, 'place') === '' ? {} : { place: str(p, 'place') })}
        round={str(p, 'round')}
        modifiers={MODIFIER_SETS[str(p, 'modifiers')] ?? []}
      >
        {bool(p, 'helpButton') && (
          <button type="button" class="stage-help pix" aria-label="How abilities work">
            ?
          </button>
        )}
      </StageHead>
    </section>
  ),
};

/** An event index well into round 2 of the 11-player fight, with a creature in the middle acting. */
const BIG_MID_FIGHT = 150;

const stage: Entry = {
  name: 'Stage',
  file: 'apps/activity/src/Stage.tsx',
  group: 'Creatures & game pieces',
  description:
    'The fight stage of the raid replay, the live finale and the dungeon, held still at one moment of a fixture fight: the head (with the room\'s modifier tags in the dungeon), the foe\'s name with its element chip after it, its picture (tap it for the foe popover: element, HP, its attack and tricks) and HP bar, the creatures with the order they act in and the one acting now outlined. The raid\'s party is a grid like the placement board (rows front to back, lanes as columns, scrolling sideways); it opens on your own creatures and follows the one acting. "Raid, big party" plays a seeded fight of the party size set below. "Boss moves" holds one hand-made boss move still (a sweep, barrage, slam, lance, pincer, chain, a charge with its amber marks, a Support\'s heal, the Enraged banner, a retreat, or the lines of gear: a Stubborn creature that stays up at 1 HP, and an Echo, a Sidestep and a Payback), at its wind-up or as it lands.',
  controls: {
    fight: {
      kind: 'select',
      options: ['Raid', 'Raid, big party', 'Dungeon room', 'Boss moves'],
    },
    move: { kind: 'select', options: PATTERN_SCENARIOS },
    moment: { kind: 'select', options: ['Landed', 'Wind-up'] },
    events: { kind: 'number', min: 0, max: 600 },
    room: { kind: 'number', min: 1, max: 3 },
    players: { kind: 'number', min: 1, max: 15 },
    yourLane: { kind: 'number', min: 1, max: 15 },
    roundIntro: { kind: 'toggle' },
  },
  defaults: {
    fight: 'Raid',
    move: 'Sweep (Great Wave)',
    moment: 'Landed',
    events: 75,
    room: 1,
    players: 11,
    yourLane: 5,
    roundIntro: false,
  },
  presets: [
    { name: 'Raid, third round, fourth creature acting', props: {} },
    { name: 'Raid, before the first round', props: { events: 0 } },
    { name: 'Raid, "Round 3 / 12" opening', props: { events: 59, roundIntro: true } },
    { name: 'Raid, the boss has struck', props: { events: 127 } },
    {
      name: 'Raid, 11 players (33 slots), mid-fight',
      props: { fight: 'Raid, big party', players: 11, yourLane: 5, events: BIG_MID_FIGHT },
    },
    {
      name: 'Raid, 11 players, before the first round (your lane in view)',
      props: { fight: 'Raid, big party', players: 11, yourLane: 9, events: 0 },
    },
    {
      name: 'Dungeon room 1, the second creature acting',
      props: { fight: 'Dungeon room', events: 8 },
    },
    { name: 'Dungeon room 3, the end', props: { fight: 'Dungeon room', events: 200, room: 3 } },
    ...PATTERN_SCENARIOS.map((move) => ({
      name: `Boss move: ${move}`,
      props: { fight: 'Boss moves', move },
    })),
    {
      name: 'Boss move: Barrage, the wind-up',
      props: { fight: 'Boss moves', move: 'Barrage (Cinder Fall)', moment: 'Wind-up' },
    },
    {
      name: 'Boss move: Slam, the wind-up',
      props: { fight: 'Boss moves', move: 'Slam (Coil Crush)', moment: 'Wind-up' },
    },
    {
      name: 'Boss move: Sweep, the row outline',
      props: { fight: 'Boss moves', move: 'Sweep (Great Wave)', moment: 'Wind-up' },
    },
  ],
  render: (p) => {
    if (str(p, 'fight') === 'Boss moves') {
      const move = str(p, 'move') as PatternScenario;
      const fight = patternFight(move);
      const ids = fight.row.map((r) => r.id);
      const windup = str(p, 'moment') === 'Wind-up';
      // Held still at one moment: the wind-up (reticles, outlines, rings) before the move's first
      // event, or the landed move with everything after it applied.
      const index = windup ? fight.moveAt : fight.events.length;
      const cues = windup
        ? windupCuesForEvents(fight.events, 0, fight.events.length, ids, fight.boss.id)
        : cuesForEvents(fight.events, 0, fight.events.length, ids, fight.boss.id);
      return (
        <Stage
          boss={fight.boss}
          hpMax={fight.hpMax}
          hpStart={fight.hpMax}
          rounds={raidMaxRounds('finale', fight.boss.id)}
          row={fight.row}
          mineIds={new Set(fight.row.filter((r) => r.owner === 'p1').map((r) => r.id))}
          names={{
            boss: fight.boss.name,
            creatures: Object.fromEntries(fight.row.map((r) => [r.id, r.name])),
            gimmicks: Object.fromEntries(
              (content.bosses.find((b) => b.id === fight.boss.id)?.gimmicks ?? []).map((g) => [
                g.id,
                g.name,
              ]),
            ),
          }}
          events={fight.events}
          index={index}
          anim={null}
          fx={staticFx(cues)}
          place={phaseLine(fight.phase ?? 'finale')}
          {...(fight.phase === undefined ? {} : { phase: fight.phase })}
        />
      );
    }
    if (str(p, 'fight') === 'Dungeon room') {
      const room = REPLAY.rooms[num(p, 'room') - 1] ?? REPLAY.rooms[0];
      if (room === undefined) return <p class="muted">The fixture has no room.</p>;
      return (
        <Stage
          boss={roomBoss(room)}
          hpMax={room.foe.hpMax}
          hpStart={room.foe.hpMax}
          rounds={roomMaxRounds(room.foe.id)}
          row={stageRow(REPLAY)}
          mineIds={mineIds([])}
          names={room.names}
          events={room.events}
          index={num(p, 'events')}
          anim={null}
          intro={introOf(p, roomMaxRounds(room.foe.id))}
          creatureHp={{ start: room.hpStart, max: room.hpMax }}
          layout="row"
          place={roomLine(room.index, REPLAY.rooms.length)}
          modifiers={[room.modifier]}
          addedGimmicks={modifierGimmicks(room)}
        />
      );
    }
    if (str(p, 'fight') === 'Raid, big party') {
      const big = bigRaidFight(num(p, 'players'), num(p, 'yourLane') - 1);
      return (
        <Stage
          boss={big.boss}
          hpMax={big.hpMax}
          hpStart={big.hpMax}
          rounds={raidMaxRounds('finale', big.boss.id)}
          row={big.row}
          mineIds={big.mineIds}
          names={big.names}
          events={big.events}
          index={num(p, 'events')}
          anim={null}
          intro={introOf(p, raidMaxRounds('finale', big.boss.id))}
          place={phaseLine('finale')}
        />
      );
    }
    const fight = sampleFight();
    return (
      <Stage
        boss={fight.boss}
        hpMax={fight.boss.hpMax}
        hpStart={fight.boss.hpStart}
        rounds={raidMaxRounds('phase1', fight.boss.id)}
        row={fight.row}
        mineIds={new Set(fight.row.filter((r) => r.owner === fight.you).map((r) => r.id))}
        names={fight.names}
        events={fight.events}
        index={num(p, 'events')}
        anim={null}
        intro={introOf(p, raidMaxRounds('phase1', fight.boss.id))}
        place={phaseLine('phase1')}
      />
    );
  },
};

const dungeonPlayback: Entry = {
  name: 'DungeonPlayback',
  file: 'apps/activity/src/DungeonPlayback.tsx',
  group: 'Creatures & game pieces',
  description:
    'The dungeon fight as it plays after a run, room by room on the stage with the room banner first (about five seconds, with a yellow outline round the stage that drains toward the bottom until the fight starts); Pause, 2x and Skip are hidden unless switched on here. It plays a fixture run, so reload the page to see it again.',
  controls: { showControls: { kind: 'toggle' } },
  defaults: { showControls: false },
  presets: [
    { name: 'Plays by itself', props: {} },
    { name: 'With the controls', props: { showControls: true } },
  ],
  render: (p) => (
    <DungeonPlayback
      key={String(bool(p, 'showControls'))}
      input={replayInput(REPLAY)}
      onDone={() => undefined}
      showControls={bool(p, 'showControls')}
    />
  ),
};

const finaleProgressEntry: Entry = {
  name: 'FinaleProgress',
  file: 'apps/activity/src/FinaleProgress.tsx',
  group: 'Bars',
  description:
    "What a finale did to the Boss Rank and where the season stands, under the finale result: the Rank as the dungeon's edge-to-edge track (this Rank, the next one) and the five season pips, the last one the Festival.",
  controls: {
    rank: { kind: 'number', min: 0, max: 40 },
    seasonWeek: { kind: 'number', min: 0, max: 5 },
  },
  defaults: { rank: 4, seasonWeek: 2 },
  presets: [
    { name: 'Rank 4, week 2', props: {} },
    { name: 'First week of a season', props: { rank: 1, seasonWeek: 1 } },
    { name: 'Festival (the last pip)', props: { rank: 7, seasonWeek: 5 } },
    { name: 'Rank not known yet', props: { rank: 0 } },
    { name: 'Season not known', props: { seasonWeek: 0 } },
    { name: 'A high rank', props: { rank: 32, seasonWeek: 4 } },
  ],
  render: (p) => {
    const rank = num(p, 'rank');
    const week = num(p, 'seasonWeek');
    const progress = finaleProgress(
      {
        week: 'wb-week',
        rankChange:
          rank === 0
            ? null
            : { before: Math.max(1, rank - 1), after: rank, festival: week === 5, serverWon: true },
      },
      week === 0 ? null : { weekId: 'wb-week', season: { index: 1, week } },
    );
    return progress === null ? (
      <p class="muted">Nothing to show yet.</p>
    ) : (
      <FinaleProgress progress={progress} />
    );
  },
};

export const stageEntries: readonly Entry[] = [
  stageHead,
  stage,
  dungeonPlayback,
  finaleProgressEntry,
];
