import { describe, expect, it } from 'vitest';
import after from '../../activity/src/fixtures/games-after.json';
import creature from '../../activity/src/fixtures/games-creature.json';
import entries from '../../activity/src/fixtures/games-entries.json';
import entry from '../../activity/src/fixtures/games-entry.json';
import entryTeam from '../../activity/src/fixtures/games-entry-team.json';
import errors from '../../activity/src/fixtures/games-errors.json';
import locked from '../../activity/src/fixtures/games-locked.json';
import show from '../../activity/src/fixtures/games-show.json';
import buy from '../../activity/src/fixtures/games-stall-buy.json';
import buyBait from '../../activity/src/fixtures/games-stall-buy-bait.json';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for the Valley Games. The files in `apps/activity/src/fixtures` were
 * captured from real server output (`games-scenario.ts`, see `fixture-sets.ts`). These tests run the
 * scenario again and compare the SHAPE of every response (keys and types, not values), so a change in
 * what the server sends fails here and points at the fixtures and the client's parsers.
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture --set games`, review the diff of apps/activity/src/fixtures and update the Games client types';

const sameShape = (live: unknown, fixture: unknown): void => expectSameShape(live, fixture, UPDATE);

describe('the games fixtures match what the server sends', () => {
  it('has the same responses and the same errors for the whole scenario', async () => {
    const captured = await fixtureSet('games').run();
    const r = captured.responses;
    sameShape(r['games-entries'], entries);
    sameShape(r['games-entry'], entry);
    sameShape(r['games-entry-team'], entryTeam);
    sameShape(r['games-locked'], locked);
    sameShape(r['games-show'], show);
    sameShape(r['games-after'], after);
    sameShape(r['games-creature'], creature);
    sameShape(r['games-stall-buy'], buy);
    sameShape(r['games-stall-buy-bait'], buyBait);
    expect(captured.errors, UPDATE).toEqual(errors);
  });

  it('shows what each fixture is meant to show', () => {
    expect(entries.phase).toBe('entries');
    expect(entries.next).not.toHaveProperty('auto');
    expect(Object.keys(entries.next.goodFit)).toEqual(entries.next.lineup.map((e) => e.id));
    expect(Object.values(entries.next.goodFit).flat().length).toBeGreaterThan(0);
    expect(entries.show).toBeNull();
    expect(locked.phase).toBe('locked');
    expect(locked.show).toBeNull();
    expect(show.phase).toBe('show');
    expect(show.show?.events.length).toBeGreaterThan(0);
    expect(after.phase).toBe('after');
    expect(after.you.lastResults?.results.length).toBeGreaterThan(0);
    expect(buy.purchase.grant.gear).toHaveLength(1);
    expect(buyBait.purchase.bait).toBeGreaterThan(0);
    expect(errors.map((e) => e.body.error)).toEqual([
      'already_entered',
      'invalid_team',
      'invalid_body',
      'entries_closed',
      'stall_closed',
      'limit_reached',
    ]);
  });
});
