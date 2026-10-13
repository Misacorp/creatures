/**
 * The end-of-trip choice as plain data: each offered goal with its risk in words (Safe, Risky, Very
 * risky; never a percentage, discovery is part of the fun), its extra hours, what it can bring home (as
 * little pictures with a word each) and, for a risky goal, what failing costs. The goal's name, story and
 * reward come from the shared content; the risk comes from the odds in the server's offer, so the word
 * always matches what the server will roll.
 */
import { goalDef, partsOfSpec, type GoalReward } from '@creatures/game';
import type { OfferedGoal } from './expedition-types';
import { partName, partsEntries, rarityName } from './gear-view';
import type { PartKind } from './gear-types';

/** What a reward line draws. */
export type RewardIcon = { kind: 'glyph'; id: string } | { kind: 'part'; part: PartKind };

interface RewardLine {
  key: string;
  icon: RewardIcon;
  text: string;
}

/** What a goal's risk is called on the card. */
type RiskWord = 'Safe' | 'Risky' | 'Very risky';

/** A risky goal that works less often than this (basis points) is "Very risky". */
export const VERY_RISKY_BELOW_BP = 5_000;

/** The risk of a goal in words, from its kind and the exact odds the server will roll. */
export function riskWord(risk: OfferedGoal['risk'], oddsBp: number): RiskWord {
  if (risk === 'safe') return 'Safe';
  return oddsBp < VERY_RISKY_BELOW_BP ? 'Very risky' : 'Risky';
}

/** What failing costs, said once for every risky goal. The odds are never shown. */
const FAILURE_LINE = 'May fail and bring nothing back.';

export interface GoalCard {
  id: string;
  name: string;
  flavor: string;
  risk: OfferedGoal['risk'];
  /** The risk in words: Safe, Risky or Very risky. */
  riskWord: RiskWord;
  /** "+2 h": hours added to the trip, counted from its end. */
  extra: string;
  /** What it brings home when it works. */
  rewards: RewardLine[];
  /** For a risky goal: what failing means, in one short line; null for a safe one. */
  failure: string | null;
}

/** The lines of a goal's reward: one per thing it can bring. */
export function rewardLines(reward: GoalReward): RewardLine[] {
  const out: RewardLine[] = [];
  if (reward.catchRolls !== undefined) {
    out.push({
      key: 'catch',
      icon: { kind: 'glyph', id: 'paw' },
      text: `${String(reward.catchRolls)} more catch ${reward.catchRolls === 1 ? 'roll' : 'rolls'}`,
    });
  }
  for (const part of partsEntries(partsOfSpec(reward.parts))) {
    out.push({
      key: part.kind,
      icon: { kind: 'part', part: part.kind },
      text: `${String(part.amount)} ${partName(part.kind)}`,
    });
  }
  if (reward.supply === true) {
    out.push({ key: 'supply', icon: { kind: 'glyph', id: 'satchel' }, text: 'A supply' });
  }
  if (reward.gear !== undefined) {
    out.push({
      key: 'gear',
      icon: { kind: 'glyph', id: 'gear-piece' },
      text: `A ${rarityName(reward.gear).toLowerCase()} gear piece`,
    });
  }
  if (reward.blueprint === true) {
    out.push({ key: 'blueprint', icon: { kind: 'glyph', id: 'blueprint' }, text: 'A blueprint' });
  }
  if (reward.journal === true) {
    out.push({ key: 'journal', icon: { kind: 'glyph', id: 'journal' }, text: 'A journal page' });
  }
  if (reward.xpBp !== undefined) {
    out.push({
      key: 'xp',
      icon: { kind: 'glyph', id: 'rank' },
      text: 'Bonus explorer XP',
    });
  }
  return out;
}

/** The cards of an offer, in the order the server sent them. A goal the content does not know is left out. */
export function goalCards(goals: readonly OfferedGoal[]): GoalCard[] {
  return goals.flatMap((offered) => {
    const def = goalDef(offered.id);
    if (def === undefined) return [];
    const risky = offered.risk === 'risky';
    return [
      {
        id: offered.id,
        name: def.name,
        flavor: def.flavor,
        risk: offered.risk,
        riskWord: riskWord(offered.risk, offered.oddsBp),
        extra: `+${String(offered.extraHours)} h`,
        rewards: rewardLines(def.reward),
        failure: risky ? FAILURE_LINE : null,
      },
    ];
  });
}
