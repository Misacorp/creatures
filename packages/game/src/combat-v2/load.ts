/**
 * Loads and checks the combat v2 content (docs/design/combat/content-as-data.md, section 3): each file against its
 * schema, then the cross-references. Every failure throws `Invalid combat v2 content: ...` and names the entry.
 */
import * as v from 'valibot';
import { ADDITIVE_FIELDS } from './fx-schema';
import { RulesSchema, type CombatRules } from './rules-schema';
import {
  FormFileSchema,
  KnackFileSchema,
  POOL_SIZE,
  TalentFileSchema,
  type FormDef,
  type KnackDef,
  type TalentDef,
} from './schema';

/** The raw files, as read from `data/*.json`. */
export interface RawCombatV2 {
  readonly rules: unknown;
  readonly knacks: unknown;
  readonly forms: unknown;
  readonly talents: unknown;
}

/** A shipped species, as far as the checks need it. */
export interface CombatSpeciesRef {
  readonly id: string;
  readonly line: string;
}

/**
 * The loaded combat v2 content. The maps keep the order of the files (searches iterate them in order), and
 * the ids are never integer-like, so the order of the keys is the order of the entries.
 */
export interface CombatV2Pack {
  readonly rules: CombatRules;
  /** Knack family name to its rule. */
  readonly families: Readonly<Record<string, string>>;
  readonly knacks: Readonly<Record<string, KnackDef>>;
  /** By form id: armour, own Knacks and stat changes. */
  readonly forms: Readonly<Record<string, FormDef>>;
  readonly talents: Readonly<Record<string, TalentDef>>;
  /** Line id to its pool: talent ids. */
  readonly pools: Readonly<Record<string, readonly string[]>>;
}

function fail(message: string): never {
  throw new Error(`Invalid combat v2 content: ${message}`);
}

function parse<S extends v.GenericSchema>(schema: S, raw: unknown, file: string): v.InferOutput<S> {
  const parsed = v.safeParse(schema, raw);
  if (parsed.success) return parsed.output;
  const first = parsed.issues[0];
  const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
  return fail(`${file} at "${path}": ${first?.message ?? 'unknown error'}`);
}

const ADDITIVE: ReadonlySet<string> = new Set(ADDITIVE_FIELDS);

/**
 * Validates the raw files and returns the typed pack. Throws an Error naming the first problem. Checks: every
 * Knack's family exists; every form is a shipped form and every shipped form has an entry with at least one own
 * Knack; every Knack a form names exists and every Knack is on at least one form; ids are unique; every talent
 * in a pool exists, each pool holds seven talents and each pool is a shipped line's; a talent's effects use only
 * the additive fields and never Seal; every rules field is present (the schema).
 */
export function loadCombatV2(raw: RawCombatV2, species: readonly CombatSpeciesRef[]): CombatV2Pack {
  const rules = parse(RulesSchema, raw.rules, 'rules.json');
  const knackFile = parse(KnackFileSchema, raw.knacks, 'knacks.json');
  const formFile = parse(FormFileSchema, raw.forms, 'forms.json');
  const talentFile = parse(TalentFileSchema, raw.talents, 'talents.json');

  const families: Record<string, string> = {};
  for (const f of knackFile.families) {
    if (Object.hasOwn(families, f.name)) fail(`duplicate Knack family "${f.name}"`);
    families[f.name] = f.text;
  }

  const knacks: Record<string, KnackDef> = {};
  for (const k of knackFile.knacks) {
    if (Object.hasOwn(knacks, k.id)) fail(`duplicate Knack id "${k.id}"`);
    if (!Object.hasOwn(families, k.family))
      fail(`Knack "${k.id}" has the unknown family "${k.family}"`);
    knacks[k.id] = k;
  }

  const shipped = new Set(species.map((s) => s.id));
  const forms: Record<string, FormDef> = {};
  const onAForm = new Set<string>();
  for (const f of formFile) {
    if (Object.hasOwn(forms, f.id)) fail(`duplicate form "${f.id}"`);
    if (!shipped.has(f.id)) fail(`form "${f.id}" is not a shipped form`);
    for (const k of f.ownKnacks) {
      if (!Object.hasOwn(knacks, k)) fail(`form "${f.id}" names the unknown Knack "${k}"`);
      onAForm.add(k);
    }
    forms[f.id] = f;
  }
  for (const s of species) {
    // The schema already needs one own Knack per entry; this is the missing entry.
    if (!Object.hasOwn(forms, s.id)) fail(`shipped form "${s.id}" has no entry with an own Knack`);
  }
  for (const id of Object.keys(knacks)) {
    if (!onAForm.has(id)) fail(`Knack "${id}" is on no form`);
  }

  const talents: Record<string, TalentDef> = {};
  for (const t of talentFile.talents) {
    if (Object.hasOwn(talents, t.id)) fail(`duplicate talent id "${t.id}"`);
    if (t.fx.seal !== undefined) fail(`talent "${t.id}" uses seal, which is never a talent`);
    for (const field of Object.keys(t.fx)) {
      if (!ADDITIVE.has(field))
        fail(`talent "${t.id}" uses "${field}", which is not an additive effect field`);
    }
    talents[t.id] = t;
  }

  const lines = new Set(species.map((s) => s.line));
  const pools: Record<string, readonly string[]> = {};
  for (const [line, pool] of Object.entries(talentFile.pools)) {
    if (!lines.has(line)) fail(`a talent pool is for "${line}", which is not a shipped line`);
    if (pool.length !== POOL_SIZE)
      fail(
        `the pool of "${line}" has ${String(pool.length)} talents, expected ${String(POOL_SIZE)}`,
      );
    for (const id of pool) {
      if (!Object.hasOwn(talents, id))
        fail(`the pool of "${line}" names the unknown talent "${id}"`);
    }
    if (new Set(pool).size !== pool.length) fail(`the pool of "${line}" repeats a talent`);
    pools[line] = pool;
  }

  return { rules, families, knacks, forms, talents, pools };
}
