import { describe, expect, it, vi } from 'vitest';
import replayFixture from './fixtures/dungeon-replay.json';
import runCleared from './fixtures/dungeon-run-cleared.json';
import today from './fixtures/dungeon-today.json';
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { dungeonAct, saveDungeonTeam, startDungeonRun } from './dungeon-api';
import {
  parseDungeonAct,
  parseDungeonReplay,
  parseDungeonStart,
  parseDungeonTeamSaved,
  parseDungeonToday,
} from './dungeon-parse';
import {
  SAMPLE_EVENT,
  sampleActFight,
  sampleMap,
  sampleRoom,
  sampleState,
  sampleStateCamp,
  sampleStateEvent,
  sampleStateMid,
  sampleSummary,
  sampleToday,
  omitKey,
} from './dungeon-path-samples';
import { sampleHistory } from './dungeon-map-sample';
import type { DungeonRunState } from './dungeon-types';

const withoutDraft: Record<string, unknown> = { ...today };
delete withoutDraft['draftTeam'];

/** An old run's summary inside today's `last` (the old run route is gone; its summary still shows). */
const todayWithLast = (rewards: unknown): unknown => ({
  ...runCleared.today,
  last: { ...runCleared.run, rewards },
});

describe('the supplies in an old run summary', () => {
  it('reads the supplies the run dropped, and an older summary with none', () => {
    const last = parseDungeonToday(runCleared.today).last;
    expect(last?.rewards.supplies?.length).toBeGreaterThan(0);
    const older: Record<string, unknown> = { ...runCleared.run.rewards };
    delete older['supplies'];
    expect(parseDungeonToday(todayWithLast(older)).last?.rewards.supplies).toBeUndefined();
  });

  it('refuses supplies that are not a list of ids', () => {
    for (const supplies of ['lure-basic', [1], [null], { id: 'lure-basic' }]) {
      expect(() =>
        parseDungeonToday(todayWithLast({ ...runCleared.run.rewards, supplies })),
      ).toThrow();
    }
  });
});

describe('the saved team draft in the dungeon answers', () => {
  it('is null when the server does not send it, or sends null', () => {
    expect(parseDungeonToday(withoutDraft).draftTeam).toBeNull();
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: null }).draftTeam).toBeNull();
  });

  it('is the row with its empty places, left to right', () => {
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: ['a', null, 'c'] }).draftTeam).toEqual([
      'a',
      null,
      'c',
    ]);
    expect(parseDungeonToday({ ...withoutDraft, draftTeam: [null, null, null] }).draftTeam).toEqual(
      [null, null, null],
    );
  });

  it('refuses a draft that is not a list of ids and nulls', () => {
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: 'a' })).toThrow();
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: [1, null, null] })).toThrow();
    expect(() => parseDungeonToday({ ...withoutDraft, draftTeam: ['a', undefined] })).toThrow();
  });

  it('is read from the today inside a start or act answer too', () => {
    const answer = parseDungeonStart({ state: sampleState(), today: sampleToday() });
    expect(answer.today.draftTeam).toBeNull();
    const withDraft = parseDungeonStart({
      state: sampleState(),
      today: { ...sampleToday(), draftTeam: ['a', 'b', null] },
    });
    expect(withDraft.today.draftTeam).toEqual(['a', 'b', null]);
    expect(() =>
      parseDungeonStart({ state: sampleState(), today: { ...sampleToday(), draftTeam: [3] } }),
    ).toThrow();
  });

  it('reads the answer of the save', () => {
    expect(parseDungeonTeamSaved({ draftTeam: ['a', null, null] }).draftTeam).toEqual([
      'a',
      null,
      null,
    ]);
    expect(() => parseDungeonTeamSaved({})).toThrow();
    expect(() => parseDungeonTeamSaved({ draftTeam: [1] })).toThrow();
    expect(() => parseDungeonTeamSaved(null)).toThrow();
  });
});

describe('saveDungeonTeam', () => {
  it('sends a PUT with the three places and parses the stored draft', async () => {
    apiFetch.mockResolvedValue({ draftTeam: ['a', null, 'c'] });
    const done = await saveDungeonTeam({ team: ['a', null, 'c'] });
    expect(done.draftTeam).toEqual(['a', null, 'c']);
    const [path, init] = apiFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/dungeon/team');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"team":["a",null,"c"]}');
  });

  it('refuses an answer that is not a draft', async () => {
    apiFetch.mockResolvedValue({ nope: true });
    await expect(saveDungeonTeam({ team: [null, null, null] })).rejects.toThrow();
  });
});

/** A copy of a sample with one field changed, to see the parser refuse it. */
function without<T extends object>(value: T, key: string): unknown {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy[key];
  return copy;
}

describe('the map and the open run in today', () => {
  it('read as null when an older server does not send them', () => {
    const parsed = parseDungeonToday(today);
    expect(parsed.map).toBeNull();
    expect(parsed.active).toBeNull();
  });

  it('reads the map and the open run', () => {
    const open = sampleStateMid();
    const parsed = parseDungeonToday({ ...sampleToday(), active: open });
    expect(parsed.map?.floors).toBe(7);
    expect(parsed.map?.nodes).toHaveLength(16);
    expect(parsed.active?.id).toBe(open.id);
    expect(parseDungeonToday({ ...today, map: null, active: null }).active).toBeNull();
  });

  it('refuses a map or a run that is not the shape the server sends', () => {
    expect(() => parseDungeonToday({ ...sampleToday(), map: { floors: 7 } })).toThrow();
    expect(() => parseDungeonToday({ ...sampleToday(), active: { id: 'x' } })).toThrow();
    const node = { ...sampleMap().nodes[0], kind: 'treasure' };
    expect(() =>
      parseDungeonToday({ ...sampleToday(), map: { floors: 7, nodes: [node] } }),
    ).toThrow();
  });
});

describe('the map', () => {
  const nodes = sampleMap().nodes;
  const withNode = (change: Record<string, unknown>) =>
    parseDungeonToday({
      ...sampleToday(),
      map: { floors: 7, nodes: [{ ...nodes[0], ...change }] },
    });

  it('keeps a fight, an elite, a mystery, a cache, the camp and the boss', () => {
    const kinds = new Set(parseDungeonToday(sampleToday()).map?.nodes.map((n) => n.kind));
    expect([...kinds].sort()).toEqual(['boss', 'cache', 'camp', 'elite', 'fight', 'mystery']);
  });

  it('refuses a node with a wrong id, floor, edge list, foe, modifier or event', () => {
    expect(() => withNode({ id: 3 })).toThrow();
    expect(() => withNode({ floor: -1 })).toThrow();
    expect(() => withNode({ lane: 1.5 })).toThrow();
    expect(() => withNode({ next: ['f1l0', 4] })).toThrow();
    expect(() => withNode({ foe: { id: 'x' } })).toThrow();
    expect(() => withNode({ foe: { ...nodes[0]?.foe, element: 'void' } })).toThrow();
    expect(() => withNode({ foe: { ...nodes[0]?.foe, elite: 'yes' } })).toThrow();
    expect(() => withNode({ modifier: { id: 'dark' } })).toThrow();
    expect(() => withNode({ event: { id: 1 } })).toThrow();
  });
});

describe('the state of a run', () => {
  const start = (state: unknown) => parseDungeonStart({ state, today: sampleToday() });

  it('reads a fresh run, a run mid-way, a mystery room and the camp', () => {
    for (const state of [sampleState(), sampleStateMid(), sampleStateEvent(), sampleStateCamp()]) {
      expect(start(state).state.id).toBe(state.id);
    }
    expect(start(sampleStateEvent()).state.pending?.kind).toBe('event');
    const camp = start(sampleStateCamp()).state.pending;
    expect(camp?.kind === 'camp' ? camp.offers : []).toHaveLength(2);
  });

  it('reads a finished run with its outcome, and a last event of null or text', () => {
    expect(start({ ...sampleState(), status: 'done', outcome: 'home' }).state.outcome).toBe('home');
    expect(start({ ...sampleState(), lastEvent: null }).state.lastEvent).toBeNull();
    expect(start(sampleStateMid()).state.lastEvent?.name).toBe('Glowing Pool');
  });

  it('refuses a state with a field missing or of the wrong kind', () => {
    const base: DungeonRunState = sampleStateMid();
    for (const key of Object.keys(base)) {
      expect(() => start(without(base, key)), `without ${key}`).toThrow();
    }
    const bad: Record<string, unknown>[] = [
      { status: 'paused' },
      { outcome: 'won' },
      { step: -1 },
      { step: 1.5 },
      { at: 3 },
      { path: [1] },
      { reachable: 'f0l0' },
      { team: [{ id: 'a' }] },
      { keepsakes: [{ id: 'a' }] },
      { pack: { bait: -1, essence: 0, scrap: 0 } },
      { pack: { bait: 1, essence: 0 } },
      { supply: 'yes' },
      { lastEvent: { name: 'a' } },
      { pending: { kind: 'fight' } },
      { pending: { kind: 'camp', offers: [], restBp: -1 } },
      {
        pending: { kind: 'event', event: { ...SAMPLE_EVENT, options: [SAMPLE_EVENT.options[0]] } },
      },
      { pending: { kind: 'event', event: { ...SAMPLE_EVENT, text: 4 } } },
    ];
    for (const change of bad) {
      expect(() => start({ ...base, ...change }), JSON.stringify(change)).toThrow();
    }
  });

  it('refuses a creature with an HP or a flag that is not right', () => {
    const base = sampleState();
    const hurt = (change: Record<string, unknown>) =>
      start({ ...base, team: [{ ...base.team[0], ...change }, base.team[1], base.team[2]] });
    expect(hurt({}).state.team).toHaveLength(3);
    expect(() => hurt({ hp: -5 })).toThrow();
    expect(() => hurt({ hpMax: 1.5 })).toThrow();
    expect(() => hurt({ treat: 'no' })).toThrow();
    expect(() => hurt({ element: 'void' })).toThrow();
    expect(() => hurt({ role: 'boss' })).toThrow();
  });
});

describe('the history of a run and the route of a summary', () => {
  const start = (state: unknown) => parseDungeonStart({ state, today: sampleToday() });
  const map = sampleMap();
  const walked = ['f0l1', 'f1l1', 'f2l1', 'f3l1'];
  const history = sampleHistory(map, walked);
  const historyIn = (entries: unknown) => start({ ...sampleStateMid(), history: entries }).state;
  const routeIn = (route: unknown) =>
    parseDungeonAct({
      state: sampleState(),
      summary: { ...sampleSummary('home'), route },
      today: sampleToday(),
    }).summary;

  it('are optional: an older server sends neither', () => {
    expect(start(sampleStateMid()).state.history).toBeUndefined();
    const bare = omitKey(sampleSummary('home'), 'route');
    expect(
      parseDungeonAct({ state: sampleState(), summary: bare, today: sampleToday() }).summary?.route,
    ).toBeUndefined();
    expect(historyIn([]).history).toEqual([]);
  });

  it('read a fight, a mystery room, a cache and the camp, each with what it gave', () => {
    const log = historyIn(history).history ?? [];
    expect(log.map((e) => e.result)).toEqual(['fight', 'event', 'fight', 'camp']);
    const elite = log[2];
    expect(elite?.result === 'fight' ? elite.keepsake?.id : null).toBe('lantern-moth');
    const first = log[0];
    expect(first?.result === 'fight' ? first.supply : null).toBe(true);
    const cache = sampleHistory(map, [...walked, 'f4l1']);
    expect(historyIn(cache).history?.[4]).toMatchObject({ kind: 'cache', result: 'cache' });
  });

  it('read the rooms still waiting, and a lost fight', () => {
    const pending = sampleHistory(map, ['f0l1', 'f1l1'], { pendingLast: true });
    expect(historyIn(pending).history?.[1]).toMatchObject({ kind: 'mystery', result: 'pending' });
    const camp = sampleHistory(map, walked, { pendingLast: true });
    expect(historyIn(camp).history?.[3]).toEqual({ node: 'f3l1', kind: 'camp', result: 'pending' });
    const lost = sampleHistory(map, ['f0l1', 'f1l1', 'f2l1'], { lostLast: true });
    expect(historyIn(lost).history?.[2]).toMatchObject({ cleared: false, foeHpEnd: 128 });
  });

  it('refuse an entry that is not one of the shapes', () => {
    const fight = history[0] as Record<string, unknown>;
    const mystery = history[1] as Record<string, unknown>;
    const camp = history[3] as Record<string, unknown>;
    const bad: unknown[] = [
      'f0l1',
      [{ ...fight, result: 'won' }],
      [{ ...fight, node: 3 }],
      [{ ...fight, kind: 'mystery' }],
      [{ ...fight, cleared: 'yes' }],
      [{ ...fight, rounds: -1 }],
      [{ ...fight, foeHpEnd: 1.5 }],
      [{ ...fight, foeHpMax: undefined }],
      [{ ...fight, loot: { bait: 1 } }],
      [{ ...fight, loot: { bait: -1, essence: 0, scrap: 0 } }],
      [{ ...fight, keepsake: { id: 'a' } }],
      [{ ...fight, supply: 'yes' }],
      [{ node: 'f2l2', kind: 'cache', result: 'cache' }],
      [{ node: 'f2l2', kind: 'fight', result: 'cache', loot: { bait: 1, essence: 0, scrap: 0 } }],
      [{ ...mystery, option: 4 }],
      [{ ...mystery, outcome: undefined }],
      [{ ...mystery, event: undefined }],
      [{ ...camp, choice: 'fly' }],
      [{ ...camp, detail: 3 }],
      [{ node: 'f1l1', kind: 'mystery', result: 'pending' }],
      [{ node: 'f1l1', kind: 'fight', result: 'pending' }],
    ];
    for (const entries of bad) {
      expect(() => historyIn(entries), JSON.stringify(entries)).toThrow();
    }
  });

  it('read the route of a summary: its map, the rooms walked and what each did', () => {
    const route = { map, path: walked, history };
    const read = routeIn(route)?.route;
    expect(read?.path).toEqual(walked);
    expect(read?.map.nodes).toHaveLength(map.nodes.length);
    expect(read?.history).toHaveLength(4);
    expect(routeIn({ map, path: [], history: [] })?.route?.history).toEqual([]);
  });

  it('refuse a route that is not whole', () => {
    expect(() => routeIn({ map, path: walked })).toThrow();
    expect(() => routeIn({ map, history })).toThrow();
    expect(() => routeIn({ path: walked, history })).toThrow();
    expect(() => routeIn({ map: { floors: 7 }, path: walked, history })).toThrow();
    expect(() => routeIn({ map, path: [1], history })).toThrow();
    expect(() => routeIn({ map, path: walked, history: [{ node: 'f0l1' }] })).toThrow();
    expect(() => routeIn('route')).toThrow();
  });

  it('are read inside the open run of today too', () => {
    const active = { ...sampleStateMid(), history };
    expect(parseDungeonToday({ ...sampleToday(), active }).active?.history).toHaveLength(4);
    expect(() =>
      parseDungeonToday({ ...sampleToday(), active: { ...active, history: [{ node: 1 }] } }),
    ).toThrow();
  });
});

describe('the answer to entering', () => {
  it('has the run and today, with a run open', () => {
    const open = sampleState();
    const answer = parseDungeonStart({ state: open, today: { ...sampleToday(), active: open } });
    expect(answer.state.step).toBe(0);
    expect(answer.today.active?.id).toBe(open.id);
  });

  it('refuses an answer without its state or its today', () => {
    expect(() => parseDungeonStart({ today: sampleToday() })).toThrow('dungeon run');
    expect(() => parseDungeonStart({ state: sampleState() })).toThrow();
    expect(() => parseDungeonStart({ state: sampleState(), today: { day: 1 } })).toThrow();
    expect(() => parseDungeonStart(null)).toThrow();
  });
});

describe('the answer to a step', () => {
  it('reads a step that only moved the run', () => {
    const answer = parseDungeonAct({ state: sampleStateEvent() });
    expect(answer.room).toBeUndefined();
    expect(answer.summary).toBeUndefined();
    expect(answer.today).toBeUndefined();
  });

  it('reads the fight a move played, with the path fields of its room', () => {
    const answer = parseDungeonAct(sampleActFight());
    expect(answer.room?.node).toBe('f0l2');
    expect(answer.room?.keepsakes).toEqual([]);
    const elite = parseDungeonAct({
      state: sampleState(),
      room: sampleRoom({ elite: true, keepsakes: [{ id: 'k', name: 'K', description: 'D' }] }),
    });
    expect(elite.room?.elite).toBe(true);
    expect(elite.room?.keepsakes).toHaveLength(1);
  });

  it('reads the summary and today of a run that ended', () => {
    const answer = parseDungeonAct({
      state: { ...sampleState(), status: 'done', outcome: 'defeat' },
      room: sampleRoom(),
      summary: sampleSummary('defeat'),
      today: sampleToday(),
    });
    expect(answer.summary?.outcome).toBe('defeat');
    expect(answer.today?.map?.floors).toBe(7);
  });

  it('refuses a room, a summary or a today that is not the shape the server sends', () => {
    const state = sampleState();
    const room = sampleRoom();
    expect(() => parseDungeonAct({ state, room: { ...room, events: [{ t: 'nope' }] } })).toThrow(
      'dungeon step',
    );
    expect(() => parseDungeonAct({ state, room: { ...room, node: 4 } })).toThrow();
    expect(() => parseDungeonAct({ state, room: { ...room, elite: 'yes' } })).toThrow();
    expect(() => parseDungeonAct({ state, room: { ...room, keepsakes: [{ id: 1 }] } })).toThrow();
    expect(() => parseDungeonAct({ state, summary: { id: 'x' } })).toThrow();
    expect(() => parseDungeonAct({ state, today: { day: 1 } })).toThrow();
    expect(() => parseDungeonAct({ summary: sampleSummary('home') })).toThrow();
    expect(() => parseDungeonAct(undefined)).toThrow();
  });
});

describe('the new fields of a summary and of a replayed room', () => {
  const summaryIn = (change: Record<string, unknown>) =>
    parseDungeonAct({
      state: sampleState(),
      summary: { ...sampleSummary('home'), ...change },
      today: sampleToday(),
    }).summary;

  it('are optional: an old run has none of them', () => {
    const old = parseDungeonToday(runCleared.today).last;
    if (old === null) throw new Error('last');
    expect(old.outcome).toBeUndefined();
    expect(old.path).toBeUndefined();
    expect(old.pack).toBeUndefined();
    expect(old.keepsakes).toBeUndefined();
    expect(old.rooms[0]?.elite).toBeUndefined();
  });

  it('read the weather a run was fought under, and refuse a broken one', () => {
    expect(summaryIn({})?.weather).toBeUndefined();
    expect(summaryIn({ weather: { boon: 'sunny-nap', omen: null } })?.weather).toEqual({
      boon: 'sunny-nap',
      omen: null,
    });
    expect(summaryIn({ weather: { boon: 'sunny-nap', omen: 'fog' } })?.weather?.omen).toBe('fog');
    expect(() => summaryIn({ weather: { boon: 1, omen: null } })).toThrow();
    expect(() => summaryIn({ weather: { boon: 'sunny-nap' } })).toThrow();
  });

  it('read the outcome, the path, the pack and the keepsakes', () => {
    const summary = summaryIn({});
    expect(summary?.outcome).toBe('home');
    expect(summary?.path).toEqual(['fight', 'mystery', 'elite', 'camp']);
    expect(summary?.pack?.kept).toEqual({ bait: 3, essence: 1, scrap: 2 });
    expect(summary?.keepsakes).toHaveLength(1);
    expect(summary?.rooms.some((r) => r.elite === true)).toBe(true);
  });

  it('refuse values that are not allowed', () => {
    expect(() => summaryIn({ outcome: 'won' })).toThrow();
    expect(() => summaryIn({ path: ['fight', 'lava'] })).toThrow();
    expect(() => summaryIn({ pack: { found: { bait: 1, essence: 0, scrap: 0 } } })).toThrow();
    expect(() =>
      summaryIn({
        pack: {
          found: { bait: -1, essence: 0, scrap: 0 },
          kept: { bait: 0, essence: 0, scrap: 0 },
        },
      }),
    ).toThrow();
    expect(() => summaryIn({ keepsakes: [{ id: 'a', name: 'b' }] })).toThrow();
    const rooms = sampleSummary('home').rooms.map((r) => ({ ...r, elite: 1 }));
    expect(() => summaryIn({ rooms })).toThrow();
  });

  it('are in a replay too', () => {
    const rooms = replayFixture.rooms.map((r) => ({ ...r, node: 'f1l0', elite: false }));
    const replay = parseDungeonReplay({ ...replayFixture, rooms });
    expect(replay.rooms[0]?.node).toBe('f1l0');
    expect(replay.rooms[0]?.elite).toBe(false);
    expect(() =>
      parseDungeonReplay({ ...replayFixture, rooms: [{ ...rooms[0], node: 1 }] }),
    ).toThrow();
  });
});

describe('the requests of a run', () => {
  const sent = (): { path: string; init: RequestInit } => {
    const [path, init] = apiFetch.mock.calls.at(-1) as unknown as [string, RequestInit];
    return { path, init };
  };

  it('enters with a POST to /api/dungeon/start and reads the run', async () => {
    const open = sampleState();
    apiFetch.mockResolvedValue({ state: open, today: { ...sampleToday(), active: open } });
    const answer = await startDungeonRun({
      team: ['a', 'b', 'c'],
      treats: ['b'],
      idempotencyKey: 'key-12345678',
    });
    const { path, init } = sent();
    expect(path).toBe('/api/dungeon/start');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"team":["a","b","c"],"treats":["b"],"idempotencyKey":"key-12345678"}');
    expect(answer.state.id).toBe(open.id);
  });

  it('takes a step with a POST to /api/dungeon/act and reads the answer', async () => {
    apiFetch.mockResolvedValue(sampleActFight());
    const answer = await dungeonAct({
      runId: 'run-sample-1',
      step: 0,
      idempotencyKey: 'key-12345678',
      act: { type: 'move', node: 'f0l2' },
    });
    const { path, init } = sent();
    expect(path).toBe('/api/dungeon/act');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      runId: 'run-sample-1',
      step: 0,
      idempotencyKey: 'key-12345678',
      act: { type: 'move', node: 'f0l2' },
    });
    expect(answer.room?.node).toBe('f0l2');
  });

  it('refuses answers that are not the shape the server sends', async () => {
    apiFetch.mockResolvedValue({ nope: true });
    await expect(
      startDungeonRun({ team: ['a', 'b', 'c'], idempotencyKey: 'key-12345678' }),
    ).rejects.toThrow();
    await expect(
      dungeonAct({ runId: 'r', step: 0, idempotencyKey: 'key-12345678', act: { type: 'home' } }),
    ).rejects.toThrow();
  });
});
