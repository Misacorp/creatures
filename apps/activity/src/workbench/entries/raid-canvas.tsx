import { useMemo, useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { RevealCard } from '../../Reveal';
import type { RaidView } from '../../raid-api';
import type { Intent } from '../../raid-slots';
import { summaryBoss } from '../../raid-summary-view';
import { RaidCanvas } from '../../raid-canvas/RaidCanvas';
import { isCreatureTap, isSeatPlates } from '../../raid-canvas/config';
import type { LeftPanel, RightPanel } from '../../raid-canvas/taps';
import { CANVAS_STATES, canvasSample, type CanvasState } from '../raid-canvas-sample';
import { str } from '../props';
import type { Entry, Props } from '../types';

const OPEN = [
  'none',
  'your creature',
  'their creature',
  'a seat',
  'a boss move',
  'a swap request',
  'finale order',
  'weekend',
  'boss',
  'players',
  'log',
] as const;

const stateOf = (p: Props): CanvasState =>
  CANVAS_STATES.find((s) => s === str(p, 'state')) ?? 'placing';

/** The drawer a preset opens at the start (the right one holds a thing tapped, the left an overview). */
function startOf(
  open: string,
  view: RaidView,
): { right?: RightPanel; left?: LeftPanel } | undefined {
  const row = view.party?.row ?? [];
  const mine = row.find((s) => s.creature?.mine === true);
  const theirs = row.find((s) => s.creature !== null && s.creature.mine !== true);
  const empty = row.find((s) => s.creature === null);
  switch (open) {
    case 'your creature':
      return mine?.creature?.creatureId === undefined
        ? undefined
        : { right: { kind: 'mine', creatureId: mine.creature.creatureId } };
    case 'their creature':
      return theirs === undefined ? undefined : { right: { kind: 'theirs', slot: theirs.slot } };
    case 'a seat':
      return empty === undefined ? undefined : { right: { kind: 'seat', slot: empty.slot } };
    case 'a boss move': {
      const move = view.v2?.card.moves[0];
      return move === undefined ? undefined : { right: { kind: 'move', moveId: move.id } };
    }
    case 'a swap request': {
      const request = view.v2?.swaps.incoming[0] ?? view.v2?.swaps.outgoing[0];
      return request === undefined ? undefined : { right: { kind: 'swap', id: request.id } };
    }
    case 'finale order':
      return { right: { kind: 'order' } };
    case 'weekend':
    case 'boss':
    case 'players':
    case 'log':
      return { left: open };
    default:
      return undefined;
  }
}

/** A placement on the page's own board (no server): the creature leaves its seat and stands in the new one, or goes off the board. */
function applyIntent(view: RaidView, intent: Intent, creatures: readonly Creature[]): RaidView {
  const party = view.party;
  if (party === null) return view;
  const creature = creatures.find((c) => c.id === intent.creatureId);
  const cleared = party.row.map((s) =>
    s.creature?.creatureId === intent.creatureId ? { ...s, creature: null } : s,
  );
  const row =
    intent.type === 'unplace' || creature === undefined
      ? cleared
      : cleared.map((s) =>
          s.slot === intent.slot && s.creature === null
            ? {
                ...s,
                creature: {
                  ownerName: 'You',
                  species: creature.species,
                  name: creature.nickname ?? creature.species,
                  level: creature.level,
                  mine: true,
                  creatureId: creature.id,
                },
              }
            : s,
        );
  const team = row.flatMap((s) =>
    s.creature?.mine === true && s.creature.creatureId !== undefined
      ? [
          {
            creatureId: s.creature.creatureId,
            species: s.creature.species,
            name: s.creature.name,
            level: s.creature.level,
            slot: s.slot,
          },
        ]
      : [],
  );
  return {
    ...view,
    party: { ...party, row },
    you: { ...view.you, inRoster: team.length > 0, team: { creatures: team } },
  };
}

/** The raid as a place on fixture data: the states of the raid and Misa's two choices, wired to a stand-in for the server. */
function CanvasDemo({ p }: { p: Props }) {
  const state = stateOf(p);
  const sample = useMemo(() => canvasSample(state), [state]);
  const [view, setView] = useState(sample.view);
  const seatPlates = str(p, 'seatPlates');
  const creatureTap = str(p, 'creatureTap');
  const open = str(p, 'open');
  const start = useMemo(() => startOf(open, sample.view), [open, sample]);
  return (
    <div class="wb-raid-canvas">
      <div class="vy-page">
        <div>
          <RaidCanvas
            key={`${state}-${open}-${seatPlates}-${creatureTap}`}
            view={view}
            serverNow={sample.now}
            finale={sample.finale}
            creatures={sample.creatures}
            configure={sample.configure}
            busy={false}
            trayInput={{ trips: [], jobs: null, now: sample.now }}
            config={{
              ...(isSeatPlates(seatPlates) ? { seatPlates } : {}),
              ...(isCreatureTap(creatureTap) ? { creatureTap } : {}),
            }}
            start={start}
            {...(sample.feed === undefined ? {} : { feed: sample.feed })}
            {...(sample.stageFetcher === undefined ? {} : { stageFetcher: sample.stageFetcher })}
            onOpenPage={() => undefined}
            actions={{
              intent: (intent) => {
                setView((now) => applyIntent(now, intent, sample.creatures));
              },
              askSwap: () => undefined,
              answerSwap: () => undefined,
              cancelSwap: () => undefined,
              setAbility: () => undefined,
              setAutofire: () => undefined,
            }}
            reveal={
              sample.reveal === undefined ? undefined : (
                <RevealCard
                  reveal={sample.reveal}
                  busy={false}
                  season={{ weekId: view.weekId, season: view.season }}
                  boss={summaryBoss(view, sample.reveal.week)}
                  afterAction={{ week: sample.reveal.week, party: sample.reveal.party }}
                  onDismiss={() => undefined}
                />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

const raidCanvas: Entry = {
  name: 'RaidCanvas',
  file: 'apps/activity/src/raid-canvas/RaidCanvas.tsx',
  group: 'Creatures & game pieces',
  description:
    "The raid as a place (combat v2): one scene that keeps its size (the boss with its HP bar, the board of seats under it), a now line as its caption (the only text: an incoming swap request, a stage playing, what is left to place, the next time), up to three plates on its frame (Weekend, Boss, Players; Log while a stage plays) that open the left drawer, and, while you can place, your creatures in a tray under the scene (drag one to a seat, drop one on the tray to take it off the board, tap to open it) and the boss's moves as small glyphs beside it. A tap on a seat, a move, a swap mark or the now line opens the right drawer: your creature (the configurator), another player's (read-only: owner, level, role, Knack, talents, worn gear, Ask to swap), a seat (pick a creature), a boss move, a swap request, the finale order. Stages play on the scene as they happen; the finale draws on the same scene with its order in a strip under it. `state` picks the moment; `open` starts with a drawer open; `seatPlates` and `creatureTap` are Misa's two open choices (on a phone `popover-first` shows a popover and lights the reach first, with Open for the full view).",
  covers: [],
  controls: {
    state: { kind: 'select', options: CANVAS_STATES },
    open: { kind: 'select', options: OPEN },
    seatPlates: { kind: 'select', options: ['mine', 'all'] },
    creatureTap: { kind: 'select', options: ['drawer', 'popover-first'] },
  },
  defaults: { state: 'placing', open: 'none', seatPlates: 'mine', creatureTap: 'drawer' },
  presets: [
    { name: 'Before the weekend (nothing placed)', props: { state: 'before the weekend' } },
    { name: 'Placing, a swap request waiting', props: { state: 'placing' } },
    { name: 'A stage playing live (mid-round)', props: { state: 'stage playing' } },
    { name: 'Between stages (carried HP, one out)', props: { state: 'between stages' } },
    { name: 'Finale lobby (your order under the scene)', props: { state: 'finale lobby' } },
    { name: 'Live finale', props: { state: 'live finale' } },
    { name: 'After the finale (the reveal over the scene)', props: { state: 'after the finale' } },
    { name: 'The boss fell in stage 2', props: { state: 'boss fell early' } },
    { name: 'Festival or no raid', props: { state: 'no raid' } },
    { name: 'Your creature open in the right drawer', props: { open: 'your creature' } },
    { name: "Another player's creature open", props: { open: 'their creature' } },
    { name: 'A seat open (pick a creature)', props: { open: 'a seat' } },
    { name: 'A boss move open', props: { open: 'a boss move' } },
    { name: 'A swap request open', props: { open: 'a swap request' } },
    { name: 'The finale order open', props: { state: 'finale lobby', open: 'finale order' } },
    { name: 'Weekend drawer', props: { state: 'between stages', open: 'weekend' } },
    { name: 'Boss drawer', props: { open: 'boss' } },
    { name: 'Players drawer', props: { open: 'players' } },
    { name: 'Log drawer (a stage playing)', props: { state: 'stage playing', open: 'log' } },
    { name: 'Choice: plates on every seat', props: { seatPlates: 'all' } },
    { name: 'Choice: a tap shows a popover first', props: { creatureTap: 'popover-first' } },
  ],
  render: (p) => <CanvasDemo p={p} />,
};

export const raidCanvasEntries: readonly Entry[] = [raidCanvas];
