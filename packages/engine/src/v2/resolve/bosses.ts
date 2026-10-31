/**
 * Bosses as the engine's `BossDef` (combat v2): a raid boss at a strength, and a dungeon foe at a depth. Name, element and Speed come
 * from the shipped content (so they cannot drift), the arena, armour, plain attack, moves, cards and Build-up from the pack, and every
 * rule card is built on at the boss's strength (`applyCard`). What stays with the caller is measurement: which rank a boss stands for,
 * the lab's raid width, the numbers a tuner tries; it passes the numbers in.
 */
import { depthFactorBp, isLandmark } from '@creatures/game';
import type { CombatV2Pack } from '@creatures/game/combat-v2';
import * as cardsMod from '../cards';
import { FULL_STRENGTH_BP, type BossDef, type BossMove } from '../types';
import type { Shipped } from './types';

// Bound once (see `fighters.ts`).
const { applyCard } = cardsMod;

/** The dungeon line: one row of three. */
export const FOE_ROWS = 1;
export const FOE_COLS = 3;

/** The card by id, built on `boss` at a strength. */
function withCard(
  pack: Pick<CombatV2Pack, 'cards'>,
  boss: BossDef,
  id: string,
  strengthBp?: number,
): BossDef {
  const def = Object.hasOwn(pack.cards, id) ? pack.cards[id] : undefined;
  if (!def) throw new Error(`unknown card ${id}`);
  return applyCard(boss, def.ops, strengthBp);
}

/** `boss` with the cards built on, in order, at a strength (default: each card's full). */
export function applyCards(
  pack: Pick<CombatV2Pack, 'cards'>,
  boss: BossDef,
  ids: readonly string[],
  strengthBp?: number,
): BossDef {
  return ids.reduce((b, id) => withCard(pack, b, id, strengthBp), boss);
}

export interface RaidBossOptions {
  /** The arena's columns, and the rounds of a stage: the caller's (the lab's raid is four wide). */
  readonly cols: number;
  readonly rounds: number;
  /** The weekend's shared HP and the Attack (default: the spec's, the high rank's). */
  readonly hp?: number;
  readonly atk?: number;
  /** Armour (default: the spec's at the strength: half of it is the hide, the other half the cards' share, so a weaker card has less). */
  readonly armour?: number;
  /** The strength of every card and gate (bp of the full card, default 10000). */
  readonly strengthBp?: number;
  /** How many of the spec's rule cards the boss has, the first ones (default: all). */
  readonly cards?: number;
  /** Whether the boss has its Build-up (the escalation), default yes. */
  readonly buildUp?: boolean;
  /** Cards on top of the spec's, built at the same strength. */
  readonly extraCards?: readonly string[];
  /** The level of the players' creatures against it (`BossDef.rosterLevel`); unset leaves it to the fight. */
  readonly rosterLevel?: number;
}

/**
 * A raid boss by id: name, element and Speed from the shipped content, the rest from its spec in the pack, with `options` over it. Every
 * card and the Build-up are built at the strength. Throws for an unknown boss.
 */
export function raidBoss(
  pack: Pick<CombatV2Pack, 'raidBosses' | 'cards'>,
  shipped: Pick<Shipped, 'bosses'>,
  id: string,
  options: RaidBossOptions,
): BossDef {
  const spec = Object.hasOwn(pack.raidBosses, id) ? pack.raidBosses[id] : undefined;
  const base = shipped.bosses.find((b) => b.id === id);
  if (!spec || !base) throw new Error(`unknown raid boss ${id}`);
  const st = options.strengthBp ?? FULL_STRENGTH_BP;
  const cards = [
    ...(options.cards === undefined ? spec.cards : spec.cards.slice(0, options.cards)),
    ...(options.extraCards ?? []),
  ];
  const buildUp = options.buildUp ?? true;
  const boss: BossDef = {
    id,
    name: base.name,
    element: base.element,
    hp: options.hp ?? spec.hp,
    atk: options.atk ?? spec.atk,
    armour: options.armour ?? Math.round((spec.armour * (5_000 + Math.floor(st / 2))) / 10_000),
    spd: base.baseSpd ?? 0,
    rounds: options.rounds,
    rows: spec.rows,
    cols: options.cols,
    plain: spec.plain,
    moves: spec.moves,
    cards,
    mods: {},
    strengthBp: st,
    ...(options.rosterLevel === undefined ? {} : { rosterLevel: options.rosterLevel }),
    ...(spec.escalation && buildUp ? { escalation: { ...spec.escalation, strengthBp: st } } : {}),
  };
  return applyCards(pack, boss, cards, st);
}

/** A foe's HP and Attack at a depth: the content's numbers, the pack's scale, then the pack's depth curve. Throws for an unknown foe. */
export function foeStats(
  pack: Pick<CombatV2Pack, 'foes' | 'foeScale' | 'foeCurve'>,
  shipped: Pick<Shipped, 'foes'>,
  id: string,
  depth: number,
): { hp: number; atk: number } {
  const def = shipped.foes.find((f) => f.id === id);
  if (!def) throw new Error(`unknown dungeon foe ${id}`);
  const spec = Object.hasOwn(pack.foes, id) ? pack.foes[id] : undefined;
  const { foeScale: scale, foeCurve: curve } = pack;
  const part = (value: number, scaleBp: number, step: number, bend: number, own: number) =>
    Math.max(
      1,
      Math.floor(
        (Math.floor((Math.floor((value * scaleBp) / 10_000) * own) / 10_000) *
          depthFactorBp(depth, step, bend)) /
          10_000,
      ),
    );
  return {
    hp: part(def.baseHp, scale.hpBp, curve.hpStepBp, curve.hpCurveBp, spec?.hpBp ?? 10_000),
    atk: part(def.baseAtk, scale.atkBp, curve.atkStepBp, curve.atkCurveBp, spec?.atkBp ?? 10_000),
  };
}

/**
 * A dungeon foe at a depth: a one-row arena, its own armour, plain attack, moves and cards; a floor boss gains its signature at a
 * landmark (`signature` decides it instead: an Undercroft keeper always has it). Throws for an unknown foe.
 */
export function foeAt(
  pack: Pick<CombatV2Pack, 'foes' | 'foeScale' | 'foeCurve' | 'cards'>,
  shipped: Pick<Shipped, 'foes'>,
  id: string,
  depth: number,
  options: { readonly signature?: boolean } = {},
): BossDef {
  const spec = Object.hasOwn(pack.foes, id) ? pack.foes[id] : undefined;
  const def = shipped.foes.find((f) => f.id === id);
  if (!spec || !def) throw new Error(`unknown dungeon foe ${id}`);
  const { hp, atk } = foeStats(pack, shipped, id, depth);
  const moves: BossMove[] = [...spec.moves];
  if (spec.signature && (options.signature ?? isLandmark(depth))) moves.push(spec.signature);
  const boss: BossDef = {
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
  return applyCards(pack, boss, spec.cards);
}
