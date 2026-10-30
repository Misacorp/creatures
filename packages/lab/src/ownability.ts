/**
 * Ownability: can a server own the creatures a slot's tool line uses at the week the slot arrives? (`docs/design/combat/boss-track.md`,
 * "Ownability"; the targets are `OWNABLE_CHANCE_MIN` and `OWNABLE_SERVER` in `targets.ts`.)
 *
 * An evolved form cannot be found by scouts: a player owns it by owning its line's stage 1 form and evolving it. So ownership is counted
 * per line, with the rarity of the line's stage 1 form (the rare lines are stormray, mossback and coralynx; the epic ones aurorix,
 * gaiadrake, hearthshell, lanternfin and solmane). The valley's coverage (`server-coverage.json`) says, for a mixed server of 5, 8 or 15
 * players and each week, the share of each rarity's species at least one player owns: the chance a given species of that rarity can be
 * pooled into the raid roster. The share is read as its running maximum over the weeks (`coverageAt`): a species already in the pool
 * never becomes less owned, and the share dips only when a content drop adds unowned species to the denominator. The chance a server owns every non-common line an answer uses is the product of those shares, one for
 * each distinct non-common line (the valley counts 34 forms as 34 species; reading the share as the chance a given line is owned is the
 * approximation we accept). An all-common answer is always ownable. A slot with no rule cards (slot 1, the tutorial: `SLOT_CARDS`) has no
 * tool, so the rule does not apply to it. The test and the report read the same functions.
 */
import { content } from '@creatures/game';
import { BOSS_ANSWERS, answerLine, type BossAnswer } from './bossAnswers';
import type { Pick } from './search';
import { OWNABLE_CHANCE_MIN, OWNABLE_SERVER } from './targets';
import { SLOT_WEEKS, slotRules, trackSlot } from './track';
import {
  COVERAGE_SERVERS,
  VALLEY_COVERAGE,
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

/** A non-common line an answer needs, and the forms of it the answer uses. */
export interface NeededLine {
  readonly line: string;
  readonly rarity: 'rare' | 'epic';
  readonly forms: readonly string[];
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
  return [...out.entries()].map(([line, v]) => ({ line, rarity: v.rarity, forms: v.forms }));
}

/** The chance a mixed `server` owns every one of `needed` at `week`: the product of each line's rarity coverage (1 when none is needed). */
export function ownableChance(
  needed: readonly NeededLine[],
  week: number,
  server: CoverageServer,
  coverage: ServerCoverage = VALLEY_COVERAGE,
): number {
  return needed.reduce((p, n) => p * coverageAt(coverage, server, n.rarity, week), 1);
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

/** A track slot at its arrival week: every answer of its boss, the first being the tool line the rule is about. */
export interface SlotOwnability {
  readonly slot: number;
  readonly bossId: string;
  readonly week: number;
  readonly answers: readonly AnswerOwnability[];
  /** The tool line: the boss's first answer. */
  readonly tool: AnswerOwnability;
  /** Whether the rule applies: only slots with at least one rule card have a tool (slot 1, the tutorial, has none). */
  readonly applies: boolean;
  /** Whether the slot passes: the tool line is ownable at the arrival week, or the rule does not apply. */
  readonly pass: boolean;
}

/** A slot's ownability at `week` (the slot's arrival week; default the committed `SLOT_WEEKS`). */
export function slotOwnability(
  slot: number,
  week: number = SLOT_WEEKS[slot - 1] as number,
  coverage: ServerCoverage = VALLEY_COVERAGE,
): SlotOwnability {
  const bossId = trackSlot(slot).bossId;
  const answers = (BOSS_ANSWERS[bossId] ?? []).map((a) => answerOwnability(a, week, coverage));
  const tool = answers[0];
  if (!tool) throw new Error(`${bossId} has no written answer`);
  const applies = slotRules(slot).cards !== 0;
  return { slot, bossId, week, answers, tool, applies, pass: !applies || tool.ownable };
}

/** Every slot with a week: slot `i + 1` at `weeks[i]` (default the committed `SLOT_WEEKS`, slots 1 to 15). */
export const ownabilityTable = (
  weeks: readonly number[] = SLOT_WEEKS,
  coverage: ServerCoverage = VALLEY_COVERAGE,
): SlotOwnability[] => weeks.map((w, i) => slotOwnability(i + 1, w, coverage));

const pct = (x: number): string => `${Math.round(100 * x)}%`;
const needText = (n: readonly NeededLine[]): string =>
  n.length ? n.map((x) => `${x.line} (${x.rarity})`).join(', ') : 'none (all common)';

/** The markdown of the ownability table. `weeksFrom` says where the arrival weeks come from (a path run, or the committed table). */
export function ownabilityMarkdown(rows: readonly SlotOwnability[], weeksFrom: string): string[] {
  const out = [
    '### Ownability of the tool lines',
    '',
    `A slot's tool line (the boss's first answer) is ownable at the slot's arrival week (only for slots with a rule card; slot 1 has none and no tool) when the chance that a mixed server of ${OWNABLE_SERVER.slice(5)} owns every non-common line it uses is at least ${pct(OWNABLE_CHANCE_MIN)}. The chance is the product, over the distinct non-common lines, of that rarity's coverage at that week (\`server-coverage.json\`, as its running maximum over the weeks; an evolved form counts as its line, with the rarity of the line's first stage). Arrival weeks: ${weeksFrom}.`,
    '',
    '| Slot | Boss | Week | Tool line needs | Chance, servers of 5 / 8 / 15 | Tool line | Other answers: needs, chance on 5 / 8 / 15 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  const chances = (a: AnswerOwnability): string =>
    COVERAGE_SERVERS.map((s) => pct(a.chance[s])).join(' / ');
  for (const r of rows)
    out.push(
      `| ${r.slot} | ${r.bossId} | ${r.week} | ${needText(r.tool.needed)} | ${chances(r.tool)} | ${r.applies ? (r.pass ? 'pass' : '**FAIL**') : 'n/a (no rule cards, no tool)'} | ${
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
