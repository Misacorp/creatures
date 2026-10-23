import type { GamesEventResult } from '@creatures/engine';
import { useMemo } from 'preact/hooks';
import { GamesShow } from '../../games/GamesShow';
import { buildShowTimeline } from '../../games/show-timeline';
import { SAMPLE_DAY, SAMPLE_EVENT_IDS, sampleShow } from '../games-show-sample';
import { bool, num, str } from '../props';
import type { Entry, Preset, Props } from '../types';
import gamesShowFixture from '../../fixtures/games-show.json';

const SERVER_SHOW = (
  gamesShowFixture as unknown as {
    show: {
      events: GamesEventResult[];
      timeline: { eventId: string }[];
      players: { id: string; name: string }[];
    };
  }
).show;
/** The viewer of the fixture: its first player. */
const FIXTURE_YOU = SERVER_SHOW.players[0]?.id;

const SHOWS = ['day', 'server fixture', ...SAMPLE_EVENT_IDS] as const;
const ROSTERS = ['8 players', '15 players', '24 with bots', '1 player'] as const;
type Roster = (typeof ROSTERS)[number];

const ROSTER_SIZES: Readonly<Record<Roster, readonly [number, number]>> = {
  '8 players': [8, 0],
  '15 players': [15, 0],
  '24 with bots': [16, 8],
  '1 player': [1, 0],
};

function Preview({ p }: { p: Props }) {
  const which = str(p, 'show');
  const roster = str(p, 'roster') as Roster;
  const seed = str(p, 'seed');
  const [humans, bots] = ROSTER_SIZES[roster] ?? [8, 0];
  const show = useMemo(() => {
    if (which === 'server fixture') {
      // The real GET /api/games payload (fixtures/games-show.json).
      const f = SERVER_SHOW;
      return {
        events: f.events,
        names: Object.fromEntries(f.players.map((x) => [x.id, x.name])),
        youId: FIXTURE_YOU,
        lineup: f.timeline.map((x) => x.eventId),
      };
    }
    return {
      ...sampleShow(which === 'day' ? SAMPLE_DAY : [which], humans, bots, seed || 'workbench'),
      lineup: undefined,
    };
  }, [which, humans, bots, seed]);
  const live = str(p, 'mode') === 'live';
  const at = num(p, 'at') * 1000;
  // A live show "started" `at` seconds ago (negative: it starts in that long).
  const startsAt = useMemo(() => Date.now() - at, [at, live]);
  const play = bool(p, 'play');
  // An event nobody entered, second in the lineup (its intro card only).
  const lineup =
    bool(p, 'skipped') && which === 'day'
      ? [SAMPLE_DAY[0] ?? '', 'berry-bonanza', ...SAMPLE_DAY.slice(1)]
      : show.lineup;
  const total = buildShowTimeline(show.events, lineup).total;
  return (
    <div class="wb-games-show wb-games-bleed">
      <GamesShow
        key={`${which}|${roster}|${seed}|${String(at)}|${String(live)}|${String(play)}`}
        events={show.events}
        lineup={lineup}
        mode={live ? 'live' : 'replay'}
        startsAt={live ? startsAt : undefined}
        serverNow={live ? Date.now() : undefined}
        youId={bool(p, 'you') ? show.youId : undefined}
        names={show.names}
        startMs={Math.max(0, Math.min(total, at))}
        autoplay={play}
        still={!play && !live}
      />
    </div>
  );
}

/** Review moments of a single-event show (8 players unless given, the default seed): seconds into the show. */
function moments(id: string, players = 8): { early: number; chaos: number; podium: number } {
  const show = sampleShow([id], players, 0, 'workbench');
  const event = show.events[0];
  const span = buildShowTimeline(show.events).spans[0];
  if (event === undefined || span === undefined) return { early: 6, chaos: 20, podium: 40 };
  // The busiest second: the most notable beats (outs, effects) within one second.
  const ticks = event.beats.filter((b) => b.k === 'out' || b.k === 'fx').map((b) => b.t);
  const per = Math.max(1, Math.round(1000 / event.tickMs));
  let best = 0;
  let bestCount = -1;
  for (const t of ticks) {
    const n = ticks.filter((u) => u >= t && u < t + per).length;
    if (n > bestCount && t > 2) {
      bestCount = n;
      best = t;
    }
  }
  return {
    early: (span.eventStart + 4 * event.tickMs * 2) / 1000,
    chaos: (span.eventStart + (best + 1) * event.tickMs) / 1000,
    podium: (span.podiumStart + 2_000) / 1000,
  };
}

/** The team events (the hauls) also at 15 teams: a full lane each, the busiest a show gets. */
const TEAM_PRESETS: Preset[] = ['log-carry', 'pumpkin-push'].flatMap((id) => [
  {
    name: `${id}: 15 teams, intro`,
    props: { show: id, roster: '15 players', at: 2.4, play: false },
  },
  { name: `${id}: 15 teams, mid`, props: { show: id, roster: '15 players', at: 18, play: false } },
  {
    name: `${id}: 15 teams, podium`,
    props: {
      show: id,
      roster: '15 players',
      at: Math.round(moments(id, 15).podium * 2) / 2,
      play: false,
    },
  },
]);

const EVENT_PRESETS: Preset[] = SAMPLE_EVENT_IDS.flatMap((id) => {
  const m = moments(id);
  return [
    { name: `${id}: intro`, props: { show: id, at: 2.4, play: false } },
    { name: `${id}: early`, props: { show: id, at: m.early, play: false } },
    {
      name: `${id}: busiest moment`,
      props: { show: id, at: Math.round(m.chaos * 2) / 2, play: false },
    },
    { name: `${id}: podium`, props: { show: id, at: Math.round(m.podium * 2) / 2, play: false } },
    {
      name: `${id}: 24 with bots, mid`,
      props: { show: id, roster: '24 with bots', at: 20, play: false },
    },
  ];
});

const gamesShow: Entry = {
  name: 'GamesShow',
  file: 'apps/activity/src/games/GamesShow.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Valley Games show player: the day’s events one after another, each with an intro card, the event on its scene and a podium, with the stands above, one line of commentary, the top three and you, and the event pips. Live it is synced to the show’s start (a countdown before); a replay has play, 2x and next event. Every preset runs the real engine on a sample roster; "at" is seconds into the show (live: how long ago it started).',
  controls: {
    show: { kind: 'select', options: SHOWS },
    roster: { kind: 'select', options: ROSTERS },
    seed: { kind: 'text', maxLength: 24 },
    mode: { kind: 'select', options: ['replay', 'live'] },
    at: { kind: 'number', min: -120, max: 400, step: 0.5 },
    play: { kind: 'toggle' },
    you: { kind: 'toggle' },
    skipped: { kind: 'toggle' },
  },
  defaults: {
    show: 'day',
    roster: '8 players',
    seed: 'workbench',
    mode: 'replay',
    at: 0,
    play: true,
    you: true,
    skipped: false,
  },
  presets: [
    { name: 'Full day, 8 players, replay', props: {} },
    {
      name: 'Full day, 15 players, live from the start',
      props: { roster: '15 players', mode: 'live' },
    },
    { name: 'The server’s real payload (fixture)', props: { show: 'server fixture' } },
    { name: 'Live, 40 s before the show', props: { mode: 'live', at: -40 } },
    { name: 'Live, joined late (60 s in)', props: { mode: 'live', at: 60 } },
    { name: 'Full day, 24 with bots', props: { roster: '24 with bots' } },
    { name: 'One player alone', props: { roster: '1 player' } },
    { name: 'Spectator (no creature of yours)', props: { you: false } },
    {
      name: 'An event nobody entered (its intro only)',
      props: { skipped: true, at: 55.5, play: false },
    },
    ...EVENT_PRESETS,
    ...TEAM_PRESETS,
  ],
  render: (p) => <Preview p={p} />,
};

export const gamesShowEntries: readonly Entry[] = [gamesShow];
