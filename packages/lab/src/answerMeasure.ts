/**
 * Measures of the written raid answers beyond one win rate (panel 5): what an answer loses without its own tool,
 * how it does with random legal talents and with none, which Knack families it cannot do without (the gate check, P-05 and
 * P-10), and the card hint a boss would show if it were generated from the measured "calls for" table (P-13).
 */
import { createSeededRng, int } from '@creatures/game';
import type { Measured } from './ablation';
import type { BossAnswer } from './bossAnswers';
import { withoutTool } from './bossAnswers';
import { combineWeekends, weekendStats, type Tiers, type WeekendStats } from './bosses';
import { KNACKS } from './knacks';
import type { Mechanic } from './mechanics';
import type { Pick } from './search';
import {
  GATE_BOSSES,
  GATE_DROP,
  ROBUST_SHARE,
  ROBUST_TARGET,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
} from './targets';
import { legalTalents } from './talents';
import type { BossDef } from './types';

// The thresholds live in `targets.ts` (the boss tuner reads them too); they are still exported from here.
export { GATE_BOSSES, GATE_DROP, ROBUST_SHARE, ROBUST_TARGET, TOOL_DROP_MIN, TOOL_SHARE_MIN };

/** `line` with one random legal talent on each creature that can carry one (what a player may have rolled), replacing any it had. */
export function randomTalents(
  rng: ReturnType<typeof createSeededRng>,
  line: readonly Pick[],
): Pick[] {
  return line.map((p) => {
    const options = legalTalents(p.formId);
    const t = options[int(rng, options.length)];
    return {
      formId: p.formId,
      knack: p.knack,
      ...(p.level !== undefined ? { level: p.level } : {}),
      ...(t ? { talents: [t] } : {}),
    };
  });
}

/** `line` with every talent taken off. */
export const noTalents = (line: readonly Pick[]): Pick[] =>
  line.map((p) => ({
    formId: p.formId,
    knack: p.knack,
    ...(p.level !== undefined ? { level: p.level } : {}),
  }));

export interface Robustness {
  /** The line as written (its searched talents). */
  readonly written: WeekendStats;
  /** Random legal talents: the mean over the draws, and the range of the draws' win rates. */
  readonly random: {
    readonly draws: number;
    readonly winRate: number;
    readonly minWin: number;
    readonly maxWin: number;
    readonly damageShare: number;
    /** The standard deviation of the share between weekends (all draws pooled). */
    readonly damageShareSd: number;
    /** The lowest and highest draw's mean share of the boss's HP removed. */
    readonly minShare: number;
    readonly maxShare: number;
    readonly knockouts: number;
    /** The mean share of weekends that reached each success tier. */
    readonly tiers: Tiers;
  };
  /** No talents at all. */
  readonly none: WeekendStats;
}

/**
 * The line with its written talents, with `draws` random legal talent sets (`weekends` in all, split over the draws) and
 * with no talents. Talents are meant to be about a fifth of a result (R20), not the whole weekend.
 */
export function robustnessOf(
  boss: BossDef,
  line: readonly Pick[],
  weekends: number,
  draws: number,
  salt: string,
): Robustness {
  const per = Math.max(1, Math.floor(weekends / draws));
  const parts: WeekendStats[] = [];
  for (let d = 0; d < draws; d++) {
    const rng = createSeededRng(`talents:${salt}:${d}`);
    parts.push(weekendStats(boss, randomTalents(rng, line), per, `${salt}:r${d}`));
  }
  const mean = (f: (p: WeekendStats) => number) =>
    parts.reduce((n, p) => n + f(p), 0) / parts.length;
  return {
    written: weekendStats(boss, line, weekends, `${salt}:w`),
    random: {
      draws,
      winRate: mean((p) => p.winRate),
      minWin: Math.min(...parts.map((p) => p.winRate)),
      maxWin: Math.max(...parts.map((p) => p.winRate)),
      damageShare: mean((p) => p.damageShare),
      damageShareSd: combineWeekends(parts).damageShareSd,
      minShare: Math.min(...parts.map((p) => p.damageShare)),
      maxShare: Math.max(...parts.map((p) => p.damageShare)),
      knockouts: mean((p) => p.knockoutsTotal),
      tiers: {
        t1: mean((p) => p.tiers.t1),
        t2: mean((p) => p.tiers.t2),
        kill: mean((p) => p.tiers.kill),
      },
    },
    none: weekendStats(boss, noTalents(line), weekends, `${salt}:n`),
  };
}

export interface ToolCost {
  /** Weekend win rates, 0 to 1. */
  readonly withTool: number;
  readonly without: number;
  /** The mean share of the boss's HP the weekend removed, with and without the tool. */
  readonly shareWith: number;
  readonly shareWithout: number;
  /** The drop in points of win rate (0 to 100). */
  readonly drop: number;
  /** The same drop in the primary measure: points of the boss's HP removed (the share removed with the tool minus without, times 100). */
  readonly shareDrop: number;
  /** The two weekend measures themselves (tiers and spread included). */
  readonly withStats: WeekendStats;
  readonly withoutStats: WeekendStats;
}

/** An answer's weekend win rate with and without its own tool (`core`: its Knacks become none, its talents go), on the same seeds. */
export function toolCost(
  boss: BossDef,
  answer: BossAnswer,
  line: readonly Pick[],
  weekends: number,
  salt: string,
): ToolCost {
  const a = weekendStats(boss, line, weekends, salt);
  const b = weekendStats(boss, withoutTool(line, answer.core ?? []), weekends, salt);
  return {
    withTool: a.winRate,
    without: b.winRate,
    shareWith: a.damageShare,
    shareWithout: b.damageShare,
    drop: 100 * (a.winRate - b.winRate),
    shareDrop: 100 * (a.damageShare - b.damageShare),
    withStats: a,
    withoutStats: b,
  };
}

/** The Knack families an answer's own tool is made of (the `core` Knacks' families). */
export const ownFamilies = (core: readonly string[]): string[] => [
  ...new Set(core.flatMap((c) => (KNACKS[c] ? [KNACKS[c].family] : []))),
];

/** What taking each Knack family out of a line costs, in win-rate points (families the line carries only). */
export function familyDrops(measured: readonly Measured[]): Record<string, number> {
  return Object.fromEntries(
    measured
      .filter((m) => m.carried && m.mechanic.id.startsWith('family:'))
      .map((m) => [m.mechanic.name, m.drop]),
  );
}

export interface GateEntry {
  readonly boss: string;
  readonly answer: string;
  /** Family name to the points its removal costs this answer. */
  readonly drops: Readonly<Record<string, number>>;
}

export interface FamilyGate {
  readonly family: string;
  /** Bosses where removing the family from some written answer costs more than `GATE_DROP` points. */
  readonly bosses: readonly string[];
  /** The answers it gates (boss: answer). */
  readonly answers: readonly string[];
}

/** Every Knack family that gates at least one boss, most bosses first. Fails the check at `GATE_BOSSES` bosses or more. */
export function familyGates(entries: readonly GateEntry[], threshold = GATE_DROP): FamilyGate[] {
  const byFamily = new Map<string, { bosses: Set<string>; answers: string[] }>();
  for (const e of entries)
    for (const [family, drop] of Object.entries(e.drops))
      if (drop > threshold) {
        const g = byFamily.get(family) ?? { bosses: new Set<string>(), answers: [] };
        g.bosses.add(e.boss);
        g.answers.push(`${e.boss}: ${e.answer}`);
        byFamily.set(family, g);
      }
  return [...byFamily.entries()]
    .map(([family, g]) => ({ family, bosses: [...g.bosses], answers: g.answers }))
    .sort((a, b) => b.bosses.length - a.bosses.length || a.family.localeCompare(b.family));
}

/** The gates that fail the check: a family that gates `GATE_BOSSES` bosses or more. */
export const failingGates = (gates: readonly FamilyGate[]): FamilyGate[] =>
  gates.filter((g) => g.bosses.length >= GATE_BOSSES);

// ---------- card hints from measurement ----------

export interface Call {
  readonly mechanic: Mechanic;
  /** The measured drop (points for a raid boss, score for a foe). */
  readonly drop: number;
  /** Mechanics that take the same things off a line share a key (Measured.key). */
  readonly key: string;
}

/** What a player reads for a mechanic on a card: a Knack family is "<name> Knacks", a talent kind "<name> talents". */
export function hintName(m: Mechanic): string {
  switch (m.group) {
    case 'Knack family':
      return `${m.name} Knacks`;
    case 'Talent kind':
      return `${m.name} talents`;
    case 'Keyword':
      return m.name;
    default:
      return m.name;
  }
}

const PRIORITY: readonly Mechanic['group'][] = [
  'Rule',
  'Knack family',
  'Keyword',
  'Talent kind',
  'Escalation feed',
];

interface Entry {
  mechanic: Mechanic;
  /** The biggest drop in any line. */
  drop: number;
  /** How many of the boss's lines (its best line, each written answer) cannot do without it. */
  lines: number;
}

/** A tie goes to a Knack family (a tool a player can pick) before a rule, a talent kind or a keyword. */
const RANK: readonly Mechanic['group'][] = [
  'Knack family',
  'Rule',
  'Talent kind',
  'Keyword',
  'Escalation feed',
];

/**
 * The answer hint of a boss from what it measurably calls for. `lines` are the measurements of the boss's lines (its best
 * line, each written answer): in each, mechanics that take the same Knacks and talents off the line (the Debuff family and
 * Mired, say) are one entry named by the most general of them (a rule before a family before a keyword before a talent
 * kind); a keyword with the name of a family or a rule is the same entry. The hint lists the biggest `top` entries whose
 * removal costs at least `min`, those that most lines cannot do without first (a drop alone is not a ranking: the lines
 * are brittle, and many drops are near 100), then by the biggest drop, then a family before the rest. Empty when the boss
 * calls for nothing.
 */
export function measuredHint(lines: readonly (readonly Call[])[], min: number, top = 5): string {
  const entries = new Map<string, Entry>();
  for (const calls of lines) {
    const groups = new Map<string, { mechanic: Mechanic; drop: number }>();
    for (const c of calls) {
      if (c.drop < min) continue;
      const key = c.key || c.mechanic.id;
      const g = groups.get(key);
      if (!g) groups.set(key, { mechanic: c.mechanic, drop: c.drop });
      else {
        const better = PRIORITY.indexOf(c.mechanic.group) < PRIORITY.indexOf(g.mechanic.group);
        groups.set(key, {
          mechanic: better ? c.mechanic : g.mechanic,
          drop: Math.max(g.drop, c.drop),
        });
      }
    }
    // One count per line for each name (a family and a keyword of one name are one entry).
    const seen = new Set<string>();
    for (const g of groups.values()) {
      const name = g.mechanic.name.toLowerCase();
      const e = entries.get(name);
      if (!e) entries.set(name, { ...g, lines: 1 });
      else {
        if (!seen.has(name)) e.lines++;
        if (
          g.drop > e.drop ||
          (g.drop === e.drop && RANK.indexOf(g.mechanic.group) < RANK.indexOf(e.mechanic.group))
        )
          e.mechanic = g.mechanic;
        e.drop = Math.max(e.drop, g.drop);
      }
      seen.add(name);
    }
  }
  return [...entries.values()]
    .sort(
      (a, b) =>
        b.lines - a.lines ||
        b.drop - a.drop ||
        RANK.indexOf(a.mechanic.group) - RANK.indexOf(b.mechanic.group) ||
        a.mechanic.id.localeCompare(b.mechanic.id),
    )
    .slice(0, top)
    .map((g) => hintName(g.mechanic))
    .join(', ');
}
