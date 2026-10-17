/**
 * The daily dungeon's chain of fights (docs/design/daily-dungeon.md). It sits on top of
 * `simulateFight` and adds nothing to it: each room is an ordinary fight against a foe built as a
 * boss, the team's HP is carried from room to room (`FightSlot.hp`, `FightResult.hpEnd`), and a room
 * modifier is a set of plain number changes to the room's fight input (stats, foe numbers, the crit
 * luck, a gimmick). Pure: no I/O, and all randomness comes from the run's seed through seeded
 * streams, one per room, so a stored run replays exactly.
 *
 * Every room goes left to right, then the foe (`RULES.dungeon.turnOrder`): the fight's boss gets that
 * order here, whatever a foe's content says, and no modifier can change it.
 *
 * The team stands in ONE ROW of three, left to right (`team[i]` is position i). The engine's row
 * rules are used as they are: a row of three splits into one slot per zone, so the left creature is
 * in the Front zone, the middle one in Middle and the right one in Back. The foe goes for the left
 * creature first (the plain attack goes to the front-most creature standing), a zone gimmick hits
 * the creature at that position and "both ends" are the left and right creatures. A Guard covers its
 * neighbours (`guardReach: 'adjacent'`), since a zone of one creature has nobody else in it.
 */
import {
  RULES,
  content,
  createSeededRng,
  effectiveStats,
  isLandmark,
  type BossDef,
  type ContentPack,
  type DungeonFoeDef,
  type LuckConfig,
  type RoomEffect,
  type RoomModifierDef,
  type Stats,
} from '@creatures/game';
import { simulateFight, type FightOptions } from './fight';
import type {
  AbilityChoice,
  EnrageRules,
  FightInput,
  FightResult,
  FightRules,
  FightSlot,
} from './types';

/** One room of a run, with its foe and modifier stored in full so a replay never reads content again. */
export interface DungeonRoomSpec {
  index: number;
  foe: DungeonFoeDef;
  modifier: RoomModifierDef;
  /** The foe's HP and Attack at the run's depth, before the modifier. */
  hp: number;
  atk: number;
}

/** Everything a run needs besides its seed. Plain JSON, so it can be stored and replayed. */
export interface DungeonRunInput {
  /** The row, left to right (position 0 is the left creature). Stats already include the worn gear. */
  team: FightSlot[];
  /** The engine's player key of the team's owner (every slot has it as `ownerId`). */
  player: string;
  rooms: DungeonRoomSpec[];
  /** The pre-run ability choices; they fire once in every room. */
  abilities: AbilityChoice[];
  /** The luck rules the run was fought with (`RULES.combat.luck` when it was built). */
  luck: LuckConfig;
  /**
   * The combat rules the run was fought with (`liveFightRules()` when it was built), copied into
   * every room's fight. Absent: the rules before attack patterns (no cover, no element effects, no
   * hit cap), so a stored older run replays as it was fought.
   */
  rules?: FightRules;
  /**
   * Enrage for the boss room (`dungeonBossEnrage()` when the run was built): when the boss room's
   * rounds run out with both sides standing, up to `rounds` more rounds are played. It applies to
   * the boss room only (a room whose foe is of kind `boss`); normal rooms keep the rule that running
   * out of rounds ends the run. Absent: none, so a stored older run replays as it was fought.
   */
  enrage?: EnrageRules;
  /**
   * The depth the run was fought at. At a landmark depth (`isLandmark`) the boss room's foe gains
   * its `signature` gimmick. Absent: no landmark, so a stored older run replays as it was fought.
   */
  depth?: number;
  /**
   * Between-room rest (a Scarf line): by creature id, the share of its max HP (basis points) it
   * recovers before each room after the first, if it is still standing. Absent: none, so a stored
   * older run replays as it was fought.
   */
  rest?: Readonly<Record<string, number>>;
  /**
   * How many plain attacks every foe makes each round, 2 or 3 (the day's Stormfront). Absent: one, so a
   * stored older run replays as it was fought.
   */
  bossAttacks?: number;
}

export interface DungeonRoomResult {
  index: number;
  /** Every creature's HP when the room started, and at most (by creature id). */
  hpStart: Record<string, number>;
  hpMax: Record<string, number>;
  /** The foe fell before the rounds ran out. */
  cleared: boolean;
  result: FightResult;
}

export interface DungeonRunResult {
  /** The rooms that were played: all of them, or up to and including the one that was lost. */
  rooms: DungeonRoomResult[];
  roomsCleared: number;
  /** Every room was cleared. */
  cleared: boolean;
  /** The team's HP at the end (by creature id). */
  hpEnd: Record<string, number>;
}

/** The seed of one room's fight: derived from the run's seed and the room, so rooms never share dice. */
export function roomSeed(seed: string, index: number): string {
  return `${seed}:room:${String(index)}`;
}

function scale(value: number, bp: number): number {
  return Math.max(1, Math.floor((value * (10_000 + bp)) / 10_000));
}

function statsOf(slot: FightSlot, pack: ContentPack): Stats {
  if (slot.stats !== undefined) return slot.stats;
  const species = pack.creatures.find((c) => c.id === slot.speciesId);
  if (species === undefined) throw new RangeError(`unknown species "${slot.speciesId}"`);
  return effectiveStats(species, slot.level, slot.fusionCount);
}

function matches(effect: Extract<RoomEffect, { op: 'team_stat' }>, slot: FightSlot): boolean {
  return (
    (effect.element === undefined || effect.element === slot.element) &&
    (effect.role === undefined || effect.role === slot.role)
  );
}

/**
 * The fight input of one room. `hp` is the team's HP carried from the room before (absent for the
 * first room: everyone starts at full HP). The modifier's effects are applied in order.
 */
export function buildRoomInput(
  run: DungeonRunInput,
  room: DungeonRoomSpec,
  hp: Readonly<Record<string, number>> | null,
  pack: ContentPack = content,
): FightInput {
  const effects = room.modifier.effects;
  const row: FightSlot[] = run.team.map((slot) => {
    let stats = { ...statsOf(slot, pack) };
    for (const e of effects) {
      if (e.op === 'team_stat' && matches(e, slot))
        stats = { ...stats, [e.stat]: scale(stats[e.stat], e.bp) };
    }
    let carried = hp?.[slot.id];
    const rest = run.rest?.[slot.id] ?? 0;
    // A creature that stands recovers its rest share of max HP (never above max); a fallen one stays down.
    if (carried !== undefined && carried > 0 && rest > 0) {
      carried = Math.min(stats.hp, carried + Math.floor((stats.hp * rest) / 10_000));
    }
    return { ...slot, stats, ...(carried === undefined ? {} : { hp: carried }) };
  });

  let foeHp = room.hp;
  let foeAtk = room.atk;
  let luck = run.luck;
  const gimmicks = [...room.foe.gimmicks];
  // The boss room is where the harder rules live: enrage, and at a landmark depth the foe's
  // charged signature (after its own moves, before any modifier's gimmick).
  const bossRoom = room.foe.kind === 'boss';
  const signature = room.foe.signature;
  if (
    bossRoom &&
    signature !== undefined &&
    run.depth !== undefined &&
    isLandmark(run.depth) &&
    !gimmicks.some((g) => g.id === signature.id)
  ) {
    gimmicks.push(signature);
  }
  for (const e of effects) {
    switch (e.op) {
      case 'foe_stat':
        if (e.stat === 'hp') foeHp = scale(foeHp, e.bp);
        else foeAtk = scale(foeAtk, e.bp);
        break;
      case 'team_crit':
        luck = {
          ...luck,
          critChanceBp: luck.critChanceBp + e.chanceBp,
          critBp: luck.critBp + e.damageBp,
        };
        break;
      case 'foe_gimmick':
        if (!gimmicks.some((g) => g.id === e.gimmick.id)) gimmicks.push(e.gimmick);
        break;
      case 'team_stat':
        break; // applied to the row above
    }
  }

  const adaptation = pack.adaptations[0];
  if (adaptation === undefined) throw new Error('content has no adaptation rule');
  // The engine fights a BossDef; the adaptation id is only read for a Phase 1 suggestion, which a
  // dungeon room (a "finale" with no adaptation in force) never makes.
  const boss: BossDef = {
    id: room.foe.id,
    name: room.foe.name,
    element: room.foe.element,
    baseHp: room.foe.baseHp,
    baseAtk: room.foe.baseAtk,
    turnOrder: RULES.dungeon.turnOrder,
    gimmicks,
    adaptation: adaptation.id,
    lootTable: 'dungeon',
    finaleRounds: room.foe.rounds,
    ...(room.foe.crit === undefined ? {} : { crit: room.foe.crit }),
  };
  return {
    boss,
    bossAtk: foeAtk,
    ...(run.bossAttacks !== undefined && run.bossAttacks > 1
      ? { bossAttacks: run.bossAttacks }
      : {}),
    phase: 'finale',
    bossHpPool: { max: foeHp, current: foeHp },
    adaptation: null,
    row,
    players: [run.player],
    finaleAbilities: run.abilities,
    luck,
    guardReach: 'adjacent',
    ...(run.rules === undefined ? {} : { rules: run.rules }),
    ...(bossRoom && run.enrage !== undefined ? { enrage: run.enrage } : {}),
  };
}

/**
 * Plays a run: the rooms in order, each against its foe, with the team's HP carried from room to
 * room and knocked-out creatures staying out. A room is cleared when its foe falls; the run stops at
 * the first room that is not cleared, or when nobody is left standing. Deterministic for a given
 * input and seed.
 */
export function simulateDungeon(
  run: DungeonRunInput,
  seed: string,
  options: FightOptions = {},
): DungeonRunResult {
  const pack = options.pack ?? content;
  const rooms: DungeonRoomResult[] = [];
  let hp: Record<string, number> | null = null;
  let roomsCleared = 0;
  for (const room of run.rooms) {
    if (hp !== null && !Object.values(hp).some((h) => h > 0)) break;
    const input = buildRoomInput(run, room, hp, pack);
    const result = simulateFight(input, createSeededRng(roomSeed(seed, room.index)), options);
    const cleared = result.bossHpEnd === 0;
    rooms.push({
      index: room.index,
      hpStart: result.hpStart,
      hpMax: result.hpMax,
      cleared,
      result,
    });
    hp = result.hpEnd;
    if (!cleared) break;
    roomsCleared += 1;
  }
  return {
    rooms,
    roomsCleared,
    cleared: roomsCleared === run.rooms.length && run.rooms.length > 0,
    hpEnd: hp ?? {},
  };
}
