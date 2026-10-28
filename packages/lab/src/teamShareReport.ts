/**
 * The team measure of the talent section: the talents' share of a team's result, per card, for the best-fitting talents
 * and for a casual roster's random ones (gauntlet and raid), with the pass / fail line against Misa's target.
 */
import { CARDS, type CardDef } from './cards';
import {
  TEAM_SHARE,
  bestFitShare,
  casualOk,
  inBand,
  eachOwn,
  gauntletScorer,
  groupsByForm,
  teamBossHp,
  meanShare,
  pooledShare,
  raidScorer,
  randomShare,
  type ShareSettings,
  type TeamShare,
} from './teamShare';
import { GAUNTLET, RAID, type Pick } from './search';
import { TALENTS } from './talents';
import { CASUAL_CARDS, bestLines, casualLines } from './teams';
import { KNACKS } from './knacks';

/** The best teams and casual teams the share is measured on (the report passes the ones its searches found). */
export interface TeamInputs {
  readonly gauntlet: ReadonlyMap<string, readonly Pick[]>;
  readonly raid: ReadonlyMap<string, readonly Pick[]>;
  readonly casual: readonly { cardId: string; line: readonly Pick[] }[];
}

export interface TeamShareSummary {
  readonly gauntlet: number;
  readonly raid: number;
  readonly casualGauntlet: number;
  readonly casualRaid: number;
  readonly pass: boolean;
}

const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;
const knackName = (k: string) => (k === 'none' ? 'no Knack' : (KNACKS[k]?.name ?? k));
const cardName = (id: string) => CARDS.find((c) => c.id === id)?.name ?? id;
const talentName = (t: string | undefined) => (t === undefined ? 'none' : (TALENTS[t]?.name ?? t));

export function buildTeamShareSection(opts: {
  cards: readonly CardDef[];
  quick: boolean;
  /** The share of fights the best team of a card should win without talents (the boss is tuned to it). */
  winRate: number;
  teams?: TeamInputs;
}): { md: string[]; data: Record<string, unknown>; summary: TeamShareSummary } {
  const { cards, quick, winRate } = opts;
  const teams: TeamInputs = opts.teams ?? {
    gauntlet: bestLines(cards, GAUNTLET, quick),
    raid: bestLines(cards, RAID, quick),
    casual: casualLines(quick),
  };
  const gSet: ShareSettings = quick
    ? { selectSeeds: 4, finalSeeds: 8, draws: 3, passes: 2 }
    : { selectSeeds: 12, finalSeeds: 40, draws: 8, passes: 2 };
  const rSet: ShareSettings = quick
    ? { selectSeeds: 2, finalSeeds: 4, draws: 3, passes: 1 }
    : { selectSeeds: 4, finalSeeds: 12, draws: 6, passes: 2 };
  const bossHp = new Map<string, number>();
  for (const c of cards) {
    const g = teams.gauntlet.get(c.id);
    if (g) bossHp.set(c.id, teamBossHp(c.id, g, winRate, quick ? 12 : 40));
  }
  const gScore = gauntletScorer(bossHp, cards);
  const rScore = raidScorer();

  const gaunt: TeamShare[] = [];
  const raid: TeamShare[] = [];
  const raidRandom: Record<string, number> = {};
  const casualPairs = new Map<string, { with: number; without: number }[]>();
  const casualFitPairs: { with: number; without: number }[] = [];
  const gauntRandom: Record<string, number> = {};
  for (const c of cards) {
    const g = teams.gauntlet.get(c.id);
    if (g) {
      const team = [...g];
      gaunt.push(bestFitShare(gScore, team, c.id, eachOwn(team), gSet));
      gauntRandom[c.id] = randomShare(gScore, team, c.id, eachOwn(team), gSet, 'gauntlet').share;
    }
    const r = teams.raid.get(c.id);
    if (r) {
      const team = [...r];
      raid.push(bestFitShare(rScore, team, c.id, groupsByForm(team), rSet));
      raidRandom[c.id] = randomShare(rScore, team, c.id, groupsByForm(team), rSet, 'raid').share;
    }
  }
  teams.casual.forEach((t, i) => {
    const team = [...t.line];
    const hp = new Map([[t.cardId, teamBossHp(t.cardId, team, winRate, quick ? 12 : 40)]]);
    const r = randomShare(
      gauntletScorer(hp, cards),
      team,
      t.cardId,
      eachOwn(team),
      gSet,
      `casual${i}`,
    );
    casualPairs.set(t.cardId, [...(casualPairs.get(t.cardId) ?? []), r]);
    casualFitPairs.push(
      randomShare(
        gauntletScorer(hp, cards),
        team,
        t.cardId,
        eachOwn(team),
        gSet,
        `casual${i}`,
        true,
      ),
    );
  });

  const avgG = meanShare(gaunt.map((s) => s.share));
  const avgR = meanShare(raid.map((s) => s.share));
  const casualShares = [...casualPairs.entries()].map(([cardId, pairs]) => ({
    cardId,
    share: pooledShare(pairs),
    n: pairs.length,
  }));
  const casualG = meanShare(casualShares.map((s) => s.share));
  const casualFit = pooledShare(casualFitPairs);
  const casualR = meanShare(Object.values(raidRandom));
  const T = TEAM_SHARE;
  const ok = (b: boolean) => (b ? 'pass' : 'FAIL');
  const pass = inBand(avgG) && inBand(avgR) && casualOk(casualG, avgG) && casualOk(casualR, avgR);

  const talentsOf = (s: TeamShare) =>
    s.chosen.map((c) => `${c.forms[0] ?? '?'}: ${talentName(c.talent)}`).join(', ');
  const md: string[] = [
    "### The talents' share of the team's result",
    '',
    `**What it is.** The share of a team's result that comes from talents: the best gauntlet team of each card (and the best raid board), each creature given the best-fitting talent from its line's pool (one talent each; in the raid one per form), against the same team with none, on a boss whose HP is tuned to that team, as a week's boss is tuned to the players: the team wins ${Math.round(winRate * 100)}% of its fights without talents, a fight that could go either way (the boss of the per-talent table below is the classic line's 8-round boss, which these teams crush: they score about 88 of 100 there and no talent could show 20%); the 0 to 100 score; share = 1 - score without / score with. The target is about ${T.target}% on average (accepted ${T.min}% to ${T.max}%); a casual roster, with a random talent from each creature's whole pool (idle ones included), should gain something but stay well below the best fit (at most ${T.casualMaxOfBestPct}% of it), so talents stay situational rather than flat (Misa, 2026-10-28). The raid board is scored by the best-teams section's damage score on a boss with a million HP (the raid has no calibrated boss), talents chosen on other seeds than the ones scored.`,
    '',
    '| Card | Best gauntlet team | Without | With talents | Share | Talents | Raid share | Same team, random talents |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |',
  ];
  for (const c of cards) {
    const g = gaunt.find((s) => s.cardId === c.id);
    const r = raid.find((s) => s.cardId === c.id);
    const team = teams.gauntlet.get(c.id) ?? [];
    md.push(
      `| ${cardName(c.id)} | ${team.map((p) => `${p.formId} (${knackName(p.knack)})`).join(', ')} | ${g ? g.without.toFixed(1) : 'n/a'} | ${g ? g.with.toFixed(1) : 'n/a'} | ${g ? fmt(g.share) : 'n/a'} | ${g ? talentsOf(g) : ''} | ${r ? fmt(r.share) : 'n/a'} | ${gauntRandom[c.id] === undefined ? 'n/a' : fmt(gauntRandom[c.id] as number)} |`,
    );
  }
  md.push(
    '',
    `**Average share, best-fit talents:** gauntlet ${fmt(avgG)} (${ok(inBand(avgG))}), raid ${fmt(avgR)} (${ok(inBand(avgR))}); target about ${T.target}% (${T.min}% to ${T.max}%).`,
    '',
    `**Casual roster, random talents** (the best lines of ${teams.casual.length / Math.max(1, CASUAL_CARDS.length)} random rosters on ${CASUAL_CARDS.length} cards, each with ${gSet.draws} random draws; ${CASUAL_CARDS.map((id) => `${cardName(id)} ${fmt(casualShares.find((s) => s.cardId === id)?.share ?? 0)}`).join(', ')}): gauntlet ${fmt(casualG)} (${ok(casualOk(casualG, avgG))}), and the best raid boards with a random talent per form ${fmt(casualR)} (${ok(casualOk(casualR, avgR))}); above 0 and at most ${T.casualMaxOfBestPct}% of the best fit. With a random talent that fits the creature's role (no idle rolls) the casual gauntlet gains ${fmt(casualFit)}; the same best gauntlet teams with random talents on all cards: ${fmt(meanShare(Object.values(gauntRandom)))} (column above).`,
    '',
    `**Team share check: ${pass ? 'pass' : 'FAIL'}.**`,
    '',
  );
  const data = {
    teamShare: {
      gauntlet: gaunt.map((s) => ({
        card: s.cardId,
        without: Math.round(s.without * 10) / 10,
        with: Math.round(s.with * 10) / 10,
        share: Math.round(s.share * 10) / 10,
        talents: talentsOf(s),
      })),
      raid: raid.map((s) => ({
        card: s.cardId,
        share: Math.round(s.share * 10) / 10,
        talents: talentsOf(s),
      })),
      boss: { winRate, hp: Object.fromEntries(bossHp) },
      average: { gauntlet: Math.round(avgG * 10) / 10, raid: Math.round(avgR * 10) / 10 },
      casual: {
        gauntlet: Math.round(casualG * 10) / 10,
        raid: Math.round(casualR * 10) / 10,
        gauntletFitOnly: Math.round(casualFit * 10) / 10,
        byCard: Object.fromEntries(
          casualShares.map((s) => [s.cardId, Math.round(s.share * 10) / 10]),
        ),
      },
      pass,
    },
  };
  return {
    md,
    data,
    summary: { gauntlet: avgG, raid: avgR, casualGauntlet: casualG, casualRaid: casualR, pass },
  };
}
