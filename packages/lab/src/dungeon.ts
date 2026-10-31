/**
 * A dungeon run in the lab, on the shipped map (docs/design/dungeon-paths.md; Misa, 2026-10-28: model that map more
 * faithfully). The day's map is the game's own (`generateDungeonMap`): seven floors from an entrance to the floor boss,
 * two or three rooms a floor (fights, elites, mystery rooms, caches), the camp halfway, and paths that fork and meet.
 * A run picks its path room by room, plays the fights on the lab's engine with HP carried from room to room, meets the
 * mystery rooms (`resolveEvent`, the game's own events), holds keepsakes, and at the camp chooses one of Rest, Swap
 * (a creature from a small bench) or a keepsake. A **clear is beating the floor boss**: heading home is not a clear, so
 * the policy never does. After the boss it may go down into the Undercroft (from depth 8), where the foes are scaled as
 * if the depth were higher and nothing rests (`generateUndercroftMap`).
 *
 * Two policies: `first` takes the first exit, rests at the camp and takes the first free option (a team that does
 * not plan), and `smart` is a player who does (a plan from what the lab can measure): prefer rooms that cost no
 * HP (a cache, a mystery room's free option), then the fight the team is strongest against; take an elite only when
 * healthy and strong against it (it gives a keepsake); at the camp swap in a bench creature for one that is knocked out or
 * nearly so, else rest when hurt, else take the better keepsake.
 *
 * What the lab leaves out, on purpose: room modifiers (Flooded, Thorns and the rest), rare rooms, carved doors and marks,
 * the loot and the pack, experience, the Sealed Vault, and the shipped enrage. Keepsakes are applied as they come
 * out for the foe, because the lab's fights have no team stat folds: a keepsake's team Attack is the same share off the foe's HP,
 * its team HP the same share off the foe's Attack (an element's keepsake counts the share of the team of that element),
 * a crit point is a full point of Attack (a crit deals 2x, R7.1). That is close, not exact, and it is enough to read a clear rate.
 */
import {
  RULES,
  campOffers,
  campRest,
  catchBreath,
  createSeededRng,
  dungeonEvents,
  dungeonKeepsake,
  eventOptionBlock,
  eventOptionCosts,
  generateDungeonMap,
  generateUndercroftMap,
  isLandmark,
  landmarkBossId,
  mapNode,
  reachableNodes,
  resolveEvent,
  undercroftBaseFloors,
  undercroftDepth,
  undercroftOpen,
  type DungeonEventDef,
  type DungeonMap,
  type MapNode,
  type Rng,
} from '@creatures/game';
import { fight } from './fight';
import { LAB_RULES } from './rules';
import { foeAt } from './foes';
import { GAUNTLET, toPlacements, type Pick, type Score } from './search';
import { formStats } from './species';
import type { BossDef } from './types';

/**
 * The lab's all-round team: a Setter, a Payoff and a Guard in the row (the shape of the classic line, with talents and
 * Knacks chosen for the whole dungeon), and a small bench for the camp's Swap: a ward Support and a Guard. Found by the
 * lab's team search over legal rosters (the best average clear over several depths with the `smart` policy), then
 * written down. The report reads three teams: the classic line, this team without a plan (`first`, no bench: "the best
 * fixed team") and this team with the policy and the bench.
 */
export const ALL_ROUND_TEAM: readonly Pick[] = [
  { formId: 'ancientshell', knack: 'steady-mark', talents: ['stubborn'] },
  { formId: 'pyrelynx', knack: 'guards-shadow', talents: ['first-pounce'] },
  { formId: 'bogwarden', knack: 'wide-reach', talents: ['long-shadow'] },
];
export const ALL_ROUND_BENCH: readonly Pick[] = [
  { formId: 'lanternfin', knack: 'lantern-glow', talents: ['odd-one-out'] },
  { formId: 'fogwyrm', knack: 'none', talents: ['unbothered'] },
];

export type Policy = 'first' | 'smart';

export interface RunOptions {
  readonly policy: Policy;
  /** Creatures a swap at the camp can bring in, in the order the policy tries them. */
  readonly bench?: readonly Pick[];
  /** False: the camp does nothing (what a run would be without it). */
  readonly rest?: boolean;
  /** Undercroft levels to try after the floor boss (0 for none; level 2 is played as if the first keeper's floor were cracked). */
  readonly levels?: number;
}

export interface RunResult {
  /** The floor boss was beaten: the run is cleared. */
  readonly cleared: boolean;
  /** Undercroft levels whose keeper was beaten. */
  readonly undercroft: number;
  /** Fights won, the floor boss and the Undercroft included. */
  readonly fights: number;
  /** Creatures knocked out at the end. */
  readonly knockouts: number;
  /** Keepsakes held at the end. */
  readonly keepsakes: number;
  /** What happened at the camp: 'rest', 'swap', 'keepsake', or none (a run that did not reach it). */
  readonly camp: string | null;
}

// ---------- keepsakes in the lab ----------

/** What the run's keepsakes and curses do to a foe, in basis points of its numbers (see the file comment for what is approximated). */
export function foeFold(
  held: readonly string[],
  curses: readonly { readonly stat: 'hp' | 'atk'; readonly bp: number }[],
  row: readonly Pick[],
): { hpBp: number; atkBp: number } {
  let hp = 10_000;
  let atk = 10_000;
  const scale = (value: number, bp: number) =>
    Math.max(1, Math.floor((value * (10_000 + bp)) / 10_000));
  const inverse = (value: number, factor: number) =>
    Math.max(1, Math.floor((value * 10_000) / factor));
  const shareOf = (element: string | undefined, role: string | undefined): number => {
    if (row.length === 0) return 0;
    const n = row.filter((p) => {
      const s = formStats(p.formId, p.level ?? 25);
      return (
        (element === undefined || s.element === element) && (role === undefined || s.role === role)
      );
    }).length;
    return n / row.length;
  };
  for (const id of held) {
    for (const e of dungeonKeepsake(id)?.effects ?? []) {
      if (e.op === 'team_stat') {
        const factor = 10_000 + Math.floor(e.bp * shareOf(e.element, e.role));
        if (e.stat === 'atk') hp = inverse(hp, factor);
        if (e.stat === 'hp') atk = inverse(atk, factor);
      } else if (e.op === 'team_crit') {
        hp = inverse(hp, 10_000 + Math.floor((e.chanceBp * (LAB_RULES.critBp - 10_000)) / 10_000));
      } else if (e.op === 'foe_stat') {
        if (e.stat === 'hp') hp = scale(hp, e.bp);
        else atk = scale(atk, e.bp);
      }
    }
  }
  for (const c of curses) {
    if (c.stat === 'hp') hp = scale(hp, c.bp);
    else atk = scale(atk, c.bp);
  }
  return { hpBp: hp, atkBp: atk };
}

/** A foe with its HP and Attack scaled (basis points of its own). */
function scaled(foe: BossDef, hpBp: number, atkBp: number): BossDef {
  return {
    ...foe,
    hp: Math.max(1, Math.floor((foe.hp * hpBp) / 10_000)),
    atk: Math.max(1, Math.floor((foe.atk * atkBp) / 10_000)),
  };
}

// ---------- one run ----------

const share = (hp: number, max: number): number => (max > 0 ? hp / max : 0);

/**
 * One run of `team` (the row, three creatures) at `depth`: the day's map from `rng`, then the floor boss and, if
 * asked, Undercroft levels. All dice come from `rng` (the path policy's look-ahead uses its own seeded streams).
 */
export function runMap(
  team: readonly Pick[],
  depth: number,
  rng: Rng,
  options: RunOptions,
): RunResult {
  const smart = options.policy === 'smart';
  const restOn = options.rest ?? true;
  let row: Pick[] = [...team];
  const bench: Pick[] = [...(options.bench ?? [])];
  let placements = toPlacements(row, GAUNTLET);
  let hp = new Map<string, number>();
  const maxHp = new Map<string, number>();
  const held: string[] = [];
  const curses: { stat: 'hp' | 'atk'; bp: number }[] = [];
  let fights = 0;
  let campChoice: string | null = null;
  let lookSeed = 0;

  const uids = (): string[] => placements.map((p, i) => `${p.owner}:${p.formId}:${String(i)}`);
  const hpOf = (uid: string): number => hp.get(uid) ?? maxHp.get(uid) ?? 1;
  const standing = (): string[] => uids().filter((u) => hpOf(u) > 0);
  /** The mean share of max HP of the creatures still standing (1 before the first fight). */
  const health = (): number => {
    const alive = standing();
    if (alive.length === 0) return 0;
    return alive.reduce((a, u) => a + share(hpOf(u), maxHp.get(u) ?? hpOf(u)), 0) / alive.length;
  };

  const foeFor = (id: string, d: number, kind: MapNode['kind'], signature: boolean): BossDef => {
    const fold = foeFold(held, curses, row);
    const base = foeAt(id, d, { signature });
    const elite = kind === 'elite' ? RULES.dungeon.elite : { hpBp: 10_000, atkBp: 10_000 };
    return scaled(
      base,
      Math.floor((fold.hpBp * elite.hpBp) / 10_000),
      Math.floor((fold.atkBp * elite.atkBp) / 10_000),
    );
  };

  /** Play a fight for real; the carried HP is updated. */
  const play = (foe: BossDef): boolean => {
    const res = fight(foe, placements, { rng, carryHp: hp });
    for (const f of res.fighters) maxHp.set(f.uid, f.maxHp);
    hp = new Map(res.hpLeft);
    if (res.won) fights++;
    return res.won;
  };

  /** What a fight would cost the team, from a few look-ahead fights on seeded streams: the chance to win and the share of HP lost (a lost fight loses all). */
  const look = (foe: BossDef): { win: number; loss: number } => {
    const n = 4;
    let wins = 0;
    let loss = 0;
    lookSeed++;
    for (let i = 0; i < n; i++) {
      const res = fight(foe, placements, {
        rng: createSeededRng(`look:${String(lookSeed)}:${String(i)}`),
        carryHp: hp,
      });
      const before = res.fighters.reduce((a, f) => a + (hp.get(f.uid) ?? f.maxHp), 0);
      const after = res.fighters.reduce((a, f) => a + f.hp, 0);
      if (res.won) {
        wins++;
        loss += before > 0 ? 1 - after / before : 1;
      } else loss += 1;
    }
    return { win: wins / n, loss: loss / n };
  };

  const eventOf = (node: MapNode): DungeonEventDef | undefined =>
    dungeonEvents.find((e) => e.id === node.eventId);

  const eventCtx = () => {
    const hpNow: Record<string, number> = {};
    const hpMax: Record<string, number> = {};
    for (const u of uids()) {
      hpNow[u] = hpOf(u);
      hpMax[u] = maxHp.get(u) ?? hpOf(u);
    }
    return { hp: hpNow, hpMax, keepsakes: held };
  };

  /** The option of a mystery room the policy takes: one that costs nothing, preferring a heal when hurt, then a keepsake. */
  const pickOption = (event: DungeonEventDef): number => {
    const ctx = eventCtx();
    const score = (i: number): number => {
      const o = event.options[i];
      if (o === undefined || eventOptionBlock(o, ctx) !== null) return -100;
      if (eventOptionCosts(o)) return -50;
      if (o.effects.some((e) => e.op === 'send_home')) return -40;
      let v = 0;
      for (const e of o.effects) {
        if (e.op === 'heal') v += (1 - health()) * 4;
        if (e.op === 'keepsake') v += 1;
        if (e.op === 'xp') v += 0.1;
      }
      return v;
    };
    if (!smart) return score(0) > -50 ? 0 : 1;
    return score(1) > score(0) ? 1 : 0;
  };

  const meetEvent = (node: MapNode): void => {
    const event = eventOf(node);
    if (event === undefined) return;
    const option = pickOption(event);
    const res = resolveEvent(event, option, eventCtx(), rng);
    hp = new Map(Object.entries(res.hp).filter(([u]) => uids().includes(u)));
    for (const id of res.keepsakesGained) held.push(id);
    for (const c of res.curses ?? [])
      for (const e of c.effects) curses.push({ stat: e.stat, bp: e.bp });
  };

  const atCamp = (): void => {
    if (!restOn) {
      campChoice = 'none';
      return;
    }
    const ids = uids();
    const downs = ids.filter((u) => hpOf(u) <= 0);
    const weakest = [...standing()].sort(
      (a, b) => share(hpOf(a), maxHp.get(a) ?? 1) - share(hpOf(b), maxHp.get(b) ?? 1),
    )[0];
    const lowShare = weakest === undefined ? 1 : share(hpOf(weakest), maxHp.get(weakest) ?? 1);
    const swapOut = downs[0] ?? (lowShare < 0.3 ? weakest : undefined);
    if (smart && swapOut !== undefined && bench.length > 0) {
      const slot = ids.indexOf(swapOut);
      const next = bench.shift();
      if (next !== undefined && slot >= 0) {
        row = row.map((p, i) => (i === slot ? next : p));
        placements = toPlacements(row, GAUNTLET);
        hp = new Map([...hp].filter(([u]) => uids().includes(u)));
        campChoice = 'swap';
        return;
      }
    }
    if (smart && health() >= 0.75 && downs.length === 0) {
      const offers = campOffers(rng, held);
      // The better of two keepsakes: the broad Attack and HP charm first, then the rest in content order.
      const best = [...offers].sort(
        (a, b) => Number(b === 'wayfarer-charm') - Number(a === 'wayfarer-charm'),
      )[0];
      if (best !== undefined) {
        held.push(best);
        campChoice = 'keepsake';
        return;
      }
    }
    const healed = campRest(Object.fromEntries(ids.map((u) => [u, hpOf(u)])), maxRecord());
    hp = new Map(Object.entries(healed));
    campChoice = 'rest';
  };

  const maxRecord = (): Record<string, number> =>
    Object.fromEntries(uids().map((u) => [u, maxHp.get(u) ?? hpOf(u)]));

  /** The node the policy steps to next. */
  const choose = (map: DungeonMap, at: string | null, d: number): MapNode | undefined => {
    const options = reachableNodes(map, at)
      .map((id) => mapNode(map, id))
      .filter((n): n is MapNode => n !== undefined);
    if (!smart || options.length <= 1) return options[0];
    let best: MapNode | undefined;
    let bestValue = -Infinity;
    for (const n of options) {
      let value: number;
      if (n.kind === 'cache') value = 0.05;
      else if (n.kind === 'mystery') value = 0.02 + (1 - health()) * 0.3;
      else if (n.kind === 'camp') value = 0;
      else {
        const foeId = n.foeId;
        if (foeId === undefined) continue;
        const est = look(foeFor(foeId, d, n.kind, false));
        value = -est.loss;
        if (n.kind === 'elite')
          value = health() >= 0.75 && est.win >= 0.75 ? value + 0.12 : value - 0.6;
      }
      if (value > bestValue) {
        bestValue = value;
        best = n;
      }
    }
    return best ?? options[0];
  };

  /** Walk one map to its last room; true when its floor boss (or keeper) is beaten. */
  const walk = (map: DungeonMap, d: number, keeper: boolean): boolean => {
    let at: string | null = null;
    for (;;) {
      const node = choose(map, at, d);
      if (node === undefined) return false;
      at = node.id;
      if (node.kind === 'cache') {
        /* free loot, nothing for the fight */
      } else if (node.kind === 'mystery') meetEvent(node);
      else if (node.kind === 'camp') atCamp();
      else {
        const foeId =
          node.kind === 'boss' && !keeper ? (landmarkBossId(d) ?? node.foeId) : node.foeId;
        if (foeId === undefined) return false;
        if (!play(foeFor(foeId, d, node.kind, node.kind === 'boss' && (keeper || isLandmark(d)))))
          return false;
        if (node.kind === 'boss') return true;
      }
    }
  };

  const map = generateDungeonMap(rng);
  const cleared = walk(map, depth, false);
  let undercroft = 0;
  if (cleared && undercroftOpen(depth)) {
    for (let level = 1; level <= (options.levels ?? 0); level++) {
      const caught = catchBreath(Object.fromEntries(uids().map((u) => [u, hpOf(u)])), maxRecord());
      hp = new Map(Object.entries(caught));
      if (smart && health() <= 0.5) break;
      const under = generateUndercroftMap(rng, {
        level,
        floors: undercroftBaseFloors(depth, level),
        marks: [],
      });
      if (!walk(under, undercroftDepth(depth, level), true)) break;
      undercroft++;
    }
  }
  return {
    cleared,
    undercroft,
    fights,
    knockouts: uids().filter((u) => hpOf(u) <= 0).length,
    keepsakes: held.length,
    camp: campChoice,
  };
}

export interface RunStats {
  readonly runs: number;
  /** Share of runs cleared (the floor boss beaten), 0 to 1. Heading home is not a clear. */
  readonly winRate: number;
  /** Mean fights won per run. */
  readonly cleared: number;
  readonly knockouts: number;
  /** Share of all runs that went on to beat the keeper of Undercroft level 1, 2, ... (empty without levels). */
  readonly undercroft: readonly number[];
}

/**
 * `runs` seeded runs at `depth`: the same seeds give the same maps and dice with and without the camp, and at every
 * depth. `rest` false takes the camp's Rest away (the default policy is `smart`, no bench).
 */
export function runStats(
  team: readonly Pick[],
  depth: number,
  rest: boolean,
  runs: number,
  salt: string,
  options: Partial<RunOptions> = {},
): RunStats {
  const levels = options.levels ?? 0;
  let wins = 0,
    fights = 0,
    ko = 0;
  const under = Array.from({ length: levels }, () => 0);
  for (let i = 0; i < runs; i++) {
    const r = runMap(team, depth, createSeededRng(`run:${salt}:${String(depth)}:${String(i)}`), {
      policy: 'smart',
      ...options,
      rest,
    });
    if (r.cleared) wins++;
    fights += r.fights;
    ko += r.knockouts;
    for (let k = 0; k < r.undercroft; k++) under[k] = (under[k] ?? 0) + 1;
  }
  return {
    runs,
    winRate: wins / runs,
    cleared: fights / runs,
    knockouts: ko / runs,
    undercroft: under.map((u) => u / runs),
  };
}

/** A line's score over whole runs at a depth (the camp rests): clears first, then fights won, then fewer knockouts. */
export function runScore(
  depth: number,
  options: Partial<RunOptions> = {},
): (line: readonly Pick[], seeds: number, salt: string) => Score {
  return (line, seeds, salt) => {
    const r = runStats(line, depth, true, seeds, salt, options);
    return {
      score: 100 * r.winRate + 12 * r.cleared - 3 * r.knockouts,
      damage: r.cleared,
      knockouts: r.knockouts,
      reactions: 0,
      blocked: 0,
    };
  };
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
