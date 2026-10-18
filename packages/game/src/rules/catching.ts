import type { ContentPack, CreatureSpecies, Element, Rarity } from '../content/schema';
import { RARITIES } from '../content/schema';
import { chance, pickWeighted, type Rng } from '../rng';
import { RULES, type SuppliesId } from './config';

export interface CatchContext {
  content: ContentPack;
  supplies: SuppliesId;
  explorerElement: Element;
  /** Line ids the player already owns (a line is owned once any stage of it is owned). */
  ownedLines: ReadonlySet<string>;
  /** Duplicates caught in a row so far. */
  dupeStreak: number;
  /**
   * True only for the first roll of the player's first claim when they own no zipmouse line.
   * That roll is a zipmouse; use `rollCatches` to have this computed for you.
   */
  zipmouseGuarantee: boolean;
}

export interface CatchResult {
  species: CreatureSpecies;
  shiny: boolean;
  /** True when the player already owned this species' line. */
  duplicate: boolean;
}

export interface CatchRoll {
  result: CatchResult;
  /** Dupe streak after this catch: 0 after a new species, +1 after a duplicate. */
  dupeStreak: number;
}

function catchableStage1(content: ContentPack): CreatureSpecies[] {
  return content.creatures.filter((c) => c.catchable && c.stage === 1);
}

function rollRarity(rng: Rng, supplies: SuppliesId): Rarity {
  const odds = RULES.expedition.supplies[supplies].oddsBp;
  const entries = RARITIES.map((rarity) => ({ rarity, weight: odds[rarity] }));
  return pickWeighted(rng, entries).rarity;
}

/**
 * Rolls one catch. Draw order on `rng`: rarity, then species (skipped for the zipmouse
 * guarantee), then shiny.
 *
 * 1. First-expedition guarantee: the species is zipmouse.
 * 2. Otherwise roll the rarity from the supply level's odds, then pick a catchable stage-1 species
 *    of that rarity; species of the explorer's element weigh 2 instead of 1.
 * 3. Dupe shield: with a streak of `RULES.catching.dupeShieldStreak` (3) or more, pick only among unowned species of that rarity (if
 *    there are none, the normal pick applies).
 * 4. Shiny: 1 in 500.
 */
export function rollCatch(rng: Rng, ctx: CatchContext): CatchRoll {
  const candidatesAll = catchableStage1(ctx.content);
  let species: CreatureSpecies | undefined;

  if (ctx.zipmouseGuarantee) {
    species = candidatesAll.find((c) => c.line === RULES.catching.firstExpeditionLine);
    if (species === undefined) throw new Error('content has no catchable zipmouse line');
  } else {
    const rarity = rollRarity(rng, ctx.supplies);
    let candidates = candidatesAll.filter((c) => c.rarity === rarity);
    if (ctx.dupeStreak >= RULES.catching.dupeShieldStreak) {
      const unowned = candidates.filter((c) => !ctx.ownedLines.has(c.line));
      if (unowned.length > 0) candidates = unowned;
    }
    const weighted = candidates.map((c) => ({
      species: c,
      weight: c.element === ctx.explorerElement ? RULES.catching.explorerAffinityWeight : 1,
    }));
    if (weighted.length === 0) throw new Error(`content has no catchable ${rarity} species`);
    species = pickWeighted(rng, weighted).species;
  }

  const { numerator, denominator } = RULES.catching.shiny;
  const shiny = chance(rng, numerator, denominator);
  const duplicate = ctx.ownedLines.has(species.line);
  return {
    result: { species, shiny, duplicate },
    dupeStreak: duplicate ? ctx.dupeStreak + 1 : 0,
  };
}

export interface ClaimContext {
  content: ContentPack;
  supplies: SuppliesId;
  explorerElement: Element;
  ownedLines: ReadonlySet<string>;
  dupeStreak: number;
  /** True if this is the player's first expedition (its first claim). */
  firstExpedition: boolean;
}

/**
 * Rolls all catches of one claim in order, carrying owned lines and the dupe streak from one roll
 * to the next. If it is the first expedition and no zipmouse line is owned, the first roll is the
 * zipmouse guarantee.
 */
export function rollCatches(
  rng: Rng,
  count: number,
  ctx: ClaimContext,
): { results: CatchResult[]; dupeStreak: number } {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be an integer >= 0');
  const owned = new Set(ctx.ownedLines);
  let dupeStreak = ctx.dupeStreak;
  const results: CatchResult[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rollCatch(rng, {
      content: ctx.content,
      supplies: ctx.supplies,
      explorerElement: ctx.explorerElement,
      ownedLines: owned,
      dupeStreak,
      zipmouseGuarantee:
        i === 0 && ctx.firstExpedition && !owned.has(RULES.catching.firstExpeditionLine),
    });
    results.push(roll.result);
    owned.add(roll.result.species.line);
    dupeStreak = roll.dupeStreak;
  }
  return { results, dupeStreak };
}
