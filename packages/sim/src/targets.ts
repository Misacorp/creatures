import * as v from 'valibot';
import targetsJson from '../targets.json';

export const TargetSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), v.maxLength(64)),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  /** Key into the metrics map the simulator produces. */
  metric: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  comparator: v.picklist(['min', 'max', 'range']),
  /** A number for min and max; [low, high] (both inclusive) for range. */
  value: v.union([v.number(), v.tuple([v.number(), v.number()])]),
  /** How the report prints values: "percent" shows 0.95 as 95%. */
  unit: v.picklist(['percent', 'number', 'ratio', 'level', 'count']),
});
export type Target = v.InferOutput<typeof TargetSchema>;

/** Parses and cross-checks a list of targets (unique ids, comparator matches the value shape). */
export function parseTargets(raw: unknown): Target[] {
  const parsed = v.safeParse(v.pipe(v.array(TargetSchema), v.maxLength(200)), raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid targets at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const seen = new Set<string>();
  for (const t of parsed.output) {
    if (seen.has(t.id)) throw new Error(`Invalid targets: duplicate id "${t.id}"`);
    seen.add(t.id);
    if (t.comparator === 'range') {
      if (typeof t.value === 'number' || t.value[0] > t.value[1]) {
        throw new Error(`Invalid targets: "${t.id}" needs a [low, high] range`);
      }
    } else if (typeof t.value !== 'number') {
      throw new Error(`Invalid targets: "${t.id}" needs a single number`);
    }
  }
  return parsed.output;
}

/** The shipped targets (`targets.json`), validated at load. */
export const TARGETS: readonly Target[] = parseTargets(targetsJson);

export type TargetStatus = 'pass' | 'fail' | 'not_measured';

export interface TargetResult {
  id: string;
  description: string;
  metric: string;
  comparator: Target['comparator'];
  value: Target['value'];
  unit: Target['unit'];
  status: TargetStatus;
  /** The measured value; null when the metric was not measured. */
  measured: number | null;
}

export type Metrics = Readonly<Record<string, number | null | undefined>>;

const EPSILON = 1e-9;

export function checkTarget(target: Target, measured: number): boolean {
  const { comparator, value } = target;
  if (comparator === 'min' && typeof value === 'number') return measured >= value - EPSILON;
  if (comparator === 'max' && typeof value === 'number') return measured <= value + EPSILON;
  if (comparator === 'range' && typeof value !== 'number') {
    return measured >= value[0] - EPSILON && measured <= value[1] + EPSILON;
  }
  throw new Error(`target "${target.id}" has a value that does not match its comparator`);
}

/** Pass, fail or not measured (metric missing, null or not finite) for every target. */
export function evaluateTargets(targets: readonly Target[], metrics: Metrics): TargetResult[] {
  return targets.map((t) => {
    const raw = metrics[t.metric];
    const measured = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    return {
      id: t.id,
      description: t.description,
      metric: t.metric,
      comparator: t.comparator,
      value: t.value,
      unit: t.unit,
      status: measured === null ? 'not_measured' : checkTarget(t, measured) ? 'pass' : 'fail',
      measured,
    };
  });
}

export function formatValue(value: number, unit: Target['unit']): string {
  switch (unit) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'ratio':
      return `${value.toFixed(2)}x`;
    case 'level':
    case 'count':
      return String(Math.round(value * 100) / 100);
    case 'number':
      return (Math.round(value * 100) / 100).toString();
  }
}

export function describeRequirement(t: Pick<Target, 'comparator' | 'value' | 'unit'>): string {
  if (t.comparator === 'range' && typeof t.value !== 'number') {
    return `${formatValue(t.value[0], t.unit)} to ${formatValue(t.value[1], t.unit)}`;
  }
  if (typeof t.value === 'number') {
    return `${t.comparator === 'min' ? '>=' : '<='} ${formatValue(t.value, t.unit)}`;
  }
  return '';
}
