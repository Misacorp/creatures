import { content, createSeededRng, type Element, RULES } from '@creatures/game';
import { chooseSignUps, type Snapshot } from './economy';
import { openRaidWeek, playWholeWeek, summarizeRaid } from './raid';
import type { RoleStudy } from './role-study';
import { clonePlayer } from './state';

/**
 * The roles ablation (docs/design/attack-patterns.md 4.3 and 4.7, `pnpm sim`'s "Roles" section): the
 * same raid weeks played again with a role's mechanics switched off, so what a Guard or a Support
 * is worth shows as win points. The switches are the study switches of `role-study.ts` and
 * `openRaidWeek`; nothing in the engine changes.
 *
 * Everything is paired: an arm plays the same rosters, sign-ups and fight dice as its reference, so
 * the difference is the switch and little else. Weeks use a spread formation (Guards at evenly
 * spaced places): that is where the Guard's cover and intercept show, and the sim's default
 * formation clumps them in front. Only typical groups (5 to 10 signed up) count.
 */

/** The players bring: their 3 strongest creatures, or a Guard and a Support whenever they own one. */
export type RolePopulation = 'normal' | 'both';

export interface RoleArm {
  id: string;
  label: string;
  population: RolePopulation;
  /** The switch, as `openRaidWeek` options. */
  study: Pick<RoleStudy, 'neutralSupports' | 'supportFx'> & { neutralGuards?: boolean };
}

const ELEMENT_EFFECT: readonly { element: Element; label: string }[] = [
  { element: 'ember', label: 'Ember Stoke' },
  { element: 'spark', label: 'Spark Overcharge' },
  { element: 'tide', label: 'Tide Mend' },
  { element: 'grove', label: 'Grove Mend' },
];

/** The arms, reference first in each population. */
export const ROLE_ARMS: readonly RoleArm[] = [
  { id: 'normal-ref', label: 'Everything on', population: 'normal', study: {} },
  {
    id: 'normal-no-guard',
    label: 'Guard off',
    population: 'normal',
    study: { neutralGuards: true },
  },
  {
    id: 'normal-no-support',
    label: 'Support off',
    population: 'normal',
    study: { neutralSupports: true },
  },
  { id: 'both-ref', label: 'Everything on', population: 'both', study: {} },
  { id: 'both-no-guard', label: 'Guard off', population: 'both', study: { neutralGuards: true } },
  {
    id: 'both-no-support',
    label: 'Support off',
    population: 'both',
    study: { neutralSupports: true },
  },
  ...ELEMENT_EFFECT.map(({ element, label }): RoleArm => ({
    id: `both-no-${element}`,
    label: `${label} off`,
    population: 'both',
    study: { supportFx: { [element]: {} } },
  })),
];

export interface RoleArmResult {
  id: string;
  label: string;
  population: RolePopulation;
  runs: number;
  winRate: number | null;
  /** Share of the finale's creatures that were knocked out. */
  koShare: number | null;
  /** The arm's win rate minus its population's reference, in percentage points (0 for the reference). */
  deltaPoints: number | null;
}

export interface RoleStudyResult {
  arms: RoleArmResult[];
  /** Win points lost with the Guard role neutralised (spread formation, normal rosters); null if not run. */
  guardValue: number | null;
}

export interface RoleStudyOptions {
  seed: string;
  /** Weeks per player count and boss (the sweep's `runsPerCell`). */
  runs: number;
  /** Server sizes to play: the ones whose groups can be typical (5 and 10 of the sweep's). */
  counts: readonly number[];
  snapshots: ReadonlyMap<number, readonly Snapshot[]>;
  /** The arms to play (default: all of `ROLE_ARMS`). */
  arms?: readonly RoleArm[];
  /**
   * The boss pool in basis points of the shipped one (`openRaidWeek`'s `hpScaleBp`). Default
   * `ROLE_STUDY_HP_BP`.
   */
  hpScaleBp?: number;
}

/**
 * The ablation fights bosses with this share of their HP pool (basis points). With spread Guards a
 * typical group wins the shipped bosses about 95% of the time, which leaves a role no room to show
 * (a Guard's saves are knock-outs, and a win rate near the ceiling hides them); a pool 15% bigger
 * puts the reference at about 70%, the level the attack-pattern study measured the roles at
 * (docs/design/attack-patterns.md 4.3), where a role's worth shows as win points. One whole rank up
 * (HP x1.4, Attack x1.2) is too far: the reference then wins about a fifth of its weeks.
 */
export const ROLE_STUDY_HP_BP = 11_500;

/**
 * The ablation plays this many times the sweep's weeks per cell: a role's worth is a difference of a
 * few points between two arms, and its noise (one standard error is about a point at the sweep's own
 * size) is what a target on it is judged against.
 */
export const ROLE_STUDY_RUNS_FACTOR = 2;

/** Server sizes whose groups can fall in 5 to 10 signed up. */
const TYPICAL_COUNTS: readonly number[] = [5, 10];

export function runRoleStudy(options: RoleStudyOptions): RoleStudyResult {
  const arms = options.arms ?? ROLE_ARMS;
  const tally = new Map<string, { runs: number; wins: number; ko: number; creatures: number }>();
  for (const arm of arms) tally.set(arm.id, { runs: 0, wins: 0, ko: 0, creatures: 0 });

  for (const count of options.counts.filter((c) => TYPICAL_COUNTS.includes(c))) {
    const snaps = options.snapshots.get(count) ?? [];
    if (snaps.length === 0) continue;
    for (const boss of content.bosses) {
      for (let i = 0; i < options.runs; i++) {
        const snap = snaps[i % snaps.length] as Snapshot;
        // The sweep's own seeds, so the rosters and the dice are the sweep's.
        const base = `${options.seed}:sweep:${count}:${boss.id}:${i}`;
        const signUps = (): ReturnType<typeof chooseSignUps> =>
          chooseSignUps(
            snap.players.map(clonePlayer),
            createSeededRng(`${base}:signup`),
            createSeededRng(`${base}:order`),
          );
        const size = signUps().length;
        if (size < 5 || size > 10) continue;
        for (const arm of arms) {
          const week = openRaidWeek(boss, signUps(), {
            luck: RULES.combat.luck,
            hpScaleBp: options.hpScaleBp ?? ROLE_STUDY_HP_BP,
            formation: 'spread',
            bringRoles: arm.population === 'both',
            ...(arm.study.neutralGuards === true ? { neutralGuards: true } : {}),
            ...(arm.study.neutralSupports === true ? { neutralSupports: true } : {}),
            ...(arm.study.supportFx === undefined ? {} : { supportFx: arm.study.supportFx }),
          });
          playWholeWeek(week, createSeededRng(`${base}:fight`), createSeededRng(`${base}:loot`));
          const s = summarizeRaid(week);
          const t = tally.get(arm.id);
          if (t === undefined) continue;
          t.runs += 1;
          if (s.finaleWon) t.wins += 1;
          t.ko += s.finale.knockedOut;
          t.creatures += s.finale.creatures;
        }
      }
    }
  }

  const rate = (id: string): number | null => {
    const t = tally.get(id);
    return t === undefined || t.runs === 0 ? null : t.wins / t.runs;
  };
  const results: RoleArmResult[] = arms.map((arm) => {
    const t = tally.get(arm.id) ?? { runs: 0, wins: 0, ko: 0, creatures: 0 };
    const ref = rate(`${arm.population}-ref`);
    const win = rate(arm.id);
    return {
      id: arm.id,
      label: arm.label,
      population: arm.population,
      runs: t.runs,
      winRate: win,
      koShare: t.creatures === 0 ? null : t.ko / t.creatures,
      deltaPoints: win === null || ref === null ? null : (win - ref) * 100,
    };
  });
  const guard = results.find((r) => r.id === 'normal-no-guard');
  return {
    arms: results,
    // Win points lost: positive when the Guard is worth something.
    guardValue: guard?.deltaPoints == null ? null : -guard.deltaPoints,
  };
}
