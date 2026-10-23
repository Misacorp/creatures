/**
 * The debug panel's forms as data: each tool control is a `ToolSpec` (a tool id, some fields and maybe
 * fixed body keys) and `buildBody` turns what the player typed into the request body. The server checks
 * every body again with a strict schema (`apps/worker/src/dev-schemas.ts`); the checks here only give a
 * quick message before a pointless request. Pure: no DOM, no network.
 */

/** Every action tool of `/api/dev/<tool>` (the POST ones). Kept in step with the Worker's list. */
export const DEV_TOOL_IDS = [
  'clock',
  'set-balances',
  'grant-parts',
  'grant-supplies',
  'grant-blueprints',
  'grant-creature',
  'set-creature',
  'set-explorer',
  'set-familiarity',
  'set-crafting-xp',
  'finish-jobs',
  'grant-gear',
  'fill-bag',
  'finish-trips',
  'force-offer',
  'force-gates',
  'set-slots',
  'journal',
  'slot-wipe-notice',
  'dungeon-depth',
  'dungeon-reset',
  'dungeon-streak',
  'dungeon-retry',
  'dungeon-modifiers',
  'dungeon-seed',
  'set-weather',
  'raid-phase',
  'raid-resolve',
  'raid-boss',
  'raid-festival',
  'raid-roster',
  'raid-live',
  'raid-simulate',
  'games-bots',
  'games-run-now',
  'games-reset',
  'analytics-rollup',
  'reset-account',
] as const;
export type DevToolId = (typeof DEV_TOOL_IDS)[number];

export interface Option {
  value: string;
  label: string;
}

interface FieldBase {
  /** The body key (and the key of the value in the form). */
  key: string;
  label: string;
  /** Left empty, the field is left out of the body. */
  optional?: boolean;
}

export type Field =
  | (FieldBase & { kind: 'int'; min: number; max: number; initial?: number })
  | (FieldBase & { kind: 'select'; options: readonly Option[] })
  /** Yes or no; as an optional field it also has "unchanged". */
  | (FieldBase & { kind: 'bool' })
  /** One of the player's own creatures. */
  | (FieldBase & { kind: 'creature' })
  /** Free text; `must` is a word the text has to equal (the reset confirmation). */
  | (FieldBase & { kind: 'text'; must?: string });

export type Values = Readonly<Record<string, string>>;

export interface ToolSpec {
  tool: DevToolId;
  /** The button's text. */
  label: string;
  fields: readonly Field[];
  /** Body keys that are always sent (the variant of a tool that takes one of several shapes). */
  fixed?: Readonly<Record<string, unknown>>;
  /** At least one of the optional fields must be given. */
  needOne?: true;
  /** Builds the body from the (already checked) values itself: a list of values, which one key cannot hold. */
  build?: (values: Values) => Record<string, unknown>;
  /** Makes the button red: it deletes something. */
  danger?: true;
  /** One short line under the button. */
  hint?: string;
}

type BuildResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/** The options a creature picker offers. */
export interface CreatureChoice {
  id: string;
  label: string;
}

function fieldValue(
  field: Field,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (field.kind) {
    case 'int': {
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isInteger(n) || n < field.min || n > field.max) {
        return {
          ok: false,
          error: `${field.label}: a whole number from ${String(field.min)} to ${String(field.max)}`,
        };
      }
      return { ok: true, value: n };
    }
    case 'select':
      return field.options.some((o) => o.value === raw)
        ? { ok: true, value: raw }
        : { ok: false, error: `${field.label}: pick one` };
    case 'bool':
      return raw === 'true' || raw === 'false'
        ? { ok: true, value: raw === 'true' }
        : { ok: false, error: `${field.label}: pick yes or no` };
    case 'creature':
      return raw === ''
        ? { ok: false, error: `${field.label}: pick a creature` }
        : { ok: true, value: raw };
    case 'text':
      return field.must !== undefined && raw !== field.must
        ? { ok: false, error: `${field.label}: type ${field.must}` }
        : { ok: true, value: raw };
  }
}

/** The request body for a spec, or the first problem with what was typed. */
export function buildBody(spec: ToolSpec, values: Values): BuildResult {
  const body: Record<string, unknown> = { ...spec.fixed };
  let given = 0;
  for (const field of spec.fields) {
    const raw = values[field.key] ?? '';
    if (raw === '' && field.optional === true) continue;
    const parsed = fieldValue(field, raw);
    if (!parsed.ok) return parsed;
    if (field.optional === true) given += 1;
    body[field.key] = parsed.value;
  }
  if (spec.needOne === true && given === 0) {
    return { ok: false, error: 'Fill in at least one of the optional fields' };
  }
  if (spec.build !== undefined) return { ok: true, body: { ...spec.fixed, ...spec.build(values) } };
  return { ok: true, body };
}

/** The form's starting values: the first choice of every required list, a creature, and defaults. */
export function initialValues(
  spec: ToolSpec,
  creatures: readonly CreatureChoice[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of spec.fields) {
    if (field.kind === 'int' && field.initial !== undefined) out[field.key] = String(field.initial);
    else if (field.kind === 'select' && field.optional !== true)
      out[field.key] = field.options[0]?.value ?? '';
    else if (field.kind === 'bool' && field.optional !== true) out[field.key] = 'true';
    else if (field.kind === 'creature') out[field.key] = creatures[0]?.id ?? '';
    else out[field.key] = '';
  }
  return out;
}

/** A stable id for a spec (its tool and button text). */
export function specId(spec: ToolSpec): string {
  return `${spec.tool}:${spec.label}`;
}
