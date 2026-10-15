/**
 * One scripted play-through of the daily dungeon through the real routes. The capture test
 * (`dungeon-capture.test.ts`) writes its responses out as the fixtures in
 * `apps/activity/src/fixtures` (`dungeon-*.json`), and `dungeon-fixtures.test.ts` checks that the
 * server still sends the shapes those files have, so the client can build against them. Nothing here
 * is hand-written output: every response comes from the server.
 */
import { createSeededRng } from '@creatures/game';
import { dungeonPlayer, newKey, type DungeonPlayer, type Json } from './dungeon-helpers';
import type { CoreContext } from './helpers';

/** Tuesday of week 2027-W02, 14:00 in Helsinki: after the 13:37 daily reset, so the game day is the 12th. */
export const DUNGEON_SCENARIO_START = Date.parse('2027-01-12T12:00:00Z');

export interface DungeonCaptured {
  /** Named responses: bodies of successful calls. */
  responses: Record<string, unknown>;
  /** Real error bodies: `{ route, status, body }`. */
  errors: { route: string; status: number; body: unknown }[];
  /** Request bodies the client sends, `{ path, method, body }`, with real ids. */
  requests: Record<string, { path: string; method: string; body: unknown }>;
}

/** The rngs the scenario's guild must be built with, so the output is the same every time. */
export const dungeonScenarioOptions = () => ({
  dungeonRng: createSeededRng('fixture-dungeon'),
  gearRng: createSeededRng('fixture-dungeon-gear'),
});

export async function runDungeonScenario(ctx: CoreContext): Promise<DungeonCaptured> {
  ctx.clock.t = DUNGEON_SCENARIO_START;
  const out: DungeonCaptured = { responses: {}, errors: [], requests: {} };
  const tidy = (method: string, path: string): string =>
    `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`;

  /** Calls, remembers the request, and stores the response (or the error) under `name`. */
  const record = async (
    p: DungeonPlayer,
    name: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Json> => {
    const res = await p.call(method, path, body);
    if (res.status === 200) {
      out.responses[name] = res.body;
      out.requests[name] = { path, method, body: body ?? null };
    } else {
      out.errors.push({ route: tidy(method, path), status: res.status, body: res.body });
    }
    return res;
  };
  const refuse = async (p: DungeonPlayer, method: string, path: string, body?: unknown) => {
    const res = await p.call(method, path, body);
    if (res.status === 200) throw new Error(`${method} ${path} was meant to fail`);
    out.errors.push({ route: tidy(method, path), status: res.status, body: res.body });
  };
  const setProgress = (userId: string, fields: Record<string, number | string | null>): void => {
    ctx.sql.exec(
      `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      fields['depth'] ?? 1,
      fields['streak'] ?? 0,
      fields['last_day'] ?? null,
      fields['first_day'] ?? null,
    );
  };

  // --- A new player's day: today, a run, and today again ---
  const hero = await dungeonPlayer(ctx, 1, {
    level: 12,
    species: ['cindle', 'sproutle', 'splashet'],
  });
  const [cindle, sproutle, splashet] = hero.creatureIds as [string, string, string];
  out.responses['dungeon-today'] = (await hero.call('GET', '/api/dungeon/today')).body;
  // The row is saved while the player sets it up (the run below spends it).
  await record(hero, 'dungeon-team-draft', 'PUT', '/api/dungeon/team', {
    team: [splashet, null, cindle],
  });
  out.responses['dungeon-today-draft'] = (await hero.call('GET', '/api/dungeon/today')).body;
  const body = hero.body({ team: [sproutle, splashet, cindle] });
  const ran = await record(hero, 'dungeon-run-cleared', 'POST', '/api/dungeon/run', body);
  const runId = ((ran.body['run'] ?? {}) as { id?: string }).id ?? '';
  out.responses['dungeon-today-done'] = (await hero.call('GET', '/api/dungeon/today')).body;
  await record(hero, 'dungeon-replay', 'GET', `/api/dungeon/run/${runId}`);
  // A retry with the same key is the stored run.
  await record(hero, 'dungeon-run-retry', 'POST', '/api/dungeon/run', body);

  // --- What a player can hit ---
  await refuse(hero, 'POST', '/api/dungeon/run', hero.body()); // already run today
  await refuse(hero, 'PUT', '/api/dungeon/team', { team: [cindle, cindle, null] }); // the same creature twice
  await refuse(hero, 'POST', '/api/dungeon/run', { ...body, team: [cindle, splashet, sproutle] }); // same key, other team
  const other = await dungeonPlayer(ctx, 2, { level: 12 });
  await refuse(
    other,
    'POST',
    '/api/dungeon/run',
    other.body({
      team: [
        other.creatureIds[0] as string,
        other.creatureIds[0] as string,
        other.creatureIds[1] as string,
      ],
    }),
  );
  // The old shape, with a formation of zones: refused, since the order of `team` is the row.
  await refuse(other, 'POST', '/api/dungeon/run', {
    ...other.body(),
    formation: ['front', 'middle', 'back'],
  });
  await refuse(
    other,
    'POST',
    '/api/dungeon/run',
    other.body({ team: [cindle, ...other.creatureIds.slice(1, 3)] }),
  ); // somebody else's creature
  await refuse(
    other,
    'POST',
    '/api/dungeon/run',
    other.body({ team: other.creatureIds.slice(0, 2) }),
  ); // two creatures
  // The old shape with `abilities` (a basic pick and fire rounds): refused, there is no such choice.
  await refuse(other, 'POST', '/api/dungeon/run', {
    ...other.body(),
    abilities: { basic: { abilityId: 'rally', fireAtRound: null }, creatures: [] },
  });
  await refuse(other, 'GET', `/api/dungeon/run/${runId}`); // somebody else's run
  await refuse(other, 'GET', '/api/dungeon/run/not-a-uuid');
  await refuse(other, 'POST', '/api/dungeon/run', { ...other.body(), seed: 'abc' }); // a seed is not for clients

  // --- A landmark: depth 7, a day-3 streak and a gear drop ---
  const champion = await dungeonPlayer(ctx, 3, {
    level: 30,
    species: ['tidewing', 'pyrelynx', 'thornbuck'],
  });
  setProgress(champion.id, {
    depth: 7,
    streak: 2,
    last_day: '2027-01-11',
    first_day: '2027-01-01',
  });
  out.responses['dungeon-today-landmark'] = (await champion.call('GET', '/api/dungeon/today')).body;
  await record(champion, 'dungeon-run-landmark', 'POST', '/api/dungeon/run', champion.body());

  // --- A lost run on the first day: the retry is offered ---
  const loser = await dungeonPlayer(ctx, 4, { level: 1 });
  setProgress(loser.id, { depth: 45 });
  await record(loser, 'dungeon-run-lost', 'POST', '/api/dungeon/run', loser.body());
  out.responses['dungeon-today-retry'] = (await loser.call('GET', '/api/dungeon/today')).body;
  const second = loser.body({ idempotencyKey: newKey() });
  await record(loser, 'dungeon-run-retry-attempt', 'POST', '/api/dungeon/run', second);
  await refuse(loser, 'POST', '/api/dungeon/run', loser.body()); // no third run

  // --- A player who cannot run yet ---
  const fresh = await dungeonPlayer(ctx, 5, { creatures: 2 });
  out.responses['dungeon-today-need-creatures'] = (
    await fresh.call('GET', '/api/dungeon/today')
  ).body;
  await refuse(
    fresh,
    'POST',
    '/api/dungeon/run',
    fresh.body({ team: fresh.creatureIds.slice(0, 2) }),
  );
  return out;
}
