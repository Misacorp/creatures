/**
 * Creature experience in the guild's Durable Object (docs/design/gear-and-creatures-v2.md section 9):
 * every activity that pays a creature (a finished trip, a dungeon run, a raid stage, a Workshop job)
 * goes through `awardExperience`, and the two things that open a closed way (a ribbon, an evolution) go
 * through `settleExperience`. Synchronous and meant to run inside the caller's transaction, so the
 * experience is paid together with whatever earned it and exactly once: the callers are the
 * idempotent claim, run and resolve paths.
 */
import { RULES, addExperience, expToNext, type ExpGain, type XpBoost } from '@creatures/game';
import type { Analytics } from './analytics';
import { speciesOf } from './species';

/**
 * The activities that pay creatures experience (raids take no treats), and the two things that spend what
 * a waiting creature banked (a ribbon, an evolution).
 */
export type ExpSource = 'trip' | 'dungeon' | 'raid' | 'job' | 'ribbon' | 'evolve';

/** What an award did to one creature: shown on the result of the activity that earned it. */
export interface ExperienceView {
  creatureId: string;
  /** The experience the activity paid (a treat already doubled). */
  gained: number;
  /** True when a treat was packed for this activity. */
  treat: boolean;
  levelBefore: number;
  level: number;
  /** Experience banked towards the next level, and what that level needs (null at the top level). */
  exp: number;
  needed: number | null;
  /** The creature waits at a level it may not leave yet (a ribbon, or its evolution) holding the next level's experience. */
  waiting: boolean;
  /** The Gold Ribbon came with this gain (the creature reached the top level). */
  gold: boolean;
  /**
   * What changed the amount (the treat, the day's Boons and Omens) and the total multiplier, for the
   * result's multiplier chip and its breakdown. Absent when nothing did (and on results from before 2026-10-19).
   */
  boost?: XpBoost;
}

type Row = { level: number; exp: number; ribbons: number; species: string };

function readRow(sql: SqlStorage, userId: string, creatureId: string): Row | undefined {
  return sql
    .exec<Row>(
      'SELECT level, exp, ribbons, species FROM creatures WHERE id = ? AND user_id = ?',
      creatureId,
      userId,
    )
    .toArray()[0];
}

function viewOf(
  creatureId: string,
  gained: number,
  treat: boolean,
  before: Row,
  g: ExpGain,
  boost: XpBoost | null,
) {
  const view: ExperienceView = {
    creatureId,
    gained,
    treat,
    levelBefore: before.level,
    level: g.level,
    exp: g.exp,
    needed: g.level >= RULES.experience.maxLevel ? null : expToNext(g.level),
    waiting: g.waiting,
    gold: g.gold,
    ...(boost === null ? {} : { boost }),
  };
  return view;
}

function store(sql: SqlStorage, creatureId: string, g: ExpGain): void {
  sql.exec(
    'UPDATE creatures SET level = ?, exp = ?, ribbons = ? WHERE id = ?',
    g.level,
    g.exp,
    g.ribbons,
    creatureId,
  );
}

/**
 * Pays `gained` experience (a treat already counted) to a creature of the player's. A creature that does
 * not exist or is someone else's gets nothing (a stale id never throws inside a claim). Levels up while
 * the way is open, banks the rest at a ribbon or an evolution (`addExperience`) and logs a `creature_exp`
 * event. Returns what happened, or null when the creature was not found. `boost` is what changed the
 * amount (built from the same numbers the caller paid with), passed through to the view.
 */
export function awardExperience(
  sql: SqlStorage,
  analytics: Analytics | undefined,
  userId: string,
  creatureId: string,
  gained: number,
  source: ExpSource,
  treat: boolean,
  boost: XpBoost | null = null,
): ExperienceView | null {
  const before = readRow(sql, userId, creatureId);
  if (before === undefined) return null;
  const species = speciesOf(before.species);
  const g = addExperience(
    { level: before.level, exp: before.exp, ribbons: before.ribbons, levelCap: species.levelCap },
    gained,
  );
  store(sql, creatureId, g);
  analytics?.record(
    {
      kind: 'creature_exp',
      source,
      species: before.species,
      gained,
      treat,
      levelBefore: before.level,
      level: g.level,
      waiting: g.waiting,
    },
    userId,
  );
  if (g.gold) {
    analytics?.record({ kind: 'ribbon', species: before.species, ribbon: 'gold' }, userId);
  }
  return viewOf(creatureId, gained, treat, before, g, boost);
}

/**
 * Spends what a creature banked while it waited, now that the way is open (the ribbon was earned, or the
 * creature evolved so its level cap rose): the same as an award of nothing. Returns the new view.
 */
export function settleExperience(
  sql: SqlStorage,
  analytics: Analytics | undefined,
  userId: string,
  creatureId: string,
  source: 'ribbon' | 'evolve',
): ExperienceView | null {
  return awardExperience(sql, analytics, userId, creatureId, 0, source, false);
}
