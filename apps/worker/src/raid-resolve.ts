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
  content,
  contributionWeights,
  createCryptoRng,
  createSeededRng,
  essenceForStage,
  jackpotEssenceFor,
  rollJackpot,
  type BossDef,
  type Rng,
} from '@creatures/game';
import {
  autoPlace,
  type AbilityChoice,
  compactRow,
  fillWithGuests,
  makeSlot,
  resolveGuests,
  scaleBoss,
  simulateFight,
  type ActiveAdaptation,
  type FightInput,
  type FightResult,
  type FightSlot,
} from '@creatures/engine';
import { credit, type LedgerStorage } from './ledger';
import { grantFestivalCreature } from './raid-festival';
import { fightRank, payoutWeek, readWeekProgression, updateLadder } from './raid-ladder';
import { partyMembers } from './raid-roster';
import { queuePhasePost } from './raid-posts';
import type { RaidPhase } from './raid-schedule';
import { effectiveTeam, rowLength, type TeamCreature } from './raid-teams';
import { recordServerFirst } from './server-firsts';

export interface ResolveDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness: the fight seed and the jackpot rolls. Crypto in production. */
  rng: Rng;
  /** Live randomness for the quirk of a Festival creature. Defaults to crypto. */
  quirkRng?: Rng;
}

/** What the API shows about a resolved phase. Contains user ids: map to names before sending. */
export interface StoredSummary {
  cleared: boolean;
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

/** 128 random bits as 32 lowercase hex characters. */
export function drawSeed(rng: Rng): string {
  let hex = '';
  for (let i = 0; i < 4; i++) hex += rng.nextU32().toString(16).padStart(8, '0');
  return hex;
}

export function bossFor(bossId: string): BossDef {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error('week uses an unknown boss');
  return boss;
}

export const aliasFor = (index: number): string => `m${index + 1}`;

function slotFor(creature: TeamCreature, alias: string): FightSlot {
  return makeSlot(creature.species, {
    id: creature.id,
    ownerId: alias,
    level: creature.level,
    fusionCount: creature.fusionCount,
    name: creature.nickname ?? creature.species.name,
  });
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

/** A fight input built for one party, with who is in it (`aliases[i]` belongs to `memberIds[i]`). */
export interface BuiltPhase {
  memberIds: string[];
  aliases: string[];
  input: FightInput;
}

export interface BuildOptions {
  /**
   * A practice fight: full boss HP and no adaptation, whatever the week's carried pool is. The row
   * and everything else are the same as for a real fight.
   */
  practice?: boolean;
}

/**
 * Builds the fight input for one party and phase from the creatures' current stats: the row
 * (placements, auto-placement, guests), the boss (scaled at phase 1, then carried) and, for the
 * finale, each member's ability at its default round. Reads only; call it inside the transaction
 * that uses the result. Returns null if the party has no members.
 */
export function buildPhaseInput(
  sql: SqlStorage,
  week: { weekId: string; bossId: string },
  party: number,
  phase: RaidPhase,
  options: BuildOptions = {},
): BuiltPhase | null {
  const memberIds = partyMembers(sql, week.weekId, party);
  if (memberIds.length === 0) return null;
  const boss = bossFor(week.bossId);

  // --- Build the row from the creatures' current stats ---
  const aliases = memberIds.map((_, i) => aliasFor(i));
  const teams = memberIds.map((userId) => effectiveTeam(sql, week.weekId, userId).creatures);
  const slotById = new Map<string, FightSlot>();
  teams.forEach((team, i) => {
    for (const creature of team) slotById.set(creature.id, slotFor(creature, aliases[i] as string));
  });
  const length = rowLength(memberIds.length);
  const sparse: (FightSlot | null)[] = new Array<FightSlot | null>(length).fill(null);
  const placements = sql
    .exec<{ slot: number; user_id: string; creature_id: string }>(
      'SELECT slot, user_id, creature_id FROM raid_placements WHERE week_id = ? AND party = ?',
      week.weekId,
      party,
    )
    .toArray();
  for (const placement of placements) {
    const slot = slotById.get(placement.creature_id);
    const owner = memberIds.indexOf(placement.user_id);
    // Only creatures that are still in their owner's team and fit the row stay placed.
    if (slot === undefined || owner < 0 || slot.ownerId !== aliases[owner]) continue;
    if (placement.slot < 0 || placement.slot >= length) continue;
    sparse[placement.slot] = slot;
  }
  const placedIds = new Set<string>();
  for (const s of sparse) if (s !== null) placedIds.add(s.id);
  const unplaced = new Map<string, FightSlot[]>();
  teams.forEach((team, i) => {
    unplaced.set(
      aliases[i] as string,
      team.filter((c) => !placedIds.has(c.id)).map((c) => slotById.get(c.id) as FightSlot),
    );
  });
  let placed = autoPlace(sparse, unplaced);
  const levels = teams.flat().map((c) => c.level);
  const avgLevel = Math.max(1, Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length));
  if (memberIds.length < RULES.combat.guestsBelowPlayers) {
    placed = fillWithGuests(placed, resolveGuests(), avgLevel);
  }
  const row = compactRow(placed);

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
    const scaled = scaleBoss(boss, memberIds.length, fightRank(sql, week.weekId));
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
  const input: FightInput = {
    boss,
    bossAtk,
    phase,
    bossHpPool: { max: hpMax, current: hpCurrent },
    adaptation,
    row,
    players: aliases,
    // Each member's basic pick plus the abilities of their (frozen) team's unlocked creatures.
    finaleAbilities: abilityIds.flatMap((abilityId, i) =>
      memberChoices(aliases[i] as string, abilityId, teams[i] as TeamCreature[], rowIds),
    ),
    // Crits and the rest of the luck rules, stored with the input so a replay is exact.
    luck: { ...RULES.combat.luck },
  };
  return { memberIds, aliases, input };
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
    const result = simulateFight(built.input, createSeededRng(seed));
    settleParty(deps, week, party, phase, built, seed, built.input, result);
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

  // --- Finale loot ---
  const jackpot =
    phase === 'finale' ? rollJackpots(deps, week.weekId, party, memberIds, result, payout) : [];

  // --- The Festival creature, for every member of a party that won a Festival finale ---
  if (phase === 'finale' && result.cleared) {
    const progression = readWeekProgression(sql, week.weekId);
    if (progression?.festival === true && progression.festivalSpecies !== null) {
      const quirkRng = deps.quirkRng ?? createCryptoRng((array) => crypto.getRandomValues(array));
      for (const userId of memberIds) {
        grantFestivalCreature(
          storage,
          quirkRng,
          week.weekId,
          userId,
          progression.festivalSpecies,
          now,
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
  // The ladder moves once the finale has resolved for every party (the last one to settle does it),
  // before the post is queued so the post can say where the server stands.
  if (phase === 'finale') updateLadder(sql, week.weekId, now);
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
