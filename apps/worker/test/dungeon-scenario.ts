/**
 * One scripted play-through of the daily dungeon on the map, through the real routes.
 * `pnpm fixtures:capture` (see `fixture-sets.ts`) writes its responses out as the fixtures in
 * `apps/activity/src/fixtures` (`dungeon-*.json`), and `dungeon-fixtures.test.ts` checks that the
 * server still sends the shapes those files have, so the client can build against them. Nothing here
 * is hand-written output: every response comes from the server.
 *
 * The fights are made easy or deadly (`scaleFoes`) where the script needs a win or a loss, so a retune
 * of the foes does not change what the script shows. The map, the events and the camp's offers come from
 * the seeded rngs of `dungeonScenarioOptions`.
 *
 * The older fixtures (`dungeon-run-*.json`, `dungeon-today*.json` from before the map, the old
 * replay, `dungeon-legacy-errors.json`, `dungeon-legacy-request-bodies.json`) were captured from the
 * all-at-once run that no longer exists; they stay, as the shapes of the runs stored before the map,
 * and are not captured again.
 */
import { RULES, createSeededRng, dungeonContent } from '@creatures/game';
import {
  deadlyFoes,
  dungeonPlayer,
  followRoute,
  routeThrough,
  scaleFoes,
  type DungeonPlayer,
} from './dungeon-helpers';
import type { DungeonRunState } from '../src/dungeon-types';
import { createRecorder, type Captured } from './fixture-contract';
import type { CoreContext } from './helpers';
import { give, newKey, type Json } from './kit';

/** Tuesday of week 2027-W02, 14:00 in Helsinki: after the 13:37 daily reset, so the game day is the 12th. */
export const DUNGEON_SCENARIO_START = Date.parse('2027-01-12T12:00:00Z');

/** The rngs the scenario's guild must be built with, so the output is the same every time. */
export const dungeonScenarioOptions = () => ({
  dungeonRng: createSeededRng('fixture-dungeon'),
  gearRng: createSeededRng('fixture-dungeon-gear'),
});

type Act = Parameters<DungeonPlayer['act']>[1];

/** The foes of the script's wins: weak enough that the team of level 12 beats any room of the map. */
const FOES: [hpBp: number, atkBp: number] = [2_000, 1_000];

/**
 * The pool the scenario was written against: the shipped foes and room modifiers without the Mire ones
 * (Bog Toad, Tar Leech, Fen Lurker and Muddy). The map draws its rooms from the whole pool, so a new foe
 * moves every seeded map, and the client tests name the captured rooms (a carved door on floor 5, the
 * Slag Tyrant keeper). The Mire rooms' own wiring is proven where it belongs (`packages/game`, the
 * engine). The pool is put back when the scenario ends, so no other test sees the change.
 */
function pinPool(): () => void {
  const foes = [...dungeonContent.foes];
  const modifiers = [...dungeonContent.modifiers];
  const keep = <T>(list: T[], wanted: (x: T) => boolean): void => {
    const kept = list.filter(wanted);
    list.splice(0, list.length, ...kept);
  };
  keep(dungeonContent.foes, (f) => f.element !== 'mire');
  keep(dungeonContent.modifiers, (m) => m.id !== 'mud');
  return () => {
    dungeonContent.foes.splice(0, dungeonContent.foes.length, ...foes);
    dungeonContent.modifiers.splice(0, dungeonContent.modifiers.length, ...modifiers);
  };
}

export async function runDungeonScenario(ctx: CoreContext): Promise<Captured> {
  const unpin = pinPool();
  try {
    return await playDungeonScenario(ctx);
  } finally {
    unpin();
  }
}

async function playDungeonScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = DUNGEON_SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const recorderOf = (p: DungeonPlayer) =>
    createRecorder(p.call, { captured: out, failedRecord: 'collect', everyRequest: true });

  /** Calls, remembers the request, and stores the response (or the error) under `name`. */
  const record = (
    p: DungeonPlayer,
    name: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Json> => recorderOf(p).record(name, method, path, body);
  const refuse = async (p: DungeonPlayer, method: string, path: string, body?: unknown) => {
    await recorderOf(p).refuse(method, path, body);
  };
  const actBody = (state: DungeonRunState, act: Act, key = newKey('dungeon', 'test')) => ({
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
  // Sproutle has a treat packed, so the run's experience carries its breakdown (`boost`).
  give(ctx, hero.id, { bait: 20 });
  const startBody = hero.body({ team: [sproutle, splashet, cindle], treats: [sproutle] });
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
  // Swap the third creature for the fourth, and stand in a new order: the order is the row after the swap.
  state = await step(hero, 'dungeon-act-camp', state, {
    type: 'camp',
    choice: 'swap',
    order: [splashet, sproutle, zipmouse],
    out: cindle,
    in: zipmouse,
  });
  // Play on to the floor boss; the move into it is the clear.
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
  const key = newKey('dungeon', 'test');
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

  // --- The Undercroft: a carved door, the boss, the way down and the keeper ---
  // (After everything above, so the rngs the earlier fixtures were captured with are used in the same
  // order. It runs on later game days until a day's map has a carved door.)
  restore = scaleFoes(...FOES);
  const diver = await dungeonPlayer(ctx, 8, {
    level: 20,
    creatures: 4,
    species: ['cindle', 'sproutle', 'splashet', 'zipmouse'],
  });
  const [dCindle, dSproutle, dSplashet] = diver.creatureIds as [string, string, string, string];
  ctx.sql.exec(
    "INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, ?, '2027-01-01')",
    diver.id,
    // A landmark depth the Undercroft is open at: the boss chest's gear drop is certain, so it shows.
    RULES.dungeon.landmarkEvery * 2,
  );
  let hasDoor = false;
  for (let day = 0; day < 40 && !hasDoor; day++) {
    ctx.clock.t += 24 * 3_600_000;
    hasDoor = (await diver.today()).map.nodes.some((n) => n.kind === 'door');
  }
  if (!hasDoor) throw new Error('no day of the scenario has a carved door');
  const dived = await diver.start({ team: [dSproutle, dSplashet, dCindle] });
  let under = dived.body.state;
  const doorId = under.map.nodes.find((n) => n.kind === 'door')?.id as string;
  const toDoor = routeThrough(under.map, (n) => n.id === doorId) as string[];
  under = await walk(diver, under, toDoor, (s) => s.reachable.includes(doorId));
  // Stepping through the door adds a room to the Undercroft; nothing waits.
  under = await step(diver, 'dungeon-act-door', under, { type: 'move', node: doorId });
  const bossId = under.map.nodes.find((n) => n.kind === 'boss')?.id as string;
  under = await walk(diver, under, [], (s) => s.reachable.includes(bossId));
  // The boss falls: the run does not end. The chest is banked and the way down is offered.
  under = await step(diver, 'dungeon-act-descend-pending', under, { type: 'move', node: bossId });
  if (under.pending?.kind !== 'descend') throw new Error('the boss did not offer the descent');
  // Down: the level is drawn, the row catches its breath.
  under = await step(diver, 'dungeon-act-descend', under, { type: 'descend' });
  // A cracked floor would offer a deeper level instead of ending the run: this fixture shows the end.
  if (under.undercroft?.maps[0]?.crack === true) {
    const row = ctx.sql
      .exec<{ state_json: string }>('SELECT state_json FROM dungeon_runs WHERE id = ?', under.id)
      .one();
    const st = JSON.parse(row.state_json) as { under: { crack?: boolean }[] };
    (st.under[0] as { crack?: boolean }).crack = false;
    ctx.sql.exec(
      'UPDATE dungeon_runs SET state_json = ? WHERE id = ?',
      JSON.stringify(st),
      under.id,
    );
  }
  const level = (s: DungeonRunState) => s.undercroft?.maps[s.level - 1] ?? s.map;
  const keeperId = level(under).nodes.find((n) => n.kind === 'boss')?.id as string;
  under = await walk(diver, under, [], (s) => s.reachable.includes(keeperId));
  await step(diver, 'dungeon-act-keeper', under, { type: 'move', node: keeperId });
  restore();
  return out;
}
