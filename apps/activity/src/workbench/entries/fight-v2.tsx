import { useMemo, useState } from 'preact/hooks';
import { AbilityChipV2 } from '../../AbilityChipV2';
import { foldSetupOf, showOf, stageModelOf, type StageModel } from '../../fight-v2';
import type { LiveAbilityV2 } from '../../fight-v2-api';
import { FightV2 } from '../../LiveV2';
import type { RaidView } from '../../raid-api';
import { RaidSummaryCardV2 } from '../../RaidSummaryV2';
import { PlayerV2 } from '../../ReplayV2';
import { StageV2 } from '../../StageV2';
import { staticFx } from '../../stage-fx';
import { MarkStrip } from '../../ui/MarkStrip';
import type { PlaybackV2 } from '../../use-playback-v2';
import { cuesOf } from '../../use-playback-v2';
import { num, str } from '../props';
import type { Entry, Props } from '../types';
import {
  cardOfBoss,
  liveSample,
  playSample,
  replaySample,
  statsSample,
  type FightSampleOptions,
} from '../fight-v2-sample';

const VIEWS = ['held', 'replay', 'live', 'results', 'action'] as const;

const MOMENTS = [
  'start',
  'marks and an announced move',
  'a crit',
  'a Blocked hit',
  'a silenced creature',
  'a knock-out',
  'a reaction is cashed',
  'a boss that sheds marks',
  'the end',
  'beat number',
] as const;

type Moment = (typeof MOMENTS)[number];

/** The beat (steps played) a moment of the real fight is at, found by reading the fight's own events; 0 when the fight has none. */
function momentBeat(
  model: StageModel,
  events: Parameters<typeof showOf>[0],
  moment: Moment,
  beat: number,
): number {
  const { beats, states } = model;
  const at = (found: (k: number) => boolean): number => {
    const k = beats.findIndex((_, i) => found(i));
    return k < 0 ? 0 : k + 1;
  };
  const shows = beats.map((b) => showOf(events, b));
  switch (moment) {
    case 'start':
      return 0;
    case 'marks and an announced move':
      return at(
        (k) =>
          (states[k + 1]?.marks.length ?? 0) >= 2 && (states[k + 1]?.announced.length ?? 0) > 0,
      );
    case 'a crit':
      return at((k) => shows[k]?.floats.some((f) => f.crit) === true);
    case 'a Blocked hit':
      return at((k) => shows[k]?.floats.some((f) => f.tone === 'blocked') === true);
    case 'a silenced creature':
      return at((k) => (shows[k]?.silenced.length ?? 0) > 0);
    case 'a knock-out':
      return at((k) => (shows[k]?.knockedOut.length ?? 0) > 0);
    case 'a reaction is cashed':
      return at((k) => (shows[k]?.cashed.length ?? 0) > 0);
    case 'a boss that sheds marks':
      return at((k) => (states[k + 1]?.expiring.length ?? 0) > 0);
    case 'the end':
      return beats.length;
    case 'beat number':
      return Math.max(0, Math.min(beats.length, beat));
  }
}

function optionsOf(p: Props): FightSampleOptions {
  const stage = num(p, 'stage');
  return {
    slot: num(p, 'slot'),
    players: num(p, 'players'),
    stage: stage >= 3 ? 3 : stage === 2 ? 2 : 1,
    seed: str(p, 'seed'),
  };
}

/** The stage held still at a moment of a real fight, with the effects of the beat that just landed. */
function StageHeld({ p }: { p: Props }) {
  const opts = optionsOf(p);
  const replay = useMemo(
    () => replaySample(opts),
    [opts.slot, opts.players, opts.stage, opts.seed],
  );
  const setup = useMemo(
    () =>
      foldSetupOf({
        fighters: replay.fighters,
        card: replay.card,
        bossHpStart: replay.bossHpStart,
      }),
    [replay],
  );
  const model = useMemo(() => stageModelOf(setup, replay.events), [setup, replay]);
  const moment = MOMENTS.find((m) => m === str(p, 'moment')) ?? 'start';
  const beat = momentBeat(model, replay.events, moment, num(p, 'beat'));
  const landed = beat > 0 ? model.beats[beat - 1] : undefined;
  const show = landed === undefined ? null : showOf(replay.events, landed);
  const playback: PlaybackV2 = {
    beat,
    total: model.beats.length,
    finished: beat >= model.beats.length,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show,
    fx: show === null ? [] : staticFx(cuesOf(show)),
    intro: null,
  };
  return (
    <div class="wb-held">
      <StageV2
        boss={replay.boss}
        card={replay.card}
        fighters={replay.fighters}
        names={replay.names}
        you={replay.you}
        model={model}
        playback={playback}
        place={opts.stage === 3 ? 'Finale' : `Stage ${String(opts.stage)} / 3`}
        hpMax={replay.bossHpMax}
        rounds={replay.boss.rounds}
      />
    </div>
  );
}

/** The finale with the caller's input: the sample's snapshot, and a press that queues the action as the server would. */
function LiveDemo({ p }: { p: Props }) {
  const opts = { ...optionsOf(p), stage: 3 as const };
  const ability = str(p, 'ability');
  const round = num(p, 'round');
  const [fired, setFired] = useState<{ row: number | undefined } | null>(null);
  const [auto, setAuto] = useState(true);
  const base = useMemo(
    () => liveSample(opts, { round, ability, mode: auto ? 'default' : 'held' }),
    [opts.slot, opts.players, opts.seed, round, ability, auto],
  );
  const input: LiveAbilityV2 | undefined = base.abilities[0];
  const snapshot =
    input === undefined || fired === null
      ? base
      : {
          ...base,
          abilities: [
            {
              ...input,
              mode: 'fired' as const,
              fired: false,
              fireAtRound: round + 1,
              row: input.kind === 'shieldWall' ? (fired.row ?? 0) : null,
            },
          ],
        };
  return (
    <FightV2
      snapshot={snapshot}
      serverNow={snapshot.serverNow}
      busy={false}
      actionError={null}
      onFire={(_key, row) => {
        setFired({ row });
      }}
      onAuto={(_key, on) => {
        setAuto(on);
      }}
    />
  );
}

/** The Raid tab's Results list on a v2 week: a card for each stage played so far, from the numbers of their own events. */
function ResultsDemo({ p }: { p: Props }) {
  const opts = optionsOf(p);
  const stages = useMemo(
    () =>
      Array.from({ length: opts.stage }, (_, k) =>
        statsSample({ ...opts, stage: (k + 1) as 1 | 2 | 3 }),
      ),
    [opts.slot, opts.players, opts.stage, opts.seed],
  );
  return (
    <section class="raid-section" aria-label="Results">
      <h3>Results</h3>
      <ul class="cards">
        {stages.map((stats) => (
          <li key={stats.phase} class="card-item rs-item">
            <RaidSummaryCardV2
              stats={stats}
              rewards={{
                essence: 120,
                finaleLoot: null,
                festivalLoot: null,
                festivalGrant: null,
                rankChange: null,
                progress: null,
              }}
              mode="result"
              id={`workbench-result-${stats.phase}`}
              onReplay={() => undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Raid tab's pick of the finale action (Rally, Shield Wall or Purge) with Auto fire. */
function ActionDemo({ p }: { p: Props }) {
  const [pick, setPick] = useState(str(p, 'ability'));
  const [auto, setAuto] = useState(true);
  const you: Pick<RaidView['you'], 'ability' | 'abilities'> = {
    ability: { abilityId: pick, chosen: true },
    abilities: [
      {
        abilityId: pick,
        creatureId: null,
        species: null,
        unlocked: true,
        unlockLevel: 1,
        autoFire: auto,
      },
    ],
  };
  return <AbilityChipV2 you={you} editable busy={false} onPick={setPick} onAutoFire={setAuto} />;
}

const CONTROLS = {
  view: { kind: 'select', options: VIEWS },
  slot: { kind: 'number', min: 1, max: 15 },
  players: { kind: 'number', min: 1, max: 15 },
  stage: { kind: 'number', min: 1, max: 3 },
  seed: { kind: 'text', maxLength: 12 },
  moment: { kind: 'select', options: MOMENTS },
  beat: { kind: 'number', min: 0, max: 400 },
  round: { kind: 'number', min: 0, max: 8 },
  ability: { kind: 'select', options: ['rally', 'shield-wall', 'purge'] },
} as const;

const DEFAULTS = {
  view: 'held',
  slot: 1,
  players: 4,
  stage: 1,
  seed: 'fold',
  moment: 'marks and an announced move',
  beat: 0,
  round: 3,
  ability: 'rally',
};

const stageV2: Entry = {
  name: 'StageV2',
  file: 'apps/activity/src/StageV2.tsx',
  group: 'Creatures & game pieces',
  description:
    "The combat v2 fight stage, played from a real fight (every event is the engine's own, from the shipped bosses and creatures): the boss above its HP bar with a tick per stage, the move it just made, the marks on it oldest first, Mired, what it resists and the Escalating meter, the turn strip lighting the step on, and the v2 board with each creature's HP, a silenced creature's Knack crossed out with the turns left, knocked-out ones greyed and the move announced at round start on each creature it will land on. Views: held still at a moment of the fight (a crit, a Blocked hit, a silenced creature, a knock-out, a cashed mark), playing by itself like the replay, the live finale with the player's action button (Rally, Shield Wall with its row picker, Purge) and Auto fire, a stage's result card, and the Raid tab's pick of the finale action.",
  covers: ['PlayerV2', 'FightV2', 'AbilityChipV2', 'RaidSummaryCardV2', 'FinaleInputV2'],
  controls: CONTROLS,
  defaults: DEFAULTS,
  presets: [
    { name: 'Mid-fight: marks on the boss and an announced move (slot 1)', props: {} },
    { name: 'A crit (Storm Sovereign)', props: { slot: 3, moment: 'a crit' } },
    { name: 'A Blocked hit (the shield and 0)', props: { moment: 'a Blocked hit' } },
    {
      name: 'A silenced creature (Thornmother)',
      props: { slot: 5, moment: 'a silenced creature' },
    },
    { name: 'A knock-out', props: { slot: 5, moment: 'a knock-out' } },
    { name: 'A reaction is cashed', props: { moment: 'a reaction is cashed' } },
    { name: 'The end of stage 1', props: { moment: 'the end' } },
    {
      name: 'Stage 2 of Old Bogback, 6 players (carried HP, resistance)',
      props: { slot: 4, players: 6, stage: 2, moment: 'the end' },
    },
    { name: 'Playing: the whole of stage 1, by itself', props: { view: 'replay' } },
    {
      name: 'Playing: stage 2 with 8 players',
      props: { view: 'replay', slot: 4, players: 8, stage: 2 },
    },
    {
      name: 'Live finale, round 3: Rally waits for its round',
      props: { view: 'live', slot: 4, stage: 3, round: 3 },
    },
    {
      name: 'Live finale: Shield Wall with the row picker',
      props: { view: 'live', slot: 4, stage: 3, round: 2, ability: 'shield-wall' },
    },
    {
      name: 'Live finale: Purge',
      props: { view: 'live', slot: 4, stage: 3, round: 1, ability: 'purge' },
    },
    {
      name: 'Live finale, the fight is over',
      props: { view: 'live', slot: 4, stage: 3, round: 8 },
    },
    {
      name: "The Raid tab's Results: the stages played (Stage 1, Stage 2, Finale)",
      props: { view: 'results', slot: 4, stage: 3 },
    },
    { name: 'The Raid tab: the finale action picker', props: { view: 'action' } },
  ],
  render: (p) => {
    switch (str(p, 'view')) {
      case 'replay':
        return <ReplayDemo p={p} />;
      case 'live':
        return <LiveDemo p={p} />;
      case 'results':
        return <ResultsDemo p={p} />;
      case 'action':
        return <ActionDemo p={p} />;
      default:
        return <StageHeld p={p} />;
    }
  },
};

/** The stored stage played from its start, by itself. */
function ReplayDemo({ p }: { p: Props }) {
  const opts = optionsOf(p);
  const replay = useMemo(
    () => replaySample(opts),
    [opts.slot, opts.players, opts.stage, opts.seed],
  );
  return <PlayerV2 data={replay} />;
}

const markStrip: Entry = {
  name: 'MarkStrip',
  file: 'apps/activity/src/ui/MarkStrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The marks on the boss in one strip under it, oldest first: the element\'s icon and its count ("x2"), a lock on a Sealed mark, a blink on the marks the boss will shed before its next turn and a flash on the one a Payoff just cashed. The strip keeps one line of height when it is empty. Read from the marks of a real fight at a moment you choose.',
  controls: {
    moment: {
      kind: 'select',
      options: ['three marks', 'sealed', 'about to be shed', 'cashed', 'empty'],
    },
  },
  defaults: { moment: 'three marks' },
  presets: [
    { name: 'Three marks, oldest first', props: {} },
    { name: 'A Sealed mark (the lock)', props: { moment: 'sealed' } },
    { name: 'Marks about to be shed (blinking)', props: { moment: 'about to be shed' } },
    { name: 'A mark just cashed (flashing)', props: { moment: 'cashed' } },
    { name: 'No marks (one empty line)', props: { moment: 'empty' } },
  ],
  render: (p) => {
    const sample = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const setup = foldSetupOf({
      fighters: sample.fighters,
      card: cardOfBoss(sample.boss, sample.before),
      bossHpStart: sample.before.bossHp,
    });
    const model = stageModelOf(setup, sample.events);
    const withMarks =
      model.states.find((s) => s.marks.length >= 3) ?? model.states[model.states.length - 1];
    const marks = (withMarks?.marks ?? []).map((m) => ({ ...m }));
    const moment = str(p, 'moment');
    if (moment === 'empty') return <MarkStrip marks={[]} />;
    return (
      <MarkStrip
        marks={marks.map((m, k) => ({
          ...m,
          sealed: moment === 'sealed' ? k === 0 : m.sealed && moment === 'three marks',
          expiring: moment === 'about to be shed' && !m.sealed,
          cashed: moment === 'cashed' && k === 1,
        }))}
      />
    );
  },
};

export const fightV2Entries: readonly Entry[] = [stageV2, markStrip];
