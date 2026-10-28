/**
 * The talents' share of a team's result (Misa, 2026-10-28; decisions.md, "Talent strength is a share of the team's
 * result"): the same team with its creatures' talents and without them, share = 1 - without / with, averaged over the
 * cards. "About 20%" is the target for the best-fitting talents; a casual roster, with random talents, should still
 * gain clearly. The helpers here are pure (the fights are injected as a score function) so they are tested on their own.
 */
import { content, createSeededRng, int, type Rng } from '@creatures/game';
import { labBoss, type CardDef } from './cards';
import { fight } from './fight';
import { calibrateBossHp, fightScore } from './measure';
import { formStats } from './species';
import { GAUNTLET, LEVEL, RAID, bossFor, evaluate, toPlacements, type Pick } from './search';
import { LINE_POOLS, TALENTS } from './talents';

/** The target: the average share over the cards, in percent, with the accepted band, and the least a casual roster should gain. */
export const TEAM_SHARE = { target: 20, min: 17, max: 23, casualMaxOfBestPct: 60 } as const;

/** Whether an average share meets the target: within the accepted band, read to the whole percent ("about"). */
export const inBand = (share: number): boolean =>
  Math.round(share) >= TEAM_SHARE.min && Math.round(share) <= TEAM_SHARE.max;

/** Whether a casual roster's share is high enough, read to the whole percent. */
/**
 * Random talents stay situational (Misa, 2026-10-28): a casual roster's random rolls still gain something, but stay
 * well below the best fit (at most this share of it), so talents do not become flat.
 */
export const casualOk = (share: number, best: number): boolean =>
  share > 0 && share <= (best * TEAM_SHARE.casualMaxOfBestPct) / 100;

/** A talent's share of a team's result, in percent: 1 - without / with (0 when the team with talents scores nothing). */
export function shareOf(withScore: number, withoutScore: number): number {
  return withScore > 0 ? (1 - withoutScore / withScore) * 100 : 0;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** The mean of the cards' shares, in percent. */
export const meanShare = (shares: readonly number[]): number => mean(shares);

/** The share of a group of teams taken together: 1 - the sum of the scores without over the sum with. */
export function pooledShare(
  pairs: readonly { readonly with: number; readonly without: number }[],
): number {
  return shareOf(
    pairs.reduce((a, p) => a + p.with, 0),
    pairs.reduce((a, p) => a + p.without, 0),
  );
}

/** The line of a form (a form with no line is its own). */
export const lineOf = (form: string): string =>
  content.creatures.find((c) => c.id === form)?.line ?? form;

/** The talents of a form's line pool that do something for its role (what a player would pick from). */
export function fitTalents(form: string): string[] {
  const role = formStats(form, LEVEL).role;
  return (LINE_POOLS[lineOf(form)] ?? []).filter((t) => TALENTS[t]?.roles.includes(role));
}

/** The whole pool of a form's line, talents that are idle on its role too (what a roll can give). */
export function poolTalents(form: string): string[] {
  return [...(LINE_POOLS[lineOf(form)] ?? [])];
}

/** A group of team positions that share one talent choice (a creature; in a raid every copy of a form). */
export type Group = readonly number[];

/** Positions of the same form share a choice (the raid: one talent per form). */
export function groupsByForm(team: readonly { readonly formId: string }[]): Group[] {
  const by = new Map<string, number[]>();
  team.forEach((p, i) => by.set(p.formId, [...(by.get(p.formId) ?? []), i]));
  return [...by.values()];
}

/** Every position its own group (the gauntlet: three creatures, three choices). */
export const eachOwn = (team: readonly unknown[]): Group[] => team.map((_, i) => [i]);

/** The team with `choice[g]` (a talent id, or none) on every position of group `g`; picks outside every group are kept as they are. */
export function withTalents(
  team: readonly Pick[],
  groups: readonly Group[],
  choice: readonly (string | undefined)[],
): Pick[] {
  const chosen = new Map<number, string | undefined>();
  groups.forEach((g, gi) => g.forEach((i) => chosen.set(i, choice[gi])));
  return team.map((p, i) => {
    if (!chosen.has(i)) return p;
    const t = chosen.get(i);
    return {
      formId: p.formId,
      knack: p.knack,
      ...(p.level !== undefined ? { level: p.level } : {}),
      ...(t !== undefined ? { talents: [t] } : {}),
    };
  });
}

/**
 * The best choice, one talent per group, by coordinate ascent: start with none, then for each group in turn take the
 * candidate that scores most with the others as they are (a talent is only taken when it beats none), for up to
 * `passes` passes. `score` is injected (higher is better).
 */
export function chooseTalents(
  candidates: readonly (readonly string[])[],
  score: (choice: readonly (string | undefined)[]) => number,
  passes = 2,
): (string | undefined)[] {
  const choice: (string | undefined)[] = candidates.map(() => undefined);
  let current = score(choice);
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    candidates.forEach((list, gi) => {
      for (const t of list) {
        if (choice[gi] === t) continue;
        const prev = choice[gi];
        choice[gi] = t;
        const s = score(choice);
        if (s > current + 1e-9) {
          current = s;
          changed = true;
        } else choice[gi] = prev;
      }
    });
    if (!changed) break;
  }
  return choice;
}

/** One random talent per group from its candidates (none when there are none): what a casual roster rolls. */
export function drawTalents(
  candidates: readonly (readonly string[])[],
  rng: Rng,
): (string | undefined)[] {
  return candidates.map((list) => (list.length ? list[int(rng, list.length)] : undefined));
}

/** The team's score on a card: a mean over seeds, injected so the helpers above need no fights. */
export type TeamScorer = (
  team: readonly Pick[],
  cardId: string,
  seeds: number,
  salt: string,
) => number;

export interface TeamShare {
  readonly cardId: string;
  readonly with: number;
  readonly without: number;
  readonly share: number;
  /** The talent each group got (a form, in a raid), by group. */
  readonly chosen: readonly {
    readonly forms: readonly string[];
    readonly talent: string | undefined;
  }[];
}

export interface ShareSettings {
  /** Seeds for choosing talents, and for the fresh seeds the with / without scores are measured on. */
  readonly selectSeeds: number;
  readonly finalSeeds: number;
  /** How many random draws a casual team averages over. */
  readonly draws: number;
  readonly passes: number;
}

type Candidates = (form: string) => readonly string[];

/** A group's candidates: those of the form of its first member (the members of a group share a form in a raid; a gauntlet group is one creature). */
const candidatesOf = (
  team: readonly Pick[],
  groups: readonly Group[],
  pick: Candidates,
): string[][] => groups.map((g) => [...pick(team[g[0] ?? 0]?.formId ?? '')]);

/** A team with the best-fitting talent from each group's pool against the same team with none. */
export function bestFitShare(
  score: TeamScorer,
  team: readonly Pick[],
  cardId: string,
  groups: readonly Group[],
  settings: ShareSettings,
): TeamShare {
  const cands = candidatesOf(team, groups, fitTalents);
  const choice = chooseTalents(
    cands,
    (c) => score(withTalents(team, groups, c), cardId, settings.selectSeeds, `sel:${cardId}`),
    settings.passes,
  );
  const w = score(withTalents(team, groups, choice), cardId, settings.finalSeeds, `fin:${cardId}`);
  const o = score(team, cardId, settings.finalSeeds, `fin:${cardId}`);
  return {
    cardId,
    with: w,
    without: o,
    share: shareOf(w, o),
    chosen: groups.map((g, gi) => ({
      forms: g.map((i) => team[i]?.formId ?? ''),
      talent: choice[gi],
    })),
  };
}

/**
 * A team with random talents (`poolTalents`, or `fitTalents` when `fitOnly`) averaged over `settings.draws` draws,
 * against none. The draws are the same for the same salt and card.
 */
export function randomShare(
  score: TeamScorer,
  team: readonly Pick[],
  cardId: string,
  groups: readonly Group[],
  settings: ShareSettings,
  salt: string,
  fitOnly = false,
): { readonly with: number; readonly without: number; readonly share: number } {
  const cands = candidatesOf(team, groups, fitOnly ? fitTalents : poolTalents);
  const rng = createSeededRng(`rand:${salt}:${cardId}`);
  const ws: number[] = [];
  for (let d = 0; d < settings.draws; d++) {
    const choice = drawTalents(cands, rng);
    ws.push(
      score(
        withTalents(team, groups, choice),
        cardId,
        settings.finalSeeds,
        `fin:${salt}:${cardId}`,
      ),
    );
  }
  const w = mean(ws);
  const o = score(team, cardId, settings.finalSeeds, `fin:${salt}:${cardId}`);
  return { with: w, without: o, share: shareOf(w, o) };
}

/** Scores on each card's team boss (`teamBossHp`): the 0 to 100 fight score, a mean over seeds, on a gauntlet team. */
export function gauntletScorer(
  bossHp: ReadonlyMap<string, number>,
  cards: readonly CardDef[],
): TeamScorer {
  const rounds = 10;
  const bosses = new Map(
    cards.map((c) => [
      c.id,
      labBoss({
        rows: GAUNTLET.rows,
        cols: GAUNTLET.cols,
        cards: [c.id],
        atk: 110,
        hp: bossHp.get(c.id) ?? 1_000_000,
        rounds,
      }),
    ]),
  );
  return (team, cardId, seeds, salt) => {
    const boss = bosses.get(cardId);
    if (!boss) throw new Error(`unknown card ${cardId}`);
    let sum = 0;
    for (let i = 0; i < seeds; i++) {
      const r = fight(boss, toPlacements(team, GAUNTLET), {
        rng: createSeededRng(`team:${salt}:${i}`),
      });
      sum += fightScore(r, bossHp.get(cardId) ?? 1_000_000, rounds, team.length);
    }
    return sum / seeds;
  };
}

/**
 * Scores on the raid board: the search's own score (damage weighted by how many creatures still stand, a wipe counts
 * half) on the card's boss with a million HP, as in the best-teams section; the raid has no calibrated boss.
 */
export function raidScorer(): TeamScorer {
  const bosses = new Map<string, ReturnType<typeof bossFor>>();
  return (team, cardId, seeds, salt) => {
    let boss = bosses.get(cardId);
    if (!boss) {
      boss = bossFor(RAID, [cardId]);
      bosses.set(cardId, boss);
    }
    return evaluate(boss, team, RAID, seeds, `team:${salt}`).score;
  };
}

/**
 * The share of fights the team measure's boss lets the team under test win without talents: a fight that could go either
 * way. On a boss a team crushes (or never beats) its score sits near its ceiling (or floor) and no talent can show a
 * share; on the classic line's 8-round boss the best teams score about 88 of 100 and 20% is out of reach.
 */
export const TEAM_BOSS_WIN_RATE = 0.4;

/**
 * The boss HP on a card at which the team, with no talents, wins `winRate` of its fights (bisection; the win rate falls
 * as HP rises). Each card's boss is tuned to its best team, as a week's boss is tuned to the players, so every card
 * can show a share.
 */
export function teamBossHp(
  cardId: string,
  team: readonly Pick[],
  winRate: number,
  seeds: number,
): number {
  const loseRate = (hp: number) => {
    const boss = labBoss({
      rows: GAUNTLET.rows,
      cols: GAUNTLET.cols,
      cards: [cardId],
      atk: 110,
      hp,
      rounds: 10,
    });
    let lost = 0;
    for (let i = 0; i < seeds; i++)
      if (
        !fight(boss, toPlacements(team, GAUNTLET), {
          rng: createSeededRng(`teamboss:${cardId}:${i}`),
        }).won
      )
        lost++;
    return lost / seeds;
  };
  return calibrateBossHp(loseRate, 1 - winRate, 1_000, 1_000_000, 16);
}
