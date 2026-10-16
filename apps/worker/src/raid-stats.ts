/**
 * The after-action stats of one resolved stage: what happened, in numbers, with no advice. Built
 * from the stored fight (input, result, summary) alone; nothing is simulated again. Players appear
 * by display name and a `you` flag, never by user id, and no creature id is sent at all (the fight's
 * creature ids are the players' real creature ids).
 */
import type { FightInput, FightResult } from '@creatures/engine';
import { RULES, content } from '@creatures/game';
import { outcomeFlags, type StoredSummary } from './raid-resolve';
import { isWeekId, RAID_PHASES, type RaidPhase } from './raid-schedule';

/** How many of the best creatures are listed (the caller's own are always listed as well). */
const TOP_CREATURES = 5;

export type StatsOutcome = 'cleared' | 'missed' | 'wiped';

export interface StatsPlayer {
  displayName: string;
  you: boolean;
  /** Damage credited to the player's creatures (setup and support shares excluded). */
  damage: number;
  /** The loot weight: damage plus setup, support and guard credit. */
  contribution: number;
}

export interface StatsCreature {
  /** 1-based place among all creatures in the fight, by damage. */
  rank: number;
  name: string;
  species: string;
  /** The owner's display name, or null for a guest. */
  owner: string | null;
  you: boolean;
  damage: number;
  contribution: number;
}

export interface StatsReaction {
  name: string;
  /** Times it triggered, reflected ones included. */
  count: number;
  /** How many of those the boss reflected onto the payoff creature. */
  reflected: number;
}

export interface StatsAbilityUse {
  /** The player who owns it. */
  player: string;
  you: boolean;
  ability: string;
  /** The creature it belongs to; null for a basic ability. */
  creature: string | null;
  round: number;
  /** True when it fired at its default round, false when the player chose the round. */
  byDefault: boolean;
}

export interface StatsKnockout {
  creature: string;
  species: string;
  /** The owner's display name, or null for a guest. */
  owner: string | null;
  you: boolean;
  round: number;
}

export interface StatsAdaptation {
  name: string;
  /** What the boss resisted (a reaction or an element); null if it had nothing to adapt to. */
  target: string | null;
  resistBp: number;
  purged: boolean;
  purgedRound: number | null;
  /** The round a timed purge ended and the adaptation applied again, if it did. */
  restoredRound: number | null;
}

export interface AfterActionStats {
  phase: RaidPhase;
  outcome: StatsOutcome;
  /** The "Close one!" flag (see `isCloseCall`). */
  close: boolean;
  /** The boss reached the phase floor and retreated (a cleared Phase 1 or 2); false for older results. */
  retreated: boolean;
  /** The finale went into enrage rounds; false for older results. */
  enraged: boolean;
  rounds: number;
  /** The rounds the stage has at most. */
  maxRounds: number;
  boss: {
    hpMax: number;
    hpStart: number;
    hpEnd: number;
    /** The share of the whole pool left, in basis points (floored). */
    leftBp: number;
    /** HP that had to come off the pool, counted from the full pool, for the stage to be cleared. */
    needed: number;
    /** HP that has come off the pool (this week, up to the end of the stage). */
    lost: number;
  };
  players: StatsPlayer[];
  /** The best creatures plus the caller's own, best first. */
  creatures: StatsCreature[];
  reactions: StatsReaction[];
  /** Total number of reactions that triggered. */
  reactionsTotal: number;
  abilities: {
    used: StatsAbilityUse[];
    /** Abilities that never fired (the fight ended first). */
    unused: number;
  };
  knockouts: StatsKnockout[];
  /** The counter-move the boss fought with (Phase 2 and the finale); null if it had none. */
  adaptation: StatsAdaptation | null;
}

function phaseConfig(phase: RaidPhase): { rounds: number; clearAtLossBp: number } {
  const cfg = RULES.raid.phases.find((p) => p.id === phase);
  if (cfg === undefined) throw new Error(`unknown phase ${phase}`);
  return cfg;
}

/** HP that must come off a pool of `hpMax` for the stage to count as cleared (rounded up). */
export function hpNeeded(phase: RaidPhase, hpMax: number): number {
  return Math.floor((hpMax * phaseConfig(phase).clearAtLossBp + 9_999) / 10_000);
}

/**
 * The "Close one!" rule, with integer maths only (`RULES.raid.closeCall`):
 * - a stage that was not cleared is close when it missed its target by at most `missBp` of it. For a
 *   phase the target is its clear threshold (HP to take off the pool); for the finale it is the
 *   whole pool, so the boss kept at most that share of its maximum HP;
 * - a cleared stage is close when it had at most `spareBp` of its rounds still to play when it was
 *   cleared (the boss retreated at its floor, or fell in the finale). The pool cannot be taken past
 *   a phase floor, so there is never HP to spare: rounds are the only spare there is. A finale won in
 *   enrage rounds has none left at all, so it is close.
 */
export function isCloseCall(args: {
  phase: RaidPhase;
  cleared: boolean;
  hpMax: number;
  hpEnd: number;
  rounds: number;
  maxRounds: number;
}): boolean {
  const { phase, cleared, hpMax, hpEnd, rounds, maxRounds } = args;
  const { missBp, spareBp } = RULES.raid.closeCall;
  const needed = hpNeeded(phase, hpMax);
  const lost = hpMax - hpEnd;
  if (!cleared) return (needed - lost) * 10_000 <= missBp * needed;
  return (maxRounds - rounds) * 10_000 <= spareBp * maxRounds;
}

/**
 * The stats for the caller. `names` maps user ids to display names (an unknown id shows as
 * "Unknown"). The caller does not have to be a member: nothing then is theirs (`you` is false
 * throughout), but the route only serves members.
 */
export function buildStats(
  phase: RaidPhase,
  input: FightInput,
  result: FightResult,
  summary: StoredSummary,
  userId: string,
  names: ReadonlyMap<string, string>,
): AfterActionStats {
  const hpMax = summary.bossHpMax;
  const maxRounds = phase === 'finale' ? input.boss.finaleRounds : phaseConfig(phase).rounds;
  const userOfAlias = new Map(summary.members.map((m) => [m.alias, m.userId]));
  const nameOf = (id: string | undefined): string =>
    id === undefined ? 'Unknown' : (names.get(id) ?? 'Unknown');
  /** The owner of a fight creature: a display name, or null for a guest. */
  const ownerOf = (alias: string | null): { owner: string | null; you: boolean } => {
    if (alias === null) return { owner: null, you: false };
    const id = userOfAlias.get(alias);
    return { owner: nameOf(id), you: id === userId };
  };
  const slotOf = new Map(input.row.map((s) => [s.id, s]));

  // --- Players ---
  const players: StatsPlayer[] = summary.contributors
    .map((c) => ({
      displayName: nameOf(c.userId),
      you: c.userId === userId,
      damage: c.damage,
      contribution: c.contribution,
    }))
    .sort((a, b) => b.damage - a.damage || b.contribution - a.contribution);

  // --- Creatures ---
  const ranked = input.row
    .map((slot, position) => {
      const totals = result.perCreature[slot.id];
      return {
        position,
        slot,
        damage: totals?.damage ?? 0,
        contribution: totals?.contribution ?? 0,
      };
    })
    .sort(
      (a, b) => b.damage - a.damage || b.contribution - a.contribution || a.position - b.position,
    )
    .map((entry, index): StatsCreature => {
      const { owner, you } = ownerOf(entry.slot.ownerId);
      return {
        rank: index + 1,
        name: entry.slot.name,
        species: entry.slot.speciesId,
        owner,
        you,
        damage: entry.damage,
        contribution: entry.contribution,
      };
    });
  const creatures = ranked.filter((c, index) => index < TOP_CREATURES || c.you);

  // --- Events: reactions, abilities, knockouts, adaptation ---
  const reactionNames = new Map(content.reactions.map((r) => [r.id, r.name]));
  const reactions = new Map<string, StatsReaction>();
  const abilityNames = new Map(content.finaleAbilities.map((a) => [a.id, a.name]));
  const used: StatsAbilityUse[] = [];
  const knockouts: StatsKnockout[] = [];
  const knockedOut = new Set<string>();
  let purgedRound: number | null = null;
  let restoredRound: number | null = null;
  for (const e of result.events) {
    switch (e.t) {
      case 'reaction': {
        const name = reactionNames.get(e.reaction) ?? e.reaction;
        const entry = reactions.get(e.reaction) ?? { name, count: 0, reflected: 0 };
        entry.count += 1;
        if (e.reflected) entry.reflected += 1;
        reactions.set(e.reaction, entry);
        break;
      }
      case 'ability': {
        const { owner, you } = ownerOf(e.player);
        used.push({
          player: owner ?? 'Unknown',
          you,
          ability: abilityNames.get(e.ability) ?? e.ability,
          creature: e.creature === undefined ? null : (slotOf.get(e.creature)?.name ?? null),
          round: e.round,
          byDefault: e.byDefault,
        });
        break;
      }
      case 'knockout': {
        if (knockedOut.has(e.creature)) break;
        knockedOut.add(e.creature);
        const slot = slotOf.get(e.creature);
        const { owner, you } = ownerOf(slot?.ownerId ?? null);
        knockouts.push({
          creature: slot?.name ?? 'Unknown',
          species: slot?.speciesId ?? '',
          owner,
          you,
          round: e.round,
        });
        break;
      }
      case 'adaptation':
        if (e.status === 'purged' && purgedRound === null) purgedRound = e.round;
        if (e.status === 'restored' && restoredRound === null) restoredRound = e.round;
        break;
      default:
        break;
    }
  }

  // --- Adaptation ---
  let adaptation: StatsAdaptation | null = null;
  if (input.adaptation !== null) {
    const rule = content.adaptations.find((a) => a.id === input.adaptation?.rule);
    const target = input.adaptation.target;
    adaptation = {
      name: rule?.name ?? input.adaptation.rule,
      target:
        reactionNames.get(target) ??
        content.elements.find((el) => el.id === target)?.name ??
        target,
      resistBp: rule?.resistBp ?? 0,
      purged: purgedRound !== null,
      purgedRound,
      restoredRound,
    };
  }

  const lost = hpMax - result.bossHpEnd;
  const wiped = input.row.length > 0 && knockedOut.size >= input.row.length;
  const outcome: StatsOutcome = result.cleared ? 'cleared' : wiped ? 'wiped' : 'missed';
  return {
    phase,
    outcome,
    ...outcomeFlags(result),
    close: isCloseCall({
      phase,
      cleared: result.cleared,
      hpMax,
      hpEnd: result.bossHpEnd,
      rounds: result.rounds,
      maxRounds,
    }),
    rounds: result.rounds,
    maxRounds,
    boss: {
      hpMax,
      hpStart: result.bossHpStart,
      hpEnd: result.bossHpEnd,
      leftBp: Math.floor((result.bossHpEnd * 10_000) / hpMax),
      needed: hpNeeded(phase, hpMax),
      lost,
    },
    players,
    creatures,
    reactions: [...reactions.values()].sort(
      (a, b) => b.count - a.count || (a.name < b.name ? -1 : 1),
    ),
    reactionsTotal: result.reactions.total,
    abilities: {
      used,
      unused: Math.max(0, input.finaleAbilities.length - used.length),
    },
    knockouts,
    adaptation,
  };
}

/**
 * The stats of one stored fight for a member of it, or null (not resolved, no such party, or the
 * caller was not in that fight: the same answer for all three, so nothing leaks).
 */
export function readStats(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  party: number,
  phase: RaidPhase,
  names: ReadonlyMap<string, string>,
): AfterActionStats | null {
  if (!isWeekId(weekId) || !RAID_PHASES.includes(phase)) return null;
  const row = sql
    .exec<{ input: string; result: string; summary: string }>(
      'SELECT input, result, summary FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
      weekId,
      party,
      phase,
    )
    .toArray()[0];
  if (row === undefined) return null;
  const summary = JSON.parse(row.summary) as StoredSummary;
  if (!summary.members.some((m) => m.userId === userId)) return null;
  return buildStats(
    phase,
    JSON.parse(row.input) as FightInput,
    JSON.parse(row.result) as FightResult,
    summary,
    userId,
    names,
  );
}
