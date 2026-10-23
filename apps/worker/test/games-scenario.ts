/**
 * One scripted day of the Valley Games through the real routes, for the contract fixtures
 * (`games-*.json` in `apps/activity/src/fixtures`; see `fixture-sets.ts`). A player with six creatures
 * enters a solo event and the team event next to a second player who enters every event (there is no
 * auto-entry); the responses are taken with entries open, after the lock, during the show and after
 * the awards, then a stall purchase on the Wednesday and a creature's medals, badges and records.
 * Nothing here is hand-written output.
 */
import { createSeededRng } from '@creatures/game';
import { createRecorder, type Captured } from './fixture-contract';
import type { CoreContext } from './helpers';
import { newKey, sessionCaller } from './kit';
import { seedPlayer } from './raid-helpers';

/** Tuesday 2027-01-12, 10:00 in Helsinki: entries are open for that day's show (13:40). */
export const GAMES_SCENARIO_START = Date.parse('2027-01-12T08:00:00Z');
const LOCK = Date.parse('2027-01-12T11:37:00Z');
const SHOW = Date.parse('2027-01-12T11:40:00Z');
/** The next day, a Wednesday, 14:00: the Prize Stall is open. */
const WEDNESDAY = Date.parse('2027-01-13T12:00:00Z');

/** Tuesday's events (two solo events, then the team event). */
export const SCENARIO_LINEUP = ['melon-run', 'pepper-panic', 'log-carry'] as const;

export const gamesScenarioOptions = () => ({
  gamesRng: createSeededRng('fixture-games'),
  gearRng: createSeededRng('fixture-games-gear'),
});

type Next = { day: string; lineup: { id: string; team: 1 | 3 }[] };

export async function runGamesScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = GAMES_SCENARIO_START;
  const seeded = seedPlayer(ctx, 1, {
    level: 12,
    creatures: 6,
    species: ['splashet', 'cindle', 'sproutle', 'zipmouse', 'mistnewt', 'ashmole'],
  });
  const rival = seedPlayer(ctx, 2, {
    level: 10,
    creatures: 6,
    species: ['stormray', 'mossback', 'coralynx', 'solmane', 'cindle', 'splashet'],
  });
  // The day's lineup is pinned, so the fixtures (and the client tests that name their events) stay
  // the same when events are added to the content; the next days are drawn as usual.
  ctx.sql.exec(
    'INSERT INTO games_days (day, lineup_json, created_at) VALUES (?, ?, ?)',
    '2027-01-12',
    JSON.stringify(SCENARIO_LINEUP),
    GAMES_SCENARIO_START,
  );
  const { call } = await sessionCaller(ctx, { id: seeded.id, displayName: seeded.name });
  const rivalCaller = await sessionCaller(ctx, { id: rival.id, displayName: rival.name });
  const { record, refuse, captured } = createRecorder(call);

  const open = await record('games-entries', 'GET', '/api/games');
  const next = (open.body as { next: Next }).next;
  const solo = next.lineup.find((e) => e.team === 1)?.id ?? '';
  const team = next.lineup.find((e) => e.team === 3)?.id ?? '';
  const [a, b, c, d] = seeded.creatureIds as [string, string, string, string];
  // The rival enters every event (not recorded: the same answers as the player's).
  let r = 0;
  for (const e of next.lineup) {
    const size = e.team === 3 ? 3 : 1;
    await rivalCaller.call('PUT', '/api/games/entry', {
      day: next.day,
      eventId: e.id,
      creatureIds: rival.creatureIds.slice(r, r + size),
    });
    r += size;
  }
  await record('games-entry', 'PUT', '/api/games/entry', {
    day: next.day,
    eventId: solo,
    creatureIds: [a],
  });
  await record('games-entry-team', 'PUT', '/api/games/entry', {
    day: next.day,
    eventId: team,
    creatureIds: [b, c],
  });
  await refuse('PUT', '/api/games/entry', { day: next.day, eventId: team, creatureIds: [a] });
  await refuse('PUT', '/api/games/entry', { day: next.day, eventId: solo, creatureIds: [d, b] });
  await refuse('PUT', '/api/games/entry', { day: next.day, eventId: solo, extra: true });

  ctx.clock.t = LOCK + 5_000;
  await record('games-locked', 'GET', '/api/games');
  await refuse('PUT', '/api/games/entry', { day: next.day, eventId: solo, creatureIds: [d] });

  ctx.clock.t = SHOW + 20_000;
  const live = await record('games-show', 'GET', '/api/games');
  const endsAt = (live.body as { show: { endsAt: number } }).show.endsAt;

  ctx.clock.t = endsAt + 1;
  await ctx.core.alarm();
  await record('games-after', 'GET', '/api/games');
  await record('games-creature', 'GET', `/api/games/creature/${a}`);
  await refuse('POST', '/api/games/stall/buy', {
    offerId: 'bait-sack',
    idempotencyKey: newKey('games'),
  });

  ctx.clock.t = WEDNESDAY;
  // A known pocket, whatever the show paid, so the stall's answers do not move with the engine's tuning.
  ctx.sql.exec(
    `INSERT INTO games_medals (user_id, pocket) VALUES (?, 12)
     ON CONFLICT(user_id) DO UPDATE SET pocket = 12`,
    seeded.id,
  );
  await record('games-stall-buy', 'POST', '/api/games/stall/buy', {
    offerId: 'mystery-gear',
    idempotencyKey: newKey('games'),
  });
  await record('games-stall-buy-bait', 'POST', '/api/games/stall/buy', {
    offerId: 'bait-sack',
    idempotencyKey: newKey('games'),
  });
  await refuse('POST', '/api/games/stall/buy', {
    offerId: 'mystery-gear',
    idempotencyKey: newKey('games'),
  });
  return captured;
}
