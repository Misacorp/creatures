import { useMemo, useState } from 'preact/hooks';
import { BossCardV2 } from '../../BossCardV2';
import { Placement } from '../../Placement';
import { SwapRequests } from '../../SwapRequests';
import { litMove } from '../../raid-board-v2';
import type { BossMoveV2, SwapV2 } from '../../raid-v2-api';
import { MoveTile } from '../../ui/MoveTile';
import { TrackStrip } from '../../ui/TrackStrip';
import { raidV2Sample, trackOf, V2_NAMES, type V2SampleOptions } from '../raid-v2-sample';
import { speciesLabel } from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const SWAP_KINDS = ['none', 'asked', 'incoming', 'both'] as const;

/** The week a page asks for. */
function optionsOf(p: Props): V2SampleOptions {
  const stage = num(p, 'stage');
  const swaps = SWAP_KINDS.find((k) => k === str(p, 'swaps')) ?? 'none';
  return {
    slot: num(p, 'slot'),
    players: num(p, 'players'),
    stagesPlayed: stage >= 2 ? 2 : stage === 1 ? 1 : 0,
    mine: num(p, 'mine'),
    bestShareBp: num(p, 'bestSharePct') * 100,
    knockedOut: bool(p, 'knockedOut'),
    swaps,
    determinationBp: num(p, 'determinationPct') * 100,
  };
}

/** The Fizzle move as the server's card lists it for a boss that carries it (the Ash Sprite's every second round), for the presets. */
const fizzleMoveOf = (rows: number): BossMoveV2 => ({
  id: 'fizzle',
  name: 'Fizzle',
  label: 'No reactions',
  shape: 'all',
  silences: false,
  oneShot: false,
  fizzles: true,
  every: 2,
  turn: rows - 1,
  windUp: false,
  later: false,
});

/**
 * The v2 part of the Raid tab as one page: the track strip, the boss card and the party board, wired to a stand-in for the server
 * (a tap on a move lights its slots; a placement is refused with a hint; asking to swap adds a pending request).
 */
function RaidWeekDemo({ p }: { p: Props }) {
  const sample = useMemo(() => raidV2Sample(optionsOf(p)), [p]);
  const { ownedIds } = sample;
  // `fizzle` adds the Fizzle move to the boss's card (no raid boss carries it yet; the Ash Sprite does).
  const view =
    bool(p, 'fizzle') && sample.view.v2 !== undefined
      ? {
          ...sample.view,
          v2: {
            ...sample.view.v2,
            card: {
              ...sample.view.v2.card,
              moves: [...sample.view.v2.card.moves, fizzleMoveOf(sample.view.v2.rows)],
            },
          },
        }
      : sample.view;
  const v2 = view.v2;
  const party = view.party;
  const [litId, setLitId] = useState<string | null>(null);
  const [asked, setAsked] = useState<readonly SwapV2[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  if (v2 === undefined || party === null) return null;
  const pick = num(p, 'tap');
  const tappedId =
    pick > 0 ? (v2.card.moves[Math.min(pick, v2.card.moves.length) - 1]?.id ?? null) : litId;
  const tapped = v2.card.moves.find((m) => m.id === tappedId);
  const owned = ownedIds.map((id, i) => {
    const onBoard = party.row.find((s) => s.creature?.creatureId === id)?.creature;
    const species = onBoard?.species ?? v2.out.find((o) => o.creatureId === id)?.species;
    const level = onBoard?.level ?? 12;
    return {
      id,
      species: species ?? 'splashet',
      nickname: null,
      level,
      power: level * 3,
      caughtAt: i,
    };
  });
  return (
    <>
      <SwapRequests
        requests={v2.swaps.incoming}
        grid={{ rows: v2.rows, cols: v2.cols }}
        busy={false}
        onAnswer={() => undefined}
      />
      <section class="raid-section">
        <TrackStrip order={v2.track.order} index={v2.track.index} rank={v2.slot} />
      </section>
      <BossCardV2 view={view} lit={tappedId} onLit={setLitId} />
      <Placement
        party={party}
        creatures={owned}
        canEdit
        busy={false}
        rosterNames={V2_NAMES.slice(0, v2.players)}
        turnOrder=""
        onIntent={() => {
          setRefused('A placement goes to the server; this page has none.');
        }}
        v2={{
          view: { ...v2, swaps: { ...v2.swaps, outgoing: [...v2.swaps.outgoing, ...asked] } },
          lit: tapped === undefined ? null : litMove(v2.preview, tapped),
          onAskSwap: (mySlot, theirSlot) => {
            const mine = party.row.find((s) => s.slot === mySlot)?.creature;
            const theirs = party.row.find((s) => s.slot === theirSlot)?.creature;
            if (mine == null || theirs == null) return;
            setAsked((now) => [
              ...now,
              {
                id: `asked-${String(now.length)}`,
                from: 'You',
                to: theirs.ownerName,
                slotA: mySlot,
                slotB: theirSlot,
                creatureA: { species: mine.species, name: mine.name, level: mine.level },
                creatureB: { species: theirs.species, name: theirs.name, level: theirs.level },
                createdAt: now.length,
              },
            ]);
          },
        }}
      />
      {refused !== null && (
        <p class="muted" role="status">
          {refused}
        </p>
      )}
    </>
  );
}

const WEEK_CONTROLS = {
  slot: { kind: 'number', min: 1, max: 15 },
  players: { kind: 'number', min: 1, max: 15 },
  stage: { kind: 'number', min: 0, max: 2 },
  mine: { kind: 'number', min: 0, max: 3 },
  bestSharePct: { kind: 'number', min: 0, max: 100 },
  determinationPct: { kind: 'number', min: 0, max: 25 },
  knockedOut: { kind: 'toggle' },
  swaps: { kind: 'select', options: SWAP_KINDS },
  tap: { kind: 'number', min: 0, max: 9 },
  fizzle: { kind: 'toggle' },
} as const;

const WEEK_DEFAULTS = {
  slot: 1,
  players: 4,
  stage: 0,
  mine: 3,
  bestSharePct: 0,
  determinationPct: 0,
  knockedOut: false,
  swaps: 'none',
  tap: 0,
  fizzle: false,
};

const bossCardV2: Entry = {
  name: 'BossCardV2',
  file: 'apps/activity/src/BossCardV2.tsx',
  group: 'Creatures & game pieces',
  description:
    "The v2 raid tab as a player meets it before and between stages: the track strip, the boss card (armour, the weekend's HP bar with a tick per stage and last week's best as a ghost, rule cards with their strength, the Escalating meter, the plain attack, a tile for each move and the turn strip) and the party board under it, with the boss's rows by the party's columns. Tap a move tile and the slots it would hit light on the board (a move aimed when it comes lights nothing and says so); the tap control does the same from the controls. Tap another player's creature, then Ask to swap.",
  covers: ['boardTurnSteps', 'strengthPips', 'stageTicks'],
  controls: WEEK_CONTROLS,
  defaults: WEEK_DEFAULTS,
  presets: [
    { name: 'Slot 1 before stage 1 (4 columns, no card row)', props: {} },
    { name: 'Slot 1, a move tapped', props: { tap: 3 } },
    { name: 'Slot 1, a Wind-up move tapped (aimed when it comes)', props: { tap: 4 } },
    {
      name: 'Slot 3 with a Fizzle move (hits nobody)',
      props: { slot: 3, players: 5, fizzle: true },
    },
    {
      name: 'Slot 3, the Fizzle move tapped',
      props: { slot: 3, players: 5, fizzle: true, tap: 9 },
    },
    { name: 'Slot 3, two rows, 5 players', props: { slot: 3, players: 5 } },
    {
      name: 'Slot 8 (rule cards, Escalating), 6 players',
      props: { slot: 8, players: 6, tap: 1 },
    },
    {
      name: 'Between stages: carried HP, one creature out, the boss is back',
      props: { slot: 2, players: 5, stage: 1, knockedOut: true, bestSharePct: 40 },
    },
    {
      name: 'Second lap, a boss failed three times (Determination chip)',
      props: { slot: 6, players: 5, bestSharePct: 55, determinationPct: 15 },
    },
    { name: 'Swap request asked', props: { players: 5, swaps: 'asked' } },
    { name: 'Swap request waiting for you', props: { players: 5, swaps: 'incoming' } },
    { name: 'Eleven players', props: { players: 11, slot: 6 } },
  ],
  render: (p) => <RaidWeekDemo p={p} />,
};

const moveTile: Entry = {
  name: 'MoveTile',
  file: 'apps/activity/src/ui/MoveTile.tsx',
  group: 'Creatures & game pieces',
  description:
    "One boss move as a tile on the v2 boss card: a tiny arena with the slots the move would hit lit in red (or, for a move aimed when it comes, its shape's picture over a dim arena), how often it is due, an hourglass for a Wind-up, and its name over its plain label. A tap selects it; the board lights the same slots.",
  covers: ['everyText'],
  controls: {
    slot: { kind: 'number', min: 1, max: 5 },
    move: { kind: 'number', min: 1, max: 9 },
    players: { kind: 'number', min: 1, max: 15 },
    selected: { kind: 'toggle' },
  },
  defaults: { slot: 1, move: 3, players: 4, selected: false },
  presets: [
    { name: 'A fixed move (slots lit)', props: {} },
    { name: 'A Wind-up move (aimed when it comes)', props: { move: 4 } },
    { name: 'Selected', props: { selected: true } },
    { name: 'Wide arena (11 columns)', props: { players: 11 } },
    { name: 'Two-row boss', props: { slot: 3, move: 1 } },
  ],
  render: (p) => {
    const { view } = raidV2Sample({
      slot: num(p, 'slot'),
      players: num(p, 'players'),
      stagesPlayed: 0,
      mine: 3,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'none',
    });
    const v2 = view.v2;
    const move = v2?.card.moves[num(p, 'move') - 1] ?? v2?.card.moves[0];
    if (v2 === undefined || move === undefined) return null;
    return (
      <div class="boss-moves">
        <MoveTile
          move={move}
          arena={{ rows: v2.rows, cols: v2.cols }}
          lit={litMove(v2.preview, move).slots}
          selected={bool(p, 'selected')}
          onToggle={() => undefined}
        />
      </div>
    );
  },
};

const trackStrip: Entry = {
  name: 'TrackStrip',
  file: 'apps/activity/src/ui/TrackStrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The track strip on the week\'s raid screen: the five bosses of the lap as portraits, this week\'s lit, the beaten ones ticked, with "Boss Rank N" over them. It never shows on a fight screen, and no boss is marked as harder than another.',
  controls: { rank: { kind: 'number', min: 1, max: 15 } },
  defaults: { rank: 1 },
  presets: [
    { name: 'First boss', props: {} },
    { name: 'Third boss', props: { rank: 3 } },
    { name: 'Last of the lap', props: { rank: 5 } },
    { name: 'Second lap, second boss', props: { rank: 7 } },
  ],
  render: (p) => {
    const track = trackOf(num(p, 'rank'));
    return (
      <div class="raid-section">
        <TrackStrip order={track.order} index={track.index} rank={num(p, 'rank')} />
      </div>
    );
  },
};

const swapRequests: Entry = {
  name: 'SwapRequests',
  file: 'apps/activity/src/SwapRequests.tsx',
  group: 'Creatures & game pieces',
  description:
    'The swap requests other players asked of you, at the top of the Raid tab (Home\'s notice row leads here): a note per request ("Mira asks to swap Lanternfin for Emberkit.") with Accept and Decline. Nothing is drawn without a request.',
  controls: { requests: { kind: 'number', min: 0, max: 3 }, busy: { kind: 'toggle' } },
  defaults: { requests: 1, busy: false },
  presets: [
    { name: 'One request', props: {} },
    { name: 'Three requests', props: { requests: 3 } },
    { name: 'Answer on its way', props: { busy: true } },
    { name: 'None', props: { requests: 0 } },
  ],
  render: (p) => {
    const { view } = raidV2Sample({
      slot: 1,
      players: 4,
      stagesPlayed: 0,
      mine: 3,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'incoming',
    });
    const first = view.v2?.swaps.incoming[0];
    if (view.v2 === undefined || first === undefined) return null;
    const names = V2_NAMES.slice(1);
    const requests = Array.from({ length: num(p, 'requests') }, (_, i) => ({
      ...first,
      id: `${first.id.slice(0, -1)}${String(i)}`,
      from: names[i] ?? 'Mira',
      creatureA:
        first.creatureA === null ? null : { ...first.creatureA, name: speciesLabel('ashmole') },
    }));
    return (
      <SwapRequests
        requests={requests}
        grid={{ rows: view.v2.rows, cols: view.v2.cols }}
        busy={bool(p, 'busy')}
        onAnswer={() => undefined}
      />
    );
  },
};

export const raidV2Entries: readonly Entry[] = [bossCardV2, moveTile, trackStrip, swapRequests];
