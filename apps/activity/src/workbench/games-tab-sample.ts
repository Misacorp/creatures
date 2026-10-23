/**
 * The Games tab's sample data for the workbench and the tests: the real captured server answers
 * (`fixtures/games-*.json`), parsed by the client's own guards, the fixture player's creatures (the ids
 * and species the capture used) and variants of a view the game can produce (all entered, the stall
 * open, a medal table). Fixture code only; the game never imports it.
 */
import type { Creature } from '../api';
import { sampleRoster } from '../creature-card-sample';
import { parseCreatureGames, parseGamesView, parseStallPurchase } from '../games-parse';
import type { GamesView } from '../games-types';
import gamesAfter from '../fixtures/games-after.json';
import gamesCreature from '../fixtures/games-creature.json';
import gamesEntries from '../fixtures/games-entries.json';
import gamesLocked from '../fixtures/games-locked.json';
import gamesShow from '../fixtures/games-show.json';
import gamesStallBuy from '../fixtures/games-stall-buy.json';
import gamesStallBuyBait from '../fixtures/games-stall-buy-bait.json';

/** The fixture's viewer (the first player of the capture). */
export const GAMES_SELF_ID = '800000000000000001';

const id = (n: number): string => `00000000-0000-4000-8600-${String(n).padStart(12, '0')}`;

/**
 * The fixture player's six creatures, with the species the capture gave them. The capture numbers ids
 * in order of first appearance, and the first answer lists the good fits first, so the numbers are not
 * the roster's order: 1 Splashet (Melon Run), 3 Cindle and 5 Sproutle (Log Carry) are the entered ones,
 * as `games-show.json`'s actors say; 2 Zipmouse and 4 Ashmole are the other good fits.
 */
export function gamesRoster(): Creature[] {
  const all = sampleRoster(34);
  const wanted: [number, string, number, string | null][] = [
    [1, 'splashet', 8, null],
    [3, 'cindle', 6, 'Toasty'],
    [5, 'sproutle', 4, null],
    [2, 'zipmouse', 11, null],
    [6, 'mistnewt', 3, null],
    [4, 'ashmole', 9, 'Big Biscuit'],
  ];
  return wanted.map(([n, species, level, nickname]) => {
    const found = all.find((c) => c.species === species);
    if (found === undefined) throw new Error(`no ${species} in the sample roster`);
    const rest: Creature = { ...found };
    delete rest.evolution;
    return {
      ...rest,
      id: id(n),
      level,
      exp: 120 + 25 * n,
      expNeeded: 200 + 25 * level,
      nickname,
      waiting: false,
      ribbon: null,
    } satisfies Creature;
  });
}

export const GAMES_FIXTURES = {
  entries: parseGamesView(gamesEntries),
  locked: parseGamesView(gamesLocked),
  show: parseGamesView(gamesShow),
  after: parseGamesView(gamesAfter),
  stallBuy: parseStallPurchase(gamesStallBuy),
  stallBuyBait: parseStallPurchase(gamesStallBuyBait),
  creature: parseCreatureGames(gamesCreature),
} as const;

/** A medal table with a few more players, the viewer in the middle. */
const BOARD: GamesView['board'] = [
  { userId: 'p-aino', name: 'Aino', gold: 9, silver: 4, bronze: 2 },
  { userId: 'p-eero', name: 'Eero', gold: 6, silver: 6, bronze: 5 },
  { userId: GAMES_SELF_ID, name: 'Player 1', gold: 4, silver: 7, bronze: 3 },
  { userId: 'p-kaisa', name: 'Kaisa', gold: 2, silver: 1, bronze: 6 },
  { userId: 'p-lauri', name: 'Lauri the Magnificent', gold: 0, silver: 3, bronze: 1 },
];

export const GAMES_VIEWS = [
  'entries: one entered',
  'entries: all entered',
  'entries: none entered',
  'after: results and the next lineup',
  'after: stall open',
  'locked: the stands',
  'show: live',
] as const;
export type GamesViewName = (typeof GAMES_VIEWS)[number];

/** The captured lineup's solo events and its team event (the ids follow the content). */
const LINEUP = GAMES_FIXTURES.entries.next.lineup;
export const SAMPLE_SOLO = LINEUP.filter((e) => e.team === 1).map((e) => e.id);
export const SAMPLE_TEAM = LINEUP.find((e) => e.team === 3)?.id ?? '';

/**
 * Every event of the lineup entered as a player who reads the badges would: in each solo event a good
 * fit the capture marked (when one is still free), the team event filled to three with the rest.
 */
function allEntered(): Record<string, string[]> {
  const next = GAMES_FIXTURES.entries.next;
  const out: Record<string, string[]> = {};
  const used = new Set<string>();
  for (const eventId of SAMPLE_SOLO) {
    const pick = (next.goodFit[eventId] ?? []).find((c) => !used.has(c));
    if (pick === undefined) continue;
    out[eventId] = [pick];
    used.add(pick);
  }
  const rest = [1, 2, 3, 4, 5, 6].map(id).filter((c) => !used.has(c));
  const good = new Set(next.goodFit[SAMPLE_TEAM] ?? []);
  rest.sort((a, b) => Number(good.has(b)) - Number(good.has(a)));
  if (SAMPLE_TEAM !== '') out[SAMPLE_TEAM] = rest.slice(0, 3);
  return out;
}

/** A view by name, with its clock moved to now (so countdowns and the show read as captured). */
export function gamesView(name: GamesViewName): { view: GamesView; offset: number } {
  const f = GAMES_FIXTURES;
  const pick = (): GamesView => {
    switch (name) {
      case 'entries: one entered':
        return {
          ...f.entries,
          next: { ...f.entries.next, entries: { [SAMPLE_SOLO[0] ?? '']: [id(1)] } },
        };
      case 'entries: all entered':
        return { ...f.entries, next: { ...f.entries.next, entries: allEntered() } };
      case 'entries: none entered':
        return { ...f.entries, next: { ...f.entries.next, entries: {} } };
      case 'after: results and the next lineup':
        return { ...f.after, board: BOARD };
      case 'after: stall open':
        return {
          ...f.after,
          board: BOARD,
          stall: { ...f.stallBuy.stall, offers: f.entries.stall.offers },
        };
      case 'locked: the stands':
        return f.locked;
      case 'show: live':
        return f.show;
    }
  };
  const view = pick();
  return { view, offset: view.serverNow - Date.now() };
}
