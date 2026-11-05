/**
 * The gear report (`report -- --gear`, gear-plan section 5): what the lab's gear model (`gear.ts`) does to the numbers, measured before any
 * gear number moves. Four blocks, all printed and none asserted:
 *
 * 1. the loadouts at weeks 4, 12 and 24 (what the model puts on a creature of each role);
 * 2. with gear against without, on the raid (the mixed and dedicated servers' 24 week journeys: slots reached, weekend kills by slot band,
 *    the stuck share) and in the dungeon (the safe player's depth gained a week, the Undercroft's first level cleared by the team's state);
 * 3. the per-line power table: each line the v2 engine counts (and the stat lines), worn by the creatures it fits on a real weekend,
 *    against no gear: the share of the boss's HP the weekend removes;
 * 4. gear-plan OPEN 14, the reaction cap and the x4 reaction lines, from the engine's own factor and the lines' own numbers.
 *
 * The model is expected values (no rolling), so the report is deterministic; the fights are seeded. Everything reads the game's data.
 */
import { RULES, gearContent, gearFx, itemOf, type GearItem, type GearLine } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { dungeonDaysOf } from './dungeonDays';
import {
  DESCENT_BANDS,
  STATE_BUCKETS,
  descentTable,
  gainByBand,
  type StateBucket,
} from './dungeonMeasure';
import {
  LINES_PER_RARITY,
  RARITY_FACTOR,
  baseOf,
  bestPip,
  loadoutAt,
  rarityMix,
  singleLineLoadout,
  type Loadout,
} from './gear';
import { HABITS } from './habits';
import {
  JOURNEY_SERVERS,
  journeyOf,
  journeyWeekend,
  playJourneyWeekend,
  type JourneyServer,
} from './journey';
import { STUCK_WEEKS } from './path';
import { rosterGearLevel } from './roster';
import { formStats } from './species';
import { SLOT_WEEKS } from './track';
import { VALLEY_ROSTER } from './valley';
import type { Placement, Role } from './types';

/** The weeks the report compares, and the roster week they read the item level from (the daily player's). */
export const GEAR_WEEKS = [4, 12, 24] as const;
const ROLES: readonly Role[] = ['setter', 'payoff', 'support', 'guard'];
const pct = (x: number): string => `${Math.round(100 * x)}%`;
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const serverOf = (id: string): JourneyServer => {
  const s = JOURNEY_SERVERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown server ${id}`);
  return s;
};

// ---------- 1. the loadouts ----------

const fxText = (l: Loadout): string => {
  const fx = Object.entries(l.fx).map(([k, v]) => `${k} ${v === true ? 'yes' : v}`);
  const s = l.stats;
  const stats = [
    s.atk ? `atk +${s.atk}` : '',
    s.hp ? `hp +${s.hp}` : '',
    s.spd ? `spd +${s.spd}` : '',
    s.critChanceBp ? `crit +${s.critChanceBp / 100} pts` : '',
    s.critDamageBp ? `crit dmg +${s.critDamageBp / 100} pts` : '',
  ].filter(Boolean);
  return [...stats, ...fx].join(', ') || 'nothing';
};

function loadoutsMarkdown(): string[] {
  const md = [
    '#### The loadouts (expected values, a Tide creature of each role)',
    '',
    "Item level is the daily player's average worn level of the week (`roster-profile.json`); the model puts a Hat and a Scarf of the creature's element and its role's Charm on it, at the rarities of `rarityMix`, with the lines the pool weights make likely (`gear.ts`). Stats are of a level 25 stage 1 form.",
    '',
    '| Week | Item level | Best pip | Pieces | Role | Worn (expected) |',
    '| ---: | ---: | --- | --- | --- | --- |',
  ];
  for (const w of GEAR_WEEKS) {
    const il = rosterGearLevel(VALLEY_ROSTER, 'daily', w, 'expected');
    for (const role of ROLES)
      md.push(
        `| ${w} | ${il} | ${['I', 'II', 'III', 'IV', 'V'][bestPip(il)]} | ${rarityMix(il).join(', ')} | ${role} | ${fxText(loadoutAt(il, role, 'tide'))} |`,
      );
  }
  md.push('');
  return md;
}

// ---------- 2. with and without: the raid ----------

interface RaidRow {
  readonly stuck: number;
  readonly reached: Record<number, number>;
  readonly bands: Record<string, number>;
  readonly kills: Record<number, number>;
}

const SLOT_BANDS: readonly (readonly [number, number])[] = [
  [1, 5],
  [6, 10],
  [11, 15],
];

function raidRow(serverId: string, n: number, gear: boolean): RaidRow {
  const server = serverOf(serverId);
  const paths = Array.from({ length: n }, (_, i) =>
    journeyOf(server, 'expected', i, VALLEY_ROSTER, gear ? { gear: true } : {}, HABITS),
  );
  const reached: Record<number, number> = {};
  const kills: Record<number, number> = {};
  for (const w of GEAR_WEEKS) {
    reached[w] = mean(paths.map((p) => Math.max(0, ...p.fought.slice(0, w))));
    kills[w] = mean(paths.map((p) => p.won.slice(0, w).filter(Boolean).length));
  }
  const bands: Record<string, number> = {};
  for (const [a, b] of SLOT_BANDS) {
    let won = 0;
    let all = 0;
    for (const p of paths)
      p.fought.forEach((slot, i) => {
        if (slot >= a && slot <= b) {
          all++;
          if (p.won[i]) won++;
        }
      });
    bands[`${a}-${b}`] = all === 0 ? NaN : won / all;
  }
  return {
    stuck: paths.filter((p) => p.longestRun > STUCK_WEEKS).length / paths.length,
    reached,
    bands,
    kills,
  };
}

function raidMarkdown(n: number): string[] {
  const md = [
    '#### The raid: the journey with gear against without (game rules, the habits, expected speed, Determination on)',
    '',
    `${n} servers of each kind, the same seeds with and without gear. "Slot at week W" is the furthest slot fought by week W, "kills by week W" the bosses killed; the slot bands are the share of weekends won against a boss of the band (the weeks fought). Stuck is more than ${STUCK_WEEKS} weekends on one boss.`,
    '',
    '| Server | Gear | Slot at wk 4 / 12 / 24 | Kills by wk 4 / 12 / 24 | Won, slots 1-5 / 6-10 / 11-15 | Stuck |',
    '| --- | --- | --- | --- | --- | ---: |',
  ];
  for (const id of ['mixed', 'dedicated'])
    for (const gear of [false, true]) {
      const r = raidRow(id, n, gear);
      const f = (m: Record<number, number>): string =>
        GEAR_WEEKS.map((w) => (m[w] ?? 0).toFixed(1)).join(' / ');
      md.push(
        `| ${id} | ${gear ? 'with' : 'without'} | ${f(r.reached)} | ${f(r.kills)} | ${SLOT_BANDS.map(
          ([a, b]) => {
            const x = r.bands[`${a}-${b}`] as number;
            return Number.isNaN(x) ? '-' : pct(x);
          },
        ).join(' / ')} | ${pct(r.stuck)} |`,
      );
    }
  md.push('');
  return md;
}

// ---------- 2. with and without: the dungeon ----------

function dungeonMarkdown(n: number): string[] {
  const server = serverOf('mixed');
  const play = (gear: boolean) =>
    Array.from({ length: n }, (_, i) =>
      dungeonDaysOf(server, 'expected', i, undefined, undefined, undefined, {
        descent: 'sure',
        probe: true,
        ...(gear ? { gear: true } : {}),
      }),
    ).flat();
  const without = play(false);
  const withGear = play(true);
  const WEEK_BANDS: readonly (readonly [number, number])[] = [
    [3, 4],
    [11, 12],
    [23, 24],
  ];
  const md = [
    "#### The dungeon: the safe player with gear against without (the mixed server's players, expected speed)",
    '',
    `${n} servers, the same seeds. Gain is the depth a safe player (goes down only when sure) gains a week, the mean of player-weeks in the band; the Undercroft's first level is the clear chance of the keeper by the team's share of HP at the floor's end (depth 8 and up, the runs of that week band; n in brackets).`,
    '',
    `| Weeks | Gear | Depth gained a week | Stuck weeks | ${STATE_BUCKETS.map((b) => `Level 1 clear, ${b}`).join(' | ')} |`,
    `| --- | --- | ---: | ---: | ${STATE_BUCKETS.map(() => '---:').join(' | ')} |`,
  ];
  for (const band of WEEK_BANDS)
    for (const [label, players] of [
      ['without', without],
      ['with', withGear],
    ] as const) {
      const g = gainByBand(players, band);
      const runs = players
        .flatMap((p) => p.runs)
        .filter((r) => r.week >= band[0] && r.week <= band[1]);
      const t = descentTable(runs, [DESCENT_BANDS[0]?.[0] ?? 8, Infinity], 1);
      const cell = (k: StateBucket): string => {
        const c = t.byShare[k];
        return c.n < 5 || c.won === null ? `- (n ${c.n})` : `${pct(c.won)} (n ${c.n})`;
      };
      md.push(
        `| ${band[0]}-${band[1]} | ${label} | ${g.mean.toFixed(2)} | ${pct(g.stuckWeeks)} | ${STATE_BUCKETS.map(cell).join(' | ')} |`,
      );
    }
  md.push('');
  return md;
}

// ---------- 3. the per-line power table ----------

/** A line family: an element line by its id without the element, so `tide-reaction` and `ember-reaction` are `reaction`. */
const familyOf = (l: GearLine): string =>
  l.element === null ? l.id : l.id.slice(l.element.length + 1);

/** The week and slot the power table fights: the track's slot tuned nearest the week. */
function slotNearWeek(week: number): number {
  let best = 1;
  SLOT_WEEKS.forEach((w, i) => {
    if (Math.abs(w - week) < Math.abs((SLOT_WEEKS[best - 1] ?? 0) - week)) best = i + 1;
  });
  return best;
}

export interface LinePower {
  readonly family: string;
  readonly name: string;
  /** The percentage points of the boss's HP the weekend removes more than without gear (mean over the seeds). */
  readonly liftPoints: number;
  /** Creatures of the party that wore it (the roles and elements it fits), per weekend. */
  readonly wearers: number;
  readonly mapped: boolean;
}

/** The lines to measure: every family some role and element wears for an effect, with the line each creature of an element wears. */
export function lineFamilies(): Map<string, GearLine[]> {
  const out = new Map<string, GearLine[]>();
  for (const l of gearContent.lines) {
    if (l.fixedOnly === true) continue;
    const fam = familyOf(l);
    out.set(fam, [...(out.get(fam) ?? []), l]);
  }
  return out;
}

/** The line of a family a creature of this element would wear (the family's own element's, or the one line). */
const lineFor = (lines: readonly GearLine[], element: string): GearLine | undefined =>
  lines.find((l) => l.element === element) ?? lines.find((l) => l.element === null);

/** The creatures of a weekend wear a line (each the family's line for its element) as one expected piece; the rest wear nothing. */
function geared(
  p: Placement,
  lines: readonly GearLine[],
  itemLevel: number,
): { placement: Placement; wore: boolean } {
  const st = formStats(p.formId, p.level);
  const line = lineFor(lines, st.element);
  if (line === undefined) return { placement: p, wore: false };
  const l = singleLineLoadout(line.id, itemLevel, 'rare', st.role, st.element, {
    hp: st.hp,
    atk: st.atk,
    spd: st.spd,
  });
  const hasFx = Object.keys(l.fx).length > 0;
  const hasStats = Object.values(l.stats).some((v) => v !== 0);
  if (!hasFx && !hasStats) return { placement: p, wore: false };
  return {
    placement: { ...p, ...(hasFx ? { gear: l.fx } : {}), gearStats: l.stats } as Placement,
    wore: true,
  };
}

/**
 * Each family's lift on a real weekend: the mixed server at the week, its slot, with and without the line on every creature it fits
 * (a Rare piece's line at the week's expected pips). `seeds` servers; the same fight seeds both ways. A family that fits no creature of
 * any weekend is left out (it is no line the engine counts).
 */
export function linePowers(
  week: number,
  seeds: number,
): { rows: LinePower[]; hpFactor: number; plain: number } {
  const server = serverOf('mixed');
  const slot = slotNearWeek(week);
  const il = rosterGearLevel(VALLEY_ROSTER, 'daily', week, 'expected');
  const base0 = Array.from({ length: seeds }, (_, i) =>
    journeyWeekend(server, slot, week, 'expected', `mixed:${i}`, VALLEY_ROSTER, {}, HABITS),
  );
  // The share of the boss's HP removed is capped at a kill, so a weekend the party wins says nothing about a line: the boss's HP is
  // raised (the smallest of these factors that leaves the plain weekend under 60% of it) until the party cannot kill it.
  const factors = [1, 2, 3, 4, 6, 8, 12, 16];
  const shareAt = (f: number): { weekends: typeof base0; plain: number[] } => {
    const weekends = base0.map((w) => ({
      ...w,
      boss: { ...w.boss, hp: Math.round(w.boss.hp * f) },
    }));
    return {
      weekends,
      plain: weekends.map((w, i) => playJourneyWeekend(w, `gear:${week}:${i}`).share),
    };
  };
  let hpFactor = factors[factors.length - 1] as number;
  let chosen = shareAt(hpFactor);
  for (const f of factors) {
    const c = shareAt(f);
    if (mean(c.plain) < 0.6) {
      hpFactor = f;
      chosen = c;
      break;
    }
  }
  const { weekends, plain } = chosen;
  const base = mean(plain);
  const rows: LinePower[] = [];
  for (const [family, lines] of lineFamilies()) {
    let wearers = 0;
    const shares = weekends.map((w, i) => {
      let count = 0;
      const players = w.players.map((pl) => ({
        ...pl,
        team: pl.team.map((p) => {
          const g = geared(p, lines, il);
          if (g.wore) count++;
          return g.placement;
        }),
      }));
      wearers += count;
      if (count === 0) return plain[i] as number;
      return playJourneyWeekend({ ...w, players }, `gear:${week}:${i}`).share;
    });
    if (wearers === 0) continue;
    const first = lines[0] as GearLine;
    rows.push({
      family,
      name:
        first.element === null
          ? first.name
          : `${family.charAt(0).toUpperCase()}${family.slice(1).replace(/-/g, ' ')} (by element)`,
      liftPoints: mean(shares) - base,
      wearers: wearers / seeds,
      mapped: false,
    });
  }
  return { rows: rows.sort((a, b) => b.liftPoints - a.liftPoints), hpFactor, plain: base };
}

function powerMarkdown(week: number, seeds: number): string[] {
  const { rows, hpFactor, plain } = linePowers(week, seeds);
  const slot = slotNearWeek(week);
  const il = rosterGearLevel(VALLEY_ROSTER, 'daily', week, 'expected');
  const md = [
    `#### The per-line power table (week ${week}, item level ${il}, slot ${slot}'s weekend, a Rare piece: x${RARITY_FACTOR.rare})`,
    '',
    `Each line alone, worn by every creature of the party it does something for (a role line by that role, a Reaction line by that element, Armour, stats and the rest by all), against the same weekend with no gear. The boss's HP is x${hpFactor} (so that the plain weekend removes ${pct(plain)} of it and a kill does not hide a line). The lift is the share of the boss's HP the weekend removes beyond the plain one, in points, the mean of ${seeds} servers on the same seeds. A few tenths of a point are noise; a line that no creature wore is not listed. Sorted by lift.`,
    '',
    '| Line | Lift (pts of boss HP) | Wearers a weekend |',
    '| --- | ---: | ---: |',
    ...rows.map(
      (r) => `| ${r.name} (\`${r.family}\`) | ${pts(r.liftPoints)} | ${r.wearers.toFixed(1)} |`,
    ),
    '',
  ];
  return md;
}

// ---------- 4. OPEN 14: the reaction cap ----------

/** The reaction bonus (bp) a creature can wear at best: reaction lines at the top pip on the Hat, the Scarf and the Charm, and the Pounce Charm's own line. */
function bestReactionBp(): number {
  const el = 'tide';
  const rows: GearItem[] = [];
  const top = RULES.gear.tierFromItemLevel.length - 1;
  const lineOn = (base: string, ids: string[]): GearItem =>
    itemOf(
      base,
      'epic',
      RULES.gear.tierFromItemLevel[top] as number,
      ids.map((id) => ({ id, tier: top })),
    );
  rows.push(lineOn('kelp-cap', [`${el}-reaction`]));
  rows.push(lineOn('seafoam-scarf', [`${el}-reaction`]));
  rows.push(lineOn('pounce-charm', [`${el}-reaction`]));
  return gearFx({ role: 'payoff', element: el }, rows).reactionBonusBp ?? 0;
}

function reactionMarkdown(): string[] {
  const cap = combatV2.rules.maxBonusFactorBp / 10_000;
  const best = bestReactionBp();
  const wear = GEAR_WEEKS.map((w) => ({
    week: w,
    bp:
      loadoutAt(rosterGearLevel(VALLEY_ROSTER, 'daily', w, 'expected'), 'payoff', 'tide').fx
        .reactionBonusBp ?? 0,
  }));
  const knacks: { name: string; bonus: number; spendAll: number }[] = [
    { name: 'no reaction Knack (a plain Payoff)', bonus: 10_000, spendAll: 0 },
    ...Object.values(combatV2.knacks)
      .filter((k) => k.fx.spendAllBp !== undefined || k.fx.bonusBp !== undefined)
      .map((k) => ({
        name: k.name,
        bonus: k.fx.bonusBp ?? 10_000,
        spendAll: k.fx.spendAllBp ?? 0,
      })),
  ];
  const factor = (kn: { bonus: number; spendAll: number }, stacks: number, bp: number): number =>
    Math.min(
      (((kn.bonus * (10_000 + (stacks - 1) * kn.spendAll)) / 10_000) * (10_000 + bp)) /
        10_000 /
        10_000,
      cap,
    );
  const md = [
    '#### OPEN 14: the reaction cap and the x4 reaction lines',
    '',
    `The engine's reaction bonus factor is the Knack's own factor times each stack it spends, times the gear's Reaction bonus, **capped at x${cap}** (\`maxBonusFactorBp\`, R7). The gear lines are scaled x4 (\`REACTION_SCALE\`). What a creature wears: ${wear.map((w) => `week ${w.week}: +${(w.bp / 100).toFixed(1)}% (typical Payoff, Tide, the expected loadout)`).join('; ')}; at best (a Reaction line at the top pip on the Hat, the Scarf and the Pounce Charm, no rarity factor, no set): **+${(best / 100).toFixed(1)}%**.`,
    '',
    `| Knack | Stacks | No gear | Typical, week 12 | Typical, week 24 | Best case | Room under the cap left by the best case |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: |`,
  ];
  const w12 = wear[1]?.bp ?? 0;
  const w24 = wear[2]?.bp ?? 0;
  for (const kn of knacks)
    for (const stacks of kn.spendAll > 0 ? [1, 2, 3] : [1]) {
      const f0 = factor(kn, stacks, 0);
      md.push(
        `| ${kn.name} | ${stacks} | ${f0.toFixed(2)} | ${factor(kn, stacks, w12).toFixed(2)} | ${factor(kn, stacks, w24).toFixed(2)} | ${factor(kn, stacks, best).toFixed(2)} | ${(cap - factor(kn, stacks, best)).toFixed(2)} |`,
      );
    }
  md.push('');
  return md;
}

// ---------- the block ----------

/** The gear report, as markdown lines. `quick`: fewer servers and seeds (a sketch). */
export function gearMarkdown(quick: boolean): string[] {
  const n = quick ? 4 : 16;
  const dungeonN = quick ? 1 : 4;
  const seeds = quick ? 6 : 24;
  return [
    '## Gear in the lab (slice 2: the lab plays gear; no game number moved)',
    '',
    `The model: three pieces a creature (Hat and Scarf of its element, its role's Charm), lines per rarity ${LINES_PER_RARITY.common} / ${LINES_PER_RARITY.rare} / ${LINES_PER_RARITY.epic} (the valley's), rarity factors ${RARITY_FACTOR.common} / ${RARITY_FACTOR.rare} / ${RARITY_FACTOR.epic} (the plan's start), the item level from the roster profile's \`gear\`, expected values through the game's \`gearFx\` and \`applyGear\`. Only lines the v2 engine counts (slice 1) and the plain stat lines do anything; the rest of the pool is dead weight in the loadout (as in the game today). A seeded ${quick ? 'quick run, a sketch' : 'full run'}.`,
    '',
    ...loadoutsMarkdown(),
    ...raidMarkdown(n),
    ...dungeonMarkdown(dungeonN),
    ...GEAR_WEEKS.slice(1, 2).flatMap((w) => powerMarkdown(w, seeds)),
    ...reactionMarkdown(),
    `Model limits: no set bonuses worn, no position lines or three-piece effects (slices 3 and 4), a typical creature rolls the pool's weights (a planner who keeps the best lines does better, see the power table), the pool is the game's item level 1 to 20 gates read at item level / 5.`,
    '',
    `Bases at item level 54, a Tide Payoff: ${(['hat', 'scarf', 'charm'] as const).map((s) => baseOf(s, { role: 'payoff', element: 'tide' }, 54).name).join(', ')}.`,
  ];
}
