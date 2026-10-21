import { describe, expect, it, vi } from 'vitest';
import actDescendPending from './fixtures/dungeon-act-descend-pending.json';
import actDescend from './fixtures/dungeon-act-descend.json';
import actDoor from './fixtures/dungeon-act-door.json';
import actKeeper from './fixtures/dungeon-act-keeper.json';
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
  SAMPLE_TREASURES,
  chasmEvent,
  sampleChasmSummary,
  sampleStateChasm,
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

  it('reads what each creature of the run wears, and refuses gear that is not an item', () => {
    const open = sampleStateMid();
    const hood = {
      baseId: 'brine-hood',
      slot: 'hat',
      rarity: 'rare',
      itemLevel: 8,
      lines: ['Aimed ward -5%'],
    };
    const withGear = (gear: unknown[]) => ({
      ...open,
      team: open.team.map((c, i) => (i === 0 ? { ...c, gear } : c)),
    });
    const parsed = parseDungeonToday({ ...sampleToday(), active: withGear([hood]) });
    expect(parsed.active?.team[0]?.gear).toEqual([hood]);
    expect(parsed.active?.team[1]?.gear).toEqual([]);
    expect(() =>
      parseDungeonToday({ ...sampleToday(), active: withGear([{ baseId: 'brine-hood' }]) }),
    ).toThrow();
    expect(() =>
      parseDungeonToday({ ...sampleToday(), active: withGear([{ ...hood, slot: 'boots' }]) }),
    ).toThrow();
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

  it("read what changed each creature's experience, and refuse a broken factor or day effect", () => {
    const base = sampleSummary('home');
    const first = base.rewards.experience?.[0];
    if (first === undefined) throw new Error('the sample pays experience');
    const paid = (change: Record<string, unknown>) =>
      summaryIn({ rewards: { ...base.rewards, experience: [{ ...first, ...change }] } });
    expect(
      paid({ treat: true, treatTimes: 3, dayEffects: [{ name: 'Hearty Breakfast', bp: 2500 }] })
        ?.rewards.experience?.[0],
    ).toMatchObject({
      treatTimes: 3,
      dayEffects: [{ name: 'Hearty Breakfast', bp: 2500 }],
    });
    // A run stored before the server said it has neither, and still reads.
    expect(paid({})?.rewards.experience?.[0]?.dayEffects).toBeUndefined();
    expect(() => paid({ treatTimes: 'x' })).toThrow();
    expect(() => paid({ dayEffects: [{ name: 1, bp: 1 }] })).toThrow();
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

describe('the Undercroft in the dungeon answers', () => {
  const door = actDoor as unknown as { state: Record<string, unknown> };
  const pendingAnswer = actDescendPending as unknown as { state: Record<string, unknown> };
  const down = actDescend as unknown as { state: Record<string, unknown> };
  const withState = (
    answer: { state: Record<string, unknown> },
    over: Record<string, unknown>,
  ) => ({
    ...answer,
    state: { ...answer.state, ...over },
  });

  it('reads the new node kinds, the level fields of a map and the Undercroft of a state', () => {
    const state = parseDungeonAct(actDescend).state;
    const level = state.undercroft?.maps[0];
    expect(level?.level).toBe(1);
    expect(level?.label).toBeTruthy();
    expect(level?.crack).toBeUndefined();
    expect(state.map.nodes.some((n) => n.kind === 'door')).toBe(true);
    const crack = {
      ...down.state,
      undercroft: {
        marks: 1,
        maps: [{ ...(state.undercroft?.maps[0] as object), crack: true }],
      },
    };
    expect(parseDungeonAct({ state: crack }).state.undercroft?.maps[0]?.crack).toBe(true);
    const epicNodes = (state.map.nodes as object[]).map((n, i) =>
      i === 0 ? { ...n, kind: 'epic' } : n,
    );
    const epic = { ...down.state, map: { ...(down.state['map'] as object), nodes: epicNodes } };
    expect(parseDungeonAct({ state: epic }).state.map.nodes[0]?.kind).toBe('epic');
  });

  it('refuses a state without its level or with a broken Undercroft', () => {
    const lacking = { ...down.state };
    delete lacking['level'];
    expect(() => parseDungeonAct({ state: lacking })).toThrow();
    delete lacking['undercroft'];
    expect(() => parseDungeonAct({ state: { ...down.state, undercroft: undefined } })).toThrow();
    expect(() => parseDungeonAct(withState(down, { level: -1 }))).toThrow();
    expect(() =>
      parseDungeonAct(withState(down, { undercroft: { maps: [], marks: 'two' } })),
    ).toThrow();
    expect(() =>
      parseDungeonAct(withState(down, { undercroft: { maps: [{}], marks: 1 } })),
    ).toThrow();
    expect(() => parseDungeonAct(withState(down, { undercroft: [] }))).toThrow();
    const bad = (over: object) => ({
      ...(down.state['undercroft'] as { maps: object[] }),
      maps: [{ ...(down.state['undercroft'] as { maps: object[] }).maps[0], ...over }],
    });
    for (const over of [{ level: 'one' }, { label: 7 }, { crack: 'yes' }]) {
      expect(() => parseDungeonAct(withState(down, { undercroft: bad(over) }))).toThrow();
    }
  });

  it('refuses a node kind the client does not know', () => {
    const nodes = (door.state['map'] as { nodes: object[] }).nodes.map((n, i) =>
      i === 0 ? { ...n, kind: 'portal' } : n,
    );
    expect(() =>
      parseDungeonAct(withState(door, { map: { ...(door.state['map'] as object), nodes } })),
    ).toThrow();
  });

  it('reads the descent card and refuses a broken one', () => {
    const state = parseDungeonAct(actDescendPending).state;
    expect(state.pending).toMatchObject({ kind: 'descend', reviveBp: 1000 });
    const card = pendingAnswer.state['pending'] as Record<string, unknown>;
    expect(() =>
      parseDungeonAct(withState(pendingAnswer, { pending: omitKey(card, 'reviveBp') })),
    ).toThrow();
    expect(() =>
      parseDungeonAct(withState(pendingAnswer, { pending: { ...card, reviveBp: 'ten' } })),
    ).toThrow();
    expect(() =>
      parseDungeonAct(withState(pendingAnswer, { pending: { ...card, floors: 'four' } })),
    ).toThrow();
    expect(() =>
      parseDungeonAct(withState(pendingAnswer, { pending: { ...card, newDepth: -1 } })),
    ).toThrow();
    const banked = card['banked'] as Record<string, unknown>;
    for (const broken of [
      null,
      { ...banked, gear: [{ baseId: 'x', rarity: 'mythic' }] },
      { ...banked, supplies: [1] },
      { ...banked, parts: { scrap: -1 } },
      { gear: [], supplies: [] },
    ]) {
      expect(() =>
        parseDungeonAct(withState(pendingAnswer, { pending: { ...card, banked: broken } })),
      ).toThrow();
    }
    expect(() =>
      parseDungeonAct(withState(pendingAnswer, { pending: { kind: 'portal' } })),
    ).toThrow();
  });

  it('reads the new history entries and refuses malformed ones', () => {
    const history = parseDungeonAct(actDescendPending).state.history ?? [];
    expect(history.map((e) => `${e.kind}:${e.result}`).slice(-4)).toEqual([
      'door:door',
      'boss:fight',
      'boss:chest',
      'descend:pending',
    ]);
    const raw = pendingAnswer.state['history'] as Record<string, unknown>[];
    const swap = (kind: string, over: Record<string, unknown>) =>
      raw.map((e) =>
        `${String(e['kind'])}:${String(e['result'])}` === kind ? { ...e, ...over } : e,
      );
    for (const [kind, over] of [
      ['door:door', { added: 'yes' }],
      ['boss:chest', { level: 'zero' }],
      ['boss:chest', { gear: [{ baseId: 1 }] }],
      ['boss:chest', { loot: { bait: 1 } }],
      ['descend:pending', { level: 'one' }],
    ] as const) {
      expect(() =>
        parseDungeonAct(withState(pendingAnswer, { history: swap(kind, over) })),
      ).toThrow();
    }
    // The way down and the way home.
    const downHistory = parseDungeonAct(actDescend).state.history ?? [];
    expect(downHistory.at(-1)).toMatchObject({
      kind: 'descend',
      result: 'descend',
      healed: 140,
      revived: 0,
    });
    const home = raw.map((e) => (e['kind'] === 'descend' ? { ...e, result: 'home' } : e));
    expect(
      parseDungeonAct(withState(pendingAnswer, { history: home })).state.history?.at(-1),
    ).toMatchObject({
      kind: 'descend',
      result: 'home',
    });
    const noHeal = (down.state['history'] as Record<string, unknown>[]).map((e) =>
      e['result'] === 'descend' ? { ...e, healed: 'a lot' } : e,
    );
    expect(() => parseDungeonAct(withState(down, { history: noHeal }))).toThrow();
    // How many got back up is optional (a run stored before they could has none), but a count when there.
    const withRevived = (revived: unknown) =>
      (down.state['history'] as Record<string, unknown>[]).map((e) => {
        if (e['result'] !== 'descend') return e;
        if (revived === undefined) return omitKey(e, 'revived');
        return { ...e, revived };
      });
    const old = parseDungeonAct(withState(down, { history: withRevived(undefined) }));
    expect(old.state.history?.at(-1)).not.toHaveProperty('revived');
    expect(
      parseDungeonAct(withState(down, { history: withRevived(2) })).state.history?.at(-1),
    ).toMatchObject({ revived: 2 });
    for (const bad of ['two', -1, 1.5, null]) {
      expect(() => parseDungeonAct(withState(down, { history: withRevived(bad) }))).toThrow();
    }
  });

  it('reads an epic fight in a log, a room summary and a replay room', () => {
    const keeper = actKeeper as unknown as {
      state: { history: Record<string, unknown>[] };
      summary: Record<string, unknown> & { rooms: Record<string, unknown>[] };
      room: Record<string, unknown>;
      today: unknown;
    };
    const epicLog = keeper.state.history.map((e) =>
      e['kind'] === 'elite' ? { ...e, kind: 'epic' } : e,
    );
    expect(
      parseDungeonAct({
        ...keeper,
        state: { ...keeper.state, history: epicLog },
      }).state.history?.some((e) => e.kind === 'epic'),
    ).toBe(true);
    const rooms = keeper.summary.rooms.map((r, i) => (i === 5 ? { ...r, epic: true } : r));
    expect(
      parseDungeonAct({ ...keeper, summary: { ...keeper.summary, rooms } }).summary?.rooms[5]?.epic,
    ).toBe(true);
    expect(() =>
      parseDungeonAct({
        ...keeper,
        summary: { ...keeper.summary, rooms: rooms.map((r) => ({ ...r, epic: 'yes' })) },
      }),
    ).toThrow();
    expect(parseDungeonAct({ ...keeper, room: { ...keeper.room, epic: true } }).room?.epic).toBe(
      true,
    );
    expect(() => parseDungeonAct({ ...keeper, room: { ...keeper.room, epic: 1 } })).toThrow();
  });

  it('reads deepest and the Undercroft levels of a route, and refuses them broken', () => {
    const keeper = actKeeper as unknown as {
      summary: { route: Record<string, unknown> } & Record<string, unknown>;
    };
    const summary = parseDungeonAct(actKeeper).summary;
    expect(summary?.deepest).toBe(1);
    expect(summary?.route?.undercroft?.[0]?.level).toBe(1);
    const old: Record<string, unknown> = { ...keeper.summary };
    delete old['deepest'];
    expect(parseDungeonAct({ ...actKeeper, summary: old }).summary?.deepest).toBeUndefined();
    expect(() =>
      parseDungeonAct({ ...actKeeper, summary: { ...keeper.summary, deepest: 'one' } }),
    ).toThrow();
    expect(() =>
      parseDungeonAct({
        ...actKeeper,
        summary: { ...keeper.summary, route: { ...keeper.summary.route, undercroft: [{}] } },
      }),
    ).toThrow();
  });
});

describe('the Blue Chasm in the answers', () => {
  const stateWith = (treasure: unknown) =>
    parseDungeonAct({
      state: {
        ...sampleStateChasm(),
        pending: { kind: 'event', event: { ...chasmEvent(), treasure } },
      },
      today: sampleToday(),
    }).state;

  it('reads the room with each kind of treasure', () => {
    for (const treasure of Object.values(SAMPLE_TREASURES)) {
      const pending = stateWith(treasure).pending;
      expect(pending?.kind === 'event' ? pending.event.treasure : null).toEqual(treasure);
    }
  });

  it('reads a gear treasure with its card, and one without (a room saved before the card)', () => {
    const withCard = SAMPLE_TREASURES.gear;
    expect(withCard.card.lines.length).toBeGreaterThan(0);
    const bare = omitKey(withCard, 'card');
    const pending = stateWith(bare).pending;
    expect(pending?.kind === 'event' ? pending.event.treasure : null).toEqual(bare);
  });

  it('reads a room with no treasure, as an older server sends it', () => {
    const state = parseDungeonAct({ state: sampleStateEvent(), today: sampleToday() }).state;
    const pending = state.pending;
    expect(pending?.kind === 'event' ? pending.event.treasure : 'x').toBeUndefined();
  });

  it('refuses a treasure that is not one of the four kinds or has the wrong fields', () => {
    for (const bad of [
      null,
      'gear',
      {},
      { kind: 'creature', speciesId: 'x' },
      { kind: 'gear', baseId: 'felt-hat', rarity: 'mythic', itemLevel: 3 },
      { kind: 'gear', baseId: 'felt-hat', rarity: 'epic' },
      { kind: 'gear', baseId: 'felt-hat', rarity: 'epic', itemLevel: -1 },
      { kind: 'gear', baseId: 'felt-hat', rarity: 'epic', itemLevel: 3, card: { id: 1 } },
      { kind: 'blueprint' },
      { kind: 'supplies', supplyId: 'lantern-great' },
      { kind: 'supplies', supplyId: 'lantern-great', count: 1.5 },
      { kind: 'shards', parts: { 'tide-shard': -1 } },
      { kind: 'shards' },
    ]) {
      expect(() => stateWith(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it('reads the won blueprint and the lost treasure in the rewards, and refuses broken ones', () => {
    const rewardsIn = (change: Record<string, unknown>) =>
      parseDungeonAct({
        state: sampleState(),
        summary: {
          ...sampleSummary('home'),
          rewards: { ...sampleSummary('home').rewards, ...change },
        },
        today: sampleToday(),
      }).summary?.rewards;
    expect(
      rewardsIn({ blueprints: [{ baseId: 'felt-hat', duplicate: false }] })?.blueprints,
    ).toEqual([{ baseId: 'felt-hat', duplicate: false }]);
    expect(
      rewardsIn({ blueprints: [{ baseId: 'felt-hat', duplicate: true, marks: 2 }] })
        ?.blueprints?.[0]?.marks,
    ).toBe(2);
    expect(rewardsIn({ treasureLost: SAMPLE_TREASURES.gear })?.treasureLost).toEqual(
      SAMPLE_TREASURES.gear,
    );
    expect(rewardsIn({})?.blueprints).toBeUndefined();
    expect(() => rewardsIn({ blueprints: [{ baseId: 7 }] })).toThrow();
    expect(() => rewardsIn({ blueprints: 'felt-hat' })).toThrow();
    expect(() => rewardsIn({ treasureLost: { kind: 'nope' } })).toThrow();
  });

  it('reads the step of a crossing (the treasure) and of a fall, and refuses a fall that is not true', () => {
    const won = sampleChasmSummary('won');
    const fell = sampleChasmSummary('fell');
    for (const run of [won, fell]) {
      const parsed = parseDungeonAct({
        state: sampleState(),
        summary: run,
        today: sampleToday(),
      }).summary;
      expect(
        parsed?.route?.history.some((h) => h.result === 'event' && h.event === 'Blue Chasm'),
      ).toBe(true);
    }
    const steps = fell.route?.history ?? [];
    const last = steps[steps.length - 1];
    expect(last).toMatchObject({ result: 'event', fell: true });
    const broken = {
      ...fell,
      route: { ...fell.route, history: [...steps.slice(0, -1), { ...last, fell: false }] },
    };
    expect(() =>
      parseDungeonAct({ state: sampleState(), summary: broken, today: sampleToday() }),
    ).toThrow();
  });
});
