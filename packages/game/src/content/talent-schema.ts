/**
 * Talent content (`data/talents.json`): schemas and load-time checks
 * (docs/design/gear-and-creatures-v2.md section 8). A talent is a small permanent line that a creature
 * carries in one of its slots. It uses the same vocabulary as gear: its effect is a gear line (`first-pounce`,
 * `ember-reaction`, `armor`) at one fixed value, folded into the creature's stats and modifier sheet by the
 * same function that folds gear (`wornEffects`), or one of the two rules only talents have (`speed` and
 * `glimmerFind`). Every line of creatures has a pool of 7 to 8 talents (branch forms share their line's
 * pool); the epic and Festival species have a fixed signature talent besides.
 *
 * `deferred` lists talents the design names that need engine or training work that is not built yet. They
 * are never in a pool, so none can be rolled; the list keeps them from being forgotten.
 */
import * as v from 'valibot';
import type { GearLine, LineUnit } from './gear-schema';
import { IdSchema } from './schema';

/** The rules only talents have. */
export const TALENT_RULES = ['speed', 'glimmerFind'] as const;
export type TalentRule = (typeof TALENT_RULES)[number];

/** How a talent-only rule reads: its name on the card, its unit and one plain sentence. */
export const TALENT_RULE_INFO: Record<TalentRule, { name: string; unit: LineUnit; about: string }> =
  {
    speed: { name: 'Speed', unit: 'pct', about: 'Dodges more often.' },
    glimmerFind: {
      name: 'Glimmer finds',
      unit: 'pct',
      about: 'More chance of a glimmer on its trips.',
    },
  };

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const Value = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000));

/** What a talent does: a gear line by id, or one of the talent-only rules. */
export const TalentEffectSchema = v.union([
  v.strictObject({ line: IdSchema }),
  v.strictObject({ rule: v.picklist(TALENT_RULES) }),
]);
export type TalentEffect = v.InferOutput<typeof TalentEffectSchema>;

export const TalentSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  effect: TalentEffectSchema,
  /** The normal value, in the unit of the line (basis points for `pct` and `pt`, whole numbers for `flat`). */
  value: Value,
});
export type TalentDef = v.InferOutput<typeof TalentSchema>;

const DeferredSchema = v.strictObject({
  id: IdSchema,
  line: IdSchema,
  name: Name,
  needs: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
});
export type DeferredTalent = v.InferOutput<typeof DeferredSchema>;

export const TalentFileSchema = v.strictObject({
  pools: v.record(IdSchema, v.pipe(v.array(TalentSchema), v.minLength(1), v.maxLength(12))),
  signatures: v.record(IdSchema, TalentSchema),
  deferred: v.array(DeferredSchema),
});

/** The talents of the shipped content, checked against the species and the gear lines. */
export interface TalentPack {
  /** Every line's pool, in content order (the draw is even across it). */
  pools: ReadonlyMap<string, readonly TalentDef[]>;
  /** The fixed signature talent of a line (epic and Festival species). */
  signatures: ReadonlyMap<string, TalentDef>;
  deferred: readonly DeferredTalent[];
  /** Every talent (pool and signature) by id. */
  byId: ReadonlyMap<string, TalentDef>;
}

/** The pool size every line has: 7 or 8 talents. */
export const POOL_SIZE = { min: 7, max: 8 } as const;

function fail(message: string): never {
  throw new Error(`Invalid talent content: ${message}`);
}

/** A species as far as the talent checks need it. */
export interface TalentSpeciesRef {
  id: string;
  line: string;
  rarity: 'common' | 'rare' | 'epic';
  festival?: boolean | undefined;
}

/**
 * Validates raw talent content and returns it typed. Throws an Error naming the first problem. Checks:
 * every line of the species has one pool of 7 to 8 talents, ids are unique across pools, signatures and
 * the deferred list, every effect names a real line (and a value its unit allows), the epic and Festival
 * species have a signature (and no one else has), and no deferred talent is in a pool.
 */
export function loadTalents(
  raw: unknown,
  species: readonly TalentSpeciesRef[],
  lines: ReadonlyMap<string, GearLine>,
): TalentPack {
  const parsed = v.safeParse(TalentFileSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid talents schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const file = parsed.output;

  const lineIds = new Set(species.map((s) => s.line));
  for (const line of lineIds) {
    const pool = file.pools[line];
    if (pool === undefined) fail(`line "${line}" has no talent pool`);
    if (pool.length < POOL_SIZE.min || pool.length > POOL_SIZE.max) {
      fail(
        `the pool of "${line}" has ${String(pool.length)} talents, expected ${String(POOL_SIZE.min)} to ${String(POOL_SIZE.max)}`,
      );
    }
  }
  for (const line of Object.keys(file.pools)) {
    if (!lineIds.has(line)) fail(`a talent pool is for the unknown line "${line}"`);
  }

  const byId = new Map<string, TalentDef>();
  const check = (talent: TalentDef, where: string): void => {
    if (byId.has(talent.id)) fail(`duplicate talent id "${talent.id}"`);
    byId.set(talent.id, talent);
    if ('line' in talent.effect) {
      const line = lines.get(talent.effect.line);
      if (line === undefined)
        fail(`talent "${talent.id}" (${where}) uses unknown line "${talent.effect.line}"`);
      if (line.unit === 'once' && talent.value !== 1) {
        fail(`talent "${talent.id}" has a once-only effect, its value must be 1`);
      }
      if (line.reduction && line.unit !== 'once' && talent.value >= 10_000) {
        fail(`talent "${talent.id}" would cut damage by 100% or more`);
      }
      if (line.local) fail(`talent "${talent.id}" cannot be a line of an item's own stat`);
      if (line.group === 'festival')
        fail(`talent "${talent.id}" cannot be a Festival piece's line`);
    } else if (talent.value >= 10_000) {
      fail(`talent "${talent.id}" is too large for a rule`);
    }
  };
  const pools = new Map<string, readonly TalentDef[]>();
  for (const [line, pool] of Object.entries(file.pools)) {
    for (const talent of pool) check(talent, `pool of ${line}`);
    pools.set(line, pool);
  }

  const signatures = new Map<string, TalentDef>();
  for (const [line, talent] of Object.entries(file.signatures)) {
    if (!lineIds.has(line)) fail(`a signature is for the unknown line "${line}"`);
    check(talent, `signature of ${line}`);
    signatures.set(line, talent);
  }
  for (const s of species) {
    const wants = s.rarity === 'epic';
    if (wants && !signatures.has(s.line))
      fail(`the epic line "${s.line}" needs a signature talent`);
    if (!wants && signatures.has(s.line)) {
      fail(`the line "${s.line}" is not epic and cannot have a signature talent`);
    }
  }

  const deferredIds = new Set<string>();
  for (const d of file.deferred) {
    if (deferredIds.has(d.id)) fail(`duplicate deferred talent "${d.id}"`);
    deferredIds.add(d.id);
    if (byId.has(d.id)) fail(`deferred talent "${d.id}" is in a pool, so it is not deferred`);
    if (!lineIds.has(d.line)) fail(`deferred talent "${d.id}" is for the unknown line "${d.line}"`);
  }
  return { pools, signatures, deferred: file.deferred, byId };
}
