/**
 * The numbers that set the dungeon's difficulty in the lab, as options a report can move without touching the game's data
 * (phase 5, balance.md section 2 item 4; Misa, 2026-11-04: the base dungeon fairly easy, the Undercroft the challenge).
 *
 * What sets it today (the lab's v2 foes):
 * - a foe's HP and Attack: the content's numbers, times the lab scale (`foes.json`, `scale`: HP 23000 bp, Attack 225000 bp), times a depth
 *   factor (`curve`: HP 1600 bp for each depth above 1 plus 45 bp for each square of them, Attack flat), times the foe's own `hpBp` and `atkBp`;
 * - the Undercroft: its foes are built at the run's depth plus `RULES.dungeon.undercroft.depthBonus` (1) for each level, so it has no steepness of
 *   its own: it is as hard as the base floor of a depth one or two deeper, and a fall in the base curve takes the Undercroft down with it.
 *
 * A `FoeKnobs` moves these separately for the base floors and for the Undercroft: a scale (HP and Attack, basis points of today's), a curve
 * (any of the four numbers of `foeCurve`) and, for the Undercroft, the depth bonus a level adds. Nothing here is written to game data.
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
  /** The HP and Attack scale, in basis points of today's (10000 is unchanged). */
  readonly hpMult?: number;
  readonly atkMult?: number;
  readonly curve?: CurveKnob;
}

export interface FoeKnobs {
  readonly base?: FoeKnob;
  readonly undercroft?: FoeKnob;
  /** Depths an Undercroft level adds to the run's depth for its foes (game: 1). */
  readonly undercroftBonus?: number;
}

const memo = new Map<string, FoePack>();

/** The pack a knob builds: the game's, with the scale and curve changed (memoised: a run asks for it for every foe). */
export function packOf(knob: FoeKnob | undefined): FoePack {
  if (knob === undefined) return combatV2;
  const key = JSON.stringify(knob);
  const hit = memo.get(key);
  if (hit) return hit;
  const pack: FoePack = {
    ...combatV2,
    foeScale: {
      hpBp: Math.floor((combatV2.foeScale.hpBp * (knob.hpMult ?? 10_000)) / 10_000),
      atkBp: Math.floor((combatV2.foeScale.atkBp * (knob.atkMult ?? 10_000)) / 10_000),
    },
    foeCurve: { ...combatV2.foeCurve, ...knob.curve },
  };
  memo.set(key, pack);
  return pack;
}
