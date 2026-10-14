import { DungeonPlayback } from '../../DungeonPlayback';
import { FinaleProgress } from '../../FinaleProgress';
import { Stage } from '../../Stage';
import dungeonReplay from '../../fixtures/dungeon-replay.json';
import liveMid from '../../fixtures/live-mid.json';
import { parseDungeonReplay } from '../../dungeon-parse';
import { mineIds, roomBoss, stageRow } from '../../dungeon-playback';
import { roomLine } from '../../dungeon-text';
import { parseLiveSnapshot } from '../../live-api';
import { finaleProgress } from '../../raid-progress';
import { phaseLine } from '../../raid-text';
import { StageHead } from '../../ui/StageHead';
import { bool, num, str } from '../props';
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
function introOf(p: Props, rounds: number): IntroView | null {
  return bool(p, 'roundIntro') ? { round: Math.min(rounds, 3), rounds, ms: 6000, key: 1 } : null;
}

const stageHead: Entry = {
  name: 'StageHead',
  file: 'apps/activity/src/ui/StageHead.tsx',
  group: 'Headings & banners',
  description:
    'The head of the fight stage in the dungeon and the raid: the room or phase at the top left ("Room 1 / 3", "Phase 1 / 3") and the round at the top right ("Round 2 / 12"), with the live finale\'s "?" button after the place.',
  controls: {
    place: { kind: 'text', maxLength: 40 },
    round: { kind: 'text', maxLength: 40 },
    helpButton: { kind: 'toggle' },
  },
  defaults: { place: 'Room 1 / 3', round: 'Round 2 / 2', helpButton: false },
  presets: [
    { name: 'Dungeon room', props: {} },
    { name: 'Raid phase', props: { place: phaseLine('phase1'), round: 'Round 4 / 10' } },
    {
      name: 'Live finale (with the "?")',
      props: { place: phaseLine('finale'), round: 'Round 4 / 12', helpButton: true },
    },
    { name: 'Lobby', props: { place: phaseLine('finale'), round: 'Get ready' } },
    { name: 'No place', props: { place: '' } },
    {
      name: 'Long place',
      props: { place: 'Room 3 / 3, room boss of the deep', round: 'Round 12 / 12' },
    },
  ],
  render: (p) => (
    <section class="stage">
      <StageHead
        {...(str(p, 'place') === '' ? {} : { place: str(p, 'place') })}
        round={str(p, 'round')}
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

const stage: Entry = {
  name: 'Stage',
  file: 'apps/activity/src/Stage.tsx',
  group: 'Creatures & game pieces',
  description:
    "The fight stage of the raid replay, the live finale and the dungeon, held still at one moment of a fixture fight: the head, the foe's name and HP bar, the creatures with the order they act in and the one acting now outlined.",
  controls: {
    fight: { kind: 'select', options: ['Raid', 'Dungeon room'] },
    events: { kind: 'number', min: 0, max: 200 },
    room: { kind: 'number', min: 1, max: 3 },
    roundIntro: { kind: 'toggle' },
  },
  defaults: { fight: 'Raid', events: 75, room: 1, roundIntro: false },
  presets: [
    { name: 'Raid, third round, fourth creature acting', props: {} },
    { name: 'Raid, before the first round', props: { events: 0 } },
    { name: 'Raid, "Round 3 / 12" opening', props: { events: 59, roundIntro: true } },
    { name: 'Raid, the boss has struck', props: { events: 127 } },
    {
      name: 'Dungeon room 1, the second creature acting',
      props: { fight: 'Dungeon room', events: 8 },
    },
    { name: 'Dungeon room 3, the end', props: { fight: 'Dungeon room', events: 200, room: 3 } },
  ],
  render: (p) => {
    if (str(p, 'fight') === 'Dungeon room') {
      const room = REPLAY.rooms[num(p, 'room') - 1] ?? REPLAY.rooms[0];
      if (room === undefined) return <p class="muted">The fixture has no room.</p>;
      return (
        <Stage
          boss={roomBoss(room)}
          hpMax={room.foe.hpMax}
          hpStart={room.foe.hpMax}
          rounds={room.rounds}
          row={stageRow(REPLAY)}
          mineIds={mineIds([])}
          names={room.names}
          events={room.events}
          index={num(p, 'events')}
          anim={null}
          intro={introOf(p, room.rounds)}
          creatureHp={{ start: room.hpStart, max: room.hpMax }}
          layout="row"
          place={roomLine(room.index, REPLAY.rooms.length)}
        />
      );
    }
    const fight = sampleFight();
    return (
      <Stage
        boss={fight.boss}
        hpMax={fight.boss.hpMax}
        hpStart={fight.boss.hpStart}
        rounds={fight.rounds}
        row={fight.row}
        mineIds={new Set(fight.row.filter((r) => r.owner === fight.you).map((r) => r.id))}
        names={fight.names}
        events={fight.events}
        index={num(p, 'events')}
        anim={null}
        intro={introOf(p, fight.rounds)}
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
    'The dungeon fight as it plays after a run, room by room on the stage with the room banner first; Pause, 2x and Skip are hidden unless switched on here. It plays a fixture run, so reload the page to see it again.',
  controls: { showControls: { kind: 'toggle' } },
  defaults: { showControls: false },
  presets: [
    { name: 'Plays by itself', props: {} },
    { name: 'With the controls', props: { showControls: true } },
  ],
  render: (p) => (
    <DungeonPlayback
      key={String(bool(p, 'showControls'))}
      replay={REPLAY}
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
