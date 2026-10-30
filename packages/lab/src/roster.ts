/**
 * The roster profile: the seam between combat v2 (which owns the challenges) and the valley (which owns how fast a server's
 * players grow). `docs/design/combat/boss-track.md` says why it is the only thing the valley changes.
 *
 * A profile is plain data: for each kind of player and each week from 1 to 24, the levels of the player's 1st, 3rd, 10th and
 * 20th creature, how many creatures they own, which lab forms they can have, how many talent slots their best creature has
 * open, and a `gear` level (the average worn item level; carried but unused: the lab has no gear yet). The functions below only
 * read it. The data is the valley's (`valley.ts`: `VALLEY_ROSTER`, from `data/valley/roster-profile.json`); when the valley
 * writes new numbers in the same shape, the file is replaced and nothing else here changes.
 */
import { RULES, content } from '@creatures/game';
import { FORM_KNACKS } from './knacks';
import { formStats } from './species';
import { legalTalents } from './talents';
import type { Pick } from './search';

/** The creature level cap. */
export const LEVEL_CAP = 30;
/** The weeks a profile covers. */
export const ROSTER_WEEKS = 24;

/** The kinds of player: a daily player, a weekly player, and a new player (who joins at some week and catches up). */
export type RosterKind = 'daily' | 'weekly' | 'new';

/** A player of the profile: a new player also says the week they joined (1 = the server's first week). */
export interface RosterPlayer {
  readonly kind: RosterKind;
  readonly joinWeek?: number;
}

/** What one player has at one week. */
export interface RosterWeek {
  /** The week (1 to 24) for a daily or weekly player; the weeks since joining (1 = the week they join) for a new one's table. */
  readonly week: number;
  /**
   * The level of the player's best, 3rd best, 10th best and 20th best creature. Levels between are interpolated, none is above the cap.
   * Fractions are fine (the valley's `tenth: 8.5`). **0 means no such creature** (the median player has not reached that rank yet),
   * never a level: `levelOfCreature` skips it. Only the best creature is always at least 1. When a player's 3rd, 10th or 20th is
   * ahead of the daily player's 0, `rosterWeek` takes the 0 (the roster size is capped the same way).
   */
  readonly first: number;
  readonly third: number;
  readonly tenth: number;
  readonly twentieth: number;
  /** How many creatures they own. */
  readonly size: number;
  /** The lab forms they can have: `'all'` in the valley's data so far; the valley can name the starters plus what scouts found. */
  readonly forms: 'all' | readonly string[];
  /** The talent slots open on their best creature (slot 2 at level 20, slot 3 at 25: `RULES.talents.slotLevels`). */
  readonly talentSlots: number;
  /** Whether the talents are picked (a Talent Book) or random rolls. */
  readonly talentsPicked: boolean;
  /** The average worn item level. Carried, unused: the lab has no gear yet. */
  readonly gear: number;
}

export interface RosterProfile {
  readonly daily: readonly RosterWeek[];
  readonly weekly: readonly RosterWeek[];
  /**
   * A new player's roster by weeks since joining (index 0: the week they join). `rosterWeek` never lets it pass the daily player's of
   * that week (the valley's week-1 row is ahead of the daily player's own).
   */
  readonly newPlayer: readonly RosterWeek[];
}

/**
 * The speeds of the roster: slow (levels 20% behind), expected, fast (20% ahead). A factor on every level of the valley's profile
 * (a sensitivity: how the path moves if servers grow slower or faster than the valley says), one profile for all.
 */
export type RosterSpeed = 'slow' | 'expected' | 'fast';
export const ROSTER_SPEEDS: readonly RosterSpeed[] = ['slow', 'expected', 'fast'];
export const SPEED_FACTOR: Readonly<Record<RosterSpeed, number>> = {
  slow: 0.8,
  expected: 1,
  fast: 1.2,
};

/** Talent slots open at a level (`RULES.talents.slotLevels`: 1, 20, 25). */
export const talentSlotsAt = (level: number): number =>
  RULES.talents.slotLevels.filter((l) => level >= l).length;

// ---------- reading a profile ----------

const clampWeek = (week: number): number => Math.min(ROSTER_WEEKS, Math.max(1, Math.round(week)));

/** What a player has at a calendar `week` (clamped to 1..24). A new player needs `joinWeek` and has nothing before it (an error). */
export function rosterWeek(
  profile: RosterProfile,
  kind: RosterKind,
  week: number,
  joinWeek?: number,
): RosterWeek {
  const w = clampWeek(week);
  if (kind === 'daily') return profile.daily[w - 1] as RosterWeek;
  if (kind === 'weekly') return profile.weekly[w - 1] as RosterWeek;
  if (joinWeek === undefined) throw new Error('a new player needs a join week');
  if (w < joinWeek)
    throw new Error(`a new player who joins in week ${joinWeek} has no roster in week ${w}`);
  const mine = profile.newPlayer[clampWeek(w - joinWeek + 1) - 1] as RosterWeek;
  const daily = profile.daily[w - 1] as RosterWeek;
  // Never ahead of a daily player of the same week.
  return {
    ...mine,
    week: w,
    first: Math.min(mine.first, daily.first),
    third: Math.min(mine.third, daily.third),
    tenth: Math.min(mine.tenth, daily.tenth),
    twentieth: Math.min(mine.twentieth, daily.twentieth),
    size: Math.min(mine.size, daily.size),
  };
}

/**
 * The level of the `i`-th best creature (1-based): straight lines between the 1st, 3rd, 10th and 20th, flat beyond the last of them.
 * An anchor of 0 is "no such creature" (the valley's median player has not reached that rank), not a level: it is skipped, never
 * interpolated toward, so a creature ranked past the last non-zero anchor takes that anchor's level (the size cap still limits how
 * many creatures there are).
 */
export function levelOfCreature(r: RosterWeek, i: number): number {
  const at = (
    [
      [1, r.first],
      [3, r.third],
      [10, r.tenth],
      [20, r.twentieth],
    ] as const
  ).filter(([, level]) => level > 0);
  if (i <= 1) return r.first;
  for (let k = 1; k < at.length; k++) {
    const [i0, l0] = at[k - 1] as readonly [number, number];
    const [i1, l1] = at[k] as readonly [number, number];
    if (i <= i1) return l0 + ((l1 - l0) * (i - i0)) / (i1 - i0);
  }
  return (at[at.length - 1] as readonly [number, number])[1];
}

/**
 * The levels of a player's `count` best creatures at a week, best first, whole numbers between 1 and the cap (fewer if they own
 * fewer). The speed moves every level: slow 20% lower, fast 20% higher (still capped at 30).
 */
export function rosterLevels(
  profile: RosterProfile,
  kind: RosterKind,
  week: number,
  speed: RosterSpeed,
  count: number = 4,
  joinWeek?: number,
): number[] {
  const r = rosterWeek(profile, kind, week, joinWeek);
  return Array.from({ length: Math.min(count, r.size) }, (_, k) =>
    Math.max(1, Math.min(LEVEL_CAP, Math.round(levelOfCreature(r, k + 1) * SPEED_FACTOR[speed]))),
  );
}

/**
 * The levels of a player's creatures ranked `from` to `from + count - 1` by level (1 is the best), the same whole numbers as
 * `rosterLevels`. A player with fewer creatures than a rank has their weakest one there. Information only: the answer at middling ranks
 * (`trackTuner.ts`), a player who fields their 8th to 11th best instead of their best.
 */
export function rosterLevelsFrom(
  profile: RosterProfile,
  kind: RosterKind,
  week: number,
  speed: RosterSpeed,
  from: number,
  count: number,
  joinWeek?: number,
): number[] {
  const r = rosterWeek(profile, kind, week, joinWeek);
  return Array.from({ length: count }, (_, k) => {
    const rank = Math.min(from + k, Math.max(1, r.size));
    return Math.max(
      1,
      Math.min(LEVEL_CAP, Math.round(levelOfCreature(r, rank) * SPEED_FACTOR[speed])),
    );
  });
}

/**
 * The evolution a stage 2 form comes from: its line's stage 1 form and the level that form evolves at (the stage 1 form's
 * `evolvesTo`, or `altEvolvesTo` for the second branch of a line; read from the shipped content, 15 for every line today).
 * Undefined for a stage 1 form, which has nothing to wait for.
 */
export function evolutionOf(formId: string): { from: string; level: number } | undefined {
  const form = content.creatures.find((c) => c.id === formId);
  if (!form || form.stage < 2) return undefined;
  const first = content.creatures.find((c) => c.line === form.line && c.stage === 1);
  if (!first) return undefined;
  const way = [first.evolvesTo, first.altEvolvesTo].find((e) => e?.species === formId);
  return way ? { from: first.id, level: way.level } : undefined;
}

/**
 * The evolution gate (the lead, 2026-10-30, design panel 6): a creature below its form's evolution level has not evolved yet, so it
 * fights as its stage 1 form. A daily player's best creature is level 11 in week 1, 14 in week 2 and 17 in week 3, while the lab
 * used to field stage 2 forms (which evolve at 15) from week 1. The Knack stays when the stage 1 form can equip it (or there is
 * none), else it is the stage 1 form's first Knack; the talents stay when the stage 1 form can carry them legally. A creature at or
 * above its evolution level, and any stage 1 form, is unchanged.
 */
export function gatedPick(pick: Pick, level: number): Pick {
  const evo = evolutionOf(pick.formId);
  if (!evo || level >= evo.level) return pick;
  const knacks = FORM_KNACKS[evo.from] ?? [];
  const knack =
    pick.knack === 'none' || knacks.includes(pick.knack) ? pick.knack : (knacks[0] ?? 'none');
  const { talents, ...rest } = pick;
  const kept = (talents ?? []).filter((t) => legalTalents(evo.from).includes(t));
  return { ...rest, formId: evo.from, knack, ...(kept.length ? { talents: kept } : {}) };
}

/**
 * A player's column of a raid line at a week: the same forms, Knacks and talents, each creature at the level of the player's
 * creature of that row (the best at the front row), capped by the form's own cap, with the talents the level has slots for. A
 * creature under its form's evolution level fights as its stage 1 form (`gatedPick`); `gate: false` leaves the forms as written.
 */
export function levelledColumn(
  column: readonly Pick[],
  levels: readonly number[],
  gate = true,
): Pick[] {
  return column.map((written, row) => {
    const rostered = Math.round(levels[row] ?? levels[levels.length - 1] ?? 1);
    const p = gate ? gatedPick(written, rostered) : written;
    const level = Math.max(1, Math.min(rostered, formStats(p.formId, LEVEL_CAP).levelCap));
    const { talents, ...rest } = p;
    const kept = (talents ?? []).slice(0, talentSlotsAt(level));
    return { ...rest, level, ...(kept.length ? { talents: kept } : {}) };
  });
}
