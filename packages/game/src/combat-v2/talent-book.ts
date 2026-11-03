/**
 * Rolling the v2 talents (R20, docs/design/combat/proposals/001-combat-v2.md): a catch rolls one from its line's
 * pool, and a role change (R20.8) replaces each slotted talent that is idle for the new role with a roll from the
 * talents that work for it. Pure over the pack's `talents` and `pools`; randomness is injected (`Rng`): the
 * server passes its live crypto source, tests a seeded one. `index.ts` binds these to the shipped content.
 */
import type { Role } from '../content/schema';
import { chance, int, type Rng } from '../rng';
import { RULES } from '../rules/config';
import type { TalentDef } from './schema';

/** What the v2 talent rules need from the loaded pack. */
export interface TalentPack {
  readonly talents: Readonly<Record<string, TalentDef>>;
  readonly pools: Readonly<Record<string, readonly string[]>>;
}

/** A v2 talent a catch or a role change rolled, and whether it came out golden. */
export interface V2Roll {
  talentId: string;
  golden: boolean;
}

/** A line's pool, talent ids in the file's order. Empty for a line with no pool. */
export function v2PoolOf(pack: TalentPack, line: string): readonly string[] {
  return pack.pools[line] ?? [];
}

/** True when the talent does something for the role (it is idle on any other). False for an unknown id. */
export function talentWorksFor(pack: TalentPack, talentId: string, role: Role): boolean {
  return pack.talents[talentId]?.roles.includes(role) ?? false;
}

/**
 * Rolls one talent of a line's pool: even across the candidates, then golden with today's golden chance
 * (`RULES.talents.golden`). Candidates are the pool minus `exclude`, and with `role` only the talents that work
 * for that role. Draws the pick, then the golden. Returns null when no candidate is left (nothing is drawn).
 * Throws for a line with no pool.
 */
export function rollV2Talent(
  pack: TalentPack,
  rng: Rng,
  line: string,
  options: { exclude?: ReadonlySet<string>; role?: Role } = {},
): V2Roll | null {
  const pool = v2PoolOf(pack, line);
  if (pool.length === 0) throw new RangeError(`line "${line}" has no v2 talent pool`);
  const { exclude, role } = options;
  const candidates = pool.filter(
    (id) =>
      (exclude === undefined || !exclude.has(id)) &&
      (role === undefined || talentWorksFor(pack, id, role)),
  );
  if (candidates.length === 0) return null;
  const talentId = candidates[int(rng, candidates.length)] as string;
  const { numerator, denominator } = RULES.talents.golden;
  return { talentId, golden: chance(rng, numerator, denominator) };
}
