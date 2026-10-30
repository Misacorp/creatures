/**
 * Ownability: can a server own the creatures a slot's tool line uses at the week the slot arrives? (`docs/design/combat/boss-track.md`,
 * "Ownability"; the targets are `OWNABLE_CHANCE_MIN` and `OWNABLE_SERVER` in `targets.ts`.)
 *
 * An evolved form cannot be found by scouts: a player owns it by owning its line's stage 1 form and evolving it. So ownership is counted
 * per line, with the rarity of the line's stage 1 form (the rare lines are stormray, mossback and coralynx; the epic ones aurorix,
 * gaiadrake, solmane and the two festival prizes, hearthshell and lanternfin). The valley's coverage (`server-coverage.json`) is per line
 * too: for a mixed server of 5, 8 or 15 players and each week, the share of the launch content's lines of each rarity that at least one
 * player owns (`launch`; Lanternfin and Hearthshell are not in it). That is the chance a given launch line of that rarity can be pooled
 * into the raid roster, exact for the lines the answers use, and it never dips (`coverageAt`). The chance a server owns every non-common
 * line an answer uses is the product of those shares, one for each distinct non-common line (reading the share as the chance a given
 * line is owned is the approximation we accept). A line scouts cannot find (its stage 1 form is not `catchable`: a festival prize) has
 * a chance of 0: a boss must not need it, and the report shows it as "festival prize". An all-common answer is always ownable. The rule
 * holds on every slot, for the line the tuner measures as prepared: the boss's first answer, or the slot's own line (`SLOT_LINE`; slot
 * 1's is all common, so it passes on its own). The test and the report read the same functions.
 *
 * The evolution gate (the lead, 2026-10-30, design panel 6) adds a second half to the rule: every creature of the tool line is at or
 * above its form's evolution level at the arrival week, at the expected roster speed, so the line is fielded as written and not as
 * its stage 1 forms (`evolvedAt`). A line of stage 1 forms always passes it.
 */
import { content } from '@creatures/game';
import { BOSS_ANSWERS, answerLine, type BossAnswer } from './bossAnswers';
import type { Pick } from './search';
import { evolutionOf, rosterLevels, type RosterProfile } from './roster';
import { OWNABLE_CHANCE_MIN, OWNABLE_SERVER } from './targets';
import { SLOT_LINE, SLOT_WEEKS, slotBoss, slotPreparedOf, trackSlot } from './track';
import {
  COVERAGE_SERVERS,
  VALLEY_COVERAGE,
  VALLEY_ROSTER,
  coverageAt,
  type CoverageServer,
  type ServerCoverage,
} from './valley';

/** The line of a form (`content.creatures`). */
export function lineOfForm(formId: string): string {
  const c = content.creatures.find((x) => x.id === formId);
  if (!c) throw new Error(`${formId} is not a form`);
  return c.line;
}

/** The rarity of a line: its stage 1 form's rarity (an evolved form is owned by owning the line's first stage). */
export function lineRarity(line: string): 'common' | 'rare' | 'epic' {
  const forms = content.creatures.filter((c) => c.line === line);
  const first = forms.find((c) => c.stage === 1);
  if (!first) throw new Error(`line ${line} has no stage 1 form`);
  return first.rarity;
}

/**
 * Whether scouts can find the line: its stage 1 form is `catchable`. A line that is not (Lanternfin, Hearthshell) is a festival prize,
 * read from `content.creatures`.
 */
export function lineFindable(line: string): boolean {
  const first = content.creatures.find((c) => c.line === line && c.stage === 1);
  if (!first) throw new Error(`line ${line} has no stage 1 form`);
  return first.catchable;
}

/** A non-common line an answer needs, and the forms of it the answer uses. */
export interface NeededLine {
  readonly line: string;
  readonly rarity: 'rare' | 'epic';
  readonly forms: readonly string[];
  /** False for a festival prize: scouts cannot find it, so its ownable chance is 0. */
  readonly findable: boolean;
}

/** The distinct non-common lines of a raid line (in the order they first appear), each with the forms of it the line uses. */
export function nonCommonLines(picks: readonly Pick[]): NeededLine[] {
  const out = new Map<string, { rarity: 'rare' | 'epic'; forms: string[] }>();
  for (const p of picks) {
    const line = lineOfForm(p.formId);
    const rarity = lineRarity(line);
    if (rarity === 'common') continue;
    const at = out.get(line) ?? { rarity, forms: [] };
    if (!at.forms.includes(p.formId)) at.forms.push(p.formId);
    out.set(line, at);
  }
  return [...out.entries()].map(([line, v]) => ({
    line,
    rarity: v.rarity,
    forms: v.forms,
    findable: lineFindable(line),
  }));
}

/**
 * The chance a mixed `server` owns every one of `needed` at `week`: the product of each line's launch coverage for its rarity (1 when
 * none is needed), and 0 when one of them is a festival prize.
 */
export function ownableChance(
  needed: readonly NeededLine[],
  week: number,
  server: CoverageServer,
  coverage: ServerCoverage = VALLEY_COVERAGE,
): number {
  return needed.reduce(
    (p, n) => p * (n.findable ? coverageAt(coverage, server, n.rarity, week) : 0),
    1,
  );
}

/** One answer of a boss at a week: the non-common lines it needs, the chance on each mixed server, and whether it is ownable. */
export interface AnswerOwnability {
  readonly label: string;
  readonly needed: readonly NeededLine[];
  readonly chance: Readonly<Record<CoverageServer, number>>;
  /** At least `OWNABLE_CHANCE_MIN` on a server of `OWNABLE_SERVER`. */
  readonly ownable: boolean;
}

export function answerOwnability(
  answer: BossAnswer,
  week: number,
  coverage: ServerCoverage = VALLEY_COVERAGE,
): AnswerOwnability {
  const needed = nonCommonLines(answerLine(answer.line));
  const chance = Object.fromEntries(
    COVERAGE_SERVERS.map((s) => [s, ownableChance(needed, week, s, coverage)]),
  ) as Record<CoverageServer, number>;
  return {
    label: answer.label,
    needed,
    chance,
    ownable: chance[OWNABLE_SERVER] >= OWNABLE_CHANCE_MIN,
  };
}

/** A creature of a tool line that has not evolved yet at the arrival week: its form, the level of its row, and the level it evolves at. */
export interface BelowEvolution {
  readonly formId: string;
  readonly row: number;
  readonly level: number;
  readonly evolvesAt: number;
}

/**
 * The creatures of a slot's tool line (the slot's own line, else the boss's first answer: `slotPreparedOf`) that are below their form's
 * evolution level at `week`, at the expected roster speed: a daily player's creature of each row (the best at the front row) against
 * the level the form evolves at. Empty: the line is fielded as written.
 */
export function evolvedAt(
  slot: number,
  week: number,
  profile: RosterProfile = VALLEY_ROSTER,
): BelowEvolution[] {
  const { line } = slotPreparedOf(slot);
  const { rows, cols } = slotBoss(slot);
  const levels = rosterLevels(profile, 'daily', week, 'expected', rows + 1);
  const below: BelowEvolution[] = [];
  line.forEach((p, i) => {
    const row = Math.floor(i / cols);
    const level = levels[row] ?? levels[levels.length - 1] ?? 1;
    const evo = evolutionOf(p.formId);
    if (evo && level < evo.level && !below.some((b) => b.formId === p.formId && b.row === row))
      below.push({ formId: p.formId, row, level, evolvesAt: evo.level });
  });
  return below;
}

/** A track slot at its arrival week: every answer of its boss, the first being the tool line the rule is about (the slot's own line when it has one). */
export interface SlotOwnability {
  readonly slot: number;
  readonly bossId: string;
  readonly week: number;
  readonly answers: readonly AnswerOwnability[];
  /** The tool line: the line the tuner measures (the slot's own, else the boss's first answer). */
  readonly tool: AnswerOwnability;
  /** The creatures of the tool line below their form's evolution level at the arrival week (`evolvedAt`); empty is a pass. */
  readonly unevolved: readonly BelowEvolution[];
  /** Whether the tool line is ownable at the arrival week and fielded evolved (no creature of it below its evolution level). */
  readonly pass: boolean;
}

/** A slot's ownability at `week` (the slot's arrival week; default the committed `SLOT_WEEKS`). */
export function slotOwnability(
  slot: number,
  week: number = SLOT_WEEKS[slot - 1] as number,
  coverage: ServerCoverage = VALLEY_COVERAGE,
  roster: RosterProfile = VALLEY_ROSTER,
): SlotOwnability {
  const bossId = trackSlot(slot).bossId;
  const written = BOSS_ANSWERS[bossId] ?? [];
  // The tool line is the line the tuner measures: the slot's own (`SLOT_LINE`) or the boss's first answer.
  const own = SLOT_LINE[slot];
  const answers = written.map((a, i) =>
    answerOwnability(i === 0 && own ? { ...a, line: own } : a, week, coverage),
  );
  const tool = answers[0];
  if (!tool) throw new Error(`${bossId} has no written answer`);
  const unevolved = evolvedAt(slot, week, roster);
  return { slot, bossId, week, answers, tool, unevolved, pass: tool.ownable && !unevolved.length };
}

/** Every slot with a week: slot `i + 1` at `weeks[i]` (default the committed `SLOT_WEEKS`, slots 1 to 15). */
export const ownabilityTable = (
  weeks: readonly number[] = SLOT_WEEKS,
  coverage: ServerCoverage = VALLEY_COVERAGE,
  roster: RosterProfile = VALLEY_ROSTER,
): SlotOwnability[] => weeks.map((w, i) => slotOwnability(i + 1, w, coverage, roster));

const pct = (x: number): string => `${Math.round(100 * x)}%`;
const needText = (n: readonly NeededLine[]): string =>
  n.length
    ? n.map((x) => `${x.line} (${x.rarity}${x.findable ? '' : ', festival prize'})`).join(', ')
    : 'none (all common)';

/** The markdown of the ownability table. `weeksFrom` says where the arrival weeks come from (a path run, or the committed table). */
export function ownabilityMarkdown(rows: readonly SlotOwnability[], weeksFrom: string): string[] {
  const out = [
    '### Ownability of the tool lines',
    '',
    `A slot's tool line (the line the tuner measures: the boss's first answer, or the slot's own line) is ownable at the slot's arrival week when the chance that a mixed server of ${OWNABLE_SERVER.slice(5)} owns every non-common line it uses is at least ${pct(OWNABLE_CHANCE_MIN)}. The chance is the product, over the distinct non-common lines, of that rarity's launch coverage at that week (\`server-coverage.json\`, \`launch\`; an evolved form counts as its line, with the rarity of the line's first stage). A festival prize (a line scouts cannot find) has a chance of 0. The tool line must also be evolved: every creature of it at or above its form's evolution level at that week (a daily player's creature of its row, expected speed), or it is fielded as stage 1 forms. Arrival weeks: ${weeksFrom} (the week of the first fight, never a Festival week).`,
    '',
    '| Slot | Boss | Week | Tool line needs | Chance, servers of 5 / 8 / 15 | Evolved by then | Tool line | Other answers: needs, chance on 5 / 8 / 15 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const chances = (a: AnswerOwnability): string =>
    COVERAGE_SERVERS.map((s) => pct(a.chance[s])).join(' / ');
  for (const r of rows)
    out.push(
      `| ${r.slot} | ${r.bossId} | ${r.week} | ${needText(r.tool.needed)} | ${chances(r.tool)} | ${
        r.unevolved.length
          ? `below: ${r.unevolved.map((b) => `${b.formId} (row ${b.row + 1}, level ${b.level} under ${b.evolvesAt})`).join(', ')}`
          : 'yes'
      } | ${r.pass ? 'pass' : '**FAIL**'} | ${
        r.answers
          .slice(1)
          .map((a) => `${needText(a.needed)}: ${chances(a)}`)
          .join('; ') || '-'
      } |`,
    );
  const fails = rows.filter((r) => !r.pass);
  out.push(
    '',
    fails.length
      ? `**${fails.length} of ${rows.length} slots fail**: ${fails.map((r) => `${r.slot} (${r.bossId}, week ${r.week})`).join('; ')}.`
      : `All ${rows.length} slots pass.`,
    '',
  );
  return out;
}
