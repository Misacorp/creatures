import { beforeEach, describe, expect, it, vi } from 'vitest';
import gamesAfter from './fixtures/games-after.json';
import gamesCreature from './fixtures/games-creature.json';
import gamesEntries from './fixtures/games-entries.json';
import gamesEntry from './fixtures/games-entry.json';
import gamesEntryTeam from './fixtures/games-entry-team.json';
import gamesErrors from './fixtures/games-errors.json';
import gamesLocked from './fixtures/games-locked.json';
import requestBodies from './fixtures/games-request-bodies.json';
import gamesShow from './fixtures/games-show.json';
import gamesStallBuy from './fixtures/games-stall-buy.json';
import gamesStallBuyBait from './fixtures/games-stall-buy-bait.json';

/**
 * The Valley Games client against the real server output (`fixtures/games-*.json`, captured from the
 * Worker): every answer passes the client's guards, every request the client builds is the body the
 * server took, and every refusal the server sends has words.
 */
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: api.apiFetch,
}));

import { buyStallOffer, fetchCreatureGames, setGamesEntry } from './games-api';
import {
  isEventResult,
  parseCreatureGames,
  parseEntryAnswer,
  parseGamesView,
  parseStallPurchase,
} from './games-parse';
import { GAMES_ERRORS } from './games/GamesTab';
import { ApiError } from './api';
import { errorText } from './game';

const VIEWS = { gamesAfter, gamesEntries, gamesLocked, gamesShow };

beforeEach(() => {
  api.apiFetch.mockReset();
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('the Games payloads', () => {
  it.each(Object.entries(VIEWS))('reads GET /api/games: %s', (_name, raw) => {
    const view = parseGamesView(raw);
    // Three events a day; Wednesday (the captures' next day after Tuesday's show) one bonus more.
    const bonus = view.next.lineup.filter((e) => e.bonus === true).length;
    expect(bonus).toBe(view.next.day === '2027-01-13' ? 1 : 0);
    expect(view.next.lineup).toHaveLength(3 + bonus);
    expect(view.next.lineup.filter((e) => e.team === 3)).toHaveLength(1);
    expect(view.stall.offers.length).toBeGreaterThan(0);
  });

  it('reads the phases the captures were made in, and the stored show', () => {
    expect(parseGamesView(gamesEntries).phase).toBe('entries');
    expect(parseGamesView(gamesLocked).phase).toBe('locked');
    expect(parseGamesView(gamesShow).phase).toBe('show');
    const after = parseGamesView(gamesAfter);
    expect(after.phase).toBe('after');
    expect(after.show?.events).toHaveLength(3);
    expect(after.show?.events.every(isEventResult)).toBe(true);
    // The player entered a solo event and the team event (no auto-entry fills the third).
    expect(after.you.lastResults?.results).toHaveLength(2);
  });

  it('reads the entry, purchase and creature answers', () => {
    const solo = requestBodies['games-entry'].body.eventId;
    const team = requestBodies['games-entry-team'].body.eventId;
    expect(parseEntryAnswer(gamesEntry).entries[solo]).toHaveLength(1);
    expect(parseEntryAnswer(gamesEntryTeam).entries[team]).toHaveLength(2);
    expect(parseStallPurchase(gamesStallBuy).purchase.grant.gear).toHaveLength(1);
    expect(parseStallPurchase(gamesStallBuyBait).purchase.bait).toBe(30);
    const creature = parseCreatureGames(gamesCreature);
    expect(creature.records[0]?.unit).toEqual(expect.any(String));
    expect(Array.isArray(creature.badges)).toBe(true);
  });

  it('reads the good fits and the event badges, and no auto-entry or fit pips', () => {
    const next = parseGamesView(gamesEntries).next;
    expect(Object.keys(next.goodFit).sort()).toEqual(next.lineup.map((e) => e.id).sort());
    expect(next).not.toHaveProperty('auto');
    expect(next).not.toHaveProperty('fit');
    // A badge is a positive win count per creature; anything else is refused.
    const won = clone(gamesEntries) as { next: { badges: Record<string, Record<string, number>> } };
    won.next.badges = { 'pepper-panic': { c1: 3 } };
    expect(parseGamesView(won).next.badges).toEqual({ 'pepper-panic': { c1: 3 } });
    won.next.badges = { 'pepper-panic': { c1: 0 } };
    expect(() => parseGamesView(won)).toThrow();
    const fits = clone(gamesEntries) as { next: { goodFit: unknown } };
    fits.next.goodFit = { 'pepper-panic': [1] };
    expect(() => parseGamesView(fits)).toThrow();
    const page = clone(gamesCreature) as { badges: unknown };
    page.badges = [{ eventId: 'pepper-panic', wins: 2 }];
    expect(parseCreatureGames(page).badges).toEqual([{ eventId: 'pepper-panic', wins: 2 }]);
    page.badges = [{ eventId: 'pepper-panic', wins: -1 }];
    expect(() => parseCreatureGames(page)).toThrow();
    delete (page as { badges?: unknown }).badges;
    expect(() => parseCreatureGames(page)).toThrow();
  });

  it('reads the bonus mark on a lineup event and a result, and only as true', () => {
    expect(parseGamesView(gamesShow).next.lineup.find((e) => e.bonus === true)?.team).toBe(1);
    const result = clone(gamesAfter) as {
      you: { lastResults: { results: Record<string, unknown>[] } };
      next: { lineup: Record<string, unknown>[] };
    };
    (result.you.lastResults.results[0] as Record<string, unknown>)['bonus'] = true;
    expect(parseGamesView(result).you.lastResults?.results[0]?.bonus).toBe(true);
    (result.next.lineup[0] as Record<string, unknown>)['bonus'] = false;
    expect(() => parseGamesView(result)).toThrow();
  });

  it('refuses a payload of the wrong shape instead of drawing half a tab', () => {
    const bad = clone(gamesEntries) as Record<string, unknown>;
    bad['phase'] = 'intermission';
    expect(() => parseGamesView(bad)).toThrow(/Games tab/);
    const team = clone(gamesEntries) as { next: { lineup: { team: number }[] } };
    (team.next.lineup[0] as { team: number }).team = 2;
    expect(() => parseGamesView(team)).toThrow();
    const noFits = clone(gamesEntry) as { next: Record<string, unknown> };
    delete noFits.next['goodFit'];
    expect(() => parseEntryAnswer(noFits)).toThrow();
    const show = clone(gamesShow) as { show: { events: { beats: unknown[] }[] } };
    (show.show.events[0] as { beats: unknown[] }).beats.push({ k: 'pos' });
    expect(() => parseGamesView(show)).toThrow();
    expect(() => parseStallPurchase({ ...gamesStallBuy, purchase: { offerId: 'x' } })).toThrow();
  });

  it('has words for every refusal the server sends', () => {
    for (const { status, body } of gamesErrors) {
      const text = errorText(new ApiError(status, body.error), 'Bait', GAMES_ERRORS);
      expect(text, body.error).not.toMatch(/Something went wrong/);
    }
  });
});

describe('the Games requests', () => {
  it('sends the entry bodies the server took', async () => {
    api.apiFetch.mockResolvedValue(gamesEntry);
    const solo = requestBodies['games-entry'];
    await setGamesEntry(solo.body.day, solo.body.eventId, solo.body.creatureIds);
    const team = requestBodies['games-entry-team'];
    await setGamesEntry(team.body.day, team.body.eventId, team.body.creatureIds);
    const calls = api.apiFetch.mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe(solo.path);
    expect(calls[0]?.[1].method).toBe(solo.method);
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual(solo.body);
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual(team.body);
  });

  it('sends a purchase with its key, and nothing for auto-entry', async () => {
    api.apiFetch.mockResolvedValueOnce(gamesStallBuy);
    const buy = requestBodies['games-stall-buy'];
    await buyStallOffer(buy.body.offerId, buy.body.idempotencyKey);
    const calls = api.apiFetch.mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe(buy.path);
    expect(calls[0]?.[1].method).toBe('POST');
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual(buy.body);
    expect(Object.keys(requestBodies)).not.toContain('games-auto');
  });

  it('asks for a creature by its id, escaped', async () => {
    api.apiFetch.mockResolvedValue(gamesCreature);
    await fetchCreatureGames('a/b');
    expect(api.apiFetch).toHaveBeenCalledWith('/api/games/creature/a%2Fb');
  });
});
