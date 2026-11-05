/**
 * The numbers that set the dungeon's difficulty in the lab, as options a report can move without touching the game's data
 * (phase 5, balance.md section 2 item 4; Misa, 2026-11-04: the base dungeon fairly easy, the Undercroft the challenge).
 *
 * The game's v2 foes (`foes.json`, written from the lab's `base55-u1` option, decision "Combat v2 dungeon baseline"):
 * - the base floors: HP 12650 bp of the content's numbers (55% of the shipped engine's), +200 bp a depth above 1, no square; Attack
 *   225000 bp, flat;
 * - the Undercroft has a scale and a curve of its own (`undercroft`): HP 20700 bp (90%), +300 bp a depth and +2 bp a depth squared. Its foes
 *   are built at the run's depth plus `RULES.dungeon.undercroft.depthBonus` (1) for each level, with that curve.
 *
 * A `FoeKnobs` moves these separately for the base floors and for the Undercroft, as options relative to the game's data: a scale (HP and Attack,
 * basis points of the game's, or an absolute `hpBp` and `atkBp`), a curve (any of the four numbers) and, for the Undercroft, the depth bonus a
 * level adds. An empty knob is the game's own numbers, so `shipped` and `base55-u1` play the same. Nothing here is written to game data.
 */
import { combatV2 } from '@creatures/game/combat-v2';
import type { FoePack } from './foes';

/** The depth curve's four numbers (`foes.json`, `curve`). */
export interface CurveKnob {
  readonly hpStepBp?: number;
  readonly hpCurveBp?: number;
  readonly atkStepBp?: number;
  readonly atkCurveBp?: number;
}

/** A change to the foes of the base floors or of the Undercroft. */
export interface FoeKnob {
  /** The HP and Attack scale, in basis points of the game's (10000 is unchanged), applied after an absolute one. */
  readonly hpMult?: number;
  readonly atkMult?: number;
  /** An absolute HP and Attack scale (basis points of the content's numbers) in place of the game's. */
  readonly hpBp?: number;
  readonly atkBp?: number;
  readonly curve?: CurveKnob;
}

export interface FoeKnobs {
  readonly base?: FoeKnob;
  readonly undercroft?: FoeKnob;
  /** Depths an Undercroft level adds to the run's depth for its foes (game: 1). */
  readonly undercroftBonus?: number;
}

const memo = new Map<string, FoePack>();

/** Which of the game's two sets of foe numbers a knob changes. */
export type FoeSide = 'base' | 'undercroft';

/** The pack a knob builds: the game's numbers of that side, with the scale and curve changed (memoised: a run asks for it for every foe). */
export function packOf(knob: FoeKnob | undefined, side: FoeSide): FoePack {
  const source =
    side === 'base'
      ? { scale: combatV2.foeScale, curve: combatV2.foeCurve }
      : combatV2.foeUndercroft;
  if (side === 'base' && knob === undefined) return combatV2;
  const key = `${side}:${JSON.stringify(knob ?? {})}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const pack: FoePack = {
    ...combatV2,
    foeScale: {
      hpBp: Math.floor(((knob?.hpBp ?? source.scale.hpBp) * (knob?.hpMult ?? 10_000)) / 10_000),
      atkBp: Math.floor(((knob?.atkBp ?? source.scale.atkBp) * (knob?.atkMult ?? 10_000)) / 10_000),
    },
    foeCurve: { ...source.curve, ...knob?.curve },
  };
  memo.set(key, pack);
  return pack;
}

/**
 * The foe numbers before 2026-11-04 (HP scale 23000 bp, +1600 bp a depth and +45 bp a depth squared, the Undercroft on the same curve at one
 * depth more a level): the report's `old-shipped` scenario, and the stand-in of the three foe questions the game's foes no longer ask
 * anywhere (`foeQuestions.ts`). No test of a rule, a plan or a camp uses them any more.
 */
export const OLD_FOES: FoeKnobs = {
  base: { hpBp: 23_000, curve: { hpStepBp: 1_600, hpCurveBp: 45 } },
  undercroft: { hpBp: 23_000, curve: { hpStepBp: 1_600, hpCurveBp: 45 } },
};
