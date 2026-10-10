import type { DurationId, SuppliesId } from '@creatures/game';
import type { ArchetypeId } from './archetypes';
import type { OwnedCreature } from './data';

export interface PendingExpedition {
  explorerId: string;
  duration: DurationId;
  supplies: SuppliesId;
}

/** Counters reset at the start of every week. */
export interface WeekCounters {
  baitEarned: number;
  baitConverted: number;
  baitSpentExpeditions: number;
  baitSpentTraining: number;
  essenceEarned: number;
  trainings: number;
  evolutions: number;
  signedUp: boolean;
}

export function emptyWeek(): WeekCounters {
  return {
    baitEarned: 0,
    baitConverted: 0,
    baitSpentExpeditions: 0,
    baitSpentTraining: 0,
    essenceEarned: 0,
    trainings: 0,
    evolutions: 0,
    signedUp: false,
  };
}

export interface SimPlayer {
  id: string;
  label: string;
  archetype: ArchetypeId;
  joinWeek: number;
  joined: boolean;
  bait: number;
  essence: number;
  creatures: OwnedCreature[];
  dupeStreak: number;
  firstExpeditionDone: boolean;
  /** Raids taken part in without a jackpot (the pity counter). */
  pity: number;
  /** Highest value the pity counter reached. */
  maxPity: number;
  jackpots: number;
  raids: number;
  expeditions: PendingExpedition[];
  /** This week's leet days, Monday = 0. */
  leetDays: boolean[];
  week: WeekCounters;
}

export function createPlayer(
  id: string,
  label: string,
  archetype: ArchetypeId,
  joinWeek: number,
): SimPlayer {
  return {
    id,
    label,
    archetype,
    joinWeek,
    joined: false,
    bait: 0,
    essence: 0,
    creatures: [],
    dupeStreak: 0,
    firstExpeditionDone: false,
    pity: 0,
    maxPity: 0,
    jackpots: 0,
    raids: 0,
    expeditions: [],
    leetDays: [false, false, false, false, false, false, false],
    week: emptyWeek(),
  };
}

export function clonePlayer(p: SimPlayer): SimPlayer {
  return {
    ...p,
    creatures: p.creatures.map((c) => ({ ...c })),
    expeditions: p.expeditions.map((e) => ({ ...e })),
    leetDays: [...p.leetDays],
    week: { ...p.week },
  };
}
