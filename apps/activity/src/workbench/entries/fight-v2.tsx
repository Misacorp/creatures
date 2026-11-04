import { useMemo, useState } from 'preact/hooks';
import { AbilityChipV2 } from '../../AbilityChipV2';
import { roomFightV2 } from '../../dungeon-room-v2';
import { sampleRoomV2 } from '../dungeon-v2-sample';
import { foldSetupOf, showOf, stageModelOf, type StageModel } from '../../fight-v2';
import type { LiveAbilityV2 } from '../../fight-v2-api';
import { FightV2 } from '../../LiveV2';
import type { RaidView } from '../../raid-api';
import { RaidSummaryCardV2 } from '../../RaidSummaryV2';
import { PlayerV2 } from '../../ReplayV2';
import { StageResultRow } from '../../StageResultRow';
import type { PhaseResultView } from '../../raid-api';
import { raidV2Sample } from '../raid-v2-sample';
import { StageV2 } from '../../StageV2';
import { staticFx } from '../../stage-fx';
import { MarkStrip } from '../../ui/MarkStrip';
import type { PlaybackV2 } from '../../use-playback-v2';
import { cuesOf } from '../../use-playback-v2';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';
import {
  cardOfBoss,
  liveSample,
  playSample,
  replaySample,
  statsSample,
  type FightSampleOptions,
} from '../fight-v2-sample';

const VIEWS = ['held', 'replay', 'live', 'results', 'action', 'dungeon room'] as const;

/** The foes of the dungeon's rooms the page can show (a plain foe, one with a rule card, two moves, a floor boss). */
const DUNGEON_FOES = [
  'bramble-hound',
  'drift-wisp',
  'ember-mite',
  'static-bat',
  'puddle-imp',
  'drowned-warden',
  'slag-tyrant',
] as const;

const MOMENTS = [
  'start',
  'marks and an announced move',
  'a crit',
  'a Blocked hit',
  'a silenced creature',
  'a knock-out',
  'a reaction is cashed',
  'a Guard save',
  'a Guard save two slots away',
  'a dodge',
  'a heal',
  'a boost',
  'a boosted and a silenced creature',
  'a Knack acts',
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
  const shows = beats.map((b, k) =>
    showOf(events, b, { creatures: model.setup.creatures, quiet: quietOf(model, k) }),
  );
  switch (moment) {
    case 'start':
      return 0;
    case 'marks and an announced move':
      return at(
        (k) =>
          (states[k + 1]?.marks.length ?? 0) >= 2 && (states[k + 1]?.announced.length ?? 0) > 0,
      );
    case 'a crit': {
      const marked = at((k) => shows[k]?.floats.some((f) => f.mult !== undefined) === true);
      return marked > 0 ? marked : at((k) => shows[k]?.floats.some((f) => f.crit) === true);
    }
    case 'a Guard save':
      return at(
        (k) =>
          (shows[k]?.saves.length ?? 0) > 0 &&
          shows[k]?.saves.some((s) => s.prevented !== null) === true,
      );
    case 'a Guard save two slots away': {
      const col = new Map(model.setup.creatures.map((c) => [c.key, c.col]));
      return at((k) =>
        (shows[k]?.saves ?? []).some(
          (s) => Math.abs((col.get(s.guard) ?? 0) - (col.get(s.who) ?? 0)) >= 2,
        ),
      );
    }
    case 'a dodge':
      return at((k) => shows[k]?.floats.some((f) => f.tone === 'dodge') === true);
    case 'a heal':
      return at((k) => shows[k]?.floats.some((f) => f.tone === 'heal') === true);
    case 'a boost':
      return at((k) => shows[k]?.floats.some((f) => f.tone === 'boost') === true);
    case 'a boosted and a silenced creature':
      return at((k) => {
        const now = Object.values(states[k + 1]?.creatures ?? {});
        return now.some((c) => c.boost > 0 && !c.out) && now.some((c) => c.silenced > 0 && !c.out);
      });
    case 'a Knack acts':
      return at((k) => (shows[k]?.knacks.length ?? 0) > 0);
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

/** The creatures whose Knack does not act as beat `k` begins (silenced or out), as the playback reads it. */
const quietOf = (model: StageModel, k: number): ReadonlySet<string> =>
  new Set(
    Object.entries(model.states[k]?.creatures ?? {}).flatMap(([key, c]) =>
      c.out || c.silenced > 0 ? [key] : [],
    ),
  );

/** The effects of the beat that just landed, as the playback draws them (the Knack names only when `knackNames`). */
function heldFx(
  model: StageModel,
  events: Parameters<typeof showOf>[0],
  beat: number,
  knackNames: boolean,
): { show: ReturnType<typeof showOf> | null; fx: PlaybackV2['fx'] } {
  const landed = beat > 0 ? model.beats[beat - 1] : undefined;
  if (landed === undefined) return { show: null, fx: [] };
  const show = showOf(events, landed, {
    creatures: model.setup.creatures,
    quiet: quietOf(model, beat - 1),
  });
  return { show, fx: staticFx(cuesOf(show, knackNames)) };
}

/** How a boosted creature shows: `pattern` (the default) or `glow`. */
const boostLookOf = (p: Props): 'pattern' | 'glow' =>
  str(p, 'boostLook') === 'glow' ? 'glow' : 'pattern';

function optionsOf(p: Props): FightSampleOptions {
  const stage = num(p, 'stage');
  return {
    party: str(p, 'party') === 'mixed' ? 'mixed' : 'rows',
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
  const { show, fx } = heldFx(model, replay.events, beat, bool(p, 'knackNames'));
  const playback: PlaybackV2 = {
    beat,
    total: model.beats.length,
    finished: beat >= model.beats.length,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show,
    fx,
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
        boostLook={boostLookOf(p)}
      />
    </div>
  );
}

/**
 * A room of the daily dungeon on combat v2 held still at a moment of a real fight (the engine's `fightV2` against `foeAt`): the stage in
 * its single-row mode, the foe taking its one turn after the line, the carried HP and an out creature in its place.
 */
function DungeonRoomHeld({ p }: { p: Props }) {
  const foe = str(p, 'foe');
  const depth = num(p, 'depth');
  const level = num(p, 'level');
  const seed = str(p, 'seed');
  const carried = [num(p, 'hp1') / 100, num(p, 'hp2') / 100, num(p, 'hp3') / 100];
  const { room, row } = useMemo(
    () =>
      sampleRoomV2({
        foe,
        depth,
        level,
        seed,
        carried,
        ...(foe === 'drowned-warden' || foe === 'slag-tyrant'
          ? { signature: depth % 7 === 0 }
          : {}),
      }),
    [foe, depth, level, seed, carried.join(',')],
  );
  const fight = useMemo(() => roomFightV2(room, row), [room, row]);
  const model = useMemo(
    () =>
      stageModelOf(
        foldSetupOf({ fighters: fight.fighters, card: fight.card, bossHpStart: fight.hpMax }),
        room.events,
      ),
    [fight, room],
  );
  const moment = MOMENTS.find((m) => m === str(p, 'moment')) ?? 'start';
  const beat = momentBeat(model, room.events, moment, num(p, 'beat'));
  const { show, fx } = heldFx(model, room.events, beat, bool(p, 'knackNames'));
  const playback: PlaybackV2 = {
    beat,
    total: model.beats.length,
    finished: beat >= model.beats.length,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show,
    fx,
    intro: null,
  };
  return (
    <div class="wb-held">
      <StageV2
        boss={fight.boss}
        card={fight.card}
        fighters={fight.fighters}
        names={fight.names}
        you="p1"
        model={model}
        playback={playback}
        place="Room 2 / 7"
        hpMax={fight.hpMax}
        rounds={fight.rounds}
        single
        ticks={[]}
        boostLook={boostLookOf(p)}
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

/** The Raid tab's Results list on a v2 week: a compact row for each stage played so far; `open` opens one row's card (from the fight's own numbers). */
function ResultsDemo({ p }: { p: Props }) {
  const opts = optionsOf(p);
  const view = useMemo(
    () =>
      raidV2Sample({
        slot: opts.slot,
        players: opts.players,
        stagesPlayed: 1,
        mine: 3,
        bestShareBp: 0,
        knockedOut: false,
        swaps: 'none',
      }).view,
    [opts.slot, opts.players],
  );
  const stages = useMemo(
    () =>
      Array.from({ length: opts.stage }, (_, k) =>
        statsSample({ ...opts, stage: (k + 1) as 1 | 2 | 3 }),
      ),
    [opts.slot, opts.players, opts.stage, opts.seed],
  );
  const openStage = num(p, 'open');
  return (
    <section class="raid-section" aria-label="Results">
      <h3>Results</h3>
      <ul class="cards">
        {stages.map((stats, k) => {
          const result: PhaseResultView = {
            phase:
              stats.phase === 'stage1' ? 'phase1' : stats.phase === 'stage2' ? 'phase2' : 'finale',
            at: 1,
            cleared: stats.cleared,
            rounds: stats.rounds,
            bossHpMax: stats.boss.hpMax,
            bossHpStart: stats.boss.hpStart,
            bossHpEnd: stats.boss.hpEnd,
            damage: stats.boss.hpStart - stats.boss.hpEnd,
            reactions: stats.reactions.total,
            top: [],
            essence: 120,
            rankChange: null,
            festivalGrant: null,
          };
          return (
            <StageResultRow
              key={stats.phase}
              result={result}
              week="26w45"
              party={1}
              view={view}
              onReplay={() => undefined}
              defaultOpen={openStage === k + 1}
              body={
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
                />
              }
            />
          );
        })}
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
  party: { kind: 'select', options: ['rows', 'mixed'] },
  knackNames: { kind: 'toggle' },
  boostLook: { kind: 'select', options: ['pattern', 'glow'] },
  moment: { kind: 'select', options: MOMENTS },
  beat: { kind: 'number', min: 0, max: 400 },
  round: { kind: 'number', min: 0, max: 8 },
  open: { kind: 'number', min: 0, max: 3 },
  ability: { kind: 'select', options: ['rally', 'shield-wall', 'purge'] },
  foe: { kind: 'select', options: DUNGEON_FOES },
  depth: { kind: 'number', min: 1, max: 40 },
  level: { kind: 'number', min: 1, max: 40 },
  hp1: { kind: 'number', min: 0, max: 100 },
  hp2: { kind: 'number', min: 0, max: 100 },
  hp3: { kind: 'number', min: 0, max: 100 },
} as const;

const DEFAULTS = {
  view: 'held',
  slot: 1,
  players: 4,
  stage: 1,
  seed: 'fold',
  party: 'rows',
  knackNames: false,
  boostLook: 'pattern',
  moment: 'marks and an announced move',
  beat: 0,
  round: 3,
  open: 0,
  ability: 'rally',
  foe: 'bramble-hound',
  depth: 3,
  level: 22,
  hp1: 100,
  hp2: 100,
  hp3: 100,
};

const stageV2: Entry = {
  name: 'StageV2',
  file: 'apps/activity/src/StageV2.tsx',
  group: 'Creatures & game pieces',
  description:
    "The combat v2 fight stage, played from a real fight (every event is the engine's own, from the shipped bosses and creatures): the boss above its HP bar with a tick per stage, the move it just made, the marks on it oldest first, Mired, what it resists and the Escalating meter, the turn strip lighting the step on, and the v2 board with each creature's HP, a silenced creature's Knack crossed out with the turns left, knocked-out ones greyed and the move announced at round start on each creature it will land on. What a fight shows: a reaction's name in its two colours over the boss with the hit's total and the bonus under it on one line (the beat is held a moment longer), a number on the boss for every hit in the hitter's element colour (a crit ending with \"!\" in two hard halves), a Guard's save (a shield on the covered creature with what the cover kept off, the Guard's own shield bursting out of its tile to 2.5 times the size while it fades, the Guard's tile flashing and a pulse of protection running through the tiles' backgrounds, across every tile of the row between them, to the covered creature), \"Dodged!\", heals as green numbers, boosts as rising arrows (a boosted creature also has small yellow arrows drifting up in its tile's background, `boostLook` `pattern` by default, or the inner `glow`; a silenced creature has the same pattern flipped, red arrows drifting down), and, only when the Knack names option is on (Settings, off by default), the Knack's name popping on the creature that acts. The `party` control swaps the sample for a mixed party (Guards and Supports among the Setters and Payoffs) so every one of these happens. Views: held still at a moment of the fight (a crit, a Blocked hit, a silenced creature, a knock-out, a cashed mark, a Guard save, a dodge, a heal, a boost, a Knack acting), playing by itself like the replay, the live finale with the player's action button (Rally, Shield Wall with its row picker, Purge) and Auto fire, a stage's result card, and the Raid tab's pick of the finale action.",
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
      name: 'Reaction callout: the name in its two colours over the numbers on one line (total and bonus), over the boss (Old Bogback)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a reaction is cashed' },
    },
    {
      name: 'A crit: "452!" in two hard halves (the special text), no multiplier',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a crit' },
    },
    {
      name: 'Boosted creatures: small yellow arrows drifting up in the tile’s background until their next hit (the default look)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a boost' },
    },
    {
      name: 'Boosted, the glow look to compare (a yellow inner glow flush to the border)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a boost', boostLook: 'glow' },
    },
    {
      name: 'Debuffed (silenced): the same pattern flipped, red arrows drifting down in the background',
      props: { slot: 5, moment: 'a silenced creature' },
    },
    {
      name: 'A boosted and a debuffed creature side by side',
      props: { slot: 5, players: 4, party: 'mixed', moment: 'a boosted and a silenced creature' },
    },
    {
      name: 'A Guard save: a large shield on the covered creature with what it kept off (no ring), the Guard’s own shield bursting out to 2.5x, the flash and the pulse through the tiles to the covered creature',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a Guard save' },
    },
    {
      name: 'A Guard save from two slots away (Wide Reach): the pulse runs through the tile between to the covered creature',
      props: { slot: 3, players: 5, party: 'mixed', moment: 'a Guard save two slots away' },
    },
    {
      name: 'A dodge ("Dodged!")',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a dodge' },
    },
    {
      name: 'A heal (green numbers)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a heal' },
    },
    {
      name: 'A boost (rising arrows on the boosted creatures)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a boost' },
    },
    {
      name: 'A Knack acts, Knack names off (the default)',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a Knack acts' },
    },
    {
      name: 'The same beat with Knack names on',
      props: { slot: 4, players: 5, party: 'mixed', moment: 'a Knack acts', knackNames: true },
    },
    {
      name: 'Playing: a mixed party, stage 1 (reactions, saves, heals and boosts, by itself)',
      props: { view: 'replay', slot: 4, players: 5, party: 'mixed' },
    },
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
    {
      name: "Dungeon room (combat v2): the line, then the foe's one turn (Bramble Hound, mid-fight)",
      props: { view: 'dungeon room', moment: 'beat number', beat: 6 },
    },
    {
      name: 'Dungeon room: a hit and its numbers (Static Bat, the second creature out since an earlier room)',
      props: {
        view: 'dungeon room',
        foe: 'static-bat',
        hp1: 70,
        hp2: 0,
        hp3: 45,
        moment: 'beat number',
        beat: 8,
      },
    },
    {
      name: 'Dungeon room: a knock-out in the line',
      props: { view: 'dungeon room', foe: 'static-bat', level: 14, moment: 'a knock-out' },
    },
    {
      name: 'Dungeon room: the floor boss at a landmark (its moves announced)',
      props: {
        view: 'dungeon room',
        foe: 'drowned-warden',
        depth: 7,
        level: 26,
        moment: 'marks and an announced move',
      },
    },
    {
      name: 'Dungeon room: the end of a cleared fight',
      props: { view: 'dungeon room', moment: 'the end' },
    },
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
      case 'dungeon room':
        return <DungeonRoomHeld p={p} />;
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
