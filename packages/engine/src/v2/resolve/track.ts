/**
 * The boss track in the engine (combat v2, R14.1, R24; docs/design/combat/boss-track.md): the raid boss a server meets at a track slot
 * (the Boss Rank), for a party of any size. The numbers, the card strengths and the ramp come from `raid-track.json` through the pack; the
 * shipped bosses give names, elements and Speed. Like `raidBoss`, everything content comes in as an argument. What is measurement (the
 * rosters a slot is tuned for, the arrival weeks, the tuner's tables, the rank ladder past the data) stays in the lab, which builds a
 * boss from its own derivation with `slotBossOf`.
 *
 * R14.1: the boss's numbers are tuned for four players. A bigger party fights a wider arena with the HP times `(players / 4) ^ 0.7` and the
 * Attack times `(players / 4) ^ 0.3`; a party under four fights at four columns (guests fill the rest).
 */
import type { CombatV2Pack } from '@creatures/game/combat-v2';
import type { BossDef } from '../types';
import { FULL_STRENGTH_BP } from '../types';
import { raidBoss } from './bosses';
import type { Shipped } from './types';

/** The rounds of a raid stage (R14: the round count restarts each stage) and the arena's columns for the usual four players. */
export const RAID_ROUNDS = 8;
export const RAID_COLS = 4;

/**
 * How a raid boss's weekend HP grows with the number of players (panel 5): `(players / 4) ^ RAID_HP_EXPONENT`, one
 * exponent for every boss and one smooth curve, with no kink at any width. The boss's area counts grow too (`perColumns`).
 */
export const RAID_HP_EXPONENT = 0.7;

/**
 * How a raid boss's Attack grows with the number of players (panel 5 fix, tool gap at 10 players): `(players / 4) ^ RAID_ATK_EXPONENT`.
 * A wider raid spreads each hit over more creatures, so with the HP alone a wide line of the same creatures won without its tool.
 */
export const RAID_ATK_EXPONENT = 0.3;

/** The weekend HP of a raid boss for `cols` players, as a multiple of its HP for the usual four. */
export function raidHpFactor(
  boss: Pick<BossDef, 'cols'>,
  cols: number,
  exponent: number = RAID_HP_EXPONENT,
): number {
  return (cols / boss.cols) ** exponent;
}

/** The boss in an arena of `cols` columns, one player each: the arena is wider and the weekend HP and Attack have grown with the players. */
export function wideBoss(
  boss: BossDef,
  cols: number,
  exponent: number = RAID_HP_EXPONENT,
  atkExponent: number = RAID_ATK_EXPONENT,
): BossDef {
  return {
    ...boss,
    cols,
    hp: Math.round(boss.hp * raidHpFactor(boss, cols, exponent)),
    atk: Math.round(boss.atk * (cols / boss.cols) ** atkExponent),
  };
}

/** A boss's HP, Attack and armour before its rule cards (absolute). */
export interface BossNumbers {
  readonly hp: number;
  readonly atk: number;
  readonly armour: number;
}

/** What a track slot says about its boss: which, how strong its cards, how many of them, whether it escalates, and its numbers. */
export interface SlotSpec {
  /** The slot, and the Boss Rank it stands for (slot 1 is Boss Rank 1). */
  readonly slot: number;
  readonly bossId: string;
  /** The strength of every card and gate (bp of the full card). */
  readonly strengthBp: number;
  /** How many of the boss's own rule cards it has, the first ones; absent: all (the young-server ramp gives slots 1 and 2 fewer). */
  readonly cards?: number;
  /** Whether the boss has its escalation. */
  readonly buildUp: boolean;
  /** Cards the slot adds on top of the boss's own (a later lap's new card). */
  readonly extraCards: readonly string[];
  readonly numbers: BossNumbers;
}

type TrackPack = Pick<CombatV2Pack, 'raidTrack' | 'raidBosses'>;

/**
 * Slot `slot` (1 and up) of the track, read from the pack. The data lists slots 1 to N (three laps today). After it the track goes on at
 * full strength with the full set of rules, the boss's own numbers (the high rank's) and the extra cards the same boss had on its last lap
 * in the data. Throws for a slot below 1 or a boss without a spec.
 */
export function slotSpec(pack: TrackPack, slot: number): SlotSpec {
  if (!Number.isInteger(slot) || slot < 1)
    throw new Error(`a track slot is a whole number from 1, not ${slot}`);
  const { order, slots } = pack.raidTrack;
  const bossId = order[(slot - 1) % order.length] as string;
  const row = slots[slot - 1];
  if (row) {
    return {
      slot,
      bossId,
      strengthBp: row.strengthBp,
      cards: row.cards,
      buildUp: row.buildUp,
      extraCards: row.extraCards,
      numbers: { hp: row.hp, atk: row.atk, armour: row.armour },
    };
  }
  const own = Object.hasOwn(pack.raidBosses, bossId) ? pack.raidBosses[bossId] : undefined;
  if (!own) throw new Error(`unknown raid boss ${bossId}`);
  // The same boss's last lap in the data: the latest slot at or before the end of the data that is a whole number of laps back.
  const back = Math.ceil((slot - slots.length) / order.length) * order.length;
  return {
    slot,
    bossId,
    strengthBp: FULL_STRENGTH_BP,
    buildUp: true,
    extraCards: slots[slot - back - 1]?.extraCards ?? [],
    numbers: { hp: own.hp, atk: own.atk, armour: own.armour },
  };
}

export interface SlotBossOptions {
  /** The level of the players' creatures the boss names for its picks (`BossDef.rosterLevel`); unset leaves it to the fight. */
  readonly level?: number;
}

/**
 * The boss of a slot as a four-player boss, built with `raidBoss`: the spec's numbers, its cards at the slot's strength, and only the rules
 * the ramp gives it. The lab builds the spec from its own derivation (a tuner's table, another order); the game's `trackBoss` reads the pack's.
 */
export function slotBossOf(
  pack: Pick<CombatV2Pack, 'raidBosses' | 'cards'>,
  shipped: Pick<Shipped, 'bosses'>,
  spec: SlotSpec,
  options: SlotBossOptions = {},
): BossDef {
  return raidBoss(pack, shipped, spec.bossId, {
    ...spec.numbers,
    strengthBp: spec.strengthBp,
    ...(spec.cards === undefined ? {} : { cards: spec.cards }),
    buildUp: spec.buildUp,
    ...(spec.extraCards.length ? { extraCards: spec.extraCards } : {}),
    rounds: RAID_ROUNDS,
    cols: RAID_COLS,
    ...(options.level === undefined ? {} : { rosterLevel: options.level }),
  });
}

export interface TrackBossOptions extends SlotBossOptions {
  /** The players in the party, one column each (default 4). Under 4 the party fights at four columns: the numbers are tuned for four. */
  readonly players?: number;
}

/** The slot's boss for a party of `players` columns (R14.1): the slot's boss at four, widened with the players over four (`wideBoss`). */
export function trackBoss(
  pack: Pick<CombatV2Pack, 'raidBosses' | 'cards' | 'raidTrack'>,
  shipped: Pick<Shipped, 'bosses'>,
  slot: number,
  options: TrackBossOptions = {},
): BossDef {
  const base = slotBossOf(pack, shipped, slotSpec(pack, slot), options);
  const players = options.players ?? RAID_COLS;
  if (!Number.isInteger(players) || players < 1)
    throw new Error(`a party is a whole number of players from 1, not ${players}`);
  return players <= RAID_COLS ? base : wideBoss(base, players);
}
