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
  roomXpSource,
  catchBreath,
  createSeededRng,
  dungeonEvents,
  dungeonKeepsake,
  eventOptionBlock,
  eventOptionCosts,
  generateDungeonMap,
  generateUndercroftMap,
  isLandmark,
  keptOnDefeat,
  landmarkBossId,
  nodeLoot,
  mapNode,
  reachableNodes,
  resolveEvent,
  undercroftBaseFloors,
  undercroftOpen,
  type DungeonEventDef,
  type DungeonMap,
  type DungeonRunPack,
  type MapNode,
  type Rng,
} from '@creatures/game';
import { fight } from './fight';
import { LAB_RULES } from './rules';
import { foeAt } from './foes';
import { packOf, type FoeKnobs } from './dungeonKnobs';
import { GAUNTLET, toPlacements, type Mode, type Pick, type Score } from './search';
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
  /**
   * The old v2 descent, kept for comparison: the standing recover on the way down and a knocked-out creature stays out. The game no
   * longer plays it: since 2026-11-04 both rules versions revive on the way down (the game's `catchBreath`, the default here).
   */
  readonly standingOnlyDescent?: boolean;
  /** Go down only while the team's mean share of HP (the standing's) is above this (the policy's choice; `smart` defaults to 0.5, `first` always goes). */
  readonly descendAbove?: number;
  /** Follow the game: a next Undercroft level opens only when the keeper's floor was cracked (`map.crack`); the default plays `levels` levels. */
  readonly followCrack?: boolean;
  /**
   * Go down only while the team's share of HP at the end of the floor (all of the team's creatures, a knocked-out one counts 0, before the
   * breath on the way down) is above this: a player who looks at the team's bars. 2 never goes down. Alongside `descendAbove`, both must hold.
   */
  readonly descendShare?: number;
  /**
   * Measure the choice: after the floor boss falls, play the Undercroft levels (up to `levels`, a next one whether or not the floor was cracked)
   * whatever the player's rule says, and record each in `levelLog`. What the rule would have done is still what `entered` and `undercroft` count.
   */
  readonly probe?: boolean;
  /** The arena: rows and columns of the team and the foe (the dungeon's row of three by default; a four-slot team is `1 x 4`). */
  readonly mode?: Mode;
  /** Foe numbers moved for a report (`dungeonKnobs.ts`): the game's own when absent. */
  readonly foes?: FoeKnobs;
}

/** The pack the run's rooms paid, in units (Bait, Essence and scrap), as the worker counts it. */
const unitsOf = (p: DungeonRunPack): number => p.bait + p.essence + p.scrap;

/** One Undercroft level a run entered (or, with `probe`, was made to enter). */
export interface LevelLog {
  readonly level: number;
  /** The team's share of HP and the creatures knocked out when the level was offered (before the breath on the way down). */
  readonly share: number;
  readonly knocked: number;
  /** The player's rule would have gone down (false: only the probe went). */
  readonly chosen: boolean;
  /** The keeper was beaten. */
  readonly won: boolean;
  /** The level's floor was cracked (a next level was open). */
  readonly cracked: boolean;
  /** Units in the pack on the way down; what the level paid into it if it was won; what a defeat there would take from the pack (half, rounded up) if it was lost. */
  readonly packIn: number;
  readonly gain: number;
  readonly lost: number;
}

export interface RunResult {
  /** The floor boss was beaten: the run is cleared. */
  readonly cleared: boolean;
  /** Undercroft levels whose keeper was beaten. */
  readonly undercroft: number;
  /** Fights won, the floor boss and the Undercroft included. */
  readonly fights: number;
  /** Fights played, a lost one included (the run's last, when it ended in a wipe). */
  readonly played: number;
  /** Undercroft levels entered. */
  readonly entered: number;
  /** Creatures knocked out at the end. */
  readonly knockouts: number;
  /** Keepsakes held at the end. */
  readonly keepsakes: number;
  /** What happened at the camp: 'rest', 'swap', 'keepsake', or none (a run that did not reach it). */
  readonly camp: string | null;
  /** The state of the team when the floor boss fell (null: not cleared), and the units in the pack then. */
  readonly floorEnd: {
    readonly share: number;
    readonly knocked: number;
    readonly pack: number;
  } | null;
  /** The Undercroft levels entered (with `probe`, every level it played). */
  readonly levelLog: readonly LevelLog[];
  /**
   * What the run would pay (the rewards report, `dungeonRewards.ts`; no fight reads it): the base experience one creature that stood in the
   * row for every room earns (before the depth scale), the deepest Undercroft level played (0: none), and the pack as it is paid (half after a defeat).
   */
  readonly reward: { readonly xp: number; readonly deepest: number; readonly kept: DungeonRunPack };
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

/**
 * The HP of a row after the way down: the game's `catchBreath` (the standing recover `catchBreathBp`, a knocked-out creature gets back up at
 * `reviveBp`; what the game plays on both rules versions since 2026-11-04), and with `standingOnly` the old v2 rule, kept for comparison: a
 * knocked-out creature stays at 0 until a camp swaps it.
 */
export function descentBreathOf(
  before: Readonly<Record<string, number>>,
  hpMax: Readonly<Record<string, number>>,
  standingOnly: boolean,
): Record<string, number> {
  const caught = catchBreath(before, hpMax);
  if (!standingOnly) return caught;
  return Object.fromEntries(
    Object.entries(caught).map(([id, hp]) => [id, (before[id] ?? 0) <= 0 ? (before[id] ?? 0) : hp]),
  );
}

const share = (hp: number, max: number): number => (max > 0 ? hp / max : 0);

const addUnits = (a: DungeonRunPack, b: DungeonRunPack): DungeonRunPack => ({
  bait: a.bait + b.bait,
  essence: a.essence + b.essence,
  scrap: a.scrap + b.scrap,
});

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
  const mode = options.mode ?? GAUNTLET;
  let row: Pick[] = [...team];
  const bench: Pick[] = [...(options.bench ?? [])];
  let placements = toPlacements(row, mode);
  let hp = new Map<string, number>();
  const maxHp = new Map<string, number>();
  const held: string[] = [];
  const curses: { stat: 'hp' | 'atk'; bp: number }[] = [];
  let fights = 0;
  let played = 0;
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

  const basePack = packOf(options.foes?.base);
  const underPack = packOf(options.foes?.undercroft ?? options.foes?.base);
  /** The Undercroft level a walk is in (0: the base floors). */
  let level = 0;
  let pack: DungeonRunPack = { bait: 0, essence: 0, scrap: 0 };
  /** The base experience of the cleared rooms, for one creature that stood in the row for all of them. */
  let xp = 0;
  let deepestLevel = 0;
  /** What the player's own rule pays (a probe's unchosen levels are played but not paid): the pack, and whether the walk counts now. */
  let paid: DungeonRunPack = { bait: 0, essence: 0, scrap: 0 };
  let counting = true;
  const bank = (loot: DungeonRunPack): void => {
    pack = addUnits(pack, loot);
    if (counting) paid = addUnits(paid, loot);
  };

  const foeFor = (id: string, d: number, kind: MapNode['kind'], signature: boolean): BossDef => {
    const fold = foeFold(held, curses, row);
    const arena = foeAt(id, d, { signature }, level > 0 ? underPack : basePack);
    const base: BossDef = { ...arena, rows: mode.rows, cols: mode.cols };
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
    played++;
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
        placements = toPlacements(row, mode);
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
        if (counting) xp += RULES.experience.dungeon.cache;
        bank(nodeLoot('cache', level));
      } else if (node.kind === 'mystery') meetEvent(node);
      else if (node.kind === 'camp') atCamp();
      else {
        const foeId =
          node.kind === 'boss' && !keeper ? (landmarkBossId(d) ?? node.foeId) : node.foeId;
        if (foeId === undefined) return false;
        if (!play(foeFor(foeId, d, node.kind, node.kind === 'boss' && (keeper || isLandmark(d)))))
          return false;
        bank(nodeLoot(node.kind, level));
        const source = roomXpSource(node.kind, level);
        if (counting && source !== null) xp += RULES.experience.dungeon[source];
        if (node.kind === 'boss') {
          // The main boss's chest also puts the clear's Essence and a landmark's Essence and scrap in the pack (`openMainChest`).
          if (level === 0)
            bank({
              bait: 0,
              essence:
                RULES.dungeon.fullClear.essence +
                (isLandmark(d) ? RULES.dungeon.landmark.essence : 0),
              scrap: isLandmark(d) ? RULES.dungeon.landmark.scrap : 0,
            });
          return true;
        }
      }
    }
  };

  const map = generateDungeonMap(rng);
  const cleared = walk(map, depth, false);
  /** The mean share of max HP of the whole team, a knocked-out creature counting 0. */
  const teamShare = (): number => {
    const ids = uids();
    return ids.length === 0
      ? 0
      : ids.reduce((a, u) => a + share(hpOf(u), maxHp.get(u) ?? hpOf(u)), 0) / ids.length;
  };
  const knocked = (): number => uids().filter((u) => hpOf(u) <= 0).length;
  let undercroft = 0;
  let entered = 0;
  const levelLog: LevelLog[] = [];
  const floorEnd = cleared ? { share: teamShare(), knocked: knocked(), pack: unitsOf(pack) } : null;
  if (cleared && undercroftOpen(depth)) {
    const threshold = options.descendAbove ?? (smart ? 0.5 : undefined);
    const bonus = options.foes?.undercroftBonus ?? RULES.dungeon.undercroft.depthBonus;
    // What the player's rule says: it stops at the first level it would not go down (or whose floor was not cracked).
    let going = true;
    for (let lv = 1; lv <= (options.levels ?? 0); lv++) {
      const before = Object.fromEntries(uids().map((u) => [u, hpOf(u)]));
      const shareBefore = teamShare();
      const knockedBefore = knocked();
      hp = new Map(
        Object.entries(descentBreathOf(before, maxRecord(), options.standingOnlyDescent === true)),
      );
      if (standing().length === 0) break;
      if (threshold !== undefined && health() <= threshold) going = false;
      if (options.descendShare !== undefined && shareBefore <= options.descendShare) going = false;
      if (!going && options.probe !== true) break;
      const under = generateUndercroftMap(rng, {
        level: lv,
        floors: undercroftBaseFloors(depth, lv),
        marks: [],
      });
      if (going) entered++;
      level = lv;
      counting = going;
      if (going) deepestLevel = lv;
      const packIn = unitsOf(pack);
      const won = walk(under, depth + bonus * lv, true);
      const gain = won ? unitsOf(pack) - packIn : 0;
      const lost = won ? 0 : unitsOf(pack) - unitsOf(keptOnDefeat(pack));
      levelLog.push({
        level: lv,
        share: shareBefore,
        knocked: knockedBefore,
        chosen: going,
        won,
        cracked: under.crack === true,
        packIn,
        gain,
        lost,
      });
      if (!won) break;
      if (going) undercroft++;
      if (options.followCrack && under.crack !== true) going = false;
      if (!going && options.probe !== true) break;
    }
  }
  return {
    cleared,
    undercroft,
    fights,
    played,
    entered,
    knockouts: knocked(),
    keepsakes: held.length,
    camp: campChoice,
    floorEnd,
    levelLog,
    reward: {
      xp,
      deepest: deepestLevel,
      kept: !cleared || levelLog.some((l) => l.chosen && !l.won) ? keptOnDefeat(paid) : paid,
    },
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
