/**
 * A room of the daily dungeon on combat v2 (docs/design/combat/integration.md, sections 5 and 6): the run's
 * fighters, the room's foe, the fight, and what is stored and shown of it. A run that started with the
 * `COMBAT_V2` flag on is version 2 (`RunState.v`) and every room of it is played here; the map, the camp,
 * the events and the rewards are the v1 run's, unchanged.
 *
 * - **The row** is `RunState.fighters` (the v2 creatures, frozen when they joined) in the order of
 *   `RunState.input.team`, one row, `col` the place in the row. The order of play is R8.7's: the row acts left to
 *   right, then the foe takes its turn.
 * - **The foe** is `foeAt` of the room's foe at the run's depth (the Undercroft's scaled depth under ground). The
 *   floor boss gains its signature as `foeAt` decides (a landmark depth); an Undercroft keeper always has it. An
 *   elite's or an epic fight's boost scales the foe's HP and Attack as in v1.
 * - **Numbers folded in:** the room modifier's, then the keepsakes' and curses' plain number effects (team Attack,
 *   HP and Speed, team crit, foe HP and Attack), as in v1. A modifier's foe gimmick (v1 foe move) has no v2
 *   counterpart and does nothing. Weather, finale abilities, gear effect lines with no v2 hook yet and fusion do nothing.
 * - **Between rooms only HP carries** (R14), and a Scarf's Between-room Rest (`RunState.input.rest`, the share of max HP a standing
 *   creature recovers before each room) is added to it, never above max. A knocked-out creature (0 HP) is left out of every later room until a
 *   camp swap sends it away; the camp's rest never raises it.
 * - **Stored** in `dungeon_steps` (`StoredFightV2`): the room's `FightInputV2` (it cannot hold the carried HP, a
 *   Map, so `hpIn` is beside it), what to show of the room, and the result (`RoomResultV2`) with the board events.
 */
import {
  RULES,
  content,
  createSeededRng,
  undercroftDepth,
  type Element,
  type KeepsakeDef,
  type RoomEffect,
} from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  fightV2,
  foeAt,
  type BossDef,
  type FightEvent,
  type FightInputV2,
  type FighterSpec,
} from '@creatures/engine/v2';
import type { DungeonRoomSpec } from '@creatures/engine';
import { SHIPPED } from './fighter-v2';
import { heldFolds, keepsakeViewOf, type RunState } from './dungeon-state';
import type { DungeonKeepsakeView, DungeonReplayRoomV2, ReplayRowEntry } from './dungeon-types';
import { arenaOf, knackNamesOf } from './dungeon-v2-view';
import { bossCardView } from './raid-v2-card';

/** What a stored room shows besides its fight: the row that stood in it, the foe and the modifier as they were. */
export interface RoomMetaV2 {
  index: number;
  kind: 'foe' | 'boss';
  elite?: true;
  epic?: true;
  /** Every creature of the row, knocked out or not, left to right. */
  row: ReplayRowEntry[];
  keepsakes?: DungeonKeepsakeView[];
  foe: { id: string; name: string; element: Element };
  modifier: { id: string; name: string; description: string };
}

/** What `dungeon_steps.input_json` holds for a room of a v2 run. */
export interface StoredFightV2 {
  /** The fight, whole: the rules, the chart, the foe with its cards, the fighters that stood. No carried HP (see `hpIn`). */
  input: FightInputV2;
  /** The HP the row came in with, by creature id (null: the run's first fight). A creature with no entry is at full HP. */
  hpIn: Record<string, number> | null;
  room: RoomMetaV2;
}

/** What `dungeon_steps.result_json` holds for a room of a v2 run. */
export interface RoomResultV2 {
  version: 2;
  index: number;
  cleared: boolean;
  rounds: number;
  foeHpStart: number;
  foeHpEnd: number;
  /** Every creature of the row: its HP when the room started, when it ended (0: knocked out) and its most. */
  hpStart: Record<string, number>;
  hpEnd: Record<string, number>;
  hpMax: Record<string, number>;
  events: FightEvent[];
}

/** A stored fight is a v2 one. */
export const isStoredV2 = (stored: { input: object }): stored is StoredFightV2 =>
  'version' in stored.input && stored.input.version === 2;

/** A stored result is a v2 one. */
export const isResultV2 = (result: object): result is RoomResultV2 =>
  'version' in result && result.version === 2;

const scale = (value: number, bp: number): number =>
  Math.max(1, Math.floor((value * (10_000 + bp)) / 10_000));

type TeamStat = Extract<RoomEffect, { op: 'team_stat' }>;
const matches = (effect: TeamStat, spec: Pick<FighterSpec, 'element' | 'role'>): boolean =>
  (effect.element === undefined || effect.element === spec.element) &&
  (effect.role === undefined || effect.role === spec.role);

/** A fighter with the plain number effects folded in (see the file comment), in order. */
export function foldFighter(spec: FighterSpec, effects: readonly RoomEffect[]): FighterSpec {
  let out = spec;
  for (const e of effects) {
    if (e.op === 'team_stat' && matches(e, out)) {
      out =
        e.stat === 'hp'
          ? { ...out, maxHp: scale(out.maxHp, e.bp) }
          : e.stat === 'atk'
            ? { ...out, atk: scale(out.atk, e.bp) }
            : { ...out, spd: scale(out.spd, e.bp) };
    } else if (e.op === 'team_crit') {
      out = {
        ...out,
        critChanceBp: out.critChanceBp + e.chanceBp,
        critDamageBp: out.critDamageBp + e.damageBp,
      };
    }
  }
  return out;
}

/** What the run holds (keepsakes, then curses) as the effects every room folds in after its modifier. */
const heldEffects = (st: Pick<RunState, 'keepsakes' | 'curses'>): RoomEffect[] =>
  heldFolds(st).flatMap((k) => k.effects);

/** A creature's max HP in the run's next fight: its frozen fighter with the held keepsakes and curses folded in. */
export function maxHpV2(st: RunState, id: string): number {
  const spec = st.fighters?.[id];
  return spec === undefined ? 0 : foldFighter(spec, heldEffects(st)).maxHp;
}

/** The max HP of everyone in the row now (see `maxHpV2`). */
export function rowMaxHpV2(st: RunState): Record<string, number> {
  return Object.fromEntries(st.input.team.map((slot) => [slot.id, maxHpV2(st, slot.id)]));
}

/** The foe of a room as the engine's boss: `foeAt` at the (scaled) depth, the room's boost, then the folds of the modifier and the held keepsakes. */
export function roomFoeV2(
  st: Pick<RunState, 'level' | 'keepsakes' | 'curses'>,
  spec: DungeonRoomSpec,
  depth: number,
): BossDef {
  const foe = foeAt(combatV2, SHIPPED, spec.foe.id, undercroftDepth(depth, st.level), {
    ...(spec.signature === true ? { signature: true } : {}),
    ...(st.level > 0 ? { undercroft: true } : {}),
  });
  const boost =
    spec.epic === true
      ? RULES.dungeon.undercroft.epic
      : spec.elite === true
        ? RULES.dungeon.elite
        : null;
  let hp = boost === null ? foe.hp : Math.max(1, Math.floor((foe.hp * boost.hpBp) / 10_000));
  let atk = boost === null ? foe.atk : Math.max(1, Math.floor((foe.atk * boost.atkBp) / 10_000));
  for (const e of [...spec.modifier.effects, ...heldEffects(st)]) {
    if (e.op !== 'foe_stat') continue;
    if (e.stat === 'hp') hp = scale(hp, e.bp);
    else atk = scale(atk, e.bp);
  }
  return { ...foe, hp, atk };
}

export interface PlayedRoomV2 {
  input: FightInputV2;
  hpIn: Record<string, number> | null;
  room: RoomMetaV2;
  result: RoomResultV2;
}

/**
 * Plays one room of a v2 run from its state, with the seed drawn by the caller. The state is not changed: the
 * caller stores `result.hpEnd` and `result.hpMax` as the run's HP. The row is the creatures of `st.input.team` in
 * order, a creature at 0 HP left out, the rest at their carried HP (full when there is none).
 */
export function playRoomV2(
  st: RunState,
  spec: DungeonRoomSpec,
  row: ReplayRowEntry[],
  depth: number,
  seed: string,
): PlayedRoomV2 {
  const fighters = st.fighters;
  if (fighters === undefined) throw new Error('a v2 run has no fighters');
  const held = heldEffects(st);
  const effects = [...spec.modifier.effects, ...held];
  const carried = st.hp;
  const team = st.input.team.map((slot, col) => {
    const base = fighters[slot.id];
    if (base === undefined) throw new Error(`no v2 fighter for ${slot.id}`);
    return { id: slot.id, spec: { ...foldFighter(base, effects), row: 0, col } };
  });
  const hpMax = Object.fromEntries(team.map((t) => [t.id, t.spec.maxHp]));
  const hpStart = Object.fromEntries(
    team.map((t) => {
      const max = hpMax[t.id] ?? 0;
      const held = Math.min(max, carried?.[t.id] ?? max);
      // Between-room Rest: a creature that stands (and has fought before) recovers its share of max HP; a fallen one stays down.
      const rest = st.input.rest?.[t.id] ?? 0;
      const rested =
        carried?.[t.id] !== undefined && held > 0 && rest > 0
          ? Math.min(max, held + Math.floor((max * rest) / 10_000))
          : held;
      return [t.id, rested];
    }),
  );
  const standing = team.filter((t) => (hpStart[t.id] ?? 0) > 0);
  const hpIn = carried === null ? null : { ...carried };
  const boss = roomFoeV2(st, spec, depth);
  const input: FightInputV2 = {
    version: 2,
    rules: combatV2.rules,
    elements: content.elements.map((e) => e.id),
    chart: content.elementChart,
    boss,
    fighters: standing.map((t) => t.spec),
    options: { log: true },
  };
  const result = fightV2(withCarry(input, hpStart), createSeededRng(seed));
  const hpEnd = Object.fromEntries(
    team.map((t) => [t.id, Math.max(0, result.hpLeft.get(t.id) ?? 0)]),
  );
  // The row that was knocked out before the room stays at 0.
  for (const t of team) if ((hpStart[t.id] ?? 0) <= 0) hpEnd[t.id] = 0;
  const keepsakes = heldFolds(st);
  return {
    input,
    hpIn,
    room: roomMeta(spec, row, keepsakes),
    result: {
      version: 2,
      index: spec.index,
      cleared: result.won,
      rounds: lastRound(result.events),
      foeHpStart: boss.hp,
      foeHpEnd: Math.max(0, result.bossHpLeft),
      hpStart,
      hpEnd,
      hpMax,
      events: [...result.events],
    },
  };
}

/** The room's input with the HP the fighters carry in. The stored input has none: the engine reads a Map, which JSON cannot hold. */
function withCarry(input: FightInputV2, hp: Readonly<Record<string, number>>): FightInputV2 {
  return {
    ...input,
    options: { ...input.options, carryHp: new Map(Object.entries(hp)) },
  };
}

/** The rounds played: the last round the fight's own end event names. */
function lastRound(events: readonly FightEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const board = events[i]?.board;
    if (board?.type === 'end') return board.round;
  }
  return 0;
}

function roomMeta(
  spec: DungeonRoomSpec,
  row: ReplayRowEntry[],
  keepsakes: readonly KeepsakeDef[],
): RoomMetaV2 {
  return {
    index: spec.index,
    kind: spec.foe.kind,
    ...(spec.elite === true ? { elite: true as const } : {}),
    ...(spec.epic === true ? { epic: true as const } : {}),
    row,
    ...(keepsakes.length === 0 ? {} : { keepsakes: keepsakes.map(keepsakeViewOf) }),
    foe: { id: spec.foe.id, name: spec.foe.name, element: spec.foe.element },
    modifier: {
      id: spec.modifier.id,
      name: spec.modifier.name,
      description: spec.modifier.description,
    },
  };
}

/**
 * A stored room in the replay shape: its row, the foe and its HP, the rounds, every creature's HP at the start, the
 * end and at most, and the events (the log's text and the board events). `rules: 2` says which screens play it.
 */
export function replayRoomV2(
  node: string | null,
  stored: StoredFightV2,
  result: RoomResultV2,
): DungeonReplayRoomV2 {
  const { room } = stored;
  return {
    rules: 2,
    index: result.index,
    kind: room.kind,
    ...(room.elite === true ? { elite: true } : {}),
    ...(room.epic === true ? { epic: true } : {}),
    ...(node === null ? {} : { node, row: room.row }),
    ...(room.keepsakes === undefined ? {} : { keepsakes: room.keepsakes }),
    foe: { ...room.foe, hpMax: result.foeHpStart },
    modifier: room.modifier,
    cleared: result.cleared,
    rounds: result.rounds,
    hpStart: result.hpStart,
    hpEnd: result.hpEnd,
    hpMax: result.hpMax,
    events: result.events,
    card: bossCardView(stored.input.boss, null),
    arena: arenaOf(stored.input),
    knacks: knackNamesOf(stored.input),
  };
}
