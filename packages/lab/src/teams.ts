/**
 * The best teams the report's searches find, shared by the best-teams section, the casual roster section and the
 * talent section's team measure (so all three read the same teams; the searches are seeded and give the same lines
 * wherever they run).
 */
import { createSeededRng, int } from '@creatures/game';
import type { CardDef } from './cards';
import { FORM_KNACKS } from './knacks';
import { formStats } from './species';
import { GAUNTLET, bossFor, classicFor, poolOf, search, type Mode, type Pick } from './search';

/** The gauntlet and raid search settings of the report (the quick run is a smaller search, not a different one). */
export function searchOptions(quick: boolean) {
  return {
    gauntlet: quick
      ? { starts: 60, keep: 10, rounds: 2, seeds: 3, freshSeeds: 4 }
      : { starts: 400, keep: 40, rounds: 4, seeds: 6, freshSeeds: 24 },
    raid: quick
      ? { starts: 30, keep: 6, rounds: 1, seeds: 2, freshSeeds: 2 }
      : { starts: 300, keep: 24, rounds: 5, seeds: 3, freshSeeds: 8 },
  };
}

/** The best line per card for a mode, by the report's own search (the classic line is included, as in the report). */
export function bestLines(
  cards: readonly CardDef[],
  mode: Mode,
  quick: boolean,
): Map<string, readonly Pick[]> {
  const opts = mode.id === 'raid' ? searchOptions(quick).raid : searchOptions(quick).gauntlet;
  const out = new Map<string, readonly Pick[]>();
  for (const c of cards) {
    const best = search(bossFor(mode, [c.id]), mode, {
      seed: `${mode.id}:${c.id}`,
      ...opts,
      include: [classicFor(mode)],
    })[0];
    if (best) out.set(c.id, best.line);
  }
  return out;
}

/** The cards the casual roster section tries. */
export const CASUAL_CARDS: readonly string[] = ['plain', 'thick-hide', 'payoff-hunter', 'elusive'];

export interface CasualRoster {
  readonly index: number;
  /** Level of each of the twelve forms (stage 1 forms capped). */
  readonly level: (form: string) => number;
  /** Every form of the roster with every Knack it can equip, at the roster's levels. */
  readonly pool: readonly Pick[];
  /** The three highest levels, no Knack. */
  readonly top3: readonly string[];
  readonly top3Line: readonly Pick[];
}

/**
 * How many casual rosters the full report draws. A study over 20 roster seeds found the average "beyond the top
 * three" of 4 rosters swung from 0.8 to 1.8 between draws (mean 1.31), which made the gate's 1.5 a coin flip. A
 * roster's own average (its four cards) has a standard deviation of about 0.43, so n rosters read within about
 * 1.96 x 0.43 / sqrt(n) (95%): 12 rosters give 0.24, 32 give 0.15. The rosters come one after another from one
 * seeded generator, so the first 4 are the same ones as before. A roster costs about 0.45 s of work on a core.
 */
export const CASUAL_ROSTERS = 32;

/** How many of the casual rosters the report lists row by row (the rest only count towards the average). */
export const CASUAL_ROSTERS_LISTED = 4;

/** The rosters whose best lines the talent section's team share reads (its draws per team are costly; unchanged by the extra rosters). */
export const TEAM_SHARE_ROSTERS = 4;

/** Twelve random forms at random levels (8 to 25, stage 1 forms at their cap): the casual rosters, the same in every run. */
export function casualRosters(quick: boolean): CasualRoster[] {
  const forms = Object.keys(FORM_KNACKS);
  const rng = createSeededRng('casual');
  const out: CasualRoster[] = [];
  for (let r = 0; r < (quick ? 1 : CASUAL_ROSTERS); r++) {
    const roster = new Map<string, number>();
    while (roster.size < 12)
      roster.set(forms[int(rng, forms.length)] ?? 'tidewing', 8 + int(rng, 18));
    const lv = (f: string) => Math.min(roster.get(f) ?? 1, formStats(f, 30).levelCap);
    const pool = poolOf([...roster.keys()]).map((p) => ({ ...p, level: lv(p.formId) }));
    const top3 = [...roster.keys()].sort((a, b) => lv(b) - lv(a)).slice(0, 3);
    out.push({
      index: r,
      level: lv,
      pool,
      top3,
      top3Line: top3.map((f) => ({ formId: f, knack: 'none', level: lv(f) })),
    });
  }
  return out;
}

/** The best gauntlet line of each of the first casual rosters (`TEAM_SHARE_ROSTERS`) on each casual card, by the report's own search (same seeds as the casual section). */
export function casualLines(quick: boolean): { cardId: string; line: readonly Pick[] }[] {
  const sopts = searchOptions(quick).gauntlet;
  const out: { cardId: string; line: readonly Pick[] }[] = [];
  for (const roster of casualRosters(quick).slice(0, TEAM_SHARE_ROSTERS))
    for (const cid of CASUAL_CARDS) {
      const best = search(bossFor(GAUNTLET, [cid]), GAUNTLET, {
        seed: `casual:${roster.index}:${cid}`,
        ...sopts,
        pool: roster.pool,
        include: [roster.top3Line],
      })[0];
      if (best) out.push({ cardId: cid, line: best.line });
    }
  return out;
}
