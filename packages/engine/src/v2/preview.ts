/**
 * What a raid board can show before a fight (docs/design/combat/proposals/001-combat-v2.md, "On the board: Targets"): the creatures each
 * boss move would hit with the placement as it stands, so the client lights slots without doing any fight maths. The engine's own
 * targeting answers (`targetsOf`, the anchors, Taunt, the escalation's widening), from the state the next stage starts in.
 *
 * A move whose targets are rolled (a random anchor, a scatter, a random row) or that is Charged (Wind-up) is aimed when it is announced
 * at round start, so it has no answer here (`null`): the board lights it then. Pure: no dice are drawn.
 */
import type { Rng } from '@creatures/game';
import * as boardMod from './board';
import * as escalationMod from './escalation';
import { startState } from './fight';
import * as stateMod from './state';
import type { StageCarry, StageInputV2 } from './types';

const { aimedAt, targetsOf, usesRoll } = boardMod;
const { movesOf } = escalationMod;
const { contextOf, keyOf } = stateMod;

/** A creature key (`FighterSpec.key`, else its uid) per target. */
export interface MovePreview {
  /** The creature the plain attack is aimed at now (a Taunt included); null for none, or when it is rolled. */
  plain: string | null;
  /** By move id: the creatures a fixed-rule move would hit now, or null for a move aimed by a roll or a Wind-up (shown when announced). */
  moves: Readonly<Record<string, readonly string[] | null>>;
}

/** A source of dice that refuses to be asked: a preview of fixed rules draws nothing. */
const NO_DICE: Rng = {
  nextU32() {
    throw new Error('a move preview never rolls dice');
  },
};

/**
 * The preview of a stage's moves for the creatures of `input` (one whose key is in the carry's `out` is left out), at the HP and the
 * escalation the carry holds. `grudge` (last round's top hitter) reads as round 1: the strongest.
 */
export function previewMoves(input: StageInputV2, carry: StageCarry): MovePreview {
  const out = new Set(carry.out);
  const fighters = input.fighters.filter((f) => !out.has(f.key ?? f.uid));
  const hp = new Map<string, number>();
  for (const f of fighters) {
    const h = carry.hp[f.key ?? f.uid];
    if (h !== undefined) hp.set(f.uid, h);
  }
  const s = startState(
    contextOf(input),
    input.boss,
    fighters,
    {
      ...input.options,
      carryHp: hp,
      ...(carry.escalation ? { carryEscalation: carry.escalation } : {}),
      bossHp: carry.bossHp,
      shadowHp: carry.shadowHp,
    },
    NO_DICE,
  );
  s.round = 1;
  const plain = input.boss.plain.pattern;
  const rolled = usesRoll(plain);
  const aim = rolled ? undefined : aimedAt(s, plain, true);
  const moves: Record<string, readonly string[] | null> = {};
  for (const m of movesOf(s)) {
    moves[m.id] = m.charged || usesRoll(m.pattern) ? null : targetsOf(s, m.pattern, false).map(keyOf);
  }
  return {
    plain: aim === undefined ? null : keyOf(aim),
    moves,
  };
}
