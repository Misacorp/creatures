/**
 * The read models of a combat v2 raid weekend (docs/design/combat/integration.md, sections 4, 5 and 9): the week as the caller sees it,
 * a stored stage for the replay and the after-action stats, and the live finale. Every v2 view says `rules: 2` (a v1 view carries no such
 * key and keeps its shape byte for byte). Only display data leaves here: players appear by display name and the fight's opaque keys
 * (`m1`, ...), never by user id; the seed is only in a resolved stage's replay.
 *
 * A creature is named in the board events by its id (`FighterSpec.key`); the views list the creatures of the fight beside the events, so a
 * client folds them into board states. A creature's id is only a handle: every action checks the session's ownership.
 */
import { RULES, content, seasonOf } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import type {
  BossDef,
  FightEvent,
  FinaleActionKind,
  StageCarry,
  StageInputV2,
} from '@creatures/engine/v2';
import type { Raid, WeekRow } from './raid';
import { readFestivalGrant, type FestivalGrantView } from './raid-festival';
import { rankChangeOf, readWeekProgression, type RankChangeView } from './raid-ladder';
import { type StoredSummary } from './raid-resolve';
import { latestReveal, totalEssenceOf } from './raid-reveal';
import { partyMembers, partyOf, partyToJoin } from './raid-roster';
import { addWeeks, weekIndex, isWeekId } from './raid-schedule';
import { openSwaps, type SwapRequestRow } from './raid-swap';
import { partyPlacements } from './raid-teams';
import { speciesOf } from './species';
import {
  colsFor,
  determinationBpFor,
  gridPlace,
  readPartyCarry,
  readTrack,
  slotBossInfo,
  weekendBoss,
  type PartyCarry,
} from './raid-v2-core';
import {
  DEFAULT_WALL_ROW,
  defaultRoundV2,
  evaluateV2,
  v2AbilityIds,
  type LiveRowV2,
} from './raid-v2-live';
import { RESULT_PHASES, type ResultPhase, type StoredStageResult } from './raid-v2-stage';
import { loadAutofire, BASIC_TARGET } from './raid-autofire';
import {
  bossCardView,
  movePreviewView,
  trackView,
  type BossCardV2View,
  type MovePreviewView,
  type TrackView,
} from './raid-v2-card';
import { fighterOf, knackOf, loadV2Creatures, type V2Creature } from './raid-v2-fighters';
import {
  displayNames,
  nextPendingEvent,
  type PhaseResultView,
  type RaidView,
  type RowSlotView,
} from './raid-view';
import type { RaidStatus } from './raid-teams';

/** A swap request as its parties see it. */
export interface SwapView {
  id: string;
  /** The asker's and the asked player's display names. */
  from: string;
  to: string;
  slotA: number;
  slotB: number;
  /** The creature at each slot when the request was read (null: an empty slot). */
  creatureA: { species: string; name: string; level: number } | null;
  creatureB: { species: string; name: string; level: number } | null;
  createdAt: number;
}

/** The caller's open swap requests. */
export interface SwapsView {
  incoming: SwapView[];
  outgoing: SwapView[];
}

/** What a v2 board needs beyond the v1 shape of the week view (`RaidView.v2`). */
export interface RaidV2Part {
  /** The track's slot this week fights (the Boss Rank), and the server's best share of its HP so far (bp). */
  slot: number;
  bestShareBp: number;
  /** Failed weekends on this slot from the second lap on, and the bonus they give (bp of damage and healing). */
  failedWeekends: number;
  determinationBp: number;
  /** The stages the caller's party has played (0 to 3), and the next one to play (1 to 3; 4 when all are played or the boss has fallen). */
  stagesPlayed: number;
  nextStage: number;
  /** Joining is open: stage 1 has not begun and the week is not a Festival. */
  joiningOpen: boolean;
  /** The arena: rows of the slot's boss and the columns (`max(4, players)`); a slot is `col * rows + row`. */
  rows: number;
  cols: number;
  /** The party's players (set at stage 1; before it, the players joined so far). */
  players: number;
  /** The weekend's boss as it fights this party, with its rule cards applied (moves carry their library ids). */
  boss: BossDef | null;
  /** The names of the boss's moves by library id. */
  moveNames: Record<string, string>;
  /** The boss card as the screen draws it: armour, rule cards, the Escalating meter, the plain attack and the moves with their labels. */
  card: BossCardV2View;
  /** The lap's five bosses and the one this week fights. */
  track: TrackView;
  /**
   * The slots each fixed-rule move hits and the plain attack's target with the board as it stands (the engine's own targeting; a move aimed
   * by a roll or a Wind-up is null: it is aimed when it comes). Null when no creature stands on the board.
   */
  preview: MovePreviewView | null;
  /** What the party carries: the boss's HP, each creature's HP and who is out for the weekend; null before stage 1. */
  carry: StageCarry | null;
  /** The party's creatures that are out for the weekend. */
  out: { creatureId: string; species: string; name: string; owner: string; mine: boolean }[];
  /** The board's creatures with their carried HP (null: has not fought yet) and saved Knack. */
  creatures: {
    creatureId: string;
    slot: number;
    row: number;
    col: number;
    hp: number | null;
    /** Its Max HP, for the carried HP bar (null: not known). */
    hpMax: number | null;
    knack: string | null;
    /** The saved Knack's name (null: none). */
    knackName: string | null;
  }[];
  swaps: SwapsView;
}

/**
 * The move preview of a party's board: the creatures standing (not out for the weekend, inside the board's width) as the stage would build
 * them, with the engine's own targeting over them; and the Max HP of each of them, for the carried HP bars.
 */
function previewOf(
  boss: BossDef,
  carry: StageCarry | null,
  placements: readonly { slot: number; user_id: string; creature_id: string }[],
  creatures: ReadonlyMap<string, V2Creature>,
  rows: number,
  cols: number,
): { preview: MovePreviewView | null; maxHp: ReadonlyMap<string, number> } {
  const out = new Set(carry?.out ?? []);
  const standing = placements.filter((p) => !out.has(p.creature_id));
  const owners = [...new Set(standing.map((p) => p.user_id))];
  const slotOf = new Map<string, number>();
  const maxHp = new Map<string, number>();
  const fighters = standing.flatMap((p) => {
    const c = creatures.get(p.creature_id);
    const place = gridPlace(p.slot, rows);
    if (c === undefined || c.userId !== p.user_id || place.col >= cols) return [];
    slotOf.set(c.id, p.slot);
    const fighter = fighterOf(c, `p${String(owners.indexOf(p.user_id))}`, place);
    maxHp.set(c.id, fighter.maxHp);
    return [fighter];
  });
  return { preview: movePreviewView(boss, fighters, carry, slotOf), maxHp };
}

/** A saved Knack's name, or null for none (or one the pack no longer has). */
const knackNameOf = (id: string | null): string | null =>
  id !== null && Object.hasOwn(combatV2.knacks, id) ? (combatV2.knacks[id]?.name ?? null) : null;

const zoneOfRow = (row: number, rows: number): RowSlotView['zone'] =>
  row === 0 ? 'front' : row === rows - 1 ? 'back' : 'middle';

/** The moves of a boss by library id with their names. */
export function moveNamesOf(boss: BossDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of [...boss.moves, ...(boss.escalation?.phase?.moves ?? [])]) {
    const def = Object.hasOwn(combatV2.moves, m.id) ? combatV2.moves[m.id] : undefined;
    out[m.id] = def?.name ?? m.id;
  }
  return out;
}

const creatureLine = (
  sql: SqlStorage,
  weekId: string,
  party: number,
  slot: number,
): { species: string; name: string; level: number } | null => {
  const row = sql
    .exec<{ species: string; level: number; nickname: string | null }>(
      `SELECT c.species AS species, c.level AS level, c.nickname AS nickname
       FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
       WHERE p.week_id = ? AND p.party = ? AND p.slot = ?`,
      weekId,
      party,
      slot,
    )
    .toArray()[0];
  if (row === undefined) return null;
  const species = content.creatures.find((c) => c.id === row.species);
  return {
    species: row.species,
    name: row.nickname ?? species?.name ?? row.species,
    level: row.level,
  };
};

/** The caller's open swap requests with names and the creatures in the two slots. */
export function swapsView(
  sql: SqlStorage,
  weekId: string,
  userId: string,
  names: ReadonlyMap<string, string>,
): SwapsView {
  const { incoming, outgoing } = openSwaps(sql, weekId, userId);
  const view = (r: SwapRequestRow): SwapView => ({
    id: r.id,
    from: names.get(r.from_user) ?? 'Unknown',
    to: names.get(r.to_user) ?? 'Unknown',
    slotA: r.slot_a,
    slotB: r.slot_b,
    creatureA: creatureLine(sql, weekId, r.party, r.slot_a),
    creatureB: creatureLine(sql, weekId, r.party, r.slot_b),
    createdAt: r.created_at,
  });
  return { incoming: incoming.map(view), outgoing: outgoing.map(view) };
}

/** The result of a stored stage as the week view lists it. */
function stageResultView(
  sql: SqlStorage,
  weekId: string,
  phase: ResultPhase,
  summary: StoredSummary,
  at: number,
  userId: string,
  names: ReadonlyMap<string, string>,
): PhaseResultView {
  return {
    phase,
    at,
    cleared: summary.cleared,
    retreated: false,
    enraged: false,
    rounds: summary.rounds,
    bossHpMax: summary.bossHpMax,
    bossHpStart: summary.bossHpStart,
    bossHpEnd: summary.bossHpEnd,
    damage: summary.damage,
    reactions: summary.reactions,
    top: summary.contributors.slice(0, 3).map((c) => ({
      displayName: names.get(c.userId) ?? 'Unknown',
      damage: c.damage,
      contribution: c.contribution,
      you: c.userId === userId,
    })),
    essence:
      phase === 'finale'
        ? totalEssenceOf(sql, userId, weekId, summary)
        : (summary.essence[userId] ?? 0),
    rankChange: phase === 'finale' ? rankChangeOf(sql, weekId) : null,
    festivalGrant: phase === 'finale' ? readFestivalGrant(sql, weekId, userId) : null,
  };
}

/** True when joining is still open on a v2 week: stage 1 has not begun and the week is not a Festival. */
export const joiningOpenV2 = (status: RaidStatus, festival: boolean): boolean =>
  status === 'open' && !festival;

/**
 * The current v2 week as the caller sees it: the v1 shape (so the shared parts of the screen keep working) with `rules: 2` and the v2
 * part. A week whose boss is the track's: its rank is the slot.
 */
export function buildRaidViewV2(
  raid: Raid,
  sql: SqlStorage,
  userId: string,
  tz: string,
  now: number,
  week: WeekRow,
): RaidView {
  const names = displayNames(sql);
  const slot = week.trackSlot ?? 1;
  const track = readTrack(sql);
  const { rows } = slotBossInfo(slot);
  const schedule = raid.schedule(week.weekId, tz);
  const pending = nextPendingEvent(week.status);
  const progression = readWeekProgression(sql, week.weekId);
  const festival = progression?.festival === true;

  const memberRows = sql
    .exec<{ user_id: string; party: number }>(
      'SELECT user_id, party FROM raid_party_members WHERE week_id = ? ORDER BY party, joined_at, rowid',
      week.weekId,
    )
    .toArray();
  const roster = memberRows.map((m) => ({
    displayName: names.get(m.user_id) ?? 'Unknown',
    you: m.user_id === userId,
    party: m.party,
  }));
  const sizes = new Map<number, number>();
  for (const m of memberRows) sizes.set(m.party, (sizes.get(m.party) ?? 0) + 1);
  const parties = [...sizes].map(([party, size]) => ({ party, size }));

  const myParty = partyOf(sql, week.weekId, userId);
  const joinOpen = joiningOpenV2(week.status, festival);
  const shownParty =
    myParty ??
    (joinOpen &&
    sql.exec('SELECT 1 FROM creatures WHERE user_id = ? LIMIT 1', userId).toArray().length > 0
      ? partyToJoin(sql, week.weekId).party
      : null);

  let partyView: RaidView['party'] = null;
  let team: NonNullable<RaidView['you']['team']> | null = null;
  let v2Party: Pick<
    RaidV2Part,
    | 'stagesPlayed'
    | 'nextStage'
    | 'cols'
    | 'players'
    | 'boss'
    | 'moveNames'
    | 'carry'
    | 'out'
    | 'creatures'
    | 'preview'
  > = {
    stagesPlayed: 0,
    nextStage: 1,
    cols: colsFor(1),
    players: 0,
    boss: null,
    moveNames: {},
    carry: null,
    out: [],
    creatures: [],
    preview: null,
  };
  let ability: { abilityId: string; chosen: boolean } | null = null;
  if (shownParty !== null) {
    const members = partyMembers(sql, week.weekId, shownParty);
    const stored: PartyCarry | null = readPartyCarry(sql, week.weekId, shownParty);
    const players = stored?.players ?? Math.max(1, members.length);
    const cols = colsFor(players);
    const length = rows * cols;
    const placements = partyPlacements(sql, week.weekId, shownParty);
    // One load for the board and its move preview: the creatures with their slotted talents and gear lines, a few statements however many.
    const creatureOf = loadV2Creatures(
      sql,
      placements.map((p) => p.creature_id),
    );
    const cells: RowSlotView[] = Array.from({ length }, (_, slotIndex) => ({
      slot: slotIndex,
      zone: zoneOfRow(gridPlace(slotIndex, rows).row, rows),
      creature: null,
    }));
    const mine: NonNullable<RaidView['you']['team']>['creatures'] = [];
    const board: RaidV2Part['creatures'] = [];
    for (const p of placements) {
      const c = creatureOf.get(p.creature_id);
      const cell = cells[p.slot];
      if (c === undefined || c.userId !== p.user_id || cell === undefined) continue;
      const species = speciesOf(c.species);
      const knack = knackOf(c);
      const isMine = p.user_id === userId;
      cell.creature = {
        ownerName: names.get(p.user_id) ?? 'Unknown',
        species: c.species,
        name: c.nickname ?? species.name,
        level: c.level,
        mine: isMine,
        ...(isMine ? { creatureId: c.id } : {}),
      };
      const place = gridPlace(p.slot, rows);
      board.push({
        creatureId: c.id,
        slot: p.slot,
        row: place.row,
        col: place.col,
        hp: stored?.carry.hp[c.id] ?? null,
        hpMax: null,
        knack: knack ?? null,
        knackName: knackNameOf(knack ?? null),
      });
      if (isMine) {
        mine.push({
          creatureId: c.id,
          species: c.species,
          name: c.nickname ?? species.name,
          level: c.level,
          slot: p.slot,
        });
      }
    }
    if (myParty !== null) team = { creatures: mine };
    const boss = weekendBoss(slot, players);
    const out = stored === null ? [] : stored.carry.out;
    const outRows =
      out.length === 0
        ? []
        : sql
            .exec<{
              id: string;
              user_id: string;
              species: string;
              nickname: string | null;
            }>(
              `SELECT id, user_id, species, nickname FROM creatures WHERE id IN (${out.map(() => '?').join(', ')})`,
              ...out,
            )
            .toArray();
    const stagesPlayed = stored?.carry.stage ?? 0;
    const pool = sql
      .exec<{ hp_max: number | null; hp_current: number | null }>(
        'SELECT hp_max, hp_current FROM raid_parties WHERE week_id = ? AND party = ?',
        week.weekId,
        shownParty,
      )
      .toArray()[0];
    const results = sql
      .exec<{ phase: ResultPhase; summary: string; created_at: number }>(
        'SELECT phase, summary, created_at FROM raid_results WHERE week_id = ? AND party = ?',
        week.weekId,
        shownParty,
      )
      .toArray()
      .sort((a, b) => RESULT_PHASES.indexOf(a.phase) - RESULT_PHASES.indexOf(b.phase))
      .map((r) =>
        stageResultView(
          sql,
          week.weekId,
          r.phase,
          JSON.parse(r.summary) as StoredSummary,
          r.created_at,
          userId,
          names,
        ),
      );
    partyView = {
      party: shownParty,
      rowLength: length,
      row: cells,
      guests: false,
      bossHp:
        pool === undefined || pool.hp_max === null || pool.hp_current === null
          ? stored === null
            ? { max: boss.hp, current: boss.hp }
            : null
          : { max: pool.hp_max, current: pool.hp_current },
      adaptation: null,
      results,
      readiness: null,
    };
    const killed = stored !== null && stored.carry.bossHp <= 0;
    v2Party = {
      stagesPlayed,
      nextStage: killed ? 4 : Math.min(4, stagesPlayed + 1),
      cols,
      players,
      boss,
      moveNames: moveNamesOf(boss),
      carry: stored?.carry ?? null,
      out: outRows.map((c) => ({
        creatureId: c.id,
        species: c.species,
        name: c.nickname ?? content.creatures.find((s) => s.id === c.species)?.name ?? c.species,
        owner: names.get(c.user_id) ?? 'Unknown',
        mine: c.user_id === userId,
      })),
      creatures: board,
      preview: null,
    };
    const shown = previewOf(boss, stored?.carry ?? null, placements, creatureOf, rows, cols);
    v2Party.preview = shown.preview;
    for (const entry of v2Party.creatures) entry.hpMax = shown.maxHp.get(entry.creatureId) ?? null;
    if (myParty !== null) {
      const index = members
        .filter((id) => placements.some((p) => p.user_id === id))
        .indexOf(userId);
      const picked = v2AbilityIds(sql, week.weekId, members);
      const mineIndex = members.indexOf(userId);
      const abilityId = picked[mineIndex];
      const chosen =
        abilityId !== undefined &&
        sql
          .exec(
            'SELECT 1 FROM raid_abilities WHERE week_id = ? AND user_id = ? AND ability_id = ?',
            week.weekId,
            userId,
            abilityId,
          )
          .toArray().length > 0;
      ability = index < 0 || abilityId === undefined ? null : { abilityId, chosen };
    }
  }
  const autofire = loadAutofire(sql, week.weekId);
  const defaultBoss = v2Party.boss ?? weekendBoss(slot, 1);
  const failed = track?.slot === slot ? track.failedWeekends : 0;

  return {
    rules: 2,
    weekId: week.weekId,
    status: week.status,
    timezone: tz,
    boss: {
      id: defaultBoss.id,
      name: defaultBoss.name,
      element: defaultBoss.element,
      turnOrder: '',
      gimmicks: [],
      finaleRounds: defaultBoss.rounds,
      retreat: null,
    },
    rank: slot,
    effectiveRank: slot,
    festival,
    festivalCreature: null,
    season:
      progression === null
        ? null
        : {
            index: progression.seasonIndex,
            week: seasonOf(weekIndex(week.weekId)).weekInSeason + 1,
          },
    bestRank: track === null ? null : Math.max(0, track.slot - 1) || null,
    schedule,
    next: pending === undefined ? null : { event: pending, at: schedule[pending] },
    serverNow: now,
    roster,
    parties,
    you: {
      inRoster: myParty !== null,
      party: myParty,
      canEdit:
        shownParty !== null &&
        week.status !== 'finale' &&
        !festival &&
        (myParty !== null || joinOpen),
      ability,
      abilities:
        ability === null
          ? []
          : [
              {
                abilityId: ability.abilityId,
                creatureId: null,
                species: null,
                unlocked: true,
                unlockLevel: 1,
                autoFire: autofire.isOn(userId, BASIC_TARGET),
              },
            ],
      reveal: latestReveal(sql, userId, addWeeks(week.weekId, -1)),
      team,
    },
    party: partyView,
    v2: {
      slot,
      bestShareBp: track?.slot === slot ? track.bestShareBp : 0,
      failedWeekends: failed,
      determinationBp: determinationBpFor(slot, failed),
      stagesPlayed: v2Party.stagesPlayed,
      nextStage: v2Party.nextStage,
      joiningOpen: joinOpen,
      rows,
      cols: v2Party.cols,
      players: v2Party.players,
      boss: v2Party.boss,
      moveNames: v2Party.moveNames,
      card: bossCardView(defaultBoss, v2Party.carry),
      track: trackView(slot),
      preview: v2Party.preview,
      carry: v2Party.carry,
      out: v2Party.out,
      creatures: v2Party.creatures,
      swaps: swapsView(sql, week.weekId, userId, names),
    },
  };
}

// --- A stored stage: the replay and the after-action stats ---

/** The creatures of a stored stage, for a client that folds its events into board states. */
export interface FighterView {
  /** The creature's id: what the board events call it. */
  key: string;
  name: string;
  species: string;
  element: string;
  role: string;
  level: number | null;
  /** The opaque owner key (`m1`, ...; see `names.players`). */
  owner: string;
  row: number;
  col: number;
  knack: string | null;
  talents: string[];
  maxHp: number;
  /** Its HP when the stage began (a creature that fought before carries its HP). */
  startHp: number;
}

export interface ReplayViewV2 {
  rules: 2;
  weekId: string;
  party: number;
  phase: ResultPhase;
  stage: number;
  seed: string;
  at: number;
  boss: BossDef;
  moveNames: Record<string, string>;
  rounds: number;
  cleared: boolean;
  /** The boss fell in this stage. */
  kill: boolean;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  /** The caller's opaque owner key in this stage, or null if they were not in it. */
  you: string | null;
  fighters: FighterView[];
  /** The finale's live inputs (stage 3), as they acted. */
  actions: StageInputV2['actions'] | null;
  events: FightEvent[];
  names: { players: Record<string, string>; creatures: Record<string, string> };
  /** The carry after the stage: the boss's HP, each creature's HP and who is out. */
  carry: StageCarry;
}

/** The fighters of a v2 input as a view. `before` is the carry the stage started from. */
export function fighterViews(
  input: StageInputV2,
  before: Pick<StageCarry, 'hp'> | null,
): FighterView[] {
  return input.fighters.map((f) => {
    const key = f.key ?? f.uid;
    return {
      key,
      name: f.name,
      species: f.formId,
      element: f.element,
      role: f.role,
      level: null,
      owner: f.owner,
      row: f.row,
      col: f.col,
      knack: f.knack ?? null,
      talents: [...f.talents],
      maxHp: f.maxHp,
      startHp: before?.hp[key] ?? f.maxHp,
    };
  });
}

const PRIOR_PHASE: Record<ResultPhase, ResultPhase | null> = {
  stage1: null,
  stage2: 'stage1',
  finale: 'stage2',
};

/** The carry a stage started from: the carry stored with the stage before it (null for stage 1). */
function carryBefore(
  sql: SqlStorage,
  weekId: string,
  party: number,
  phase: ResultPhase,
): StageCarry | null {
  const prior = PRIOR_PHASE[phase];
  if (prior === null) return null;
  const row = sql
    .exec<{ result: string }>(
      'SELECT result FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
      weekId,
      party,
      prior,
    )
    .toArray()[0];
  if (row === undefined || row.result === '') return null;
  return (JSON.parse(row.result) as StoredStageResult).carry;
}

type StoredRow = {
  seed: string;
  input: string;
  result: string;
  summary: string;
  created_at: number;
};

/** The stored events of a resolved v2 stage with the creatures beside them. Null if it has not resolved (or its details were emptied). */
export function buildReplayViewV2(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  party: number,
  phase: ResultPhase,
): ReplayViewV2 | null {
  if (!isWeekId(weekId)) return null;
  const row = sql
    .exec<StoredRow>(
      'SELECT seed, input, result, summary, created_at FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
      weekId,
      party,
      phase,
    )
    .toArray()[0];
  if (row === undefined || row.input === '') return null;
  const input = JSON.parse(row.input) as StageInputV2;
  const result = JSON.parse(row.result) as StoredStageResult;
  const summary = JSON.parse(row.summary) as StoredSummary;
  const players = displayNames(sql);
  const playerNames: Record<string, string> = {};
  for (const m of summary.members) playerNames[m.alias] = players.get(m.userId) ?? 'Unknown';
  const fighters = fighterViews(input, carryBefore(sql, weekId, party, phase));
  return {
    rules: 2,
    weekId,
    party,
    phase,
    stage: result.stage,
    seed: row.seed,
    at: row.created_at,
    boss: input.boss,
    moveNames: moveNamesOf(input.boss),
    rounds: result.rounds,
    cleared: summary.cleared,
    kill: result.won,
    bossHpMax: summary.bossHpMax,
    bossHpStart: summary.bossHpStart,
    bossHpEnd: summary.bossHpEnd,
    you: summary.members.find((m) => m.userId === userId)?.alias ?? null,
    fighters,
    actions: input.actions ?? null,
    events: result.events,
    names: {
      players: playerNames,
      creatures: Object.fromEntries(fighters.map((f) => [f.key, f.name])),
    },
    carry: result.carry,
  };
}

/** The after-action stats of a v2 stage: lean, from the stored result. */
export interface AfterActionStatsV2 {
  rules: 2;
  phase: ResultPhase;
  stage: number;
  slot: number;
  cleared: boolean;
  kill: boolean;
  rounds: number;
  boss: { id: string; name: string; hpMax: number; hpStart: number; hpEnd: number };
  players: { displayName: string; you: boolean; damage: number; knockouts: number }[];
  creatures: {
    name: string;
    species: string;
    owner: string | null;
    you: boolean;
    damage: number;
    hp: number;
    maxHp: number;
    out: boolean;
  }[];
  reactions: { total: number; byMark: Record<string, number> };
  knockouts: number;
  blocked: number;
  dodges: number;
  intercepts: number;
  healed: number;
}

export function buildStatsV2(
  phase: ResultPhase,
  input: StageInputV2,
  result: StoredStageResult,
  summary: StoredSummary,
  userId: string,
  names: ReadonlyMap<string, string>,
): AfterActionStatsV2 {
  const userOfAlias = new Map(summary.members.map((m) => [m.alias, m.userId]));
  const nameOf = (id: string | undefined): string =>
    id === undefined ? 'Unknown' : (names.get(id) ?? 'Unknown');
  const specs = new Map(input.fighters.map((f) => [f.key ?? f.uid, f]));
  const outNow = new Set(result.carry.out);
  const creatures = result.fighters.map((f) => {
    const spec = specs.get(f.key);
    const ownerId = userOfAlias.get(f.owner);
    return {
      name: spec?.name ?? 'Creature',
      species: spec?.formId ?? 'unknown',
      owner: ownerId === undefined ? null : nameOf(ownerId),
      you: ownerId === userId,
      damage: f.damageDealt,
      hp: f.hp,
      maxHp: f.maxHp,
      out: outNow.has(f.key),
    };
  });
  const knockedBy = new Map<string, number>();
  for (const c of creatures) {
    if (c.out && c.owner !== null) knockedBy.set(c.owner, (knockedBy.get(c.owner) ?? 0) + 1);
  }
  return {
    rules: 2,
    phase,
    stage: result.stage,
    slot: summary.v2?.slot ?? 0,
    cleared: summary.cleared,
    kill: result.won,
    rounds: result.rounds,
    boss: {
      id: input.boss.id,
      name: input.boss.name,
      hpMax: summary.bossHpMax,
      hpStart: summary.bossHpStart,
      hpEnd: summary.bossHpEnd,
    },
    players: summary.contributors.map((c) => ({
      displayName: nameOf(c.userId),
      you: c.userId === userId,
      damage: c.damage,
      knockouts: knockedBy.get(nameOf(c.userId)) ?? 0,
    })),
    creatures,
    reactions: { total: result.reactions, byMark: result.reactionsByMark },
    knockouts: result.knockouts,
    blocked: result.blocked,
    dodges: result.dodges,
    intercepts: result.intercepts,
    healed: result.healed,
  };
}

// --- The live finale ---

export type LiveStatusV2 = 'none' | 'lobby' | 'live' | 'done';

export interface LiveAbilityViewV2 {
  key: string;
  alias: string;
  abilityId: string;
  kind: FinaleActionKind;
  mode: 'default' | 'held' | 'fired';
  autoFire: boolean;
  /** It has acted by the round the clock is in. */
  fired: boolean;
  firedAtRound: number | null;
  /** Mode 'fired' and not yet acted: the round it acts in. */
  fireAtRound: number | null;
  defaultRound: number;
  /** A Shield Wall's row. */
  row: number | null;
}

export interface LiveSnapshotV2 {
  rules: 2;
  status: LiveStatusV2;
  practice: false;
  week: string;
  party: number | null;
  you: string | null;
  startsAt: number | null;
  /** The fixed length of a round. */
  roundMs: number;
  rounds: number;
  round: number;
  roundStarts: number[];
  nextRoundAt: number | null;
  serverNow: number;
  boss: {
    id: string;
    name: string;
    element: string;
    hpMax: number | null;
    hpStart: number | null;
  } | null;
  bossDef: BossDef | null;
  moveNames: Record<string, string>;
  fighters: FighterView[];
  names: { players: Record<string, string>; creatures: Record<string, string> } | null;
  abilities: LiveAbilityViewV2[];
  /** Every event of rounds 1..round. */
  events: FightEvent[];
  bossHp: number | null;
  /** The carry the finale started from. */
  carry: StageCarry | null;
  watching: string[];
  loot: {
    cleared: boolean;
    essence: number;
    rankChange: RankChangeView | null;
    festivalGrant: FestivalGrantView | null;
  } | null;
}

export interface LiveContextV2 {
  sql: SqlStorage;
  now: number;
  weekId: string;
  party: number | null;
  userId: string;
  names: ReadonlyMap<string, string>;
  watching: string[];
}

/** The snapshot of a week with no fight to show: nothing soon, or the lobby. */
export function emptySnapshotV2(
  ctx: LiveContextV2,
  status: 'none' | 'lobby',
  startsAt: number | null,
): LiveSnapshotV2 {
  return {
    rules: 2,
    status,
    practice: false,
    week: ctx.weekId,
    party: ctx.party,
    you: null,
    startsAt,
    roundMs: RULES.raid.v2.liveRoundMs,
    rounds: 8,
    round: 0,
    roundStarts: [],
    nextRoundAt: status === 'lobby' ? startsAt : null,
    serverNow: ctx.now,
    boss: null,
    bossDef: null,
    moveNames: {},
    fighters: [],
    names: null,
    abilities: [],
    events: [],
    bossHp: null,
    carry: null,
    watching: status === 'lobby' ? ctx.watching : [],
    loot: null,
  };
}

/** The snapshot of a stored v2 fight. `resolved` is true once its result is stored. */
export function liveSnapshotV2(
  ctx: LiveContextV2,
  row: LiveRowV2,
  resolved: boolean,
): LiveSnapshotV2 {
  const state = evaluateV2(ctx.sql, row, ctx.now);
  const done = resolved;
  const carry = readPartyCarry(ctx.sql, row.weekId, row.party)?.carry ?? null;
  // The stored carry is the finale's own once it has settled: the carry before it is the previous stage's stored carry.
  const before = done ? carryBefore(ctx.sql, row.weekId, row.party, 'finale') : carry;
  const me = row.members.find((m) => m.userId === ctx.userId);
  const playerNames: Record<string, string> = {};
  for (const m of row.members) playerNames[m.alias] = ctx.names.get(m.userId) ?? 'Unknown';
  const fighters = fighterViews(row.input, before);
  const round = done ? Math.min(state.clockRound, row.rounds) : state.clockRound;
  let bossHp: number = before?.bossHp ?? row.input.boss.hp;
  for (const e of state.events) if (e.board?.type === 'end') bossHp = e.board.bossHp;
  const abilities: LiveAbilityViewV2[] = row.abilities.map((a) => {
    const kind =
      a.abilityId === 'shield-wall' ? 'shieldWall' : a.abilityId === 'purge' ? 'purge' : 'rally';
    const actsAt =
      a.mode === 'fired' && a.fireAtRound !== null
        ? a.fireAtRound
        : a.mode === 'held'
          ? row.rounds
          : defaultRoundV2(a.abilityId);
    const acted = actsAt <= state.clockRound;
    return {
      key: a.key,
      alias: a.alias,
      abilityId: a.abilityId,
      kind,
      mode: a.mode,
      autoFire: a.mode !== 'held',
      fired: acted,
      firedAtRound: acted ? actsAt : null,
      fireAtRound: a.mode === 'fired' && !acted ? a.fireAtRound : null,
      defaultRound: defaultRoundV2(a.abilityId),
      row: kind === 'shieldWall' ? (a.params?.row ?? DEFAULT_WALL_ROW) : null,
    };
  });
  let loot: LiveSnapshotV2['loot'] = null;
  if (done && me !== undefined) {
    const stored = ctx.sql
      .exec<{ summary: string }>(
        "SELECT summary FROM raid_results WHERE week_id = ? AND party = ? AND phase = 'finale'",
        row.weekId,
        row.party,
      )
      .toArray()[0];
    if (stored !== undefined) {
      const summary = JSON.parse(stored.summary) as StoredSummary;
      loot = {
        cleared: summary.cleared,
        essence: totalEssenceOf(ctx.sql, ctx.userId, row.weekId, summary),
        rankChange: rankChangeOf(ctx.sql, row.weekId),
        festivalGrant: null,
      };
    }
  }
  return {
    rules: 2,
    status: done ? 'done' : 'live',
    practice: false,
    week: row.weekId,
    party: row.party,
    you: me?.alias ?? null,
    startsAt: row.startedAt,
    roundMs: row.roundMs,
    rounds: row.rounds,
    round,
    roundStarts: state.roundStarts.slice(0, round),
    nextRoundAt: done ? null : state.nextRoundAt,
    serverNow: ctx.now,
    boss: {
      id: row.input.boss.id,
      name: row.input.boss.name,
      element: row.input.boss.element,
      hpMax: row.input.boss.hp,
      hpStart: before?.bossHp ?? row.input.boss.hp,
    },
    bossDef: row.input.boss,
    moveNames: moveNamesOf(row.input.boss),
    fighters,
    names: {
      players: playerNames,
      creatures: Object.fromEntries(fighters.map((f) => [f.key, f.name])),
    },
    abilities,
    events: state.events,
    bossHp,
    carry: before,
    watching: ctx.watching,
    loot,
  };
}
