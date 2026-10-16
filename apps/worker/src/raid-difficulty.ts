/**
 * The raid difficulty version: which set of rules the numbers of a raid week were declared with.
 *
 * BUMP THIS whenever the rules that decide a raid week's boss numbers change: the Boss Rank curve
 * (`rankFactorBp` and friends), the placement of a new server (`placementRank`), the Festival ease,
 * `scaleBoss`, or anything else that turns a week's rank and head count into the boss's HP and Attack.
 *
 * Each raid week stores the version it was declared with (`raid_weeks.difficulty_version`, fixed when
 * the week gets its Boss Rank). While a week is still open and no stage of it has resolved, a week
 * with an older version than this is re-declared on the guild object's next normal path (see
 * `raid-redeclare.ts`): its rank and effective rank are recomputed with the current rules and the
 * version is stored. Same boss, same week id, same sign-ups, board, abilities and player choices.
 * The boss's HP pool and Attack are scaled from the rank and the head count when Phase 1 resolves,
 * so they follow the current rules by themselves. A week with a resolved stage, and every past week,
 * keeps what it was fought with and is never touched.
 *
 * 0 is what weeks created before this column existed have. Only ever raise it.
 */
export const RAID_DIFFICULTY_VERSION = 2;
