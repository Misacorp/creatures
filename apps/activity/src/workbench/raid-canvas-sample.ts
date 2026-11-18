/**
 * The raid canvas's states as workbench data (`entries/raid-canvas.tsx`): before the weekend, placing (with a swap request), a stage
 * playing live (mid-round), between stages, the finale's lobby and live fight, after the finale, the boss fallen early and no raid. Each
 * is the week view the server sends (`raidV2Sample`, with your three creatures the dungeon team's geared samples, so the right drawer's
 * configurator is real), plus, for a stage playing, a stand-in for the replay route that answers rounds up to the clock, and, for the finale,
 * a snapshot. The server's new fields (`v2.playing`, a board creature's `talents` and `gear`) are filled in here. Fixture data only.
 */
import { gearContent } from '@creatures/game';
import type { Creature } from '../api';
import { teamSample } from '../creature-page/team-sample';
import type { FinaleFeed } from '../raid-canvas/finale-feed';
import type { FightPhaseV2, LiveSnapshotV2, PlayingReplayV2, ReplayViewV2 } from '../fight-v2-api';
import type { FinaleWindow } from '../live';
import type { WornCardV2 } from '../raid-v2-api';
import type { PhaseResultView, RaidReveal, RaidView } from '../raid-api';
import type { TeamConfigure } from '../TeamCreaturePage';
import { liveSample, replaySample } from './fight-v2-sample';
import { raidV2Sample, type V2SampleOptions } from './raid-v2-sample';

export const CANVAS_STATES = [
  'before the weekend',
  'placing',
  'stage playing',
  'between stages',
  'finale lobby',
  'live finale',
  'after the finale',
  'boss fell early',
  'no raid',
] as const;
export type CanvasState = (typeof CANVAS_STATES)[number];

export interface CanvasSample {
  view: RaidView;
  creatures: Creature[];
  configure: TeamConfigure;
  finale: FinaleWindow;
  feed?: FinaleFeed;
  stageFetcher?: (
    week: string,
    party: number,
    phase: FightPhaseV2,
  ) => Promise<ReplayViewV2 | PlayingReplayV2>;
  reveal?: RaidReveal;
  /** The server's clock for this state (the stage playing is placed around it). */
  now: number;
}

const WEEK: V2SampleOptions = {
  slot: 1,
  players: 4,
  stagesPlayed: 0,
  mine: 3,
  bestShareBp: 0,
  knockedOut: false,
  swaps: 'none',
};

const OPTIONS: Record<CanvasState, Partial<V2SampleOptions>> = {
  'before the weekend': { mine: 0 },
  placing: { mine: 2, swaps: 'incoming', bestShareBp: 4000 },
  'stage playing': { mine: 3 },
  'between stages': { stagesPlayed: 1, knockedOut: true, bestShareBp: 4000 },
  'finale lobby': { stagesPlayed: 2 },
  'live finale': { stagesPlayed: 2 },
  'after the finale': { stagesPlayed: 2 },
  'boss fell early': { stagesPlayed: 2 },
  'no raid': {},
};

const STAGE_MS = 30_000;
const ROUNDS = 8;

/** A stage's result row as the raid view lists it. */
const result = (
  phase: PhaseResultView['phase'],
  fell: boolean,
  hpEnd: number,
  hpMax: number,
): PhaseResultView => ({
  phase,
  at: 1_800_000_000_000,
  cleared: true,
  rounds: 6,
  bossHpMax: hpMax,
  bossHpStart: hpMax,
  bossHpEnd: fell ? 0 : hpEnd,
  damage: hpMax - hpEnd,
  reactions: 4,
  top: [],
  essence: 40,
  rankChange: null,
  festivalGrant: null,
});

/** A worn item as another player sees it (`WornCardV2`): its lines all do something for the wearer here. */
function wornCard(
  base: (typeof gearContent.bases)[number],
  rarity: WornCardV2['rarity'],
  itemLevel: number,
  lines: readonly string[],
): WornCardV2 {
  return {
    baseId: base.id,
    slot: base.slot,
    tag: base.tag,
    rarity,
    festival: false,
    itemLevel,
    stats: [],
    lines: lines.map((text, k) => ({
      id: `line-${String(k)}`,
      name: text,
      text,
      about: '',
      source: 'rolled',
      tier: null,
      bestTier: null,
      local: false,
      active: true,
    })),
  };
}

/** What the server adds to a board creature for the right drawer: its talents and what it wears. */
function withExtras(view: RaidView): RaidView {
  const v2 = view.v2;
  if (v2 === undefined) return view;
  const hat = gearContent.bases.find((b) => b.slot === 'hat');
  const scarf = gearContent.bases.find((b) => b.slot === 'scarf');
  return {
    ...view,
    v2: {
      ...v2,
      creatures: v2.creatures.map((c, i) => ({
        ...c,
        talents: [
          {
            id: 'first-pounce',
            golden: i % 3 === 0,
            name: 'First Pounce',
            text: 'Its first hit that lands each fight deals +170%.',
          },
          { id: 'crit-damage', golden: false, name: 'Amplified Crits', text: 'Its crits are 3x.' },
        ],
        gear:
          hat === undefined || scarf === undefined
            ? []
            : [
                wornCard(hat, 'rare', 8, ['Wildfire bonus +13%', 'First pounce +14%']),
                wornCard(scarf, 'common', 4, ['Attack +4%']),
              ],
      })),
    },
  };
}

/** Your board creatures are the dungeon team's geared samples (ids, species and names), so the drawer's configurator is real. */
function withTeam(view: RaidView, team: readonly Creature[]): RaidView {
  const mineSlots = (view.party?.row ?? []).filter((s) => s.creature?.mine === true);
  const bySlot = new Map(
    mineSlots
      .map((s, i) => [s.slot, team[i % team.length]] as const)
      .flatMap(([slot, c]) => (c === undefined ? [] : [[slot, c] as const])),
  );
  const party = view.party;
  const v2 = view.v2;
  return {
    ...view,
    ...(party === null
      ? {}
      : {
          party: {
            ...party,
            row: party.row.map((s) => {
              const c = bySlot.get(s.slot);
              return c === undefined || s.creature === null
                ? s
                : {
                    ...s,
                    creature: {
                      ...s.creature,
                      creatureId: c.id,
                      species: c.species,
                      name: c.nickname ?? c.species,
                      level: c.level,
                    },
                  };
            }),
          },
        }),
    ...(v2 === undefined
      ? {}
      : {
          v2: {
            ...v2,
            creatures: v2.creatures.map((e) => {
              const c = bySlot.get(e.slot);
              return c === undefined ? e : { ...e, creatureId: c.id };
            }),
            out: v2.out.map((o, i) => {
              const c = team[(i + 2) % team.length];
              return o.mine && c !== undefined ? { ...o, creatureId: c.id, species: c.species } : o;
            }),
          },
        }),
    you: {
      ...view.you,
      team: {
        creatures: [...bySlot.entries()].map(([slot, c]) => ({
          creatureId: c.id,
          species: c.species,
          name: c.nickname ?? c.species,
          level: c.level,
          slot,
        })),
      },
    },
  };
}

export function canvasSample(state: CanvasState): CanvasSample {
  const { team, creatures, gear, state: gameState } = teamSample();
  const realClock =
    state === 'stage playing' || state === 'live finale' || state === 'finale lobby';
  const now = realClock ? Date.now() : raidV2Sample({ ...WEEK, ...OPTIONS[state] }).view.serverNow;
  const options = { ...WEEK, ...OPTIONS[state] };
  const base = raidV2Sample(options).view;
  let view = withExtras(withTeam(base, team));
  // Stage 1 locks the players: from then on nothing on the board changes. The calendar's next event follows the stages played.
  const locked = options.stagesPlayed > 0;
  const nextEvent =
    options.stagesPlayed === 0 ? 'phase1' : options.stagesPlayed === 1 ? 'phase2' : 'finale';
  view = {
    ...view,
    you: { ...view.you, canEdit: !locked },
    next:
      state === 'after the finale' || state === 'boss fell early'
        ? null
        : { event: nextEvent, at: view.schedule[nextEvent] },
    ...(options.stagesPlayed === 0 ? {} : { status: nextEvent }),
  };
  const hpMax = view.party?.bossHp?.max ?? 1000;
  const configure: TeamConfigure = {
    state: gameState,
    gear,
    busy: false,
    actions: {
      onEquip: () => Promise.resolve(false),
      onRibbon: () => undefined,
      onEvolve: () => undefined,
      onRename: () => undefined,
      onNote: () => undefined,
      onLounge: () => undefined,
      onSlotTalent: () => undefined,
    },
    onAnswerCatch: () => undefined,
  };
  const fight = { slot: options.slot, players: options.players, seed: 'canvas' } as const;
  const finaleStart = now - 2.5 * STAGE_MS;
  switch (state) {
    case 'stage playing': {
      const stage = 1 as const;
      const startsAt = now - 2.5 * STAGE_MS;
      const playing = {
        stage,
        startsAt,
        roundMs: STAGE_MS,
        nextRoundAt: startsAt + 3 * STAGE_MS,
        endsAt: startsAt + ROUNDS * STAGE_MS,
      };
      view = {
        ...view,
        v2: view.v2 === undefined ? view.v2 : { ...view.v2, playing },
      } as RaidView;
      const full = replaySample({ ...fight, stage });
      return {
        view,
        creatures,
        configure,
        finale: 'before',
        now,
        stageFetcher: () =>
          Promise.resolve({
            ...full,
            events: full.events.filter((e) => e.round <= 3 && e.board?.type !== 'end'),
            playing: true,
            startsAt,
            roundMs: STAGE_MS,
            round: 3,
            nextRoundAt: playing.nextRoundAt,
          } as unknown as PlayingReplayV2),
      };
    }
    case 'between stages': {
      const party = view.party;
      if (party !== null) {
        view = {
          ...view,
          party: { ...party, results: [result('phase1', false, Math.round(hpMax * 0.62), hpMax)] },
        };
      }
      return { view, creatures, configure, finale: 'before', now };
    }
    case 'finale lobby':
    case 'live finale': {
      const party = view.party;
      if (party !== null) {
        view = {
          ...view,
          party: {
            ...party,
            results: [
              result('phase1', false, Math.round(hpMax * 0.62), hpMax),
              result('phase2', false, Math.round(hpMax * 0.3), hpMax),
            ],
          },
        };
      }
      const live = state === 'live finale';
      const snapshot: LiveSnapshotV2 = {
        ...liveSample({ ...fight, stage: 3 }, { round: live ? 3 : 0 }),
        serverNow: now,
        startsAt: live ? finaleStart : now + 20 * 60_000,
        nextRoundAt: live ? finaleStart + 3 * STAGE_MS : null,
      };
      return {
        view,
        creatures,
        configure,
        finale: live ? 'live' : 'lobby',
        now,
        feed: { snapshot, busy: false, actionError: null, act: () => undefined },
      };
    }
    case 'after the finale': {
      const reveal: RaidReveal = {
        week: view.weekId,
        party: 1,
        cleared: true,
        essence: 120,
        rankChange: null,
        festivalGrant: null,
      };
      return { view, creatures, configure, finale: 'after', reveal, now };
    }
    case 'boss fell early': {
      const party = view.party;
      if (party !== null) {
        view = {
          ...view,
          v2: view.v2 === undefined ? view.v2 : { ...view.v2, nextStage: 4 },
          party: {
            ...party,
            bossHp: { max: hpMax, current: 0 },
            results: [
              result('phase1', false, Math.round(hpMax * 0.5), hpMax),
              result('phase2', true, 0, hpMax),
            ],
          },
        } as RaidView;
      }
      return { view, creatures, configure, finale: 'after', now };
    }
    case 'no raid':
      return {
        view: {
          ...view,
          party: null,
          next: null,
          festival: true,
          you: { ...view.you, inRoster: false, team: null },
        },
        creatures,
        configure,
        finale: 'before',
        now,
      };
    default:
      return { view, creatures, configure, finale: 'before', now };
  }
}
