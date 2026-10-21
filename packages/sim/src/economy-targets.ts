/**
 * The targets of the expedition and crafting economy (2026-10-20, B-025; documented in
 * `docs/design/balance-targets.md`, "Expedition economy"). They are measured exactly, from `trip-ev.ts`, and
 * asserted by `test/economy-targets.test.ts`, so a new currency, supply or modifier cannot move the economy
 * by accident: a change that leaves a band fails a test and needs a sentence in `decisions.md`.
 */
import type { ExpeditionLength } from '@creatures/game';

export const ECONOMY_TARGETS = {
  /** The return on investment of every supply (gain over crafting cost) on every trip length, inclusive. */
  roi: { min: 1.1, max: 4.0 },
  /** What the study flags (a supply below this loses Bait; above `roi.max` it is too good). */
  flagRoi: { min: 1.0, max: 4.0 },
  /** A supply given another one (the second of a pair): synergy (a lure on a longer trip) may go a little over. */
  pairRoi: { min: 1.0, max: 5.0 },
  /** The ROI of every supply on a 12 hour trip (about 2). */
  roiLong: { min: 1.6, max: 2.6 },
  /** An unsupplied 12 hour trip. */
  long: {
    /** Expected creatures. */
    creatures: { min: 1.0, max: 1.5 },
    /** Its scrap and shards, in plain crafts (`craft`). */
    crafts: { min: 0.8, max: 1.5 },
    /** Expected gear pieces. */
    gear: { min: 0.6, max: 1.0 },
  },
  /** The chance that an unsupplied 2 hour trip brings at least one gear piece. */
  shortGearChance: { min: 0.09, max: 0.11 },
  /** One plain craft: the parts of a common gear piece. */
  craft: { scrap: 6, shards: 1 },
  /**
   * Long trips stay the efficient choice: for the same hours, one long trip with a kit nets (worth minus the
   * kit's cost) at least as much as repeating shorter trips with that kit. `tolerance` is in Bait (rounding
   * only). `pairSlack` is how far a two-supply kit may go over it, as a share of the long trip's net: pairs
   * stack fixed bonuses (a lure's bonus roll, a map's fixed ticks) that repeat with every trip, which a
   * single supply's scalars cannot undo without leaving the ROI bands.
   */
  repeat: { tolerance: 0.01, pairSlack: 0.2 },
  /** The trip lengths, shortest first (the order "per hour" must rise in). */
  lengths: ['short', 'medium', 'long', 'day'] as readonly ExpeditionLength[],
} as const;
