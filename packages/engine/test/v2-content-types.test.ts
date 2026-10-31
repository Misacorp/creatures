/**
 * The game's combat v2 content schemas and the engine's types describe the same shapes (the game cannot import the engine, so each
 * side has its own copy). The type assertions below fail `pnpm typecheck` when either side gains, loses or changes a field: add the
 * field to both. The test at the end checks that the two lists of additive effect fields hold the same names.
 */
import type { CombatRules, Fx } from '@creatures/game/combat-v2';
import { ADDITIVE_FIELDS as GAME_ADDITIVE_FIELDS } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { ADDITIVE_FIELDS, type KnackFx, type V2Rules } from '../src/v2';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// A drift between the game's schema and the engine's type is a type error on the line that is `true`.
const fxSame: Equal<Fx, KnackFx> = true;
const rulesSame: Equal<CombatRules, V2Rules> = true;

describe('combat v2 content types', () => {
  it('the game schema for effects equals the engine KnackFx, and the rules likewise (checked by the typecheck)', () => {
    expect(fxSame).toBe(true);
    expect(rulesSame).toBe(true);
  });

  it('the additive field lists hold the same names', () => {
    expect([...GAME_ADDITIVE_FIELDS].sort()).toEqual([...ADDITIVE_FIELDS].sort());
  });
});
