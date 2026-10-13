/**
 * The end-of-trip choice as plain data: each offered goal with its exact odds, its extra hours, what it
 * can bring home (as little pictures with a word each) and, for a risky goal, what failing costs. The
 * goal's name, story and reward come from the shared content; the odds and hours come from the server's
 * offer, so the card shows exactly what the server will roll.
 */
import { goalDef, partsOfSpec, type GoalReward } from '@creatures/game';
import type { OfferedGoal } from './expedition-types';
import { partName, partsEntries, rarityName } from './gear-view';
import type { PartKind } from './gear-types';
import { percentText } from './trip-view';

/** What a reward line draws. */
export type RewardIcon = { kind: 'glyph'; id: string } | { kind: 'part'; part: PartKind };

export interface RewardLine {
  key: string;
  icon: RewardIcon;
  text: string;
}

export interface GoalCard {
  id: string;
  name: string;
  flavor: string;
  risk: OfferedGoal['risk'];
  /** The chance it works out, as the server will roll it: "61%". A safe goal always works ("100%"). */
  odds: string;
  oddsBp: number;
  /** "+2 h": hours added to the trip, counted from its end. */
  extra: string;
  /** What it brings home when it works. */
  rewards: RewardLine[];
  /** For a risky goal: what failing means, in one sentence; null for a safe one. */
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
      text: `${percentText(reward.xpBp)} more explorer XP`,
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
        odds: percentText(offered.oddsBp),
        oddsBp: offered.oddsBp,
        extra: `+${String(offered.extraHours)} h`,
        rewards: rewardLines(def.reward),
        failure: risky
          ? `${percentText(10_000 - offered.oddsBp)} chance the whole trip fails and brings nothing back.`
          : null,
      },
    ];
  });
}
