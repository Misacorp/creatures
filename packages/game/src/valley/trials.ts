import * as v from 'valibot';
import { VALLEY_RULES, type ValleyRules } from './rules';

/**
 * Trials: honours instead of ribbons (phase 5 step 9c, docs/design/valley/systems/trials.md V-TRIAL-1 to 5, school.md V-SCH-9). The pure half;
 * the server (`apps/worker/src/valley-trials.ts`) stores it and the lab (`packages/econ/src/honours.ts`) models the same checklist.
 *
 * - **The list** (`TRIALS`): Bronze from level 10, Silver from 20, Gold from 30, the same for every creature. Each has one combat feat and a
 *   few boxes from the valley's other systems. Honours are a badge, a title ("Pip, Silver") and a ribbon on the sprite: no stat, no slot, no
 *   gate (V-TRIAL-1).
 * - **The boxes tick as the creature lives its life.** Some are events (a dungeon clear with it in the team, a find brought home, a small
 *   moment at the fire, a way found deeper, a raid kill) and some are read off the creature's own hours (a day at a post, Expert, Master, a
 *   week at a communal seat); both kinds are counted only for a creature at or above the trial's level that is not yet through it.
 *   Single-piece routes (a Rare or an Epic piece made) are counted over days of the creature's own smithing (V-TRIAL-5).
 * - **Graduation** (V-TRIAL-4): a daily ceremony at the School. A creature whose boxes are all ticked graduates at the first ceremony after
 *   the last tick whether or not its owner is there, one honour per ceremony. It is worked out from timestamps alone (`graduate`): looking
 *   at any moments in between gives the same answer as looking once.
 *
 * Not built, so not boxes: Bronze's "a day at any post" counts the scouts', the Forge's and the broker's posts (the School's seats and
 * the teacher are step 9a's and add nothing here).
 */

export const TRIAL_TIERS = [1, 2, 3] as const;
export type TrialTier = (typeof TRIAL_TIERS)[number];
export const TRIAL_NAMES = ['Bronze', 'Silver', 'Gold'] as const;

/** The boxes of every trial. Each id belongs to exactly one trial. */
export const TRIAL_BOX_IDS = [
  'dungeon',
  'post',
  'home',
  'fire',
  'undercroft',
  'craft',
  'further',
  'raid',
  'master',
  'teacher',
] as const;
export type TrialBoxId = (typeof TRIAL_BOX_IDS)[number];

export type TrialBoxKind = 'combat' | 'work' | 'home' | 'friend' | 'craft' | 'further' | 'teacher';

export interface TrialBox {
  id: TrialBoxId;
  kind: TrialBoxKind;
}

export interface Trial {
  tier: TrialTier;
  name: (typeof TRIAL_NAMES)[number];
  boxes: readonly TrialBox[];
}

/** V-TRIAL-2 (the example table of trials.md): the one list, the same for every creature. */
export const TRIALS: readonly Trial[] = [
  {
    tier: 1,
    name: 'Bronze',
    boxes: [
      // Combat: a dungeon clear with the creature in the team.
      { id: 'dungeon', kind: 'combat' },
      // Work: a day at any post.
      { id: 'post', kind: 'work' },
      // Bring something home: a find as a scout, or a day of smithing.
      { id: 'home', kind: 'home' },
      // Make a friend: a small moment at the bonfire.
      { id: 'fire', kind: 'friend' },
    ],
  },
  {
    tier: 2,
    name: 'Silver',
    boxes: [
      // Combat: an Undercroft keeper beaten with it in the team.
      { id: 'undercroft', kind: 'combat' },
      // Craft: Expert in any work, or a Rare piece made (over days of its own smithing).
      { id: 'craft', kind: 'craft' },
      // Go further: pushed on to a deeper area, or a keystone found.
      { id: 'further', kind: 'further' },
    ],
  },
  {
    tier: 3,
    name: 'Gold',
    boxes: [
      // Combat: a raid's boss killed with it in the party.
      { id: 'raid', kind: 'combat' },
      // Masterwork: Master in any work, or an Epic piece made (over days of its own smithing).
      { id: 'master', kind: 'craft' },
      // Teacher: a week at a communal seat.
      { id: 'teacher', kind: 'teacher' },
    ],
  },
];

type TrialRules = Pick<ValleyRules, 'honours' | 'posts'>;

/** The level a trial opens at. */
export const trialLevel = (tier: TrialTier, rules: TrialRules = VALLEY_RULES): number =>
  rules.honours.levels[tier - 1] as number;

/** The trial a box belongs to. */
export function tierOfBox(box: TrialBoxId): TrialTier {
  for (const trial of TRIALS) if (trial.boxes.some((b) => b.id === box)) return trial.tier;
  throw new Error(`unknown trial box ${box}`);
}

/** The boxes of the combat feats and the other things that happen as events (everything else is read off the hours). */
export const EVENT_BOXES: readonly TrialBoxId[] = [
  'dungeon',
  'home',
  'fire',
  'undercroft',
  'further',
  'raid',
];

/** A creature's own hours at work (the mastery hours of V-POST-12) and the hours its seat's work was credited to a project. */
export interface TrialHours {
  scout: number;
  smith: number;
  trade: number;
  /** Effective hours credited to the commons' projects from a communal seat (the Teacher box). */
  seat: number;
}

export const NO_HOURS: TrialHours = { scout: 0, smith: 0, trade: 0, seat: 0 };

const EPS = 1e-9;

/** Whether the creature's hours alone tick a box (the boxes that are read off hours; the event boxes answer false unless a route is hours). */
export function boxMetByHours(
  box: TrialBoxId,
  h: TrialHours,
  rules: TrialRules = VALLEY_RULES,
): boolean {
  const o = rules.honours;
  const best = Math.max(h.scout, h.smith, h.trade);
  switch (box) {
    case 'post':
      return h.scout + h.smith + h.trade + EPS >= o.bronzePostHours;
    case 'home':
      return h.smith + EPS >= o.bronzeSmithHours;
    case 'craft':
      return (
        best + EPS >= (rules.posts.mastery[1]?.hours ?? Infinity) ||
        h.smith + EPS >= o.rareRouteSmithHours
      );
    case 'master':
      return (
        best + EPS >= (rules.posts.mastery[2]?.hours ?? Infinity) ||
        h.smith + EPS >= o.epicRouteSmithHours
      );
    case 'teacher':
      return h.seat + EPS >= o.teacherHours;
    default:
      return false;
  }
}

/** One creature's trial state, as stored: the boxes ticked in each trial (a bit per box, in list order) and when each trial was completed. */
export interface TrialState {
  /** Honours held: 0 none, 1 Bronze, 2 Silver, 3 Gold. */
  honour: 0 | 1 | 2 | 3;
  /** The ceremony the last honour was given at (UTC ms), null before any. */
  honourAt: number | null;
  /** Ticked boxes of Bronze, Silver, Gold (bit `i` is the trial's `i`th box). */
  boxes: [number, number, number];
  /** When all boxes of each trial were ticked (UTC ms), null while some are open. */
  ready: [number | null, number | null, number | null];
  /** The honours already told in a return walk (the paper says "graduated" once). */
  told: 0 | 1 | 2 | 3;
  /** Hours credited from a communal seat (`TrialHours.seat`). */
  seatHours: number;
}

export const emptyTrial = (): TrialState => ({
  honour: 0,
  honourAt: null,
  boxes: [0, 0, 0],
  ready: [null, null, null],
  told: 0,
  seatHours: 0,
});

const fullMask = (tier: TrialTier): number => (1 << (TRIALS[tier - 1]?.boxes.length ?? 0)) - 1;
const bitOf = (box: TrialBoxId): number => {
  const tier = tierOfBox(box);
  return 1 << (TRIALS[tier - 1]?.boxes.findIndex((b) => b.id === box) ?? 0);
};

/** Whether a box of this trial can tick for a creature: at or above the trial's level, and not yet through it. */
export const countsFor = (
  state: TrialState,
  level: number,
  tier: TrialTier,
  rules: TrialRules = VALLEY_RULES,
): boolean => level >= trialLevel(tier, rules) && state.honour < tier;

/** The boxes of a trial that are ticked, in list order. */
export const tickedBoxes = (state: TrialState, tier: TrialTier): boolean[] =>
  (TRIALS[tier - 1]?.boxes ?? []).map(
    (_, i) => ((state.boxes[tier - 1] as number) & (1 << i)) !== 0,
  );

/**
 * Ticks boxes (`stamp` says when each happened: an event's moment, or the moment the hours crossed). Boxes that do not count for this
 * creature (below the trial's level, or already through it) are left alone. A trial whose last box ticks is stamped ready at the latest
 * of the new ticks' stamps. Returns the same state when nothing changed.
 */
export function tick(
  state: TrialState,
  level: number,
  boxes: readonly TrialBoxId[],
  stamp: (box: TrialBoxId) => number,
  rules: TrialRules = VALLEY_RULES,
): TrialState {
  const masks: [number, number, number] = [...state.boxes];
  const ready: [number | null, number | null, number | null] = [...state.ready];
  const latest: [number, number, number] = [0, 0, 0];
  let changed = false;
  for (const box of boxes) {
    const tier = tierOfBox(box);
    if (!countsFor(state, level, tier, rules)) continue;
    const bit = bitOf(box);
    if ((masks[tier - 1] as number) & bit) continue;
    masks[tier - 1] = (masks[tier - 1] as number) | bit;
    latest[tier - 1] = Math.max(latest[tier - 1] as number, stamp(box));
    changed = true;
  }
  if (!changed) return state;
  for (const tier of TRIAL_TIERS) {
    if (
      ready[tier - 1] === null &&
      masks[tier - 1] === fullMask(tier) &&
      (latest[tier - 1] as number) > 0
    ) {
      ready[tier - 1] = latest[tier - 1] as number;
    }
  }
  return { ...state, boxes: masks, ready };
}

/**
 * The boxes the hours tick that are not ticked yet, and the moment each ticked: when the hours crossed during the stretch from `from` to
 * `to` (hours grow evenly across it, which is exact for one pass and close for a long one), else `to` (the box was met earlier but did not
 * count until now, a level reached).
 */
export function hoursTicks(
  state: TrialState,
  level: number,
  before: TrialHours,
  after: TrialHours,
  from: number,
  to: number,
  rules: TrialRules = VALLEY_RULES,
): { box: TrialBoxId; at: number }[] {
  const out: { box: TrialBoxId; at: number }[] = [];
  for (const trial of TRIALS) {
    if (!countsFor(state, level, trial.tier, rules)) continue;
    for (const { id } of trial.boxes) {
      if (!boxMetByHours(id, after, rules)) continue;
      if ((state.boxes[trial.tier - 1] as number) & bitOf(id)) continue;
      out.push({ box: id, at: crossedAt(id, before, after, from, to, rules) });
    }
  }
  return out;
}

/** When a box's hours were met during `from`..`to` (bisection over the evenly growing hours); `to` when already met at `from`. */
export function crossedAt(
  box: TrialBoxId,
  before: TrialHours,
  after: TrialHours,
  from: number,
  to: number,
  rules: TrialRules = VALLEY_RULES,
): number {
  if (boxMetByHours(box, before, rules) || to <= from) return to;
  const at = (f: number): TrialHours => ({
    scout: before.scout + (after.scout - before.scout) * f,
    smith: before.smith + (after.smith - before.smith) * f,
    trade: before.trade + (after.trade - before.trade) * f,
    seat: before.seat + (after.seat - before.seat) * f,
  });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (boxMetByHours(box, at(mid), rules)) hi = mid;
    else lo = mid;
  }
  return Math.min(to, Math.max(from, Math.ceil(from + (to - from) * hi)));
}

/**
 * The ceremony (V-TRIAL-4), from timestamps alone. `nextCeremony(t)` is the first ceremony strictly after `t`. A creature whose next trial
 * was completed at `r` graduates at the first ceremony after `r` (and after its last honour's ceremony, so one honour a ceremony) if that
 * ceremony is not after `now`. Run at any moments in between, or once at the end, the answer is the same.
 */
export function graduate(
  state: TrialState,
  now: number,
  nextCeremony: (after: number) => number,
): { state: TrialState; graduated: { honour: 1 | 2 | 3; at: number }[] } {
  let s = state;
  const graduated: { honour: 1 | 2 | 3; at: number }[] = [];
  while (s.honour < 3) {
    const r = s.ready[s.honour as 0 | 1 | 2];
    if (r === null || r === undefined) break;
    const at = nextCeremony(Math.max(r, s.honourAt ?? Number.NEGATIVE_INFINITY));
    if (at > now) break;
    const honour = (s.honour + 1) as 1 | 2 | 3;
    s = { ...s, honour, honourAt: at };
    graduated.push({ honour, at });
  }
  return { state: s, graduated };
}

/** Holds a completed trial that waits for its ceremony. */
export const waitsForCeremony = (state: TrialState): boolean =>
  state.honour < 3 && state.ready[state.honour as 0 | 1 | 2] !== null;

/** The next trial of a creature (null: Gold is held). */
export const nextTier = (state: TrialState): TrialTier | null =>
  state.honour >= 3 ? null : ((state.honour + 1) as TrialTier);

/** A creature's honours as the state shows them (V-TRIAL-3): only the next trial and its boxes; the title and ribbon come from `honour`. */
export const ValleyTrialViewSchema = v.strictObject({
  /** Honours held: 0 none, 1 Bronze, 2 Silver, 3 Gold. */
  honour: v.picklist([0, 1, 2, 3]),
  /** The next trial (1 Bronze, 2 Silver, 3 Gold), null once Gold is held. */
  tier: v.nullable(v.picklist([1, 2, 3])),
  /** The next trial's boxes ticked, in the order of `TRIALS`. */
  boxes: v.pipe(v.array(v.boolean()), v.maxLength(8)),
  /** Every box ticked: it graduates at the next ceremony. */
  ready: v.boolean(),
});
export type ValleyTrialView = v.InferOutput<typeof ValleyTrialViewSchema>;

export function trialView(state: TrialState): ValleyTrialView {
  const tier = nextTier(state);
  return {
    honour: state.honour,
    tier,
    boxes: tier === null ? [] : tickedBoxes(state, tier),
    ready: waitsForCeremony(state),
  };
}
