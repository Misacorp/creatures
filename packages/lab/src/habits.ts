/**
 * Player habits in the journey (phase 5, step 2, `docs/design/combat/balance.md` section 2.3).
 *
 * Step 1 (`journey.ts`) played the game's raid rules with every player logging in between stages and replacing their knocked-out
 * creatures. Real servers are not like that: a weekly player mostly does not, and a casual player does not read the board. This module
 * says what each kind of player does, as data, so the journey can play both and the report can show the difference:
 *
 * - **Replacements** by roster kind (`REPLACE_CHANCE`).
 * - **Knacks**: best for the board (what a prepared player does: the line as written), the first Knack the creature knows, or none.
 * - **Talents**: the column's own (the line as written, or the casual column's one random talent), or rolled from the creature's line
 *   pool at the valley's rate (the slots the roster profile says are open that week, never more than the level's and the species'),
 *   each golden at the game's chance.
 * - **Placement**: the rows follow the board (the column as built) or are random within the player's column.
 * - **The finale's action**: none (step 1), or the player's basic ability (Rally, Shield Wall or Purge) fired at its default round, as
 *   the worker does when Auto fire is on and nobody touches it.
 *
 * Everything that is chosen by chance is drawn from a seeded rng keyed by the server, the player and the week, so a run repeats.
 */
import { RULES, content, createSeededRng, int, type Rng } from '@creatures/game';
import type { FinaleAction, FinaleActionKind, Placement } from '@creatures/engine/v2';
import { FORM_KNACKS } from './knacks';
import type { PlayerRole } from './path';
import { rosterWeek, talentSlotsAt, type RosterKind, type RosterProfile } from './roster';
import { legalTalents } from './talents';

/**
 * The chance that a player brings a spare after a knock-out between stages, by roster kind (the stage break, one draw per player and
 * stage: a player who logs in fills every empty seat from their spares).
 *
 * **The weekly rate of 0.3 is confirmed by Misa (2026-11-04: "3 times in 10 seems legit"), no longer an assumption.** A daily player
 * logs in between stages; a weekly player mostly does not (3 in 10 do). The new-player rate stays the lead's assumption (a new player is
 * new and keen, as a daily player).
 */
export const REPLACE_CHANCE: Readonly<Record<RosterKind, number>> = {
  daily: 1,
  weekly: 0.3,
  new: 1,
};

/**
 * How often a player runs the daily dungeon, by roster kind: a run on each of `min` to `max` days of the week (a seeded draw per
 * player and week, every count in the range equally likely, on seeded days). A daily player runs every day. **Weekly (semi-weekly)
 * players run 2 or 3 times a week: confirmed by Misa (2026-11-04), not an assumption.** A new player is keen and runs daily (the lead's
 * assumption, as for replacements).
 */
export interface RunsPerWeek {
  readonly min: number;
  readonly max: number;
}
export const DUNGEON_RUNS: Readonly<Record<RosterKind, RunsPerWeek>> = {
  daily: { min: 7, max: 7 },
  weekly: { min: 2, max: 3 },
  new: { min: 7, max: 7 },
};

/**
 * Whether a player of a role plans their dungeon runs (`smart`: picks rooms, brings a bench, swaps at the camp) or takes the first exit
 * (`first`). Assumption (the lead's): prepared players and builders plan, casual players do not.
 */
export type DungeonPolicy = 'first' | 'smart';

/**
 * How far down a player goes is their choice once the floor boss falls at depth 8 or more: they descend into the Undercroft while the
 * team's mean share of HP (of the standing creatures, after catching its breath) is above this. Assumption (the lead's; the design's
 * simulator used the same 50%, `docs/design/dungeon-paths.md`). Data, so a report can move it.
 */
export const DESCEND_ABOVE = 0.5;

export type KnackPolicy = 'board' | 'first' | 'none';
export type TalentPolicy = 'column' | 'pools';
export type PlacementPolicy = 'board' | 'random';

/** What a player does in the live finale: nothing (step 1), their default ability, or one fixed ability (a player who picks it). */
export type FinalePolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'auto' }
  | { readonly kind: 'fixed'; readonly ability: FinaleActionKind };

export interface Habits {
  readonly id: string;
  /** The chance of replacing by roster kind. */
  readonly replace: Readonly<Record<RosterKind, number>>;
  readonly knacks: Readonly<Record<PlayerRole, KnackPolicy>>;
  readonly talents: Readonly<Record<PlayerRole, TalentPolicy>>;
  /** Golden talents: one in `denominator` is golden. Null: none (step 1's lab plays no golden talents). */
  readonly golden: { readonly numerator: number; readonly denominator: number } | null;
  readonly placement: Readonly<Record<PlayerRole, PlacementPolicy>>;
  readonly finale: Readonly<Record<PlayerRole, FinalePolicy>>;
  /** Dungeon runs a week by roster kind (`DUNGEON_RUNS`). */
  readonly dungeonRuns: Readonly<Record<RosterKind, RunsPerWeek>>;
  /** Whether a role plans its dungeon runs (`DungeonPolicy`). */
  readonly dungeonPolicy: Readonly<Record<PlayerRole, DungeonPolicy>>;
  /** The team's share of HP above which a player descends (`DESCEND_ABOVE`). */
  readonly descendAbove: number;
}

const perRole = <T>(prepared: T, builder: T, casual: T): Readonly<Record<PlayerRole, T>> => ({
  prepared,
  builder,
  casual,
});

/** Step 1's journey: everybody replaces, the roles' own Knacks and talents, rows as built, no golden talent, no finale action. */
export const EVERYONE_REPLACES: Habits = {
  id: 'everyone',
  replace: { daily: 1, weekly: 1, new: 1 },
  knacks: perRole('board', 'board', 'none'),
  talents: perRole('column', 'column', 'column'),
  golden: null,
  placement: perRole('board', 'board', 'board'),
  finale: perRole<FinalePolicy>({ kind: 'none' }, { kind: 'none' }, { kind: 'none' }),
  dungeonRuns: DUNGEON_RUNS,
  dungeonPolicy: perRole<DungeonPolicy>('smart', 'smart', 'first'),
  descendAbove: DESCEND_ABOVE,
};

/** Only the replacement habit changed: the rest as step 1 (to see what each habit moves). */
export const REPLACE_ONLY: Habits = {
  ...EVERYONE_REPLACES,
  id: 'replace',
  replace: REPLACE_CHANCE,
};

/**
 * The habits: replacement by kind; prepared players keep their line as written (Talent Book picks, the board's best), builders and
 * casual players roll talents from the pool; casual players equip no Knack and stand in random rows; golden at the game's chance
 * (`RULES.talents.golden`); everyone's finale ability fires by default (the worker deals them out by place in the party).
 */
export const HABITS: Habits = {
  id: 'habits',
  replace: REPLACE_CHANCE,
  knacks: perRole('board', 'board', 'none'),
  talents: perRole('column', 'pools', 'pools'),
  golden: RULES.talents.golden,
  placement: perRole('board', 'board', 'random'),
  finale: perRole<FinalePolicy>({ kind: 'auto' }, { kind: 'auto' }, { kind: 'auto' }),
  dungeonRuns: DUNGEON_RUNS,
  dungeonPolicy: perRole<DungeonPolicy>('smart', 'smart', 'first'),
  descendAbove: DESCEND_ABOVE,
};

/** The habits again, but a casual player equips the first Knack the creature knows (a report row: what a Knack policy is worth). */
export const HABITS_FIRST_KNACK: Habits = {
  ...HABITS,
  id: 'habits-first-knack',
  knacks: perRole('board', 'board', 'first'),
};

export const HABIT_SETS: Readonly<Record<string, Habits>> = Object.fromEntries(
  [EVERYONE_REPLACES, REPLACE_ONLY, HABITS, HABITS_FIRST_KNACK].map((h) => [h.id, h]),
);

export const habitsOf = (id: string | undefined): Habits => {
  if (id === undefined) return EVERYONE_REPLACES;
  const h = HABIT_SETS[id];
  if (!h) throw new Error(`unknown habits ${id}`);
  return h;
};

/** The chance of a draw: `p` in [0, 1] from one 32-bit draw (1 always, 0 never). */
export const chanceHits = (rng: Rng, p: number): boolean => rng.nextU32() / 0x1_0000_0000 < p;

/** `xs` in a seeded random order (Fisher-Yates). */
export function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The Knack a policy puts on a creature of `p`. */
export function withKnackPolicy(p: Placement, policy: KnackPolicy): Placement {
  if (policy === 'board') return p;
  const knack = policy === 'none' ? 'none' : (FORM_KNACKS[p.formId]?.[0] ?? 'none');
  return { ...p, knack };
}

/** How many talents a creature may carry: the slots the roster says are open this week, the level's, and the species'. */
export function talentSlotsFor(
  profile: RosterProfile,
  roster: RosterKind,
  week: number,
  joinWeek: number | undefined,
  formId: string,
  level: number,
): number {
  const rarity = content.creatures.find((c) => c.id === formId)?.rarity ?? 'common';
  return Math.min(
    rosterWeek(profile, roster, week, joinWeek).talentSlots,
    talentSlotsAt(level),
    RULES.talents.slotsByRarity[rarity],
  );
}

/**
 * The creature with its talents as the policy has them and golden ones marked. `column`: the talents it has (a creature's own), `pools`:
 * `slots` talents rolled from the line's pool (the legal ones for its role), a shuffled order fixed by `key` so a creature keeps the
 * talents it rolled as the weeks go (more slots add talents after them, none change). Golden is a draw per talent, in order, by `key`.
 */
export function withTalentPolicy(
  p: Placement,
  policy: TalentPolicy,
  slots: number,
  golden: Habits['golden'],
  key: string,
): Placement {
  const talents =
    policy === 'pools'
      ? shuffled(createSeededRng(`talents:${key}`), legalTalents(p.formId)).slice(0, slots)
      : (p.talents ?? []);
  const rest: Placement = {
    owner: p.owner,
    formId: p.formId,
    level: p.level,
    ...(p.knack === undefined ? {} : { knack: p.knack }),
    row: p.row,
    col: p.col,
  };
  if (talents.length === 0) return rest;
  const rng = createSeededRng(`golden:${key}`);
  const gold = golden ? talents.filter(() => int(rng, golden.denominator) < golden.numerator) : [];
  return { ...rest, talents, ...(gold.length ? { goldenTalents: gold } : {}) };
}

/** The finale's abilities in the order the worker deals them to members who picked none (`V2_ABILITY_IDS`). */
const ABILITY_KINDS: readonly { id: string; kind: FinaleActionKind }[] = [
  { id: 'rally', kind: 'rally' },
  { id: 'shield-wall', kind: 'shieldWall' },
  { id: 'purge', kind: 'purge' },
];

/** The round an ability fires in when nobody touches it (`defaultRound` in the finale abilities). */
export const defaultRoundOf = (kind: FinaleActionKind): number => {
  const id = ABILITY_KINDS.find((a) => a.kind === kind)?.id;
  return content.finaleAbilities.find((a) => a.id === id)?.defaultRound ?? 1;
};

/**
 * The finale's inputs for the party, one per member who has one: member `i` (the party's order) gets the `i % 3`-th ability unless
 * their policy fixes one, fired at its default round (never past the last round); a Shield Wall covers the front row, as the worker's
 * default does.
 */
export function finaleActions(
  policies: readonly FinalePolicy[],
  rounds: number,
  alias: (i: number) => string,
): FinaleAction[] {
  return policies.flatMap((policy, i): FinaleAction[] => {
    if (policy.kind === 'none') return [];
    const kind =
      policy.kind === 'fixed'
        ? policy.ability
        : (ABILITY_KINDS[i % ABILITY_KINDS.length] as { kind: FinaleActionKind }).kind;
    return [
      {
        round: Math.min(rounds, defaultRoundOf(kind)),
        kind,
        ...(kind === 'shieldWall' ? { row: 0 } : {}),
        by: alias(i),
      },
    ];
  });
}
