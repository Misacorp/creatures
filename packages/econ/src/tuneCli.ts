import { measuresOf } from './analysis';
import { DIALS, applyDials, axisOf, dialById, type Dial } from './dials';
import { RULES, type Rules } from './rules';
import { runScenario, type Results } from './scenarios';
import { ALL_SERVERS } from './servers';
import { TARGETS, boundsText, scenariosFor, type Target } from './targets';
import { DEFAULT_PLAN, tune, type Axis, type Evaluate, type TuneResult } from './tuner';

/** The evaluator the real tuner uses: the dial values applied to the rules, the scenarios the targets need run, the measures taken. */
export function ruleEvaluator(
  base: Rules,
  targets: readonly Target[],
  seeds: { search: number; final: number },
  weeks: number,
): Evaluate {
  const ids = scenariosFor(targets);
  return (values, level) => {
    const rules = applyDials(base, values);
    const results: Record<string, Results[string]> = {};
    for (const id of ids) {
      const config = ALL_SERVERS.find((s) => s.id === id);
      if (!config) throw new Error(`unknown scenario ${id}`);
      results[id] = runScenario(
        { ...config, weeks },
        level === 'search' ? seeds.search : seeds.final,
        rules,
      );
    }
    return measuresOf(results);
  };
}

const num = (x: number | undefined, digits = 2): string =>
  x === undefined ? '-' : String(Math.round(x * 10 ** digits) / 10 ** digits);

/** What a dial's value means in the rules: the first number it moves, today and with the dial applied. */
function effectText(rules: Rules, dial: Dial, m: number): string {
  const path = dial.paths[0] as readonly string[];
  const read = (r: Rules): unknown =>
    path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], r);
  const show = (v: unknown): string =>
    Array.isArray(v) ? `[${(v as number[]).join(', ')}]` : String(v);
  return `${path.join('.')}: ${show(read(rules))} -> ${show(read(applyDials(rules, { [dial.id]: m })))}`;
}

/** The tuner's answer as text: what it proposes, the targets before and after, and the targets that conflict. */
export function formatTune(result: TuneResult, dials: readonly Dial[], rules: Rules): string[] {
  const out: string[] = [];
  const label = (id: string): string => TARGETS.find((t) => t.id === id)?.label ?? id;
  out.push(
    `searched ${result.searched} points on a few seeds, then ${result.finals} in full (today's values and the best of the search).`,
    '',
  );
  if (result.improved) {
    out.push(
      "Proposed dial values (a multiplier of today's number; 1 is today; NOT applied to rules.ts):",
    );
  } else {
    out.push(
      "No change fits better than today's values within the bounds. Today's values stay (dials at 1).",
    );
  }
  for (const d of dials) {
    const m = result.best.values[d.id] ?? 1;
    const bound =
      m <= d.min ? '  (at its lower bound)' : m >= d.max ? '  (at its upper bound)' : '';
    out.push(
      `  ${d.id.padEnd(15)} x${num(m)}  (range ${d.min} to ${d.max}, step ${d.step})  ${effectText(rules, d, m)}${bound}`,
    );
  }
  out.push('', 'Targets, today -> proposed (measured on the full seeds):');
  result.start.judged.forEach((j, i) => {
    const after = result.best.judged[i];
    const state = (x: typeof j | undefined): string =>
      x?.met === null ? 'skipped' : x?.met ? 'PASS' : 'FAIL';
    out.push(
      `  ${j.target.id.padEnd(6)} ${state(j).padEnd(7)} ${num(j.value).padStart(7)}  ->  ${state(after).padEnd(7)} ${num(after?.value).padStart(7)}   (${boundsText(j.target)}) ${j.target.label}`,
    );
  });
  const missedNow = result.start.failed;
  const missedAfter = result.best.failed;
  out.push(
    '',
    `Missed targets: ${missedNow} today, ${missedAfter} proposed. Total miss (each target in its own scale): ${num(result.start.miss)} today, ${num(result.best.miss)} proposed.`,
  );
  if (result.improved && missedAfter >= missedNow)
    out.push('  No more targets pass: the proposal only brings the missed ones closer.');
  if (result.unreachable.length > 0) {
    out.push(
      '',
      'Cannot be met with these dials within their bounds (no point measured met them):',
      ...result.unreachable.map((id) => `  ${id}: ${label(id)}`),
    );
  }
  if (result.conflicts.length > 0) {
    out.push(
      '',
      'Conflicts (each can be met at some point measured, never both together):',
      ...result.conflicts.map((c) => `  ${c.a} and ${c.b}: ${label(c.a)} / ${label(c.b)}`),
    );
  }
  if (result.unreachable.length === 0 && result.conflicts.length === 0)
    out.push('', 'No conflicts found among the points measured.');
  return out;
}

const flag = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/**
 * `pnpm --filter @creatures/econ tune -- --dials projectSize,scoutScrap [--targets T-3a,T-4] [--seeds 3] [--confirm 20] [--weeks 24]`.
 * Searches the named dials for the values that meet the most targets with the smallest change from today, and prints the
 * proposal and the targets that conflict. It proposes; it never edits `rules.ts`.
 */
export function main(args: readonly string[]): number {
  if (args.includes('--list') || !args.includes('--dials')) {
    console.log("dials (a multiplier on today's number; give them with --dials a,b):");
    for (const d of DIALS)
      console.log(`  ${d.id.padEnd(15)} ${d.min} to ${d.max} step ${d.step}  ${d.label}`);
    console.log('targets (restrict with --targets T-3a,T-4):');
    for (const t of TARGETS) console.log(`  ${t.id.padEnd(6)} ${boundsText(t)}  ${t.label}`);
    return args.includes('--list') ? 0 : 1;
  }
  const dials = (flag(args, '--dials') ?? '').split(',').filter(Boolean).map(dialById);
  const wanted = flag(args, '--targets')?.split(',');
  const targets = wanted
    ? TARGETS.filter((t) => wanted.includes(t.id) || wanted.includes(t.line))
    : TARGETS;
  if (dials.length === 0 || targets.length === 0) {
    console.error('need at least one dial and one target');
    return 1;
  }
  const seeds = {
    search: Number(flag(args, '--seeds') ?? 3),
    final: Number(flag(args, '--confirm') ?? 20),
  };
  const weeks = Number(flag(args, '--weeks') ?? 24);
  const t = Date.now();
  const axes: Axis[] = dials.map(axisOf);
  const result = tune(axes, targets, ruleEvaluator(RULES, targets, seeds, weeks), DEFAULT_PLAN);
  console.log(
    `tuning ${dials.map((d) => d.id).join(', ')} against ${targets.length} targets (${seeds.search} seeds searching, ${seeds.final} confirming, ${weeks} weeks)`,
  );
  console.log('');
  for (const line of formatTune(result, dials, RULES)) console.log(line);
  console.log('');
  console.log(`tuned in ${num((Date.now() - t) / 1000, 1)} s`);
  return 0;
}
