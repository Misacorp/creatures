/**
 * Resolving one phase for one party. Server-authoritative and atomic: the row, the seed, the fight,
 * the stored result, the Essence payout and (after the finale) the jackpot rolls all happen inside
 * one `transactionSync`. Resolving the same (week, party, phase) again changes nothing: the stored
 * result row is the done marker, and every payout also has a ledger idempotency key.
 *
 * The work is split in two so the live finale can share it: `buildPhaseInput` (the row, the pool and
 * the adaptation; phases resolve instantly and the live finale freezes the result at its start) and
 * `settleParty` (everything that stores and pays a finished fight; phases call it right away, the
 * live finale at its end).
 */
import {
  RULES,
  abilitiesFor,
  basicAbilities,
  bossAtRank,
  bossAttacksAtRank,
  content,
  contributionWeights,
  createCryptoRng,
  createSeededRng,
  essenceForStage,
  jackpotEssenceFor,
  luckAtRank,
  mergeMods,
  raidExperience,
  rollJackpot,
  weatherBossAttacks,
  weatherLuck,
  weatherSheet,
  weatherSky,
  dayCreatureXpParts,
  type BossDef,
  type Rng,
} from '@creatures/game';
import {
  skyFightFields,
  type AbilityChoice,
  compactRow,
  sparseBoard,
  fillWithGuests,
  liveEffects,
  liveFightRules,
  makeSlot,
  phaseFloorHp,
  placeSlots,
  raidEnrage,
  resolveGuests,
  scaleBoss,
  simulateFight,
  type ActiveAdaptation,
  type FightInput,
  type FightResult,
  type FightSlot,
} from '@creatures/engine';
import type { Analytics } from './analytics';
import { awardExperience } from './creature-exp';
import { bumpStat } from './expedition-store';
import { grantFestivalGear, grantRaidFinale, grantRaidPhase, type GrantDeps } from './gear-grants';
import { credit, type LedgerStorage } from './ledger';
import { loadAutofire, targetOf } from './raid-autofire';
import { grantFestivalCreature } from './raid-festival';
import { fightRank, payoutWeek, readWeekProgression, updateLadder } from './raid-ladder';
import { partyMembers, partyRowLength } from './raid-roster';
import { queuePhasePost } from './raid-posts';
import type { RaidPhase } from './raid-schedule';
import {
  partyPlacements,
  teamOfPlacements,
  type PlacementRow,
  type TeamCreature,
} from './raid-teams';
import { recordServerFirst } from './server-firsts';
import { stageWeather } from './weather';

export interface ResolveDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness: the fight seed and the jackpot rolls. Crypto in production. */
  rng: Rng;
  /** Live randomness for the quirk of a Festival creature. Defaults to crypto. */
  quirkRng?: Rng;
  /** Live randomness for the talent of a Festival creature. Defaults to crypto. */
  talentRng?: Rng;
  /** Live randomness for gear drops (a cleared phase, a won finale, a Festival piece). Defaults to crypto. */
  gearRng?: Rng;
  /** The analytics event log. Optional: without it nothing is logged. */
  analytics?: Analytics;
}

/** What the API shows about a resolved phase. Contains user ids: map to names before sending. */
export interface StoredSummary {
  cleared: boolean;
  /**
   * The boss reached the phase floor and retreated (Phases 1 and 2). Absent in a result stored
   * before phase floors: read it with `summary.retreated === true`.
   */
  retreated?: boolean;
  /** The finale went into enrage rounds. Absent before enrage: read it with `=== true`. */
  enraged?: boolean;
  rounds: number;
  bossHpMax: number;
  bossHpStart: number;
  bossHpEnd: number;
  reactions: number;
  /** Total damage dealt to the boss by the party's players (guests excluded). */
  damage: number;
  /** Everyone's contribution, highest first. */
  contributors: { userId: string; damage: number; contribution: number }[];
  /** Essence paid per user id for this phase (empty if the stage was not cleared). */
  essence: Record<string, number>;
  /** Finale only: users who hit the jackpot. */
  jackpot: string[];
  /** The engine's player ids in the stored input, and who they were. */
  members: { alias: string; userId: string }[];
}

type PartyRow = {
  hp_max: number | null;
  hp_current: number | null;
  boss_atk: number | null;
  adaptation_rule: string | null;
  adaptation_target: string | null;
};

/**
 * Whether a stored fight's boss retreated and whether it enraged. A result stored before phase
 * floors and enrage has neither field: both read as false.
 */
export function outcomeFlags(result: FightResult): { retreated: boolean; enraged: boolean } {
  const stored = result as Partial<Pick<FightResult, 'retreated' | 'enraged'>>;
  return { retreated: stored.retreated === true, enraged: stored.enraged === true };
}

/**
 * The Guard numbers of the rules a stored fight was played with, for the client (extra HP and armor
 * in basis points). A fight stored without `rules` gives null: the client then uses the content's old
 * Guard bonus.
 */
export function guardRulesOf(
  input: FightInput,
): { guardHpBp: number; guardArmorBp: number } | null {
  const rules = input.rules;
  return rules === undefined
    ? null
    : { guardHpBp: rules.guardHpBp, guardArmorBp: rules.guardArmorBp };
}

/**
 * The board positions a stored fight was played with, as a spread for a view: empty for a fight
 * stored before the input carried them (the client then uses the dense row).
 */
export function boardOf(input: FightInput): {
  board?: { length: number; slots: number[] };
} {
  return input.board === undefined
    ? {}
    : { board: { length: input.board.length, slots: [...input.board.slots] } };
}

/** 128 random bits as 32 lowercase hex characters. */
export function drawSeed(rng: Rng): string {
  let hex = '';
  for (let i = 0; i < 4; i++) hex += rng.nextU32().toString(16).padStart(8, '0');
  return hex;
}

/**
 * The week's boss as it fights at Boss Rank `rank` (the week's effective rank): only the moves whose
 * `fromRank` has been reached (`bossAtRank`). Every fight input and every view of the boss is built
 * from this, so a rank-gated move is in the fight, the forecast and the boss card together. A stored
 * fight keeps the boss it was fought with (`FightInput.boss`), so later content changes and rank
 * changes never reach it.
 */
export function bossFor(bossId: string, rank: number): BossDef {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error('week uses an unknown boss');
  return bossAtRank(boss, rank);
}

export const aliasFor = (index: number): string => `m${index + 1}`;

/**
 * A creature's slot for a fight. The slot carries the final stats (level, fusion and the worn items),
 * the final crit bonus and the modifier sheet of its gear, so the stored fight input is self-contained: a replay never looks
 * at gear again, and changing or dismantling the item later cannot change an old fight.
 */
export function slotFor(creature: TeamCreature, alias: string): FightSlot {
  const slot = makeSlot(creature.species, {
    id: creature.id,
    ownerId: alias,
    level: creature.level,
    fusionCount: creature.fusionCount,
    name: creature.nickname ?? creature.species.name,
  });
  return {
    ...slot,
    stats: creature.stats,
    ...(creature.crit === undefined ? {} : { crit: creature.crit }),
    ...(creature.mods === undefined ? {} : { mods: creature.mods }),
  };
}

/** The basic finale ability a member gets when they did not pick one: round-robin over the four. */
export function defaultAbilityId(index: number): string {
  const basics = basicAbilities();
  const def = basics[index % basics.length];
  if (def === undefined) throw new Error('content has no basic abilities');
  return def.id;
}

/**
 * Each member's finale ability: their pick for the week, or the round-robin default (by position in
 * the party). The returned choices carry no `fireAtRound`, so each fires at its default round.
 */
export function abilityIdsFor(
  sql: SqlStorage,
  weekId: string,
  memberIds: readonly string[],
): string[] {
  const picks = new Map(
    sql
      .exec<{
        user_id: string;
        ability_id: string;
      }>('SELECT user_id, ability_id FROM raid_abilities WHERE week_id = ?', weekId)
      .toArray()
      .map((r) => [r.user_id, r.ability_id]),
  );
  return memberIds.map((userId, i) => {
    const picked = picks.get(userId);
    return picked !== undefined && basicAbilities().some((a) => a.id === picked)
      ? picked
      : defaultAbilityId(i);
  });
}

/** The caller's finale ability for the view: their pick (`chosen`) or the round-robin default. */
export function abilityFor(
  sql: SqlStorage,
  weekId: string,
  memberIds: readonly string[],
  userId: string,
): { abilityId: string; chosen: boolean } | null {
  const index = memberIds.indexOf(userId);
  if (index < 0) return null;
  const abilityId = abilityIdsFor(sql, weekId, memberIds)[index] as string;
  const chosen =
    sql
      .exec(
        'SELECT 1 FROM raid_abilities WHERE week_id = ? AND user_id = ? AND ability_id = ?',
        weekId,
        userId,
        abilityId,
      )
      .toArray().length > 0;
  return { abilityId, chosen };
}

/** The engine key of a member's basic ability use. */
export const basicKey = (alias: string): string => `${alias}:basic`;

/**
 * The engine key of a creature ability use: `n` is the creature's index in the member's team (so
 * no raw creature id is in a key; the creature itself is `creatureId` on the choice).
 */
export const creatureKey = (alias: string, teamIndex: number): string => `${alias}:c${teamIndex}`;

/**
 * Everything one member brings to the finale, in order: their basic ability, then the ability of
 * each team creature at or above the unlock level (`abilitiesFor`), each carrying its creature.
 * `inRow` lists the creature ids that stand in the fighting row; a creature that does not is
 * skipped (the engine needs the creature to be there). No `fireAtRound`: each fires at its default.
 */
export function memberChoices(
  alias: string,
  basicAbilityId: string,
  team: readonly TeamCreature[],
  inRow: ReadonlySet<string>,
): AbilityChoice[] {
  const choices: AbilityChoice[] = [
    { playerId: alias, abilityId: basicAbilityId, key: basicKey(alias) },
  ];
  const sources = abilitiesFor(
    team.map((c) => ({ id: c.id, speciesId: c.species.id, level: c.level })),
    (c) => c.level,
  );
  for (const source of sources) {
    if (!inRow.has(source.creatureId)) continue;
    const teamIndex = team.findIndex((c) => c.id === source.creatureId);
    choices.push({
      playerId: alias,
      abilityId: source.abilityId,
      key: creatureKey(alias, teamIndex),
      creatureId: source.creatureId,
    });
  }
  return choices;
}

/**
 * The passive abilities of one member's creatures that stand in the row (Mire's `on_hit_taken` and
 * `round_start` signatures). They work in every fight; in Phases 1 and 2 they are the only part of a
 * creature ability that is on (the fireable ability is the finale's), so the input carries them as
 * `passives` rather than as finale choices.
 */
export function memberPassives(
  team: readonly TeamCreature[],
  inRow: ReadonlySet<string>,
): { creatureId: string; abilityId: string }[] {
  return abilitiesFor(
    team.map((c) => ({ id: c.id, speciesId: c.species.id, level: c.level })),
    (c) => c.level,
  )
    .filter(
      (a) =>
        inRow.has(a.creatureId) &&
        content.finaleAbilities
          .find((d) => d.id === a.abilityId)
          ?.effects.some((e) => e.op === 'on_hit_taken' || e.op === 'round_start') === true,
    )
    .map((a) => ({ creatureId: a.creatureId, abilityId: a.abilityId }));
}

/** A fight input built for one party, with who is in it (`aliases[i]` belongs to `memberIds[i]`). */
export interface BuiltPhase {
  memberIds: string[];
  aliases: string[];
  input: FightInput;
  /**
   * The keys of the finale abilities whose owners turned Auto fire off for this week (empty outside
   * the finale). The live start stores them as 'held'; an instant finale gives them the last round.
   */
  held: ReadonlySet<string>;
}

export interface BuildOptions {
  /**
   * A practice fight: full boss HP and no adaptation, whatever the week's carried pool is. The row
   * and everything else are the same as for a real fight.
   */
  practice?: boolean;
}

/** Where a board slot's creature came from: placed by its player, or a guest (never drawn). */
export type BoardOrigin = 'placed' | 'guest';

/** One slot of a party's board as the fight will have it. */
export interface BoardCell {
  slot: FightSlot | null;
  /** Null for an empty slot. */
  origin: BoardOrigin | null;
}

/** A party's board as the fight builds it: the one source of truth for the fight and the board view. */
export interface PartyBoard {
  /** The members who fight: they placed at least one creature that is still theirs. Their order is the alias order. */
  memberIds: string[];
  aliases: string[];
  /** Each fighting member's placed creatures, in `memberIds` order. */
  teams: TeamCreature[][];
  /** One cell per slot, empty slots and guests included. */
  cells: BoardCell[];
  /** The party's placement rows, at most three per player. */
  placements: PlacementRow[];
  /** The sparse row (empty slots are null): the placements, then guests. */
  row: (FightSlot | null)[];
}

/**
 * Builds a party's sparse board: exactly what the joined players placed (at most three each), then
 * guests when fewer than three players take part. Nothing is auto-placed and nobody's creatures are
 * picked for them: a joined player with no creature left on the board (they were released) does not
 * fight and is left out. `buildPhaseInput` makes the fight from it and the board view draws it, so the
 * two can never disagree. Reads only.
 */
export function buildPartyBoard(
  sql: SqlStorage,
  weekId: string,
  party: number,
  joinedIds: readonly string[],
): PartyBoard {
  // The party's placements are read once: every member's team comes from them.
  const placements = partyPlacements(sql, weekId, party);
  const allTeams = joinedIds.map((userId) => teamOfPlacements(sql, userId, placements));
  const memberIds = joinedIds.filter((_, i) => (allTeams[i] as TeamCreature[]).length > 0);
  const teams = allTeams.filter((team) => team.length > 0);
  const aliases = memberIds.map((_, i) => aliasFor(i));
  const slotById = new Map<string, FightSlot>();
  teams.forEach((team, i) => {
    for (const creature of team) slotById.set(creature.id, slotFor(creature, aliases[i] as string));
  });
  const length = partyRowLength(sql, weekId, party);
  const sparse: (FightSlot | null)[] = new Array<FightSlot | null>(length).fill(null);
  // At most three placements per player, whatever the table holds (a stale row once made a fourth).
  for (const placement of placements) {
    const slot = slotById.get(placement.creature_id);
    const owner = memberIds.indexOf(placement.user_id);
    // Only creatures that are still their owner's and fit the row stay placed.
    if (slot === undefined || owner < 0 || slot.ownerId !== aliases[owner]) continue;
    if (placement.slot < 0 || placement.slot >= length) continue;
    sparse[placement.slot] = slot;
  }
  let row = sparse;
  const levels = teams.flat().map((c) => c.level);
  if (memberIds.length < RULES.combat.guestsBelowPlayers && levels.length > 0) {
    const avgLevel = Math.max(1, Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length));
    row = fillWithGuests(sparse, resolveGuests(), avgLevel);
  }
  const cells = row.map((slot, i): BoardCell => {
    if (slot === null) return { slot, origin: null };
    return { slot, origin: sparse[i] !== null ? 'placed' : 'guest' };
  });
  return { memberIds, aliases, teams, cells, placements, row };
}

/**
 * Builds the fight input for one party and phase from the creatures' current stats: the row
 * (placements, guests), the boss (scaled at phase 1, then carried) and, for the
 * finale, each member's ability at its default round. Reads only; call it inside the transaction
 * that uses the result. Returns null if nobody in the party placed a creature.
 */
export function buildPhaseInput(
  sql: SqlStorage,
  week: { weekId: string; bossId: string },
  party: number,
  phase: RaidPhase,
  options: BuildOptions = {},
): BuiltPhase | null {
  const rank = fightRank(sql, week.weekId);
  const boss = bossFor(week.bossId, rank);

  // --- Build the row from the creatures' current stats ---
  // Only the players who placed creatures take part; a party where nobody did has no fight.
  const board = buildPartyBoard(sql, week.weekId, party, partyMembers(sql, week.weekId, party));
  const { aliases, teams, memberIds } = board;
  if (memberIds.length === 0) return null;
  const placed = board.row;
  // The weather of the day the stage is scheduled in (Boon and Omen): for every creature in the row, guests
  // included, as numbers on its sheet. The stored input keeps them, so a replay never reads the weather.
  const day = stageWeather(sql, week.weekId, phase);
  // Each creature's board slot: the fight's rows, lanes and neighbours are the board's (gaps included).
  const fightBoard = sparseBoard(placed);
  // Position lines and set gifts depend on where a creature stands: fold the gear of the row again with
  // each creature's place (Front, Middle and Back are its rows; an empty board slot breaks "beside", as
  // in the fight), before the weather is added.
  const kits = new Map(teams.flat().map((c) => [c.id, c.kit]));
  const row = placeSlots(compactRow(placed), kits, 'zones', fightBoard).map((slot): FightSlot => {
    const mods = mergeMods(slot.mods, weatherSheet(day, slot));
    return mods === undefined ? slot : { ...slot, mods };
  });

  // --- The boss: scaled once at phase 1, then carried ---
  const partyRow = sql
    .exec<PartyRow>(
      `SELECT hp_max, hp_current, boss_atk, adaptation_rule, adaptation_target
       FROM raid_parties WHERE week_id = ? AND party = ?`,
      week.weekId,
      party,
    )
    .one();
  let hpMax = partyRow.hp_max;
  let hpCurrent = partyRow.hp_current;
  let bossAtk = partyRow.boss_atk;
  if (hpMax === null || hpCurrent === null || bossAtk === null) {
    // Scaled once, from the head count and the week's stored rank (a Festival's eased rank). A week
    // from before the ladder has no stored rank and fights at rank 1, as it always did.
    const scaled = scaleBoss(boss, memberIds.length, rank);
    hpMax = scaled.maxHp;
    hpCurrent = scaled.maxHp;
    bossAtk = scaled.atk;
  }
  const practice = options.practice === true;
  if (practice) hpCurrent = hpMax;
  const adaptation: ActiveAdaptation | null =
    !practice &&
    phase !== 'phase1' &&
    partyRow.adaptation_rule !== null &&
    partyRow.adaptation_target !== null
      ? { rule: partyRow.adaptation_rule, target: partyRow.adaptation_target }
      : null;

  const rowIds = new Set(row.map((s) => s.id));
  const abilityIds = phase === 'finale' ? abilityIdsFor(sql, week.weekId, memberIds) : [];
  // The floor of Phases 1 and 2 (the boss retreats there); the finale has none. A pool already below
  // the floor (a week whose Phase 1 ran under the old rules) floors where it stands.
  const floor = phaseFloorHp(hpMax, phase);
  const enrage = raidEnrage(phase);
  const input: FightInput = {
    boss,
    bossAtk,
    // How often the boss makes its plain attack at this rank; absent (one) keeps old inputs as they were.
    ...(weatherBossAttacks(day, bossAttacksAtRank(rank)) > 1
      ? { bossAttacks: weatherBossAttacks(day, bossAttacksAtRank(rank)) }
      : {}),
    // Kind Rain, Morning Haze and Bramble Season: stored in the input like the rest of the day.
    ...skyFightFields(weatherSky(day), row, fightBoard),
    phase,
    bossHpPool: { max: hpMax, current: hpCurrent },
    adaptation,
    row,
    // Each creature's board slot, so the fight's rows, lanes and neighbours are the board's (gaps included).
    board: fightBoard,
    players: aliases,
    // Each member's basic pick plus the abilities of their (frozen) team's unlocked creatures.
    finaleAbilities: abilityIds.flatMap((abilityId, i) =>
      memberChoices(aliases[i] as string, abilityId, teams[i] as TeamCreature[], rowIds),
    ),
    // Phases 1 and 2: the creatures' passive abilities only (the finale carries them as choices).
    ...(phase === 'finale'
      ? {}
      : (() => {
          const passives = teams.flatMap((team) => memberPassives(team, rowIds));
          return passives.length > 0 ? { passives } : {};
        })()),
    // Crits and the rest of the luck rules, stored with the input so a replay is exact.
    luck: { ...weatherLuck(day, luckAtRank(RULES.combat.luck, rank)) },
    // The combat rules, the phase floor and the finale's enrage, stored the same way.
    rules: liveFightRules(),
    // The effect dice, while status effects are switched on (`RULES.combat.effects`).
    ...liveEffects(),
    ...(floor > 0 ? { bossHpFloor: Math.min(floor, hpCurrent) } : {}),
    ...(enrage === undefined ? {} : { enrage }),
  };
  // Auto fire preferences: only the finale has abilities, and only what the owner turned off matters.
  const held = new Set<string>();
  if (phase === 'finale') {
    const prefs = loadAutofire(sql, week.weekId);
    for (const choice of input.finaleAbilities) {
      const userId = memberIds[aliases.indexOf(choice.playerId)];
      if (
        userId !== undefined &&
        !prefs.isOn(userId, targetOf({ creatureId: choice.creatureId ?? null }))
      ) {
        held.add(choice.key);
      }
    }
  }
  return { memberIds, aliases, input, held };
}

/**
 * Resolves one phase of one party. Returns true if it resolved now, false if it had already been
 * resolved (or the party has no members).
 */
export function resolveParty(
  deps: ResolveDeps,
  week: { weekId: string; bossId: string },
  party: number,
  phase: RaidPhase,
): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const done = sql
      .exec(
        'SELECT 1 FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
        week.weekId,
        party,
        phase,
      )
      .toArray();
    if (done.length > 0) return false;
    const built = buildPhaseInput(sql, week, party, phase);
    if (built === null) return false;
    // The seed is drawn now, from live randomness, and stored with the input: the fight can be
    // replayed later, but nobody could have known the seed before this moment.
    const seed = drawSeed(deps.rng);
    // An ability whose owner turned Auto fire off waits for the last round (nobody is here to press it).
    const input: FightInput =
      built.held.size === 0
        ? built.input
        : {
            ...built.input,
            finaleAbilities: built.input.finaleAbilities.map((a) =>
              built.held.has(a.key) ? { ...a, fireAtRound: built.input.boss.finaleRounds } : a,
            ),
          };
    const result = simulateFight(input, createSeededRng(seed));
    settleParty(deps, week, party, phase, built, seed, input, result);
    return true;
  });
}

/**
 * Stores a finished fight and pays it out: the boss pool (and the adaptation after phase 1), Essence
 * for cleared stages, the finale's jackpot rolls and pity, server firsts, the result row and the
 * Discord post. Shared by the instant phases and the end of the live finale. `input` is the exact
 * input that was fought (for a live finale it carries the final `fireAtRound` values), so replays
 * show what happened. Call it inside a transaction, once: the result row is the done marker, and
 * every payout has a ledger idempotency key as well.
 */
export function settleParty(
  deps: ResolveDeps,
  week: { weekId: string },
  party: number,
  phase: RaidPhase,
  built: Pick<BuiltPhase, 'memberIds' | 'aliases'>,
  seed: string,
  input: FightInput,
  result: FightResult,
): void {
  const { storage } = deps;
  const sql = storage.sql;
  const now = deps.now();
  const { memberIds, aliases } = built;
  const hpMax = input.bossHpPool.max;

  // --- Pool, adaptation ---
  sql.exec(
    'UPDATE raid_parties SET hp_max = ?, hp_current = ?, boss_atk = ? WHERE week_id = ? AND party = ?',
    hpMax,
    result.bossHpEnd,
    input.bossAtk,
    week.weekId,
    party,
  );
  const suggestion = result.adaptationSuggestion;
  if (phase === 'phase1' && suggestion !== null) {
    sql.exec(
      `UPDATE raid_parties SET adaptation_rule = ?, adaptation_target = ?, adaptation_description = ?
       WHERE week_id = ? AND party = ?`,
      suggestion.target === null ? null : suggestion.rule,
      suggestion.target,
      suggestion.description,
      week.weekId,
      party,
    );
  }

  // --- Essence, for cleared stages, to members only ---
  const payout = payoutWeek(sql, week.weekId);
  const userOf = new Map(aliases.map((alias, i) => [alias, memberIds[i] as string]));
  const essence: Record<string, number> = {};
  if (result.cleared) {
    const contribution: Record<string, number> = {};
    for (const alias of aliases) contribution[alias] = result.perPlayer[alias]?.contribution ?? 0;
    const paid = essenceForStage(phase, aliases, contributionWeights(contribution), payout);
    for (const alias of aliases) {
      const amount = paid[alias] ?? 0;
      const userId = userOf.get(alias) as string;
      if (amount <= 0) continue;
      credit(
        storage,
        {
          userId,
          currency: 'essence',
          amount,
          source: 'raid',
          idempotencyKey: `raid:${week.weekId}:${party}:${phase}`,
          meta: { week: week.weekId, party, phase },
        },
        now,
      );
      essence[userId] = amount;
    }
  }

  // --- Creature experience: every creature that fought (guests excluded), by the stage; a cleared one pays
  // half as much again. No treats: the raid pays everyone the same. This runs once per stage, with the
  // result row. ---
  const day = stageWeather(sql, week.weekId, phase);
  const stageExperience = raidExperience(phase, result.cleared, dayCreatureXpParts(false, day));
  for (const slot of input.row) {
    const userId = slot.ownerId === null ? undefined : userOf.get(slot.ownerId);
    if (userId === undefined) continue;
    awardExperience(sql, deps.analytics, userId, slot.id, stageExperience, 'raid', false);
  }

  // --- Gear: scrap for a cleared phase, one gear roll for a won finale (members only) ---
  if (result.cleared) {
    const gearDeps: GrantDeps = {
      storage,
      now: deps.now,
      rng: deps.gearRng ?? createCryptoRng((array) => crypto.getRandomValues(array)),
      analytics: deps.analytics,
    };
    for (const userId of memberIds) {
      if (phase === 'finale') {
        grantRaidFinale(gearDeps, userId, week.weekId, payout.rank, input.boss.id);
      } else grantRaidPhase(gearDeps, userId, week.weekId, phase);
    }
  }

  // --- Finale loot ---
  const jackpot =
    phase === 'finale' ? rollJackpots(deps, week.weekId, party, memberIds, result, payout) : [];

  // --- The Festival creature, for every member of a party that won a Festival finale ---
  if (phase === 'finale' && result.cleared) {
    const progression = readWeekProgression(sql, week.weekId);
    if (progression?.festival === true && progression.festivalSpecies !== null) {
      const quirkRng = deps.quirkRng ?? createCryptoRng((array) => crypto.getRandomValues(array));
      const talentRng = deps.talentRng ?? createCryptoRng((array) => crypto.getRandomValues(array));
      const festivalSpecies = content.creatures.find((c) => c.id === progression.festivalSpecies);
      const gearDeps: GrantDeps = {
        storage,
        now: deps.now,
        rng: deps.gearRng ?? createCryptoRng((array) => crypto.getRandomValues(array)),
        analytics: deps.analytics,
      };
      for (const userId of memberIds) {
        // A Festival piece the player lacks (any one once they have them all), next to the creature itself.
        if (festivalSpecies !== undefined) {
          grantFestivalGear(gearDeps, userId, week.weekId, payout.rank, input.boss.id);
        }
        grantFestivalCreature(
          storage,
          { quirk: quirkRng, talent: talentRng },
          week.weekId,
          userId,
          progression.festivalSpecies,
          now,
          deps.analytics,
        );
      }
    }
  }

  // --- Store ---
  const contributors = aliases
    .map((alias) => ({
      userId: userOf.get(alias) as string,
      damage: result.perPlayer[alias]?.damage ?? 0,
      contribution: result.perPlayer[alias]?.contribution ?? 0,
    }))
    .sort((a, b) => b.contribution - a.contribution || (a.userId < b.userId ? -1 : 1));
  const summary: StoredSummary = {
    cleared: result.cleared,
    ...outcomeFlags(result),
    rounds: result.rounds,
    bossHpMax: hpMax,
    bossHpStart: result.bossHpStart,
    bossHpEnd: result.bossHpEnd,
    reactions: result.reactions.total,
    damage: contributors.reduce((total, c) => total + c.damage, 0),
    contributors,
    essence,
    jackpot,
    members: aliases.map((alias) => ({ alias, userId: userOf.get(alias) as string })),
  };
  sql.exec(
    `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    week.weekId,
    party,
    phase,
    seed,
    JSON.stringify(input),
    JSON.stringify(result),
    JSON.stringify(summary),
    now,
  );
  logPhaseResult(deps.analytics, sql, week.weekId, phase, input, result, summary);
  if (day !== null) {
    deps.analytics?.record({ kind: 'weather_use', where: 'raid', boon: day.boon, omen: day.omen });
  }
  // The profile counts the reactions every member has seen in raids.
  for (const userId of memberIds) bumpStat(sql, userId, 'reactions_seen', result.reactions.total);
  // The ladder moves once the finale has resolved for every party (the last one to settle does it),
  // before the post is queued so the post can say where the server stands.
  if (phase === 'finale') {
    const moved = updateLadder(sql, week.weekId, now);
    if (moved !== null) {
      deps.analytics?.record({
        kind: 'rank_change',
        before: moved.rankBefore,
        after: moved.rankAfter,
        won: moved.won,
        festival: readWeekProgression(sql, week.weekId)?.festival === true,
        parties: moved.parties,
        partiesWon: moved.partiesWon,
      });
    }
  }
  // Queued in this transaction, so the post exists exactly when the result does.
  queuePhasePost(sql, {
    weekId: week.weekId,
    party,
    phase,
    now,
    input,
    result,
    summary,
  });
}

/**
 * The guild-level analytics event of a resolved stage: the boss, the rank it fought at, the party's
 * size, whether it was won and how much of the damage the top contributor did. No user is named.
 */
function logPhaseResult(
  analytics: Analytics | undefined,
  sql: SqlStorage,
  weekId: string,
  phase: RaidPhase,
  input: FightInput,
  result: FightResult,
  summary: StoredSummary,
): void {
  if (analytics === undefined) return;
  const top = summary.contributors.reduce((best, c) => Math.max(best, c.damage), 0);
  analytics.record({
    kind: 'phase_result',
    phase,
    boss: input.boss.id,
    rank: fightRank(sql, weekId),
    festival: readWeekProgression(sql, weekId)?.festival === true,
    partySize: summary.members.length,
    win: result.cleared,
    rounds: result.rounds,
    topShareBp: summary.damage > 0 ? Math.floor((top * 10_000) / summary.damage) : 0,
  });
}

/**
 * After a finale: every member rolls the jackpot against their own pity counter on a win (a hit
 * pays Essence and records "first on server", shared by everyone who hits in the same finale); on a
 * loss nothing is rolled and the counter does not change (pity counts finale wins only). Returns the
 * users who hit.
 */
function rollJackpots(
  deps: ResolveDeps,
  weekId: string,
  party: number,
  memberIds: readonly string[],
  result: FightResult,
  payout: { rank: number; festival: boolean },
): string[] {
  const sql = deps.storage.sql;
  const now = deps.now();
  const hits: string[] = [];
  for (const userId of memberIds) {
    const row = sql
      .exec<{ counter: number }>('SELECT counter FROM jackpot_pity WHERE user_id = ?', userId)
      .toArray()[0];
    const counter = row?.counter ?? 0;
    // Pity counts finale wins only: a lost finale rolls nothing and leaves the counter alone.
    if (result.cleared) {
      const roll = rollJackpot(deps.rng, counter);
      if (roll.hit) {
        hits.push(userId);
        credit(
          deps.storage,
          {
            userId,
            currency: 'essence',
            amount: jackpotEssenceFor(payout),
            source: 'raid',
            idempotencyKey: `raid:${weekId}:${party}:jackpot`,
            meta: { week: weekId, party, jackpot: true },
          },
          now,
        );
        recordServerFirst(sql, 'jackpot', 'jackpot', userId, `jackpot:${weekId}`, now);
      }
      sql.exec(
        `INSERT INTO jackpot_pity (user_id, counter) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET counter = excluded.counter`,
        userId,
        roll.newCounter,
      );
    }
  }
  return hits;
}
