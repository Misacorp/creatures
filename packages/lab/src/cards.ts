import { applyCard, type CardOp } from '@creatures/engine/v2';
import { combatV2 } from '@creatures/game/combat-v2';
import type { BossDef } from './types';

/**
 * Boss rule cards (docs/design/combat-v2.md, "Rule cards"). Each one asks the team a question and should have answers from
 * different tools. The cards are data in `@creatures/game/combat-v2` (`cards.json`: a list of operations, and the answers);
 * the engine's `applyCard` builds one on a boss at a strength.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly asks: string;
  /** Only a raid weekend means anything to it (the report's controlled tests and the lab page leave it out). */
  readonly raidOnly?: boolean;
  /** What the card does, as operations (`applyCard`). */
  readonly ops: readonly CardOp[];
  /** The Knack families (by name) and talents (by id) that answer it. */
  readonly answers: readonly string[];
  /** Builds the card on the boss at a strength (bp of the full card, default 10000). */
  readonly apply: (boss: BossDef, strengthBp?: number) => BossDef;
}

export const CARDS: readonly CardDef[] = Object.values(combatV2.cards).map((def) => ({
  ...def,
  apply: (boss, strengthBp) => applyCard(boss, def.ops, strengthBp),
}));

export function card(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

/** A lab boss: a neutral element (no matchups), huge HP for damage tests unless given. */
export function labBoss(opts: {
  rows: number;
  cols: number;
  cards?: readonly string[];
  hp?: number;
  atk?: number;
  rounds?: number;
}): BossDef {
  let boss: BossDef = {
    id: 'lab-golem',
    name: 'Lab Golem',
    element: 'neutral',
    hp: opts.hp ?? 1_000_000,
    atk: opts.atk ?? 110,
    armour: 20,
    spd: 50,
    rounds: opts.rounds ?? 10,
    rows: opts.rows,
    cols: opts.cols,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    moves: [],
    cards: opts.cards ?? [],
    mods: {},
  };
  for (const id of opts.cards ?? []) boss = card(id).apply(boss);
  return boss;
}
