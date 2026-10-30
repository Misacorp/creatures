import { content } from '@creatures/game';
import { honourCounts } from './honours';
import { levelsDesc } from './growth';
import { ELEMENTS } from './rules';
import { speciesRarities } from './world';
import type { Player, Server } from './types';
import { R } from './types';

/**
 * The journey export (for phase 3): one entry per visit of a traced player, with what came home, what happened, and the levels of the
 * five best creatures. Plain data, written by the CLI for a daily and a weekly player of the mixed server of 8 (seed 1, weeks 1 to 4).
 * It records; it never changes the run (no random draws, nothing the simulation reads).
 */

export interface JourneyEntry {
  /** The week (1-based) and day (1-based, of the run), the weekday (Monday first) and the hour of the visit. */
  week: number;
  day: number;
  weekday: string;
  hour: number;
  /** What came home: the seats' finds, the leets and moments, the dungeon, dismantling and the Forge floor. */
  cameHome: {
    acorns: number;
    scrap: number;
    shards: Record<string, number>;
    creatures: { line: string; count: number; newLine: boolean }[];
    pieces: { collected: number; worn: number; bagged: number };
  };
  /** New lines, mastery steps, honours given, place level-ups, the visitor's arrival and rerolls. */
  events: string[];
  /** Levels of the five best creatures at the end of the visit. */
  top5: number[];
}

interface Snap {
  acorns: number;
  scrap: number;
  shards: number[];
  species: number[];
  floor: number;
  worn: number;
  bagged: number;
}

export interface Tracer {
  entries: JourneyEntry[];
  snap: Snap | null;
  came: JourneyEntry['cameHome'] | null;
  events: string[];
  mastery: number[];
  honours: number[];
  levelUpsSeen: number;
}

export const newTracer = (): Tracer => ({
  entries: [],
  snap: null,
  came: null,
  events: [],
  mastery: [],
  honours: [0, 0, 0],
  levelUpsSeen: 0,
});

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STEP_NAMES = ['Novice', 'Apprentice', 'Expert', 'Master'];

/** The name of a line: the content's id for the first lines, "dropped line N" (and its rarity) for the content drops. */
const LINE_IDS = content.creatures.filter((c) => c.stage === 1 && c.catchable).map((c) => c.line);
const RARITY_NAMES = ['common', 'rare', 'epic'];
export function lineName(p: Player, species: number): string {
  const id = LINE_IDS[species];
  if (id) return id;
  return `new line ${species + 1} (${RARITY_NAMES[speciesRarities(p.rules)[species] ?? 0]})`;
}

/** A line worth saying in a journey: what the piece or the visitor did. */
export function note(p: Player, text: string): void {
  p.trace?.events.push(text);
}

const masteryTiers = (p: Player): number[] => {
  const steps = p.rules.posts.mastery;
  const tier = (hours: number): number => steps.filter((s) => hours >= s.hours).length;
  return [...p.seats.map((s) => tier(s.mastery)), ...p.anvils.map((a) => tier(a.mastery))];
};

/** The start of a visit: what the player has now (the rest is read from the difference). */
export function beginVisit(p: Player): void {
  const t = p.trace;
  if (!t) return;
  t.events = [];
  t.snap = {
    acorns: p.stock[R.acorns] ?? 0,
    scrap: p.stock[R.scrap] ?? 0,
    shards: [...p.shards],
    species: [...p.speciesCount],
    floor: p.floor.length,
    worn: p.wk.piecesWorn,
    bagged: p.bagNever,
  };
}

/** Everything that was waiting has come home (before the player chooses what to do with it). */
export function homeDone(p: Player): void {
  const t = p.trace;
  const s = t?.snap;
  if (!t || !s) return;
  const shards: Record<string, number> = {};
  ELEMENTS.forEach((name, e) => {
    const gained = (p.shards[e] ?? 0) - (s.shards[e] ?? 0);
    if (Math.abs(gained) > 1e-9) shards[name] = Math.round(gained * 100) / 100;
  });
  const creatures: { line: string; count: number; newLine: boolean }[] = [];
  p.speciesCount.forEach((n, species) => {
    const before = s.species[species] ?? 0;
    if (n > before) {
      creatures.push({ line: lineName(p, species), count: n - before, newLine: before === 0 });
      if (before === 0) t.events.push(`new line: ${lineName(p, species)}`);
    }
  });
  t.came = {
    acorns: Math.round(((p.stock[R.acorns] ?? 0) - s.acorns) * 100) / 100,
    scrap: Math.round(((p.stock[R.scrap] ?? 0) - s.scrap) * 100) / 100,
    shards,
    creatures,
    pieces: {
      collected: Math.max(0, s.floor - p.floor.length),
      worn: p.wk.piecesWorn - s.worn,
      bagged: p.bagNever - s.bagged,
    },
  };
}

/** The end of a visit: the events the days in between and the choices made left, and the five best levels. */
export function endVisit(p: Player, server: Server, hour: number): void {
  const t = p.trace;
  if (!t || !t.came) return;
  const tiers = masteryTiers(p);
  const seatCount = p.seats.length;
  tiers.forEach((tier, i) => {
    const was = t.mastery[i] ?? 0;
    if (tier > was) {
      const post = i < seatCount ? `scout seat ${i + 1}` : `anvil ${i - seatCount + 1}`;
      t.events.push(`mastery: ${post} reached ${STEP_NAMES[tier] ?? tier}`);
    }
  });
  t.mastery = tiers;
  const honours = honourCounts(p);
  ['Bronze', 'Silver', 'Gold'].forEach((name, i) => {
    const gained = (honours[i] ?? 0) - (t.honours[i] ?? 0);
    if (gained > 0)
      t.events.push(`graduation: ${gained} creature${gained > 1 ? 's' : ''} earned ${name}`);
  });
  t.honours = honours;
  for (; t.levelUpsSeen < server.levelUps.length; t.levelUpsSeen++) {
    const up = server.levelUps[t.levelUpsSeen]!;
    t.events.push(`place level-up: ${up.place} reached level ${up.level}`);
  }
  const day = Math.floor(hour / 24);
  t.entries.push({
    week: Math.floor(hour / 168) + 1,
    day: day + 1,
    weekday: WEEKDAYS[day % 7] ?? '',
    hour: hour % 24,
    cameHome: t.came,
    events: [...t.events],
    top5: levelsDesc(p).slice(0, 5),
  });
  t.came = null;
  t.snap = null;
}
