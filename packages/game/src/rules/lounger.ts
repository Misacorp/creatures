import { RULES } from './config';
import { int, type Rng } from '../rng';

/**
 * Picks the creature that lounges in the living room: one of the player's idle creatures, uniformly
 * at random, or null when there is none (every creature is busy, or the player has none). The
 * caller decides which creatures are idle; the pick draws from the injected RNG exactly once when
 * there is a choice, and not at all when there is none or only one.
 */
export function pickLounger(idleIds: readonly string[], rng: Rng): string | null {
  const first = idleIds[0];
  if (first === undefined) return null;
  if (idleIds.length === 1) return first;
  return idleIds[int(rng, idleIds.length)] ?? null;
}

// --- Lounging with company ---

/** A stretch of time, UTC epoch ms, `from` <= `to`. */
export interface Span {
  from: number;
  to: number;
}

/** The spans merged into sorted, non-overlapping ones (touching spans merge too; empty ones are dropped). */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const sorted = spans.filter((s) => s.to > s.from).sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else out.push({ from: s.from, to: s.to });
  }
  return out;
}

/**
 * How long, in ms, a player was present (`own`) while at least one other player was too (`others`, all
 * of them together), counted only inside `[since, until]`. A player's own two tabs never count as
 * company: the caller passes only other players' spans in `others`. Pure.
 */
export function companyMs(
  own: readonly Span[],
  others: readonly Span[],
  since: number,
  until: number,
): number {
  if (until <= since) return 0;
  const clip = (spans: readonly Span[]) =>
    mergeSpans(spans.map((s) => ({ from: Math.max(s.from, since), to: Math.min(s.to, until) })));
  const a = clip(own);
  const b = clip(others);
  let total = 0;
  let j = 0;
  for (const s of a) {
    while (j < b.length && (b[j]?.to ?? 0) <= s.from) j++;
    for (let k = j; k < b.length; k++) {
      const o = b[k];
      if (o === undefined || o.from >= s.to) break;
      total += Math.min(s.to, o.to) - Math.max(s.from, o.from);
    }
  }
  return total;
}

/** One creature's lounging tally for the current game day, and its player's time not yet paid. */
export interface LoungeTally {
  /** Experience the creature got from lounging today, at most the daily cap. */
  paid: number;
  /** The player's company time short of one more experience (less than `msPerXp`). */
  carryMs: number;
}

/** True when a creature has had all of today's lounging experience. */
export function isRested(paidToday: number): boolean {
  return paidToday >= RULES.experience.lounge.dailyCap;
}

/**
 * Pays `ms` more company time to a creature that has had `tally.paid` today: one experience per whole
 * `msPerXp` (with the carry), up to the daily cap. At the cap the carry is dropped. Pure.
 */
export function loungeExperience(
  tally: LoungeTally,
  ms: number,
): { xp: number; tally: LoungeTally } {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new RangeError(`ms must be a whole number >= 0, got ${String(ms)}`);
  }
  const { msPerXp, dailyCap } = RULES.experience.lounge;
  const total = tally.carryMs + ms;
  const xp = Math.min(Math.max(0, dailyCap - tally.paid), Math.floor(total / msPerXp));
  const paid = tally.paid + xp;
  return { xp, tally: { paid, carryMs: paid >= dailyCap ? 0 : total - xp * msPerXp } };
}
