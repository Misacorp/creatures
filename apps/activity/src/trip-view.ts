/**
 * What the expedition screens say about a trip, as plain functions so it is tested without a browser:
 * the trip lengths a creature can take, the supplies and what they cost (the haul of a trip is in
 * `haul-view.ts`), how far a running trip has got, what the claim button means, an explorer's XP bar and the
 * slot progress line. Names, effects and numbers come from the shared content and rules (never copied
 * here), and every amount that is owned or paid comes from the server's state.
 */
import {
  EXPEDITION_LENGTHS,
  RULES,
  expeditionContent,
  kitProblem,
  lengthOpen,
  lengthRules,
  recallCatches,
  supplyDef,
  tripMs,
  type SupplyDef,
} from '@creatures/game';
import type { ExpeditionLength, ExplorerView, Slots, SupplyPick, Trip } from './expedition-types';
import { formatDuration, formatHours } from './time-format';

const BP = 10_000;

/** "12" or "12.5": a number of percent from basis points, without trailing zeros. */
export function percentText(bp: number): string {
  return `${String(Math.round(bp) / 100)}%`;
}

// --- Trip lengths ---

/** The nominal hours of a trip length, from the rules. */
function lengthHours(length: ExpeditionLength): number {
  return lengthRules(length).ms / 3_600_000;
}

/** "2 h", "6 h", "12 h", "24 h". */
export function lengthLabel(length: ExpeditionLength): string {
  return formatHours(lengthHours(length));
}

interface LengthOption {
  id: ExpeditionLength;
  label: string;
  /** What the trip takes for this explorer (each rank above 1 shortens it), for example "11 h 31 min". */
  takes: string;
  /** The trip's catch rolls, before supplies. */
  rolls: number;
}

/** The lengths an explorer of this rank can send, shortest first (the 24 h trip from rank 5). */
export function lengthOptions(rank: number): LengthOption[] {
  return EXPEDITION_LENGTHS.filter((id) => lengthOpen(id, rank)).map((id) => ({
    id,
    label: lengthLabel(id),
    takes: formatDuration(tripMs(id, rank)),
    rolls: lengthRules(id).rolls,
  }));
}

// --- Supplies ---

export type SupplySource = SupplyPick['source'];

export interface SupplyOption {
  id: string;
  kind: SupplyDef['kind'];
  tier: SupplyDef['tier'];
  name: string;
  flavor: string;
  /** Bait it costs to buy. */
  price: number;
  /** How many are in stock. */
  owned: number;
  /** What it does, in a few words and no numbers. */
  effect: string;
  /** Whether it makes the end-of-trip choice certain ("guaranteed") or just more likely. */
  choice: 'guaranteed' | 'likely';
}

/** What one supply does for a trip, in a few words from its content (no numbers). */
export function supplyEffect(def: SupplyDef): string {
  return def.blurb;
}

/** "Lure", "Map scrap", "Lantern", "Satchel": the name of a kind of supply. */
export function kindName(kind: string): string {
  const words = kind.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function optionOf(def: SupplyDef, stock: Readonly<Record<string, number>>): SupplyOption {
  return {
    id: def.id,
    kind: def.kind,
    tier: def.tier,
    name: def.name,
    flavor: def.flavor,
    price: def.price,
    owned: stock[def.id] ?? 0,
    effect: supplyEffect(def),
    choice: def.offerBp >= BP ? 'guaranteed' : 'likely',
  };
}

/** Every supply of the content, in the order of the content (a kind's tiers together). */
export function supplyOptions(stock: Readonly<Record<string, number>>): SupplyOption[] {
  return expeditionContent.supplies.map((def) => optionOf(def, stock));
}

/** The name of a supply id (the id itself when the content does not know it). */
export function supplyName(id: string): string {
  return supplyDef(id)?.name ?? id;
}

/** The definitions of supply ids; ids the content does not know are left out. */
export function supplyDefs(ids: readonly string[]): SupplyDef[] {
  return ids.flatMap((id) => {
    const def = supplyDef(id);
    return def === undefined ? [] : [def];
  });
}

/** The kind of a supply id, or null. */
export function supplyKindOf(id: string): SupplyDef['kind'] | null {
  return supplyDef(id)?.kind ?? null;
}

/** The pick for a supply id, if it is in the list. */
export function pickFor(picks: readonly SupplyPick[], id: string): SupplyPick | undefined {
  return picks.find((p) => p.id === id);
}

/**
 * Changes the supplies of a trip: `source` null takes the supply out. A trip carries one supply of a
 * kind, so picking another tier of the same kind replaces it; a new kind that would go over the limit
 * is refused (the list comes back unchanged). Pure: returns a new list.
 */
export function setSupply(
  picks: readonly SupplyPick[],
  id: string,
  source: SupplySource | null,
): SupplyPick[] {
  const def = supplyDef(id);
  if (def === undefined) return [...picks];
  const kept = picks.filter((p) => supplyDef(p.id)?.kind !== def.kind);
  if (source === null) return kept;
  if (kept.length >= RULES.expeditions.maxSupplies) return [...picks];
  return [...kept, { id, source }];
}

/** True if this supply could be added or swapped in now (a free place, or one of its kind to replace). */
export function canCarry(picks: readonly SupplyPick[], id: string): boolean {
  const def = supplyDef(id);
  if (def === undefined) return false;
  const sameKind = picks.some((p) => supplyDef(p.id)?.kind === def.kind);
  return sameKind || picks.length < RULES.expeditions.maxSupplies;
}

/** The Bait the supplies to buy cost. Owned supplies are free. */
export function kitCost(picks: readonly SupplyPick[]): number {
  let total = 0;
  for (const p of picks) if (p.source === 'buy') total += supplyDef(p.id)?.price ?? 0;
  return total;
}

/** The choice a kit gives: guaranteed (a best-tier supply), likely (any supply) or none. */
export function kitChoice(picks: readonly SupplyPick[]): 'guaranteed' | 'likely' | 'none' {
  let any = false;
  for (const p of picks) {
    const def = supplyDef(p.id);
    if (def === undefined) continue;
    any = true;
    if (def.offerBp >= BP) return 'guaranteed';
  }
  return any ? 'likely' : 'none';
}

/** Why the supplies cannot go as picked (not enough of one in stock, a bad kit); null when fine. */
export function kitBlocker(
  picks: readonly SupplyPick[],
  stock: Readonly<Record<string, number>>,
): string | null {
  if (kitProblem(picks.map((p) => p.id)) !== null) {
    return 'Supplies: at most two, never two of the same kind.';
  }
  for (const p of picks) {
    if (p.source === 'owned' && (stock[p.id] ?? 0) < 1) {
      return `You have no ${supplyName(p.id)} in stock.`;
    }
  }
  return null;
}

// --- What a trip is good for, in pictures ---

// --- A running trip ---

type TripPhase = 'out' | 'choice' | 'pushing' | 'ready';

interface TripStatus {
  phase: TripPhase;
  /** How far the current leg is, 0 to 1: the trip itself, then (after a choice) the push-on. */
  fraction: number;
  /** Time to the end of the current leg; 0 when it is over. */
  remainingMs: number;
  /**
   * What the claim does now: `recall` (before the trip ends: only what was caught so far comes home),
   * `early` (a push-on is still running: coming home skips it) or `claim` (everything comes home).
   */
  claim: 'recall' | 'early' | 'claim';
}

function legFraction(startedAt: number, endsAt: number, now: number): number {
  const total = endsAt - startedAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - startedAt) / total));
}

/**
 * Where a trip is at server time `now`: out on its trip, waiting for the player's choice, out on a
 * pushed-on goal, or ready to claim. The server decides every claim; this only says what to show.
 */
export function tripStatus(trip: Trip, now: number): TripStatus {
  if (now < trip.endsAt) {
    return {
      phase: 'out',
      fraction: legFraction(trip.startedAt, trip.endsAt, now),
      remainingMs: trip.endsAt - now,
      claim: 'recall',
    };
  }
  if (trip.pushOn !== null) {
    if (now < trip.pushOn.endsAt) {
      return {
        phase: 'pushing',
        fraction: legFraction(trip.pushOn.startedAt, trip.pushOn.endsAt, now),
        remainingMs: trip.pushOn.endsAt - now,
        claim: 'early',
      };
    }
    return { phase: 'ready', fraction: 1, remainingMs: 0, claim: 'claim' };
  }
  if (trip.offer !== null && trip.offer.goals.length > 0) {
    return { phase: 'choice', fraction: 1, remainingMs: 0, claim: 'claim' };
  }
  return { phase: 'ready', fraction: 1, remainingMs: 0, claim: 'claim' };
}

/**
 * True when a trip has just ended and the player has not been offered anything yet: the server rolls the
 * choice when it next sends the state, so the screen asks once (and a trip claimed unseen is a plain
 * claim). Never true for a trip with a choice, a pushed-on goal or one that is not running.
 */
export function needsOfferRefresh(trip: Trip, now: number): boolean {
  return (
    trip.status === 'active' && now >= trip.endsAt && trip.offer === null && trip.pushOn === null
  );
}

/** The catches a recall at this moment would keep (the same rule as the server's). */
export function recallKeeps(trip: Trip, now: number): number {
  if (trip.endsAt <= trip.startedAt) return 0;
  return recallCatches(trip.rolls, trip.startedAt, trip.endsAt, now);
}

// --- Explorer XP and slots ---

/** What an `XpBar` of an explorer is given: the XP into this rank, the span of the rank and the end caps. */
export interface ExplorerXp {
  value: number;
  max: number;
  /** "Top rank" at the top; undefined for the bar's own "0 / 200 XP". */
  text?: string;
  /** The current rank, where the creature starts, and the next one, its destination (none at the top). */
  startCap: string;
  endCap?: string;
}

/** The `XpBar` values of an explorer: how far from its rank's XP to the next rank's. */
export function explorerXp(explorer: Pick<ExplorerView, 'rank' | 'xp' | 'nextRankXp'>): ExplorerXp {
  const startCap = `Rank ${String(explorer.rank)}`;
  if (explorer.nextRankXp === null) return { value: 1, max: 1, text: 'Top rank', startCap };
  const start = RULES.expeditions.rank.xpForRank[Math.max(0, explorer.rank - 1)] ?? 0;
  const span = Math.max(1, explorer.nextRankXp - start);
  const done = Math.min(span, Math.max(0, explorer.xp - start));
  return {
    value: done,
    max: span,
    startCap,
    endCap: `Rank ${String(explorer.rank + 1)}`,
  };
}

interface SlotsLine {
  /** "1 / 2 slots in use". */
  use: string;
  /** What opens the next slot, or null when every slot is open. */
  next: string | null;
  /** Progress to the next slot (for a bar), or null. */
  progress: { value: number; max: number } | null;
}

/** The open slots and the progress to the next one (`slots.next` of the state). */
export function slotsLine(slots: Slots): SlotsLine {
  const use = `${String(slots.used)} / ${String(slots.total)} ${slots.total === 1 ? 'slot' : 'slots'} in use`;
  if (slots.next === null) return { use, next: null, progress: null };
  if (slots.next.kind === 'trips') {
    return {
      use,
      next: `Next slot: finish ${String(slots.next.at)} trips (${String(slots.tripsFinished)} so far)`,
      progress: { value: slots.tripsFinished, max: Math.max(1, slots.next.at) },
    };
  }
  return {
    use,
    next: `Next slot: your explorers' ranks above 1 add up to ${String(slots.next.at)} (now ${String(slots.rankSum)})`,
    progress: { value: slots.rankSum, max: Math.max(1, slots.next.at) },
  };
}

/** The place a creature's trip would go: its name, from the content. */
export function destinationName(id: string): string {
  return expeditionContent.destinations.find((d) => d.id === id)?.name ?? id;
}

/** A push-on goal's name from the content. */
export function goalName(id: string): string {
  return expeditionContent.goals.find((g) => g.id === id)?.name ?? id;
}
