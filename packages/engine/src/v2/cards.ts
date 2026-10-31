/**
 * Boss rule cards as data (docs/design/combat/content-as-data.md, section 4): a card is a list of operations, and `applyCard`
 * builds them on a boss at a strength. The game's `cards.json` holds the lists (its schema, `CardOpSchema`, describes the
 * same shapes as `CardOp` here: a type test checks that both ways).
 *
 * Strength is bp of the full card (10000 is full). `share(v)` is `floor(v x strength / 10000)`: a number a card adds or sets is
 * its share at the card's strength, so a weaker card changes less. Applying any card also sets `boss.strengthBp` to the card's
 * strength, which the engine reads for the gates (reflection, Shake It Off, silences, the Build-up, ...); every place that
 * applies a card does so at the boss's own strength or at full strength, and an unset strength is full, so nothing else moves.
 */
import { FULL_STRENGTH_BP, type BossDef, type BossMove, type Pattern } from './types';

/** The mods a `flag` operation turns on. */
export type CardFlag = 'shedMarks' | 'reflectFirst' | 'fizzle' | 'adapts' | 'adaptsElement';
/** The mods a `mod` operation sets to a number. */
export type CardModNumber = 'shakeEvery' | 'wardBp' | 'healBp';

export type CardOp =
  /** A stat plus its share: Thick Hide (armour 70), Elusive (Speed 300). */
  | { readonly op: 'add'; readonly stat: 'armour' | 'spd'; readonly value: number }
  /** A stat set to its share: Slippery (dodge 2500 bp), Lucky Strike (crit chance 2000 bp). */
  | { readonly op: 'set'; readonly stat: 'dodgeBp' | 'critChanceBp'; readonly value: number }
  /** A stat raised by the share of `bp`: Wither (Attack, 2000 bp), rounded down. */
  | { readonly op: 'raise'; readonly stat: 'atk'; readonly bp: number }
  /** Turns a standing rule on, at the card's strength (the engine reads the boss's `strengthBp`). */
  | { readonly op: 'flag'; readonly mod: CardFlag }
  /** A number mod: `base` plus the share of `plus`, or `base` minus the share of `minus`; with neither, `base` as it is (Shake It Off: every 3). */
  | {
      readonly op: 'mod';
      readonly mod: CardModNumber;
      readonly base: number;
      readonly plus?: number;
      readonly minus?: number;
    }
  /** No hit above `value x 10000 / strength` (a weaker card caps higher); no cap at strength 0 (Stone Skin). */
  | { readonly op: 'cap'; readonly value: number }
  /** Adds a move: `power` scales its power by the strength (at least 1 bp, so it still lands); `gate` gives it the strength as its gate's. */
  | { readonly op: 'move'; readonly move: BossMove; readonly scale: 'power' | 'gate' }
  /** The plain attack aims at a new pattern, its power raised by the share of `raiseBp` (Grudge). */
  | { readonly op: 'plain'; readonly aim: Pattern; readonly raiseBp: number }
  /** The plain attack is replaced; its `hits` are the full card's, rounded by strength, at least 1 (Swarm). */
  | {
      readonly op: 'plain';
      readonly replace: { readonly pattern: Pattern; readonly powerBp: number };
      readonly hits: number;
    };

/** The card's operations built on `boss` at `strengthBp` (default full); the boss's own `strengthBp` becomes the card's. */
export function applyCard(
  boss: BossDef,
  ops: readonly CardOp[],
  strengthBp: number = FULL_STRENGTH_BP,
): BossDef {
  const share = (value: number): number => Math.floor((value * strengthBp) / 10_000);
  let b: BossDef = { ...boss, strengthBp };
  for (const o of ops) {
    switch (o.op) {
      case 'add':
        b = { ...b, [o.stat]: b[o.stat] + share(o.value) };
        break;
      case 'set':
        b = { ...b, [o.stat]: share(o.value) };
        break;
      case 'raise':
        b = { ...b, [o.stat]: Math.floor((b[o.stat] * (10_000 + share(o.bp))) / 10_000) };
        break;
      case 'flag':
        b = { ...b, mods: { ...b.mods, [o.mod]: true } };
        break;
      case 'mod': {
        const value =
          o.plus !== undefined
            ? o.base + share(o.plus)
            : o.minus !== undefined
              ? o.base - share(o.minus)
              : o.base;
        b = { ...b, mods: { ...b.mods, [o.mod]: value } };
        break;
      }
      case 'cap':
        if (strengthBp > 0)
          b = {
            ...b,
            mods: { ...b.mods, capPerHit: Math.floor((o.value * 10_000) / strengthBp) },
          };
        break;
      case 'move': {
        const move: BossMove =
          o.scale === 'power'
            ? { ...o.move, powerBp: Math.max(1, share(o.move.powerBp)) }
            : { ...o.move, strengthBp };
        b = { ...b, moves: [...b.moves, move] };
        break;
      }
      case 'plain':
        b =
          'aim' in o
            ? {
                ...b,
                plain: {
                  ...b.plain,
                  pattern: o.aim,
                  powerBp: Math.floor((b.plain.powerBp * (10_000 + share(o.raiseBp))) / 10_000),
                },
              }
            : {
                ...b,
                plain: {
                  pattern: o.replace.pattern,
                  powerBp: o.replace.powerBp,
                  hits: Math.max(1, Math.round((o.hits * strengthBp) / 10_000)),
                },
              };
        break;
    }
  }
  return b;
}
