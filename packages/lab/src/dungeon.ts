/**
 * A dungeon run in the lab: the day's route is two fights, the camp, two more fights and the floor boss (docs/design/
 * dungeon-paths.md, without the elite and mystery rooms and without the Undercroft, which stays a mystery). Creatures keep
 * their HP from room to room, a knocked-out creature stays out, and the camp's Rest heals the standing creatures by
 * `RULES.dungeon.camp.restBp` of their max HP. A fight that does not defeat the foe in its rounds ends the run.
 */
import {
  RULES,
  createSeededRng,
  dungeonContent,
  int,
  landmarkBossId,
  type Rng,
} from '@creatures/game';
import { fight } from './fight';
import { FOE_IDS, foeAt } from './foes';
import { GAUNTLET, toPlacements, type Pick, type Score } from './search';
import type { BossDef, Placement } from './types';

export type RoomKind = 'fight' | 'camp' | 'boss';
export interface Room {
  readonly kind: RoomKind;
  /** The foe's id (none at the camp). */
  readonly foe?: string;
}

const FOES = FOE_IDS.filter((id) => dungeonContent.foes.find((f) => f.id === id)?.kind === 'foe');
const BOSSES = FOE_IDS.filter(
  (id) => dungeonContent.foes.find((f) => f.id === id)?.kind === 'boss',
);

/** A route: two fights, the camp, two fights, the floor boss (the landmark's fixed boss at a landmark depth). Foes are drawn without repeats. */
export function drawRoute(rng: Rng, depth: number): Room[] {
  const pool = [...FOES];
  const take = (): string => pool.splice(int(rng, pool.length), 1)[0] ?? 'puddle-imp';
  const boss = landmarkBossId(depth) ?? BOSSES[int(rng, BOSSES.length)] ?? 'drowned-warden';
  return [
    { kind: 'fight', foe: take() },
    { kind: 'fight', foe: take() },
    { kind: 'camp' },
    { kind: 'fight', foe: take() },
    { kind: 'fight', foe: take() },
    { kind: 'boss', foe: boss },
  ];
}

export interface RunResult {
  readonly won: boolean;
  /** Fights won (the camp does not count). */
  readonly cleared: number;
  /** Creatures knocked out at the end. */
  readonly knockouts: number;
}

/** One run of `team` along `route` at `depth`. With `rest` false the camp does nothing (what a run would be without it). */
export function runDungeon(
  team: readonly Pick[],
  route: readonly Room[],
  depth: number,
  rest: boolean,
  rng: Rng,
): RunResult {
  const placements: Placement[] = toPlacements(team, GAUNTLET);
  let hp = new Map<string, number>();
  /** Max HP by creature uid, filled by the first fight. */
  const maxHpOf = new Map<string, number>();
  let cleared = 0;
  let knockedOut = 0;
  for (const room of route) {
    if (room.kind === 'camp') {
      if (!rest) continue;
      const healed = new Map(hp);
      // The standing creatures recover a share of their max HP (a knocked-out creature stays out).
      for (const [uid, left] of hp)
        if (left > 0) {
          const max = maxHpOf.get(uid) ?? left;
          healed.set(
            uid,
            Math.min(max, left + Math.floor((max * RULES.dungeon.camp.restBp) / 10_000)),
          );
        }
      hp = healed;
      continue;
    }
    const res = fight(foeAt(room.foe ?? 'puddle-imp', depth), placements, { rng, carryHp: hp });
    for (const f of res.fighters) maxHpOf.set(f.uid, f.maxHp);
    hp = new Map(res.hpLeft);
    knockedOut = res.fighters.filter((f) => f.hp <= 0).length;
    if (!res.won) return { won: false, cleared, knockouts: knockedOut };
    cleared++;
  }
  return { won: true, cleared, knockouts: knockedOut };
}

export interface RunStats {
  readonly runs: number;
  readonly winRate: number;
  /** Mean fights won per run. */
  readonly cleared: number;
  readonly knockouts: number;
}

/** `runs` seeded runs on seeded routes; the same seeds give the same routes and dice with and without the camp. */
export function runStats(
  team: readonly Pick[],
  depth: number,
  rest: boolean,
  runs: number,
  salt: string,
): RunStats {
  let wins = 0,
    cleared = 0,
    ko = 0;
  for (let i = 0; i < runs; i++) {
    const route = drawRoute(createSeededRng(`route:${salt}:${depth}:${i}`), depth);
    const r = runDungeon(team, route, depth, rest, createSeededRng(`run:${salt}:${depth}:${i}`));
    if (r.won) wins++;
    cleared += r.cleared;
    ko += r.knockouts;
  }
  return { runs, winRate: wins / runs, cleared: cleared / runs, knockouts: ko / runs };
}

export interface GauntletStats {
  /** Share of fights that defeated the foe, 0 to 1. */
  readonly winRate: number;
  /** Mean knockouts, and mean share of the team's HP left. */
  readonly knockouts: number;
  readonly hpLeft: number;
  /** Mean share of the foe's HP removed. */
  readonly damageShare: number;
}

/** `runs` seeded single fights of `line` (one row of three) against a foe. */
export function gauntletStats(
  foe: BossDef,
  line: readonly Pick[],
  runs: number,
  salt: string,
): GauntletStats {
  let wins = 0,
    ko = 0,
    left = 0,
    share = 0;
  for (let i = 0; i < runs; i++) {
    const r = fight(foe, toPlacements(line, GAUNTLET), { rng: createSeededRng(`gs:${salt}:${i}`) });
    if (r.won) wins++;
    ko += r.knockouts;
    left += r.fighters.reduce((a, f) => a + f.hp, 0) / r.fighters.reduce((a, f) => a + f.maxHp, 0);
    share += Math.min(1, r.damage / foe.hp);
  }
  return {
    winRate: wins / runs,
    knockouts: ko / runs,
    hpLeft: left / runs,
    damageShare: share / runs,
  };
}

/** A line's score against a foe, in the shape the team search ranks by: wins first, then the foe's HP removed, the team's HP kept and knockouts avoided. */
export function gauntletScore(
  foe: BossDef,
): (line: readonly Pick[], seeds: number, salt: string) => Score {
  return (line, seeds, salt) => {
    const g = gauntletStats(foe, line, seeds, salt);
    return {
      score: 100 * g.winRate + 40 * g.damageShare + 30 * g.hpLeft - 5 * g.knockouts,
      damage: g.damageShare,
      knockouts: g.knockouts,
      reactions: 0,
      blocked: 0,
    };
  };
}

/** A line's score over whole runs at a depth (the camp rests): wins first, then rooms cleared, then fewer knockouts. */
export function runScore(
  depth: number,
): (line: readonly Pick[], seeds: number, salt: string) => Score {
  return (line, seeds, salt) => {
    const r = runStats(line, depth, true, seeds, salt);
    return {
      score: 100 * r.winRate + 12 * r.cleared - 3 * r.knockouts,
      damage: r.cleared,
      knockouts: r.knockouts,
      reactions: 0,
      blocked: 0,
    };
  };
}
