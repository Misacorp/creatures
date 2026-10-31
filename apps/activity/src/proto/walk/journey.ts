/**
 * The economy lab's journeys, as the return walk reads them (prototype, dev only): one daily player's first
 * four weeks and one weekly player's, one entry per visit (`packages/econ/src/journey.ts` writes them, the
 * copies in `journeys/` are kept equal by `scripts/sync-journeys.mjs` and a test). This module types a visit
 * and turns its event strings into typed events. A string it does not understand stays a plain line, never
 * an error: the lab may add events before the prototype knows them.
 */
import dailyFile from './journeys/daily.json';
import weeklyFile from './journeys/weekly.json';

/** What came home at one visit. Values may be fractional (the lab's averages): round for display. */
export interface CameHome {
  acorns: number;
  scrap: number;
  /** Shards by element id (`ember`, `tide`, ...). */
  shards: Record<string, number>;
  creatures: { line: string; count: number; newLine: boolean }[];
  pieces: { collected: number; worn: number; bagged: number };
}

export interface Visit {
  week: number;
  /** The day of the run, from 1. */
  day: number;
  weekday: string;
  hour: number;
  cameHome: CameHome;
  /** The lab's event strings; read them with `parseEvent`. */
  events: string[];
  top5: number[];
}

export type JourneyId = 'daily' | 'weekly';

export interface Journey {
  id: JourneyId;
  visits: Visit[];
}

/** A step of a post's mastery, in order. */
export const MASTERY_STEPS = ['Apprentice', 'Expert', 'Master'] as const;
export type MasteryStep = (typeof MASTERY_STEPS)[number];

export type JourneyEvent =
  | { kind: 'new-line'; line: string }
  | { kind: 'mastery'; post: 'scout' | 'anvil'; seat: number; step: MasteryStep }
  | { kind: 'graduation'; count: number; honour: string }
  | { kind: 'place-level'; place: string; level: number }
  | { kind: 'visitor-arrives' }
  | { kind: 'visitor-blueprint'; isNew: boolean; acorns: number; shards: number }
  | { kind: 'visitor-reroll'; rarity: string; itemLevel: number; acorns: number; scrap: number }
  | { kind: 'school-learning'; slot: number; acorns: number }
  | { kind: 'school-teacher'; acorns: number }
  | { kind: 'plain'; text: string };

const isStep = (text: string): text is MasteryStep =>
  (MASTERY_STEPS as readonly string[]).includes(text);

/** One event string as a typed event; anything not understood is `plain` with the text as it was. */
export function parseEvent(text: string): JourneyEvent {
  const newLine = /^new line: (.+)$/.exec(text);
  if (newLine?.[1] !== undefined) return { kind: 'new-line', line: newLine[1] };

  const mastery = /^mastery: (scout seat|anvil) (\d+) reached (\w+)$/.exec(text);
  if (mastery?.[1] !== undefined && mastery[2] !== undefined && mastery[3] !== undefined) {
    const step = mastery[3];
    if (isStep(step)) {
      return {
        kind: 'mastery',
        post: mastery[1] === 'anvil' ? 'anvil' : 'scout',
        seat: Number.parseInt(mastery[2], 10),
        step,
      };
    }
  }

  const graduation = /^graduation: (\d+) creatures? earned (\w+)$/.exec(text);
  if (graduation?.[1] !== undefined && graduation[2] !== undefined) {
    return { kind: 'graduation', count: Number.parseInt(graduation[1], 10), honour: graduation[2] };
  }

  const level = /^place level-up: (\S+) reached level (\d+)$/.exec(text);
  if (level?.[1] !== undefined && level[2] !== undefined) {
    return { kind: 'place-level', place: level[1], level: Number.parseInt(level[2], 10) };
  }

  if (text === 'visitor: he is in the valley until the raid finale') {
    return { kind: 'visitor-arrives' };
  }

  const blueprint =
    /^visitor: bought the week's blueprint \((a new one|a copy of one already known[^)]*)\) for (\d+) Acorns and (\d+) shards$/.exec(
      text,
    );
  if (blueprint?.[1] !== undefined && blueprint[2] !== undefined && blueprint[3] !== undefined) {
    return {
      kind: 'visitor-blueprint',
      isNew: blueprint[1] === 'a new one',
      acorns: Number.parseInt(blueprint[2], 10),
      shards: Number.parseInt(blueprint[3], 10),
    };
  }

  const reroll =
    /^visitor: rerolled an? (\w+) piece \(item level ([\d.]+)\) for (\d+) Acorns and (\d+) scrap\b/.exec(
      text,
    );
  if (
    reroll?.[1] !== undefined &&
    reroll[2] !== undefined &&
    reroll[3] !== undefined &&
    reroll[4] !== undefined
  ) {
    return {
      kind: 'visitor-reroll',
      rarity: reroll[1],
      itemLevel: Number.parseFloat(reroll[2]),
      acorns: Number.parseInt(reroll[3], 10),
      scrap: Number.parseInt(reroll[4], 10),
    };
  }

  const learning =
    /^school: a creature began learning its talent (\d+) \((\d+) Acorns, \d+ hours\)$/.exec(text);
  if (learning?.[1] !== undefined && learning[2] !== undefined) {
    return {
      kind: 'school-learning',
      slot: Number.parseInt(learning[1], 10),
      acorns: Number.parseInt(learning[2], 10),
    };
  }

  const teacher = /^school: a visiting teacher's lesson for a creature \((\d+) Acorns\)$/.exec(
    text,
  );
  if (teacher?.[1] !== undefined) {
    return { kind: 'school-teacher', acorns: Number.parseInt(teacher[1], 10) };
  }

  return { kind: 'plain', text };
}

/** The events of a visit, typed. */
export function eventsOf(visit: Visit): JourneyEvent[] {
  return visit.events.map(parseEvent);
}

/** The days since the player's last visit (the first visit counts from the start of the run). */
export function gapDays(journey: Journey, index: number): number {
  const visit = journey.visits[index];
  if (visit === undefined) return 0;
  const before = journey.visits[index - 1];
  return visit.day - (before?.day ?? 0);
}

/** A visit of the shape above, else a thrown error (the files are the lab's, so a wrong shape is a bug there). */
function readVisit(raw: unknown): Visit {
  if (typeof raw !== 'object' || raw === null) throw new Error('journey: a visit is not an object');
  const v = raw as Partial<Visit>;
  if (
    typeof v.week !== 'number' ||
    typeof v.day !== 'number' ||
    typeof v.weekday !== 'string' ||
    typeof v.hour !== 'number' ||
    !Array.isArray(v.events) ||
    !Array.isArray(v.top5) ||
    typeof v.cameHome !== 'object' ||
    v.cameHome === null
  ) {
    throw new Error('journey: a visit has the wrong shape');
  }
  return v as Visit;
}

function readJourney(id: JourneyId, file: { visits: unknown[] }): Journey {
  return { id, visits: file.visits.map(readVisit) };
}

export const DAILY: Journey = readJourney('daily', dailyFile);
export const WEEKLY: Journey = readJourney('weekly', weeklyFile);

/** A picker title: "Daily · week 1, Mon (day 1)". */
export function replayTitle(journey: Journey, index: number): string {
  const v = journey.visits[index];
  if (v === undefined) return '';
  const who = journey.id === 'daily' ? 'Daily' : 'Weekly';
  return `${who} · week ${String(v.week)}, ${v.weekday.slice(0, 3)} (day ${String(v.day)})`;
}
