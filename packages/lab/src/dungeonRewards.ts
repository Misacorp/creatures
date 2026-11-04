/**
 * What a combat v2 dungeon run pays by depth (Misa, 2026-11-04: rewards and XP grow with depth, the Undercroft alike; the hidden best-of gear roller).
 * A report only: no test asserts these numbers. The gear is the game's own dice (`rollDungeonLoot`, `rollUndercroftChest`) rolled many times on seeded
 * streams; the pack and experience are the lab's runs (`dungeonDays.ts`, `RunResult.reward`) with the game's depth scale (`dungeonResourceBp`, `dungeonXpBp`).
 * Approximations: a creature of the row is taken to have stood in every room of the run (a top creature does, a knocked-out one earns less), and the
 * experience of mystery rooms, the day's weather and treats are left out.
 */
import {
  RULES,
  SINGLE_ROLL,
  createSeededRng,
  dungeonGearSpec,
  dungeonResourceBp,
  dungeonXpBp,
  isLandmark,
  rewardDepth,
  rollDungeonLoot,
  rollUndercroftChest,
  scaleBp,
  undercroftDepth,
  type BestOfSpec,
  type GearItem,
} from '@creatures/game';
import type { DayRun, PlayerDays } from './dungeonDays';
import { BASE_BANDS, KEEPER_GEAR, descentTable, type DescentCell } from './dungeonMeasure';

type Seeded = ReturnType<typeof createSeededRng>;

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const inBand = (b: readonly [number, number], x: number): boolean => x >= b[0] && x <= b[1];
const bandName = (b: readonly [number, number]): string =>
  b[1] === Infinity ? `${b[0]}+` : b[0] === b[1] ? `${b[0]}` : `${b[0]}-${b[1]}`;
const f = (x: number, d = 1): string => x.toFixed(d);
const pct = (x: number): string => `${Math.round(100 * x)}%`;

/** The depths sampled for a band (all of a short band; 41 to 80 for the open one). */
const depthsOf = (b: readonly [number, number]): number[] =>
  Array.from({ length: Math.min(b[1], 80) - b[0] + 1 }, (_, i) => b[0] + i);

interface GearRow {
  pieces: number;
  rarity: Record<'common' | 'rare' | 'epic', number>;
  itemLevel: number;
}

/** The pieces of `n` seeded chests per sampled depth, as a mean over the depths of the band. */
function gearRow(
  band: readonly [number, number],
  n: number,
  chest: (rng: Seeded, depth: number) => GearItem[],
): GearRow {
  const items: GearItem[] = [];
  let chests = 0;
  for (const d of depthsOf(band)) {
    for (let i = 0; i < n; i++) {
      items.push(...chest(createSeededRng(`rewards:${String(d)}:${String(i)}`), d));
      chests++;
    }
  }
  const count = (r: GearItem['rarity']): number => items.filter((x) => x.rarity === r).length;
  return {
    pieces: items.length / chests,
    rarity: {
      common: count('common') / Math.max(1, items.length),
      rare: count('rare') / Math.max(1, items.length),
      epic: count('epic') / Math.max(1, items.length),
    },
    itemLevel: mean(items.map((x) => x.itemLevel)),
  };
}

const mainChest =
  (spec: (d: number) => BestOfSpec) =>
  (rng: Seeded, d: number): GearItem[] =>
    rollDungeonLoot(
      rng,
      d,
      { landmark: isLandmark(d), fullClear: true, bossCleared: true, supplies: 0 },
      'tide',
      spec(d),
    ).gear;

const keeperChest =
  (v2: boolean) =>
  (rng: Seeded, d: number): GearItem[] => {
    const u = undercroftDepth(d, 1);
    return rollUndercroftChest(rng, v2 ? u : d, 'tide', v2 ? dungeonGearSpec(u, 1) : SINGLE_ROLL);
  };

/** Gear of the base floor's chest and the keeper's chest (a won Undercroft level 1), by depth band: pieces, rarity mix, item level; v1 against v2. */
export function gearMarkdown(n = 400): string[] {
  const md = [
    '#### Gear a chest pays by depth band (v1: one plain roll; v2: the hidden best-of roller)',
    '',
    `The base floor's chest of a full clear (certain; a landmark depth has its own odds and item level) and the keeper's chest of a won Undercroft level 1 (a ${pct(KEEPER_GEAR)} chance of gear, so its pieces are a mean over every chest and include the chance of none). ${String(n)} seeded chests per sampled depth (depths 41 to 80 for 41+). The rarity mix is of the pieces kept.`,
    '',
    '| Depth | Chest | Rules | Pieces | Common | Rare | Epic | Item level |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const band of BASE_BANDS) {
    const one = (name: string, chest: string, row: GearRow): void => {
      md.push(
        `| ${bandName(band)} | ${chest} | ${name} | ${f(row.pieces, 2)} | ${pct(row.rarity.common)} | ${pct(row.rarity.rare)} | ${pct(row.rarity.epic)} | ${f(row.itemLevel)} |`,
      );
    };
    one(
      'v1',
      'base',
      gearRow(
        band,
        n,
        mainChest(() => SINGLE_ROLL),
      ),
    );
    one(
      'v2',
      'base',
      gearRow(
        band,
        n,
        mainChest((d) => dungeonGearSpec(d)),
      ),
    );
    if (band[0] >= 8) {
      one('v1', 'keeper', gearRow(band, n, keeperChest(false)));
      one('v2', 'keeper', gearRow(band, n, keeperChest(true)));
    }
  }
  md.push('');
  return md;
}

/** A run's pack as paid under v2: Bait, Essence and scrap scaled at the run's reward depth (`finishRun`). */
const packV2 = (r: DayRun): number => {
  const bp = dungeonResourceBp(rewardDepth(r.depth, r.reward.deepest));
  const k = r.reward.kept;
  return scaleBp(k.bait, bp) + scaleBp(k.essence, bp) + scaleBp(k.scrap, bp);
};
const packV1 = (r: DayRun): number =>
  r.reward.kept.bait + r.reward.kept.essence + r.reward.kept.scrap;
const xpV2 = (r: DayRun): number =>
  scaleBp(r.reward.xp, dungeonXpBp(rewardDepth(r.depth, r.reward.deepest)));

/** Pack units and experience a cleared run pays by depth band, v1 against v2. */
export function runRewardsMarkdown(players: readonly PlayerDays[]): string[] {
  const runs = players.flatMap((p) => p.runs).filter((r) => r.cleared);
  const md = [
    '#### Resources and experience of a cleared run by depth band (the lab runs: the safe player; units are Bait + Essence + scrap)',
    '',
    'Experience is one creature that stood in every room (base amounts of `RULES.experience.dungeon`), before treats and weather. A run that went down is paid at its Undercroft depth.',
    '',
    '| Depth | Runs | Pack v1 | Pack v2 | XP v1 | XP v2 | Resource scale | XP scale |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const band of BASE_BANDS) {
    const of = runs.filter((r) => inBand(band, r.depth));
    if (of.length < 5) {
      md.push(`| ${bandName(band)} | ${String(of.length)} | - | - | - | - | - | - |`);
      continue;
    }
    const p1 = mean(of.map(packV1));
    const p2 = mean(of.map(packV2));
    const x1 = mean(of.map((r) => r.reward.xp));
    const x2 = mean(of.map(xpV2));
    md.push(
      `| ${bandName(band)} | ${String(of.length)} | ${f(p1)} | ${f(p2)} | ${f(x1, 0)} | ${f(x2, 0)} | ${f(p2 / p1, 2)}x | ${f(x2 / x1, 2)}x |`,
    );
  }
  md.push('');
  return md;
}

/** Experience a day for a top creature by week (daily players), against the valley's 120 XP a day from the dungeon (`boss-track.md`, "Touch points"). */
export function xpDayMarkdown(players: readonly PlayerDays[]): string[] {
  const daily = players.filter((p) => p.roster === 'daily');
  const md = [
    '#### XP a day for a top creature, daily players (the valley assumes about 120 XP a day from the dungeon)',
    '',
    'A top creature stands in every room of every run it is in (an upper bound on one creature). "A day" is the week\'s total over 7 days (a day without a run counts as 0). Cleared and lost runs both pay what they earned.',
    '',
    '| Week | Mean depth | XP a day v1 | XP a day v2 | Per run v1 | Per run v2 |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const week of [1, 4, 8, 12, 24]) {
    const runs = daily.flatMap((p) => p.runs.filter((r) => r.week === week));
    const present = daily.filter((p) => (p.depthEnd[week - 1] ?? 0) > 0).length;
    if (runs.length === 0 || present === 0) continue;
    const v1 = runs.reduce((a, r) => a + r.reward.xp, 0) / present / 7;
    const v2 = runs.reduce((a, r) => a + xpV2(r), 0) / present / 7;
    md.push(
      `| ${String(week)} | ${f(mean(runs.map((r) => r.depth)))} | ${f(v1, 0)} | ${f(v2, 0)} | ${f(mean(runs.map((r) => r.reward.xp)), 0)} | ${f(mean(runs.map(xpV2)), 0)} |`,
    );
  }
  md.push('');
  return md;
}

/** Expected gear pieces a won keeper's chest pays at a depth (the chance times the mean kept, by simulation). */
function keeperPieces(depth: number, v2: boolean): number {
  const n = 600;
  let pieces = 0;
  for (let i = 0; i < n; i++) {
    pieces += keeperChest(v2)(
      createSeededRng(`keeper:${String(depth)}:${String(i)}`),
      depth,
    ).length;
  }
  return pieces / n;
}

/**
 * The descent from depth 21 on, by the team's state at the floor's end, v1 against v2: what a won level 1 adds to the pack, with the keeper's gear,
 * and what a defeat takes. v2 scales the whole pack at the Undercroft depth, so the gain and the loss both grow with it.
 */
export function descentMarkdown(players: readonly PlayerDays[]): string[] {
  const runs = players.flatMap((p) => p.runs);
  const out = [
    "#### Is going down worth it late? Level 1, per attempt, by the team's state at the floor's end",
    '',
    "v2 pays the pack at the Undercroft depth, so a win's units and a defeat's loss both grow; the keeper's chest also keeps more gear. Gear is the expected pieces per attempt (win chance x the chest's mean pieces).",
    '',
    '| Depth | State | Win | Gain v1 | Gain v2 | Loss v1 | Loss v2 | Gear v1 | Gear v2 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const band of BASE_BANDS.filter((b) => b[0] >= 21)) {
    const t = descentTable(runs, band, 1);
    const depths = runs
      .filter((r) => r.floor !== null && inBand(band, r.depth))
      .map((r) => r.depth);
    const mid = depths.length === 0 ? band[0] : Math.round(mean(depths));
    const bp = dungeonResourceBp(undercroftDepth(mid, 1)) / 10_000;
    const g1 = keeperPieces(mid, false);
    const g2 = keeperPieces(mid, true);
    for (const [state, c] of Object.entries(t.byShare) as [string, DescentCell][]) {
      if (c.n < 5) continue;
      const win = c.won ?? 0;
      out.push(
        `| ${bandName(band)} (at ${String(mid)}) | ${state} | ${pct(win)} (n ${String(c.n)}) | ${f(c.gain)} | ${f(c.gain * bp)} | ${f(c.loss)} | ${f(c.loss * bp)} | ${f(win * g1, 2)} | ${f(win * g2, 2)} |`,
      );
    }
  }
  out.push('');
  return out;
}

/** The whole rewards section of the dungeon report. */
export function rewardsMeasureMarkdown(players: readonly PlayerDays[]): string[] {
  const spec = [1, 8, 21, 41, 61].map((d) => `${String(d)}: ${JSON.stringify(dungeonGearSpec(d))}`);
  return [
    '### What combat v2 pays by depth (hidden best-of gear, resources and XP scaled; Misa, 2026-11-04)',
    '',
    ...gearMarkdown(),
    ...runRewardsMarkdown(players),
    ...xpDayMarkdown(players),
    ...descentMarkdown(players),
    `Spec by depth (rolls, keep): ${spec.join('; ')}. Resources +${String(RULES.dungeon.depthRewards.resources.perDepthBp / 100)}% a depth, XP +${String(RULES.dungeon.depthRewards.xp.perDepthBp / 100)}% a depth.`,
    '',
  ];
}
