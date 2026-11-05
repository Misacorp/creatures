/**
 * The phase 5 gate as one report section (`report -- --gate`, and in the full report): for each gate item of `balance.md` section 3 the
 * measured value, its target (`targets.ts`) and pass or miss.
 *
 * Nothing is measured twice. The raid by rank, the stuck share, the one-weekend kills, small parties and fifteen come from the journey
 * (`journey.ts`: the game's rules and `HABITS`, the dedicated, mixed and builder servers at the three speeds, Misa's `live10`); the
 * classic line on the cards and the casual metric from the report's own best-team and casual searches (`report.ts`). Three things had no
 * measure on the v2 raid, so they are new here: the gate's potential searches (independent searches a raid boss, scored on damage
 * potential so that they do not saturate at a kill, `weekendPotential`), the winning teams' diversity and the dead Knacks read from them,
 * and the classic line against the best at the real party sizes.
 *
 * A gate that misses is not a failing test: it is listed in `KNOWN_MISSES` (and printed) until the balance pass clears it or Misa accepts it.
 */
import { content } from '@creatures/game';
import { BOSS_ANSWERS, answerLine } from './bossAnswers';
import { RAID_BOSS_IDS, raidBossOf, raidMode, weekendPotential, weekendStats } from './bosses';
import { cpuReport, type CpuRow } from './cpuMeasure';
import { HABITS } from './habits';
import type { JobResults, JobSpec, Plan } from './jobs';
import {
  COMPARED_SERVERS,
  MIXED_KILL_SLOTS,
  SIZE_SERVERS,
  journeyServers,
  planJourney,
  type JourneyReport,
} from './journey';
import { FAMILIES, KNACKS } from './knacks';
import { DETERMINATION, STUCK_SHARE_MAX, STUCK_WEEKS } from './path';
import { widthOf, type WidthResult } from './raidMeasure';
import { bestJobs, casualId, casualJobs, type BestResult, type CasualResult } from './report';
import { ROSTER_SPEEDS } from './roster';
import { classicFor, lineKey, search, type Pick, type Ranked, type Score } from './search';
import { formStats } from './species';
import { illegalTalents } from './talents';
import { CASUAL_CARDS, casualRosters } from './teams';
import {
  CASUAL_BEYOND_MIN,
  CLASSIC_BEHIND,
  CLASSIC_LOSES_MOST,
  CPU_LIMIT_MS,
  DEAD_KNACK_PICKS_MIN,
  DIVERSITY_ELEMENT_SETS_MIN,
  DIVERSITY_FAMILIES_MIN,
  DIVERSITY_LINES_MIN,
  DIVERSITY_TOP_LINE_MAX,
  GATE_REACHED_MIN,
  GATE_WEEKENDS_MAX,
  MIXED_KILL_MIN,
} from './targets';
import { TRACK_ORDER, slotBoss } from './track';

// ---------- the items ----------

export interface GateItem {
  readonly id: string;
  /** The gate item of `balance.md` section 3 it belongs to. */
  readonly group: string;
  readonly label: string;
  readonly measured: string;
  readonly target: string;
  readonly pass: boolean;
}

/** A gate that misses today: what was measured, the target (unchanged), and why the numbers cannot reach it yet. The balance pass empties the list. */
export interface KnownMiss {
  readonly id: string;
  readonly measured: string;
  readonly target: string;
  readonly why: string;
}

/**
 * The gates that miss at the last full run of `report -- --gate` (2026-11-05, after the balance pass). No target was loosened. Each is one item id of
 * `gateItemIds()`; `test/gate.test.ts` checks that the list names only real ones.
 */
export const KNOWN_MISSES: readonly KnownMiss[] = [
  {
    id: 'casual',
    measured: '1.41 creatures beyond the top three',
    target: 'at least 1.5',
    why: 'Accepted by Misa on 2026-11-05 and kept as a miss, not a looser target: the dungeon depth picker already gives casual players meaningful content until they are ready for more depth, the valley rework brings quite passive EXP, and the picker lets any creature crew take on content. The 128-search mean is good to about plus or minus 0.14.',
  },
];

const pct = (x: number): string => `${Math.round(100 * x)}%`;

const REACHED_NOTE = `slots that at least ${pct(GATE_REACHED_MIN)} of the servers reach`;

/** The server kinds and speeds the raid-by-rank items read (the three kinds at the three speeds; Misa's server at the expected speed, its only one). */
export const RAID_CELLS: readonly { server: string; speed: string }[] = [
  ...COMPARED_SERVERS.flatMap((server) => ROSTER_SPEEDS.map((speed) => ({ server, speed }))),
  { server: 'live10', speed: 'expected' },
];
/** The servers of the one-weekend kill (the track's three tuned slots). */
export const KILL_SERVERS: readonly string[] = ['mixed', 'live10'];

const CLASSIC_WIDTHS: readonly number[] = [5, 10, 15];

/** Every item id the gate can print (for the known-misses check). */
export function gateItemIds(): string[] {
  return [
    ...RAID_CELLS.flatMap((c) => [
      `raid-stuck:${c.server}:${c.speed}`,
      `raid-weekends:${c.server}:${c.speed}`,
    ]),
    ...KILL_SERVERS.flatMap((s) =>
      MIXED_KILL_SLOTS.map((slot) => `raid-kill-weekend:${s}:${slot}`),
    ),
    'raid-determination',
    'classic-cards:gauntlet',
    'classic-cards:raid',
    'classic-bosses',
    ...RAID_BOSS_IDS.map((b) => `diversity:${b}`),
    'dead-knack',
    'casual',
  ];
}

// ---------- the gate's own measures (jobs) ----------

/** The potential searches: independent searches a boss, each keeping its best five lines. */
export const GATE_SEARCHES = 4;

const settings = (quick: boolean) =>
  quick
    ? { starts: 10, keep: 3, rounds: 2, seeds: 1, freshSeeds: 2 }
    : { starts: 40, keep: 6, rounds: 10, seeds: 2, freshSeeds: 6 };
const widthRuns = (quick: boolean): number => (quick ? 4 : 24);

/** A line's damage potential over weekends (the boss's HP is 1): the search's score, which does not saturate at a kill. */
const potentialScore =
  (boss: ReturnType<typeof raidBossOf>) =>
  (line: readonly Pick[], seeds: number, salt: string): Score => {
    const p = weekendPotential(boss, line, seeds, salt).mean;
    return { score: p, damage: p, knockouts: 0, reactions: 0, blocked: 0 };
  };

export interface GateSearch {
  readonly lines: readonly { readonly line: readonly Pick[]; readonly potential: number }[];
  /** The classic party's potential (the first search includes it). */
  readonly classic: number | undefined;
}

export interface GateWidths {
  readonly best: readonly Pick[];
  readonly widths: readonly WidthResult[];
}

export interface GateJobArgs {
  readonly quick: boolean;
  readonly part: 'search' | 'widths' | 'cpu' | 'weekend';
  readonly boss?: string;
  readonly index?: number;
  /** The track slot of a `weekend` search. */
  readonly slot?: number;
}

/**
 * The track slots whose weekends the dead-Knack item also reads: the first slot of each boss with the cards the track gives it
 * (5 Thornmother, 6 Colossus with Slippery, 7 Wyrm, 8 Sovereign with Double Strike, 9 Bogback), and the second lap's Double Strike and
 * Bogback weeks (13, 14), where the tuned numbers differ.
 */
export const WEEKEND_SEARCH_SLOTS: readonly number[] = [5, 6, 7, 8, 9, 13, 14];
/** The independent weekend-scored searches a slot (full run; the quick run has one). */
export const WEEKEND_SEARCHES = 3;

/** A weekend-scored search of a track slot: its best lines (as the player's weekend is scored: the share of the boss's HP removed). */
export interface GateWeekend {
  readonly lines: readonly (readonly Pick[])[];
}

const weekendId = (slot: number, i: number) => `gate:weekend:${slot}:${i}`;

const searchId = (boss: string, i: number) => `gate:search:${boss}:${i}`;
const widthsId = (boss: string) => `gate:widths:${boss}`;
const CPU_ID = 'gate:cpu';

/** Runs one job of the gate's own pieces (`jobRunners.ts`). */
export function runGateJob(args: GateJobArgs, deps: Readonly<Record<string, unknown>>): unknown {
  if (args.part === 'cpu')
    return cpuReport({
      now: () => (globalThis as unknown as { performance: { now(): number } }).performance.now(),
      runs: args.quick ? 4 : 20,
      warmup: args.quick ? 1 : 4,
    });
  if (args.part === 'weekend') {
    const slot = args.slot as number;
    const i = args.index ?? 0;
    const boss = slotBoss(slot);
    const mode = raidMode(boss);
    const score = (line: readonly Pick[], seeds: number, salt: string): Score => {
      const share = weekendStats(boss, line, seeds, salt).damageShare;
      return { score: share, damage: share, knockouts: 0, reactions: 0, blocked: 0 };
    };
    const ranked = search(boss, mode, {
      seed: `gate:weekend:${slot}:${i}`,
      ...(args.quick
        ? { starts: 10, keep: 3, rounds: 2, seeds: 1, freshSeeds: 2 }
        : { starts: 100, keep: 10, rounds: 3, seeds: 3, freshSeeds: 8 }),
      include: [classicFor(mode)],
      score,
    });
    const out: GateWeekend = { lines: ranked.slice(0, 5).map((r) => r.line) };
    return out;
  }
  const id = args.boss as string;
  const boss = raidBossOf(id);
  const mode = raidMode(boss);
  if (args.part === 'search') {
    const i = args.index ?? 0;
    const classic = classicFor(mode);
    // The first search starts from the classic party and the boss's written answers (the board points at them), as the report's searches do.
    const written = (BOSS_ANSWERS[id] ?? [])
      .map((a) => answerLine(a.line))
      .filter((l) => illegalTalents(l).length === 0);
    const ranked: Ranked[] = search(boss, mode, {
      seed: `gate:${id}:${i}`,
      ...settings(args.quick),
      talents: true,
      ...(i === 0 ? { include: [classic, ...written] } : {}),
      score: potentialScore(boss),
    });
    const cl = ranked.find((r) => lineKey(r.line) === lineKey(classic));
    const out: GateSearch = {
      lines: ranked.slice(0, 5).map((r) => ({ line: r.line, potential: r.score.score })),
      classic: cl?.score.score,
    };
    return out;
  }
  const found = Array.from(
    { length: GATE_SEARCHES },
    (_, i) => deps[searchId(id, i)] as GateSearch,
  );
  const best = found.flatMap((f) => f.lines).sort((a, b) => b.potential - a.potential)[0];
  if (!best) return undefined;
  const out: GateWidths = {
    best: best.line,
    widths: CLASSIC_WIDTHS.map((w) =>
      widthOf(boss, best.line, w, widthRuns(args.quick), `gate:${id}:${w}`),
    ),
  };
  return out;
}

/** The gate's own jobs: the potential searches, the party-size comparison that reads them, and the CPU measure. */
export function gateOwnJobs(quick: boolean): JobSpec[] {
  const job = (id: string, args: GateJobArgs, needs: readonly string[] = []): JobSpec => ({
    id,
    section: 'Gate: potential searches and CPU',
    kind: 'gate',
    args,
    needs,
  });
  return [
    ...RAID_BOSS_IDS.flatMap((boss) =>
      Array.from({ length: GATE_SEARCHES }, (_, index) =>
        job(searchId(boss, index), { quick, part: 'search', boss, index }),
      ),
    ),
    ...RAID_BOSS_IDS.map((boss) =>
      job(
        widthsId(boss),
        { quick, part: 'widths', boss },
        Array.from({ length: GATE_SEARCHES }, (_, i) => searchId(boss, i)),
      ),
    ),
    ...WEEKEND_SEARCH_SLOTS.flatMap((slot) =>
      Array.from({ length: quick ? 1 : WEEKEND_SEARCHES }, (_, index) =>
        job(weekendId(slot, index), { quick, part: 'weekend', slot, index }),
      ),
    ),
    job(CPU_ID, { quick, part: 'cpu' }),
  ];
}

// ---------- the measures read from the results ----------

const lineOfForm = (form: string): string =>
  content.creatures.find((c) => c.id === form)?.line ?? form;
const elementOf = (form: string): string => formStats(form, 25).element;
const familyOf = (knackId: string): string | undefined => {
  const family = KNACKS[knackId]?.family;
  return family === undefined ? undefined : (FAMILIES[family] ?? family);
};

export interface Diversity {
  readonly teams: number;
  readonly lines: number;
  readonly elementSets: number;
  readonly families: number;
  /** The most creatures held by one content line, as a share of the creatures of all the winning teams. */
  readonly topLineShare: number;
  readonly topLine: string;
}

/**
 * How varied the winning teams of a boss are. Pure: it reads lines. An element set is one player's column (the elements of the
 * creatures in it): a whole team of twelve nearly always holds every element, so the team as a whole would always count as one set.
 */
export function diversityOf(teams: readonly (readonly Pick[])[], cols = 4): Diversity {
  const lines = new Map<string, number>();
  const elementSets = new Set<string>();
  const families = new Set<string>();
  let creatures = 0;
  for (const team of teams) {
    for (let c = 0; c < cols; c++) {
      const column = team.filter((_, i) => i % cols === c);
      if (column.length > 0)
        elementSets.add([...new Set(column.map((p) => elementOf(p.formId)))].sort().join('+'));
    }
    for (const p of team) {
      creatures++;
      const l = lineOfForm(p.formId);
      lines.set(l, (lines.get(l) ?? 0) + 1);
      const fam = p.knack === 'none' ? undefined : familyOf(p.knack);
      if (fam) families.add(fam);
    }
  }
  const top = [...lines.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    teams: teams.length,
    lines: lines.size,
    elementSets: elementSets.size,
    families: families.size,
    topLineShare: top ? top[1] / Math.max(1, creatures) : 0,
    topLine: top ? top[0] : '-',
  };
}

/** The winning teams of a boss from its searches: the lines that remove the boss's whole HP when the weekend is played as if it could not die. */
export function winningTeams(searches: readonly GateSearch[]): (readonly Pick[])[] {
  const seen = new Set<string>();
  const out: (readonly Pick[])[] = [];
  for (const s of searches)
    for (const l of s.lines) {
      const k = lineKey(l.line);
      if (l.potential >= 1 && !seen.has(k)) {
        seen.add(k);
        out.push(l.line);
      }
    }
  return out;
}

/** The Knacks (not "no Knack") that fewer than `DEAD_KNACK_PICKS_MIN` creatures of `teams` carry. */
export function deadKnacks(teams: readonly (readonly Pick[])[]): string[] {
  const picks = new Map<string, number>();
  for (const t of teams) for (const p of t) picks.set(p.knack, (picks.get(p.knack) ?? 0) + 1);
  return Object.keys(KNACKS).filter((k) => (picks.get(k) ?? 0) < DEAD_KNACK_PICKS_MIN);
}

/** Whether the classic line is behind at a party size: its HP share more than `CLASSIC_BEHIND` under the best's, or its kill rate that far under. */
export const classicBehindAt = (w: WidthResult): boolean =>
  w.classicShare < w.bestShare * (1 - CLASSIC_BEHIND) || w.classicWin < w.bestWin - CLASSIC_BEHIND;

/** Whether the classic line is behind the best by more than `CLASSIC_BEHIND` of the best's score. */
export const classicBehind = (classic: number, best: number): boolean =>
  classic < best * (1 - CLASSIC_BEHIND);

/** The casual metric: creatures of the best line outside the player's top three, averaged over the rosters and cards. */
export function casualBeyond(
  lines: readonly {
    readonly top3: readonly string[];
    readonly line: readonly Pick[] | undefined;
  }[],
): number {
  let beyond = 0;
  let trials = 0;
  for (const l of lines) {
    if (!l.line) continue;
    beyond += l.line.filter((p) => !l.top3.includes(p.formId)).length;
    trials++;
  }
  return beyond / Math.max(1, trials);
}

// ---------- the table ----------

/** What the gate reads: the journey's data, the best-team and casual searches, the gate's searches and the CPU rows. */
export interface GateInputs {
  readonly journey: JourneyReport['data'];
  readonly best: ReadonlyMap<string, BestResult | undefined>;
  readonly casual: readonly {
    readonly top3: readonly string[];
    readonly line: readonly Pick[] | undefined;
  }[];
  readonly searches: ReadonlyMap<string, readonly GateSearch[]>;
  readonly widths: ReadonlyMap<string, GateWidths | undefined>;
  /** The weekend-scored searches of the track's slots (`WEEKEND_SEARCH_SLOTS`). */
  readonly weekends?: readonly GateWeekend[];
  readonly cpu: readonly CpuRow[] | undefined;
}

const item = (
  id: string,
  group: string,
  label: string,
  measured: string,
  target: string,
  pass: boolean,
): GateItem => ({ id, group, label, measured, target, pass });

/** All the gate's items from the inputs (an input that is missing gives a miss that says so). */
export function gateItems(inputs: GateInputs): GateItem[] {
  const items: GateItem[] = [];
  const cellOf = (server: string, speed: string, det: 'on' | 'off') =>
    inputs.journey.cells.find(
      (c) =>
        c.rules === 'game' &&
        c.habits === HABITS.id &&
        c.server === server &&
        c.speed === speed &&
        c.determination === det,
    );

  // Raid by rank.
  for (const { server, speed } of RAID_CELLS) {
    const cell = cellOf(server, speed, 'on');
    const group = 'Raid by rank';
    if (!cell) {
      for (const id of [`raid-stuck:${server}:${speed}`, `raid-weekends:${server}:${speed}`])
        items.push(item(id, group, id, 'not measured', '-', false));
      continue;
    }
    items.push(
      item(
        `raid-stuck:${server}:${speed}`,
        group,
        `${server}, ${speed}: stuck share (more than ${STUCK_WEEKS} weekends on one boss)`,
        pct(cell.stuckShare),
        `at most ${pct(STUCK_SHARE_MAX)}`,
        cell.stuckShare <= STUCK_SHARE_MAX,
      ),
    );
    let worst = { slot: 0, weekends: 0 };
    cell.weekendsMedian.forEach((w, i) => {
      if ((cell.reachedShare[i] ?? 0) >= GATE_REACHED_MIN && w > worst.weekends)
        worst = { slot: i + 1, weekends: w };
    });
    items.push(
      item(
        `raid-weekends:${server}:${speed}`,
        group,
        `${server}, ${speed}: weekends to kill, the worst slot's median (${REACHED_NOTE})`,
        worst.slot ? `${worst.weekends} (slot ${worst.slot})` : '-',
        `at most ${GATE_WEEKENDS_MAX}`,
        worst.weekends <= GATE_WEEKENDS_MAX,
      ),
    );
  }
  for (const server of KILL_SERVERS)
    for (const slot of MIXED_KILL_SLOTS) {
      const m = inputs.journey.mixedKill.find(
        (k) =>
          k.rules === 'game' && k.habits === HABITS.id && k.server === server && k.slot === slot,
      );
      items.push(
        item(
          `raid-kill-weekend:${server}:${slot}`,
          'Raid by rank',
          `${server}: kill in one weekend at slot ${slot}, week ${m?.week ?? '-'}`,
          m ? pct(m.kill) : 'not measured',
          `at least ${pct(MIXED_KILL_MIN)}`,
          m !== undefined && m.kill >= MIXED_KILL_MIN,
        ),
      );
    }
  items.push(
    item(
      'raid-determination',
      'Raid by rank',
      'Determination on from the second lap',
      `from slot ${DETERMINATION.fromSlot} (${DETERMINATION.stackBp / 100}% a stack, ${DETERMINATION.maxStacks} stacks)`,
      `from slot ${TRACK_ORDER.length + 1}`,
      DETERMINATION.fromSlot === TRACK_ORDER.length + 1,
    ),
  );

  // The classic trio not best everywhere.
  const classicGroup = 'The classic trio is not best everywhere';
  for (const mode of ['gauntlet', 'raid'] as const) {
    const found = [...inputs.best.entries()]
      .filter(([k]) => k.startsWith(`${mode}:`))
      .map(([, r]) => r)
      .filter((r): r is BestResult => r !== undefined);
    const behind = found.filter((r) => classicBehind(r.classicScore, r.bestScore)).length;
    items.push(
      item(
        `classic-cards:${mode}`,
        classicGroup,
        `the classic line is more than ${pct(CLASSIC_BEHIND)} behind the best ${mode === 'raid' ? 'raid line (4 players)' : 'gauntlet line'}, on cards`,
        found.length ? `${behind} of ${found.length}` : 'not measured',
        `more than ${pct(CLASSIC_LOSES_MOST)} of the cards`,
        found.length > 0 && behind / found.length > CLASSIC_LOSES_MOST,
      ),
    );
  }
  {
    let cases = 0;
    let behind = 0;
    for (const boss of RAID_BOSS_IDS) {
      const ss = inputs.searches.get(boss) ?? [];
      const best = Math.max(0, ...ss.flatMap((s) => s.lines.map((l) => l.potential)));
      const classic = ss.map((s) => s.classic).find((c) => c !== undefined);
      if (classic !== undefined && best > 0) {
        cases++;
        if (classicBehind(classic, best)) behind++;
      }
      for (const w of inputs.widths.get(boss)?.widths ?? []) {
        cases++;
        if (classicBehindAt(w)) behind++;
      }
    }
    items.push(
      item(
        'classic-bosses',
        classicGroup,
        `the classic line is more than ${pct(CLASSIC_BEHIND)} behind the best on the real bosses at 4 players (damage potential) and 5, 10 and 15 (HP removed, kill rate)`,
        cases ? `${behind} of ${cases}` : 'not measured',
        `more than ${pct(CLASSIC_LOSES_MOST)} of the cases`,
        cases > 0 && behind / cases > CLASSIC_LOSES_MOST,
      ),
    );
  }

  // Diversity of winning teams.
  const allWinning: (readonly Pick[])[] = [];
  for (const boss of RAID_BOSS_IDS) {
    const ss = inputs.searches.get(boss) ?? [];
    const teams = winningTeams(ss);
    allWinning.push(...teams);
    const d = diversityOf(teams);
    const bestPotential = Math.max(0, ...ss.flatMap((s) => s.lines.map((l) => l.potential)));
    items.push(
      item(
        `diversity:${boss}`,
        'Diversity of winning teams',
        `${boss}: ${d.teams} winning teams (potential at least 1; the best found ${bestPotential.toFixed(2)})`,
        `${d.lines} lines, ${d.elementSets} element sets, ${d.families} Knack families, top line ${d.topLine} ${pct(d.topLineShare)}`,
        `at least ${DIVERSITY_LINES_MIN} lines, ${DIVERSITY_ELEMENT_SETS_MIN} element sets, ${DIVERSITY_FAMILIES_MIN} families; top line at most ${pct(DIVERSITY_TOP_LINE_MAX)}`,
        d.lines >= DIVERSITY_LINES_MIN &&
          d.elementSets >= DIVERSITY_ELEMENT_SETS_MIN &&
          d.families >= DIVERSITY_FAMILIES_MIN &&
          d.topLineShare <= DIVERSITY_TOP_LINE_MAX,
      ),
    );
  }

  // No dead Knack: the gate's potential searches' winning teams, the report's best-team searches, and the best lines of the weekend
  // searches on the track's slots. The target is unchanged ("every Knack picked somewhere"); the last source widens where "somewhere"
  // looks, to the weeks a player really plays: a Knack that only pays against one card (Cool Head on Double Strike) is never picked
  // in the report's short per-card fights, but is on the weeks that carry the card.
  const reportTeams = [...inputs.best.values()].flatMap((r) => r?.top ?? []);
  const weekendTeams = (inputs.weekends ?? []).flatMap((w) => w.lines);
  const dead = deadKnacks([...allWinning, ...reportTeams, ...weekendTeams]);
  const deadOnPotential = deadKnacks(allWinning);
  const total = Object.keys(KNACKS).length;
  items.push(
    item(
      'dead-knack',
      'No dead Knack',
      'Knacks no winning team of the potential searches, of the report’s best-team searches or of the track weekends’ searches picks',
      `${dead.length ? `${dead.length} of ${total}: ${dead.join(', ')}` : `0 of ${total}`} (the potential searches alone: ${deadOnPotential.length})`,
      '0',
      dead.length === 0 && inputs.searches.size > 0,
    ),
  );

  // The casual metric.
  const casual = casualBeyond(inputs.casual);
  items.push(
    item(
      'casual',
      'The casual metric',
      `creatures of the best line beyond the top three by level, mean over ${inputs.casual.length} roster-card searches`,
      inputs.casual.length ? casual.toFixed(2) : 'not measured',
      `at least ${CASUAL_BEYOND_MIN}`,
      inputs.casual.length > 0 && casual >= CASUAL_BEYOND_MIN,
    ),
  );
  return items;
}

/** Misses that are not on the known list, and listed ones that now pass (the list needs an edit). */
export function listCheck(
  items: readonly GateItem[],
  known: readonly KnownMiss[] = KNOWN_MISSES,
): { unlisted: GateItem[]; stale: KnownMiss[] } {
  const knownIds = new Set(known.map((k) => k.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    unlisted: items.filter((i) => !i.pass && !knownIds.has(i.id)),
    stale: known.filter((k) => byId.get(k.id)?.pass === true),
  };
}

const cell = (s: string): string => s.replace(/\|/g, '/');

/** The section's markdown: the table, the known misses, the misses not on the list, and the numbers beside the gate. */
export function gateMarkdown(
  items: readonly GateItem[],
  inputs: GateInputs,
  quick: boolean,
  known: readonly KnownMiss[] = KNOWN_MISSES,
): string[] {
  const { unlisted, stale } = listCheck(items, known);
  const misses = items.filter((i) => !i.pass).length;
  const md: string[] = [
    '## The phase 5 gate',
    '',
    `Each gate item of \`balance.md\` section 3 on the v2 journey (the game's rules with the habits, \`HABITS\`; Determination on; ${quick ? 'a quick run: a sketch, 8 servers of each kind' : `the full run, ${GATE_JOURNEY_SERVERS} servers of each kind in the journey`}). Targets are in \`targets.ts\`; a miss is never turned into a looser target. **${items.length - misses} of ${items.length} pass, ${misses} miss.**`,
    '',
    '| Group | Item | Measured | Target | Result |',
    '| --- | --- | --- | --- | --- |',
    ...items.map(
      (i) =>
        `| ${i.group} | ${cell(i.label)} | ${cell(i.measured)} | ${cell(i.target)} | ${i.pass ? 'pass' : 'MISS'} |`,
    ),
    '',
    '### Known misses (`KNOWN_MISSES`: kept on purpose, accepted by Misa)',
    '',
  ];
  if (known.length === 0) md.push('None.');
  for (const k of known)
    md.push(`- \`${k.id}\`: measured ${k.measured}, target ${k.target}. ${k.why}`);
  md.push('');
  if (unlisted.length)
    md.push(`**Misses not on the list:** ${unlisted.map((i) => `\`${i.id}\``).join(', ')}.`, '');
  if (stale.length)
    md.push(`**On the list but passing now:** ${stale.map((k) => `\`${k.id}\``).join(', ')}.`, '');

  md.push(
    '### Beside the gate (not gating)',
    '',
    'Small parties and fifteen players (the journey, habits, Determination on, expected speed):',
    '',
    '| Server | Stuck share | Slots reached (at least half the servers) | Longest run (median / worst) |',
    '| --- | ---: | ---: | --- |',
  );
  for (const server of SIZE_SERVERS) {
    const c = inputs.journey.cells.find(
      (x) =>
        x.rules === 'game' &&
        x.habits === HABITS.id &&
        x.server === server &&
        x.speed === 'expected' &&
        x.determination === 'on',
    );
    if (c)
      md.push(
        `| ${server} | ${pct(c.stuckShare)} | ${c.reachedShare.filter((r) => r >= 0.5).length} | ${c.longestRun.median} / ${c.longestRun.max} |`,
      );
  }
  md.push('');
  const cpu = (inputs.cpu ?? []).filter((r) => r.label.includes('15 columns'));
  const worstOf = (starts: string) =>
    cpu
      .filter((r) => r.label.startsWith(starts))
      .map((r) => ({ label: r.label, ms: r.worst?.medianMs ?? r.medianMs }))
      .sort((a, b) => b.ms - a.ms)[0];
  md.push(
    `CPU at fifteen players against the Free plan's ${CPU_LIMIT_MS} ms a request (this machine's clock, not the Worker's; a ratio, not a promise):`,
    '',
  );
  for (const [name, w] of [
    ['worst raid stage', worstOf('raid stage')],
    ['worst live finale replay', worstOf('live finale replay')],
  ] as const)
    md.push(
      w
        ? `- ${name}: median ${w.ms.toFixed(2)} ms (${w.label}), ${w.ms <= CPU_LIMIT_MS ? 'under' : 'OVER'} the limit.`
        : `- ${name}: not measured.`,
    );
  md.push(
    '',
    'Not re-measured here, still in their own sections: talents’ share, crit lines and golden’s effect (`report -- --talents`, `--team`; the full report’s talent section), the reaction cap and the finale actions’ worth (the journey’s habits fire every finale ability; no worth-per-action measure exists yet), and the dungeon’s v2 measures (`report -- --dungeon-days`, `balance.md` section 9).',
    '',
  );
  return md;
}

// ---------- the plan ----------

export interface GateData {
  readonly items: readonly GateItem[];
  readonly known: readonly string[];
  readonly unlisted: readonly string[];
}

export interface GateSection {
  readonly md: string[];
  readonly data: GateData;
}

/** The inputs from the results of a plan that holds the journey, the best-team and casual searches and the gate's own jobs. */
export function inputsFrom(
  results: JobResults,
  quick: boolean,
  journey: JourneyReport['data'],
): GateInputs {
  const best = new Map<string, BestResult | undefined>();
  for (const j of bestJobs(quick)) {
    const a = j.args as { mode: string; card: string };
    best.set(`${a.mode}:${a.card}`, results.get(j.id) as BestResult | undefined);
  }
  const casual = casualRosters(quick).flatMap((r) =>
    CASUAL_CARDS.map((cid) => ({
      top3: r.top3,
      line: (results.get(casualId(r.index, cid)) as CasualResult | undefined)?.bestLine,
    })),
  );
  const searches = new Map<string, readonly GateSearch[]>();
  const widths = new Map<string, GateWidths | undefined>();
  for (const boss of RAID_BOSS_IDS) {
    searches.set(
      boss,
      Array.from({ length: GATE_SEARCHES }, (_, i) => results.get(searchId(boss, i)) as GateSearch),
    );
    widths.set(boss, results.get(widthsId(boss)) as GateWidths | undefined);
  }
  const weekends = WEEKEND_SEARCH_SLOTS.flatMap((slot) =>
    Array.from(
      { length: quick ? 1 : WEEKEND_SEARCHES },
      (_, i) => results.get(weekendId(slot, i)) as GateWeekend | undefined,
    ),
  ).filter((w): w is GateWeekend => w !== undefined);
  return {
    journey,
    best,
    casual,
    searches,
    widths,
    weekends,
    cpu: results.get(CPU_ID) as CpuRow[] | undefined,
  };
}

/**
 * Servers of each kind in the gate's journey (full run): the stuck share is a share of servers, and 40 left it noisy (one draw of the
 * same track read 18% and about 30%); 320 servers are good to about plus or minus 5 points at 95%. The rest of the report keeps 40.
 */
export const GATE_JOURNEY_SERVERS = 320;

/** The journey options the gate reads: the game's rules, the habits, the three kinds and the party sizes. */
export const gateJourneyOptions = (quick: boolean) =>
  ({
    quick,
    servers: quick ? journeyServers(true) : GATE_JOURNEY_SERVERS,
    gameOnly: true,
    habitSets: [HABITS.id],
    sizes: SIZE_SERVERS,
  }) as const;

/**
 * The gate as a plan. In the full report (`inReport`) the best-team and casual jobs are the report's own (same ids), and so are the
 * journey's first servers (job ids carry the server index: indices 0 to 39 are shared, the gate adds the rest up to its 320). The plan
 * adds the gate's own jobs and those extra servers; alone (`--gate`) it carries everything.
 */
export function planGate(opts: { quick: boolean; inReport?: boolean }): Plan<GateSection> {
  const { quick } = opts;
  const journey = planJourney(gateJourneyOptions(quick));
  const own = gateOwnJobs(quick);
  const reportJourney = new Set(planJourney({ quick }).jobs.map((j) => j.id));
  return {
    jobs: opts.inReport
      ? [...own, ...journey.jobs.filter((j) => !reportJourney.has(j.id))]
      : [...own, ...journey.jobs, ...bestJobs(quick), ...casualJobs(quick)],
    assemble: (results) => {
      const inputs = inputsFrom(results, quick, journey.assemble(results).data);
      const items = gateItems(inputs);
      const { unlisted } = listCheck(items);
      return {
        md: gateMarkdown(items, inputs, quick),
        data: {
          items,
          known: KNOWN_MISSES.map((k) => k.id),
          unlisted: unlisted.map((i) => i.id),
        },
      };
    },
  };
}
