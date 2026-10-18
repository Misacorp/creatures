/**
 * One scripted play-through of the daily dungeon on the map, through the real routes. The capture test
 * (`dungeon-capture.test.ts`) writes its responses out as the fixtures in
 * `apps/activity/src/fixtures` (`dungeon-*.json`), and `dungeon-fixtures.test.ts` checks that the
 * server still sends the shapes those files have, so the client can build against them. Nothing here
 * is hand-written output: every response comes from the server.
 *
 * The fights are made easy or deadly (`scaleFoes`) where the script needs a win or a loss, so a retune
 * of the foes does not change what the script shows. The map, the events and the camp's offers come from
 * the seeded rngs of `dungeonScenarioOptions`.
 *
 * The older fixtures (`dungeon-run-*.json`, `dungeon-today*.json` from before the map, the old
 * replay) were captured from the all-at-once run that no longer exists; they stay, as the shapes of the
 * runs stored before the map, and are not captured again.
 */
import { createSeededRng } from '@creatures/game';
import {
  deadlyFoes,
  dungeonPlayer,
  followRoute,
  newKey,
  routeThrough,
  scaleFoes,
  type DungeonPlayer,
  type Json,
} from './dungeon-helpers';
import type { DungeonRunState } from '../src/dungeon-types';
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

type Act = Parameters<DungeonPlayer['act']>[1];

/** The foes of the script's wins: weak enough that the team of level 12 beats any room of the map. */
const FOES: [hpBp: number, atkBp: number] = [2_000, 1_000];

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
  const actBody = (state: DungeonRunState, act: Act, key = newKey()) => ({
    runId: state.id,
    step: state.step,
    idempotencyKey: key,
    act,
  });
  /** An act, recorded under `name`; answers the new state. */
  const step = async (
    p: DungeonPlayer,
    name: string,
    state: DungeonRunState,
    act: Act,
  ): Promise<DungeonRunState> => {
    const res = await record(p, name, 'POST', '/api/dungeon/act', actBody(state, act));
    if (res.status !== 200) throw new Error(`${name} failed: ${JSON.stringify(res.body)}`);
    return (res.body as unknown as { state: DungeonRunState }).state;
  };
  /** Plays on (not recorded) along `route` until `stop` holds. */
  const walk = async (
    p: DungeonPlayer,
    state: DungeonRunState,
    route: readonly string[],
    stop: (s: DungeonRunState) => boolean,
  ): Promise<DungeonRunState> => {
    const res = await p.play(state, { pick: followRoute(route), stopWhen: stop });
    return res.body.state as DungeonRunState;
  };
  const routeTo = (state: DungeonRunState, kind: string): string[] =>
    routeThrough(state.map, (n) => n.kind === kind) as string[];

  // --- A full run: the map, a fight, a mystery room, the camp with a swap, and a clear ---
  let restore = scaleFoes(...FOES);
  const hero = await dungeonPlayer(ctx, 1, {
    level: 12,
    creatures: 4,
    species: ['cindle', 'sproutle', 'splashet', 'zipmouse'],
  });
  const [cindle, sproutle, splashet, zipmouse] = hero.creatureIds as [
    string,
    string,
    string,
    string,
  ];
  // The day's map before anyone has entered.
  out.responses['dungeon-today-map'] = (await hero.call('GET', '/api/dungeon/today')).body;
  const startBody = hero.body({ team: [sproutle, splashet, cindle] });
  const started = await record(hero, 'dungeon-start', 'POST', '/api/dungeon/start', startBody);
  let state = (started.body as unknown as { state: DungeonRunState }).state;
  // The first fight, played whole: the answer carries the room to show at once.
  state = await step(hero, 'dungeon-act-fight', state, {
    type: 'move',
    node: state.reachable[0] as string,
  });
  // On to the camp, which every path crosses.
  const toCamp = routeTo(state, 'camp');
  state = await walk(hero, state, toCamp, (s) => s.reachable.includes(toCamp.at(-1) as string));
  state = await step(hero, 'dungeon-act-camp-pending', state, {
    type: 'move',
    node: toCamp.at(-1) as string,
  });
  out.responses['dungeon-today-active'] = (await hero.call('GET', '/api/dungeon/today')).body;
  // Swap the third creature for the fourth, and stand in a new order.
  state = await step(hero, 'dungeon-act-camp', state, {
    type: 'camp',
    choice: 'swap',
    order: [splashet, sproutle, cindle],
    out: cindle,
    in: zipmouse,
  });
  // Play on to the room boss; the move into it is the clear.
  const boss = state.map.nodes.find((n) => n.kind === 'boss')?.id as string;
  state = await walk(hero, state, [], (s) => s.reachable.includes(boss));
  state = await step(hero, 'dungeon-act-cleared', state, { type: 'move', node: boss });
  if (state.outcome !== 'cleared') throw new Error('hero did not clear the map');
  await record(hero, 'dungeon-replay-path', 'GET', `/api/dungeon/run/${state.id}`);

  // --- A mystery room: opening it waits for an answer, and the answer ---
  const seer = await dungeonPlayer(ctx, 2, { level: 12 });
  let seen = (await seer.start()).body.state;
  const toRoom = routeTo(seen, 'mystery');
  seen = await walk(seer, seen, toRoom, (s) => s.reachable.includes(toRoom.at(-1) as string));
  seen = await step(seer, 'dungeon-act-event-pending', seen, {
    type: 'move',
    node: toRoom.at(-1) as string,
  });
  await step(seer, 'dungeon-act-event', seen, { type: 'event', option: 1 });

  // --- Heading home from the camp ---
  const homer = await dungeonPlayer(ctx, 3, { level: 12 });
  let home = (await homer.start()).body.state;
  const homeRoute = routeTo(home, 'camp');
  home = await walk(homer, home, homeRoute, (s) => s.pending?.kind === 'camp');
  await step(homer, 'dungeon-act-home', home, { type: 'home' });

  // --- A defeat: deadly foes end the run in the first fight ---
  restore();
  restore = deadlyFoes();
  const loser = await dungeonPlayer(ctx, 4, { level: 1 });
  const lost = (await loser.start()).body.state;
  await step(loser, 'dungeon-act-defeat', lost, {
    type: 'move',
    node: lost.reachable[0] as string,
  });
  restore();

  // --- What a player can hit ---
  restore = scaleFoes(...FOES);
  const other = await dungeonPlayer(ctx, 5, { level: 12 });
  const open = (await other.start()).body.state;
  const move = { type: 'move', node: open.reachable[0] as string } as const;
  await refuse(other, 'POST', '/api/dungeon/start', other.body()); // a run is open
  await refuse(other, 'POST', '/api/dungeon/act', actBody({ ...open, step: 4 }, move)); // stale step
  await refuse(other, 'POST', '/api/dungeon/act', actBody(open, { type: 'home' })); // not at the camp
  await refuse(
    other,
    'POST',
    '/api/dungeon/act',
    actBody(open, { type: 'move', node: open.map.nodes.find((n) => n.floor === 2)?.id as string }),
  ); // not reachable
  const key = newKey();
  await other.call('POST', '/api/dungeon/act', actBody(open, move, key));
  await refuse(
    other,
    'POST',
    '/api/dungeon/act',
    actBody(open, { type: 'move', node: open.reachable[1] ?? open.reachable[0] ?? 'f0l0' }, key),
  ); // the key of another act
  await refuse(hero, 'POST', '/api/dungeon/act', actBody(open, move)); // somebody else's run
  await refuse(other, 'POST', '/api/dungeon/act', { ...actBody(open, move), seed: 'abc' }); // a seed is not for clients
  await refuse(other, 'POST', '/api/dungeon/run', other.body()); // the old route is gone
  await refuse(hero, 'POST', '/api/dungeon/start', hero.body()); // already run today
  await refuse(hero, 'POST', '/api/dungeon/start', {
    ...startBody,
    team: [cindle, splashet, sproutle],
  }); // same key, other team
  await refuse(hero, 'POST', '/api/dungeon/start', { ...hero.body(), formation: ['front'] }); // an old shape
  await refuse(hero, 'GET', `/api/dungeon/run/${open.id}`); // somebody else's run
  const treater = await dungeonPlayer(ctx, 6, { level: 12 });
  // The same creature twice (checked before whose they are).
  await refuse(
    treater,
    'POST',
    '/api/dungeon/start',
    treater.body({ team: [sproutle, sproutle, splashet] }),
  );
  await refuse(treater, 'POST', '/api/dungeon/start', treater.body({ treats: [sproutle] })); // a treat for a creature that is not in the team
  await refuse(
    treater,
    'POST',
    '/api/dungeon/start',
    treater.body({ treats: [treater.creatureIds[0] as string] }),
  ); // a treat nobody can pay for
  restore();

  // --- A player who cannot run yet ---
  const fresh = await dungeonPlayer(ctx, 7, { creatures: 2 });
  await refuse(
    fresh,
    'POST',
    '/api/dungeon/start',
    fresh.body({ team: fresh.creatureIds.slice(0, 2) }),
  );
  return out;
}
