/**
 * Resolving one phase for one party. Server-authoritative and atomic: the row, the seed, the fight,
 * the stored result, the Essence payout and (after the finale) the jackpot rolls all happen inside
 * one `transactionSync`. Resolving the same (week, party, phase) again changes nothing: the stored
 * result row is the done marker, and every payout also has a ledger idempotency key.
 */
import {
  RULES,
  content,
  contributionWeights,
  createSeededRng,
  essenceForStage,
  rollJackpot,
  type BossDef,
  type Rng,
} from '@creatures/game';
import {
  autoPlace,
  compactRow,
  fillWithGuests,
  makeSlot,
  resolveGuests,
  scaleBoss,
  simulateFight,
  type AbilityChoice,
  type ActiveAdaptation,
  type FightInput,
  type FightResult,
  type FightSlot,
} from '@creatures/engine';
import { credit, type LedgerStorage } from './ledger';
import { partyMembers } from './raid-roster';
import type { RaidPhase } from './raid-schedule';
import { effectiveTeam, rowLength, type TeamCreature } from './raid-teams';
import { recordServerFirst } from './server-firsts';

export interface ResolveDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness: the fight seed and the jackpot rolls. Crypto in production. */
  rng: Rng;
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

const aliasFor = (index: number): string => `m${index + 1}`;

function slotFor(creature: TeamCreature, alias: string): FightSlot {
  return makeSlot(creature.species, {
    id: creature.id,
    ownerId: alias,
    level: creature.level,
    fusionCount: creature.fusionCount,
    name: creature.nickname ?? creature.species.name,
  });
}

/**
 * Every member gets one default finale ability, round-robin over the content list, firing at its
 * default round (M4 has no live finale yet; M5 lets present players choose and time theirs).
 */
function defaultAbilities(aliases: readonly string[]): AbilityChoice[] {
  return aliases.map((playerId, i) => {
    const def = content.finaleAbilities[i % content.finaleAbilities.length];
    if (def === undefined) throw new Error('content has no finale abilities');
    return { playerId, abilityId: def.id };
  });
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
    const memberIds = partyMembers(sql, week.weekId, party);
    if (memberIds.length === 0) return false;
    const now = deps.now();
    const boss = bossFor(week.bossId);

    // --- Build the row from the creatures' current stats ---
    const aliases = memberIds.map((_, i) => aliasFor(i));
    const teams = memberIds.map((userId) => effectiveTeam(sql, week.weekId, userId).creatures);
    const slotById = new Map<string, FightSlot>();
    teams.forEach((team, i) => {
      for (const creature of team)
        slotById.set(creature.id, slotFor(creature, aliases[i] as string));
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
      const scaled = scaleBoss(boss, memberIds.length, avgLevel);
      hpMax = scaled.maxHp;
      hpCurrent = scaled.maxHp;
      bossAtk = scaled.atk;
    }
    const adaptation: ActiveAdaptation | null =
      phase !== 'phase1' && partyRow.adaptation_rule !== null && partyRow.adaptation_target !== null
        ? { rule: partyRow.adaptation_rule, target: partyRow.adaptation_target }
        : null;

    const input: FightInput = {
      boss,
      bossAtk,
      phase,
      bossHpPool: { max: hpMax, current: hpCurrent },
      adaptation,
      row,
      players: aliases,
      finaleAbilities: phase === 'finale' ? defaultAbilities(aliases) : [],
    };
    // The seed is drawn now, from live randomness, and stored with the input: the fight can be
    // replayed later, but nobody could have known the seed before this moment.
    const seed = drawSeed(deps.rng);
    const result = simulateFight(input, createSeededRng(seed));

    // --- Pool, adaptation ---
    sql.exec(
      'UPDATE raid_parties SET hp_max = ?, hp_current = ?, boss_atk = ? WHERE week_id = ? AND party = ?',
      hpMax,
      result.bossHpEnd,
      bossAtk,
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
    const userOf = new Map(aliases.map((alias, i) => [alias, memberIds[i] as string]));
    const essence: Record<string, number> = {};
    if (result.cleared) {
      const contribution: Record<string, number> = {};
      for (const alias of aliases) contribution[alias] = result.perPlayer[alias]?.contribution ?? 0;
      const paid = essenceForStage(phase, aliases, contributionWeights(contribution));
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
      phase === 'finale' ? rollJackpots(deps, week.weekId, party, memberIds, result) : [];

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
    return true;
  });
}

/**
 * After a finale: every member rolls the jackpot against their own pity counter on a win (a hit
 * pays Essence and records "first on server", shared by everyone who hits in the same finale); on a
 * loss the counter just advances ("counts participation"). Returns the users who hit.
 */
function rollJackpots(
  deps: ResolveDeps,
  weekId: string,
  party: number,
  memberIds: readonly string[],
  result: FightResult,
): string[] {
  const sql = deps.storage.sql;
  const now = deps.now();
  const hits: string[] = [];
  for (const userId of memberIds) {
    const row = sql
      .exec<{ counter: number }>('SELECT counter FROM jackpot_pity WHERE user_id = ?', userId)
      .toArray()[0];
    const counter = row?.counter ?? 0;
    let next = counter + 1;
    if (result.cleared) {
      const roll = rollJackpot(deps.rng, counter);
      next = roll.newCounter;
      if (roll.hit) {
        hits.push(userId);
        credit(
          deps.storage,
          {
            userId,
            currency: 'essence',
            amount: RULES.raid.jackpotEssence,
            source: 'raid',
            idempotencyKey: `raid:${weekId}:${party}:jackpot`,
            meta: { week: weekId, party, jackpot: true },
          },
          now,
        );
        recordServerFirst(sql, 'jackpot', 'jackpot', userId, `jackpot:${weekId}`, now);
      }
    }
    sql.exec(
      `INSERT INTO jackpot_pity (user_id, counter) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET counter = excluded.counter`,
      userId,
      next,
    );
  }
  return hits;
}
