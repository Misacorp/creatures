/**
 * One scripted day of the Valley Games through the real routes, for the contract fixtures
 * (`games-*.json` in `apps/activity/src/fixtures`; see `fixture-sets.ts`). A player with six creatures
 * enters one event (auto-entry fills the rest at the lock) next to a second, auto-entered player; the
 * responses are taken with entries open, after the lock, during the show and after the awards, then a
 * stall purchase on the Wednesday and a creature's records. Nothing here is hand-written output.
 */
import { createSeededRng } from '@creatures/game';
import { createRecorder, type Captured } from './fixture-contract';
import type { CoreContext } from './helpers';
import { MINUTE, newKey, sessionCaller } from './kit';
import { seedPlayer } from './raid-helpers';

/** Tuesday 2027-01-12, 10:00 in Helsinki: entries are open for that day's show (13:40). */
export const GAMES_SCENARIO_START = Date.parse('2027-01-12T08:00:00Z');
const LOCK = Date.parse('2027-01-12T11:37:00Z');
const SHOW = Date.parse('2027-01-12T11:40:00Z');
/** The next day, a Wednesday, 14:00: the Prize Stall is open. */
const WEDNESDAY = Date.parse('2027-01-13T12:00:00Z');

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
  // The rival joined the Games earlier (auto-entry on): the lock enters their creatures for them.
  ctx.sql.exec(
    'INSERT INTO games_players (user_id, auto, joined_at) VALUES (?, 1, ?)',
    rival.id,
    GAMES_SCENARIO_START - MINUTE,
  );
  const { call } = await sessionCaller(ctx, { id: seeded.id, displayName: seeded.name });
  const { record, refuse, captured } = createRecorder(call);

  const open = await record('games-entries', 'GET', '/api/games');
  const next = (open.body as { next: Next }).next;
  const solo = next.lineup.find((e) => e.team === 1)?.id ?? '';
  const team = next.lineup.find((e) => e.team === 3)?.id ?? '';
  const [a, b, c, d] = seeded.creatureIds as [string, string, string, string];
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
  await record('games-auto', 'PUT', '/api/games/auto', { on: true });

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
