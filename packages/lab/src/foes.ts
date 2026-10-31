/**
 * The daily dungeon's foes and floor bosses as combat v2 `BossDef`s: one line of three, then the foe (R8.7: one boss turn
 * after the line), with HP and Attack set by a depth. Id, name, kind, element and round count come from the content
 * (`dungeon-foes.json`), so they cannot drift; the stats are scaled by the dungeon's own depth curve; the armour, plain
 * attack, moves and rule cards are data in `@creatures/game/combat-v2` (`foes.json`), in the grammar of the engine's `types.ts`.
 *
 * Misa's direction (2026-10-28): the foes may change freely, so each one asks its own question instead of repeating a
 * shipped gimmick. A dungeon shows its encounters up front but sends many different foes, so it needs an all-round
 * team, and it is tough, so the camp (a rest between rooms) matters. Fourth panel (2026-10-28): three foes ask a question
 * the classic line fails unless it answers it (`needs`: a Guard, a silence ward, something for armour), and the depth
 * curve grows one stat, HP, so a deeper foe is a longer fight and not a harder-hitting one. The runs on the shipped map,
 * the camp and the Undercroft are in `dungeon.ts`.
 */
import { depthFactorBp, dungeonContent, isLandmark } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { card } from './cards';
import type { BossDef, BossMove, Escalation } from './types';

/** The dungeon line: one row of three. */
export const FOE_ROWS = 1;
export const FOE_COLS = 3;

/**
 * Lab scale of a foe's content numbers (basis points of them): the content's HP and Attack were made for the shipped
 * engine, and a v2 creature is bigger with flat armour, so the lab multiplies both. Data (`foes.json`, `scale`).
 */
export const FOE_BASE = combatV2.foeScale;

/**
 * The lab's depth curve, in the shape of the dungeon's (`depthFactorBp`: 10000 plus a step for each depth above 1 plus a
 * curve for each square of them). It grows one stat: HP (a foe's Attack is the same at every depth; Attack growth on top
 * of HP growth tested worse, a double step the best team never recovered from). It is gentler than the shipped one: the
 * lab's creatures are all at their level cap, so there is no levelling wall to climb. Tuned (2026-10-28) so a good
 * all-round team with a plan clears over half of its runs at depths 1 to 8 (about 100% at depth 1 down to about 70% at depth 8),
 * the Undercroft below is harder, and the classic line falls away by depth 3. Lab depths are not the shipped depth numbers.
 * Data (`foes.json`, `curve`).
 */
export const FOE_CURVE = combatV2.foeCurve;

export interface FoeSpec {
  readonly id: string;
  readonly armour: number;
  readonly plain: BossDef['plain'];
  readonly moves: readonly BossMove[];
  /** A floor boss's landmark move: only at a landmark depth, announced at round start. */
  readonly signature?: BossMove;
  readonly cards: readonly string[];
  readonly escalation?: Escalation;
  /** The question the foe asks the team (for the report). */
  readonly asks: string;
  /** A foe that asks a hard question is tuned on its own: its HP and Attack, in basis points of the lab's scaled numbers (10000 is unchanged). */
  readonly hpBp?: number;
  readonly atkBp?: number;
  /**
   * Set when the classic line (Tidewing, Tempestray, Thornbuck) fails the foe unless it answers the question (tested):
   * `guard` (a team with no Guard loses a hitter), `ward` (a team with no silence ward loses its Setter and Guard to the
   * silence) or `pierce` (a team with nothing to get past its bark makes no dent).
   */
  readonly needs?: 'guard' | 'ward' | 'pierce';
}

/** The foes (data: `foes.json`, in the order of the file; the floor bosses come last). */
export const FOE_SPECS: readonly FoeSpec[] = Object.values(combatV2.foes).map((f) => ({
  id: f.id,
  armour: f.armour,
  plain: f.plain,
  moves: f.moves,
  ...(f.signature ? { signature: f.signature } : {}),
  cards: f.cards,
  ...(f.escalation ? { escalation: f.escalation } : {}),
  asks: f.asks,
  ...(f.hpBp !== undefined ? { hpBp: f.hpBp } : {}),
  ...(f.atkBp !== undefined ? { atkBp: f.atkBp } : {}),
  ...(f.needs ? { needs: f.needs } : {}),
}));

export const FOE_IDS: readonly string[] = FOE_SPECS.map((s) => s.id);

/** The depths the report looks at (7 is the first landmark, where a floor boss has its signature move). */
export const DUNGEON_DEPTHS: readonly number[] = [1, 3, 5, 7];

/** A foe's HP and Attack at a depth: the content's numbers, the lab scale, then the dungeon's depth curve. */
export function foeStats(id: string, depth: number): { hp: number; atk: number } {
  const def = dungeonContent.foes.find((f) => f.id === id);
  if (!def) throw new Error(`unknown dungeon foe ${id}`);
  const spec = FOE_SPECS.find((s) => s.id === id);
  const part = (value: number, scale: number, step: number, curve: number, own: number) =>
    Math.max(
      1,
      Math.floor(
        (Math.floor((Math.floor((value * scale) / 10_000) * own) / 10_000) *
          depthFactorBp(depth, step, curve)) /
          10_000,
      ),
    );
  return {
    hp: part(
      def.baseHp,
      FOE_BASE.hpBp,
      FOE_CURVE.hpStepBp,
      FOE_CURVE.hpCurveBp,
      spec?.hpBp ?? 10_000,
    ),
    atk: part(
      def.baseAtk,
      FOE_BASE.atkBp,
      FOE_CURVE.atkStepBp,
      FOE_CURVE.atkCurveBp,
      spec?.atkBp ?? 10_000,
    ),
  };
}

/**
 * A dungeon foe at a depth: a one-row arena, its own armour, plain attack, moves and cards; a floor boss gains its
 * signature at a landmark (`signature` decides it instead: an Undercroft keeper always has it).
 */
export function foeAt(id: string, depth: number, options: { signature?: boolean } = {}): BossDef {
  const spec = FOE_SPECS.find((s) => s.id === id);
  const def = dungeonContent.foes.find((f) => f.id === id);
  if (!spec || !def) throw new Error(`unknown dungeon foe ${id}`);
  const { hp, atk } = foeStats(id, depth);
  const moves = [...spec.moves];
  if (spec.signature && (options.signature ?? isLandmark(depth))) moves.push(spec.signature);
  let boss: BossDef = {
    id,
    name: def.name,
    element: def.element,
    hp,
    atk,
    armour: spec.armour,
    spd: def.baseSpd ?? 0,
    rounds: def.rounds,
    rows: FOE_ROWS,
    cols: FOE_COLS,
    plain: spec.plain,
    moves,
    cards: spec.cards,
    mods: {},
    ...(spec.escalation ? { escalation: spec.escalation } : {}),
  };
  for (const c of spec.cards) boss = card(c).apply(boss);
  return boss;
}
