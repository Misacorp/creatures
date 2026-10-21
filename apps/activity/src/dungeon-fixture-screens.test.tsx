import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { sampleRoster } from './creature-card-sample';
import type { Creature } from './api';
import { Dungeon } from './Dungeon';
import { DungeonResults } from './DungeonResults';
import actCampPending from './fixtures/dungeon-act-camp-pending.json';
import actCamp from './fixtures/dungeon-act-camp.json';
import actCleared from './fixtures/dungeon-act-cleared.json';
import actDefeat from './fixtures/dungeon-act-defeat.json';
import actDescendPending from './fixtures/dungeon-act-descend-pending.json';
import actDescend from './fixtures/dungeon-act-descend.json';
import actDoor from './fixtures/dungeon-act-door.json';
import actKeeper from './fixtures/dungeon-act-keeper.json';
import actEventPending from './fixtures/dungeon-act-event-pending.json';
import actEvent from './fixtures/dungeon-act-event.json';
import actFight from './fixtures/dungeon-act-fight.json';
import actHome from './fixtures/dungeon-act-home.json';
import replayPath from './fixtures/dungeon-replay-path.json';
import requestBodies from './fixtures/dungeon-request-bodies.json';
import startFixture from './fixtures/dungeon-start.json';
import todayActive from './fixtures/dungeon-today-active.json';
import todayMap from './fixtures/dungeon-today-map.json';
import { nodeLabel } from './dungeon-map';
import { undercroftState } from './dungeon-undercroft-sample';
import {
  parseDungeonAct,
  parseDungeonReplay,
  parseDungeonStart,
  parseDungeonToday,
} from './dungeon-parse';
import type { DungeonAct, DungeonActResponse, DungeonRunState } from './dungeon-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  FakeElement,
  visibleText,
  type Page,
} from './test-dom';
import { installDrag } from './test-drag';

/**
 * The Dungeon tab driven by the real server answers (`fixtures/dungeon-*.json`, captured from the
 * Worker): each answer is parsed by the client's own guards and handed to the screen as the mocked
 * API's reply, and what the screen sends is compared with the captured request bodies. The
 * fixtures are separate runs, so the state a step starts from is the state its answer came from, put
 * one step back (`before`).
 */
const api = vi.hoisted(() => ({
  dungeonAct: vi.fn(),
  fetchDungeonToday: vi.fn(),
  fetchDungeonReplay: vi.fn(),
  saveDungeonTeam: vi.fn(),
  startDungeonRun: vi.fn(),
}));
vi.mock('./dungeon-api', () => api);

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', { innerHeight: 800 });
  Reflect.set(globalThis, 'requestAnimationFrame', (cb: (t: number) => void) =>
    setTimeout(() => {
      cb(Date.now());
    }, 16),
  );
  Reflect.set(globalThis, 'cancelAnimationFrame', (id: number) => {
    clearTimeout(id);
  });
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 0 }));
  // The roster picker moves focus between its options; the fake DOM has none to find.
  Reflect.set(FakeElement.prototype, 'querySelectorAll', () => []);
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
  Reflect.deleteProperty(FakeElement.prototype, 'querySelectorAll');
});

const noop = (): void => undefined;

type Bodies = typeof requestBodies;
const bodyOf = (key: keyof Bodies) =>
  requestBodies[key].body as unknown as {
    runId: string;
    step: number;
    idempotencyKey: string;
    act: DungeonAct;
  };

/**
 * The player's creatures: the hero's of the captured run (the ids `pnpm fixtures:capture` gives the dungeon set,
 * in order of first appearance) and their species, so the screens find them by id.
 */
function roster(): Creature[] {
  const all = sampleRoster(30);
  const wanted: [string, string][] = [
    ['00000000-0000-4000-8300-000000000001', 'sproutle'],
    ['00000000-0000-4000-8300-000000000002', 'splashet'],
    ['00000000-0000-4000-8300-000000000003', 'cindle'],
    ['00000000-0000-4000-8300-000000000009', 'zipmouse'],
  ];
  const picked = wanted.map(([id, species]) => {
    const found = all.find((c) => c.species === species);
    if (found === undefined) throw new Error(`no ${species} in the sample roster`);
    return { ...found, id, level: 12, nickname: null, waiting: false } satisfies Creature;
  });
  return picked;
}

/** The state an answer's step started from: one act back, the run still open. */
function before(
  state: DungeonRunState,
  over: Partial<DungeonRunState> & Pick<DungeonRunState, 'step'>,
): DungeonRunState {
  return { ...state, status: 'active', outcome: null, pending: null, ...over };
}

function drawTab(draft: [string, string, string] | null = null, onRunFinished = noop): Page {
  page = createPage();
  // The roster picker listens for keys on the document, which the fake one cannot do.
  Reflect.set(page.document, 'addEventListener', noop);
  Reflect.set(page.document, 'removeEventListener', noop);
  page.draw(
    <Dungeon
      creatures={roster()}
      forecast={null}
      bait={100}
      draft={draft}
      onDraftChange={noop}
      onRunStarted={noop}
      onCanRunChange={noop}
      onRunFinished={onRunFinished}
    />,
  );
  return page;
}

function button(root: FakeElement, name: RegExp | string): FakeElement {
  const found = byName(root, 'button', name)[0];
  if (found === undefined) throw new Error(`no button ${String(name)}`);
  return found;
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The map's button for a room, by the label the map gives it. */
function room(state: DungeonRunState, id: string, root: FakeElement): FakeElement {
  const node = [state.map, ...(state.undercroft?.maps ?? [])]
    .flatMap((m) => m.nodes)
    .find((n) => n.id === id);
  if (node === undefined) throw new Error(`no room ${id}`);
  return button(root, new RegExp(`^${escapeRe(nodeLabel(node))}\\.`));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Plays the fight on screen to its end, a second at a time (fake timers). */
async function playOut(root: FakeElement): Promise<void> {
  for (let i = 0; i < 900 && byClass(root, 'dungeon-playback').length > 0; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
  expect(byClass(root, 'dungeon-playback')).toHaveLength(0);
}

/** What the screen sent as the nth act: the body without its key, and the key apart. */
function sentAct(n = 0): { body: Record<string, unknown>; key: string } {
  const { idempotencyKey, ...body } = api.dungeonAct.mock.calls[n]?.[0] as Record<
    string,
    unknown
  > & {
    idempotencyKey: string;
  };
  return { body, key: idempotencyKey };
}

const KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** A move on the map: open the room, press Go. */
async function goTo(state: DungeonRunState, id: string, root: FakeElement): Promise<void> {
  page?.click(room(state, id, root));
  page?.click(button(page.root, /^Go/));
  await settle();
}

describe('the pre-run card with the real map', () => {
  it("shows today's map in preview with its camp and boss, and no way to step into a room", async () => {
    api.fetchDungeonToday.mockResolvedValue(parseDungeonToday(todayMap));
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-card')).toHaveLength(1);
    expect(byClass(root, 'dungeon-preview')).toHaveLength(1);
    expect(byClass(root, 'dmap')).toHaveLength(1);
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    expect(byName(root, 'button', 'Enter the dungeon')).toHaveLength(1);
    const map = parseDungeonToday(todayMap).map;
    const nodes = map?.nodes ?? [];
    // One button per room, each named for what it is.
    const labels = byClass(root, 'dmap-node').map((n) => n.getAttribute('aria-label') ?? '');
    expect(labels).toHaveLength(nodes.length);
    expect(labels.some((l) => l.startsWith('Floor boss:'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Camp.'))).toBe(true);
    // The foe names come from the server's map, in each room's label.
    const boss = nodes.find((n) => n.kind === 'boss');
    expect(labels.some((l) => l.includes(boss?.foe?.name ?? 'no boss'))).toBe(true);
  });

  it('enters with the captured start body, then shows the run on its map at the entrance', async () => {
    api.fetchDungeonToday.mockResolvedValue(parseDungeonToday(todayMap));
    api.startDungeonRun.mockResolvedValue(parseDungeonStart(startFixture));
    const started = vi.fn();
    const sent = bodyOf('dungeon-start') as unknown as {
      team: [string, string, string];
      idempotencyKey: string;
    };
    page = createPage();
    page.draw(
      <Dungeon
        creatures={roster()}
        forecast={null}
        bait={100}
        draft={sent.team}
        onDraftChange={noop}
        onRunStarted={started}
        onCanRunChange={noop}
        onRunFinished={noop}
      />,
    );
    await settle();
    page.click(button(page.root, 'Enter the dungeon'));
    await settle();
    const request = api.startDungeonRun.mock.calls[0]?.[0] as {
      team: string[];
      idempotencyKey: string;
    };
    expect(request.team).toEqual(sent.team);
    expect(Object.keys(request).sort()).toEqual(['idempotencyKey', 'team']);
    expect(request.idempotencyKey).toMatch(KEY);
    expect(started).toHaveBeenCalledTimes(1);
    expect(byClass(page.root, 'dungeon-card')).toHaveLength(0);
    expect(byClass(page.root, 'dungeon-run-map')).toHaveLength(1);
    expect(visibleText(page.root)).toContain('At the entrance');
    expect(visibleText(byClass(page.root, 'run-pack')[0] as FakeElement)).toContain('Empty');
    // The three creatures of the row, in order.
    expect(byClass(page.root, 'run-tile')).toHaveLength(3);
  });
});

describe('a move into a fight, with the real answer', () => {
  it('plays the room, then goes back to the map with the pack the fight paid', async () => {
    vi.useFakeTimers();
    const start = parseDungeonStart(startFixture);
    api.fetchDungeonToday.mockResolvedValue(start.today);
    const answer = parseDungeonAct(actFight);
    api.dungeonAct.mockResolvedValue(answer);
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    await goTo(start.state, 'f0l0', root);
    const { body, key } = sentAct();
    const fixture = bodyOf('dungeon-act-fight');
    expect(body).toEqual({ runId: fixture.runId, step: fixture.step, act: fixture.act });
    expect(key).toMatch(KEY);
    // The room plays on the stage, in the row that fought it; the map is out of the way.
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run')).toHaveLength(0);
    await playOut(root);
    // Back on the map, one step on, standing on the room that was played.
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(byName(root, 'ul', /^In your pack:/)).toHaveLength(1);
    expect(answer.state.at).toBe('f0l0');
    expect(visibleText(root)).toContain('Room 1 / 7');
  });
});

describe('a mystery room, with the real answers', () => {
  const pending = parseDungeonAct(actEventPending).state;
  const resolved = parseDungeonAct(actEvent);

  it('opens the event card after a move into the room, and its pick is the captured act', async () => {
    const open = before(pending, { step: 1, at: 'f0l0', path: ['f0l0'], reachable: ['f1l0'] });
    api.fetchDungeonToday.mockResolvedValue({ ...parseDungeonToday(todayActive), active: open });
    api.dungeonAct.mockResolvedValueOnce({ state: pending }).mockResolvedValueOnce(resolved);
    const { root } = drawTab();
    await settle();
    await goTo(open, 'f1l0', root);
    expect(sentAct(0).body).toMatchObject({
      runId: bodyOf('dungeon-act-event-pending').runId,
      step: bodyOf('dungeon-act-event-pending').step,
      act: bodyOf('dungeon-act-event-pending').act,
    });
    // The scene and both options are the server's, drawn as text; no map while it is open.
    expect(byClass(root, 'dungeon-event')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(0);
    if (pending.pending?.kind !== 'event') throw new Error('pending event');
    const event = pending.pending.event;
    expect(visibleText(root)).toContain(event.name);
    expect(visibleText(root)).toContain(event.text);
    expect(byClass(root, 'choice')).toHaveLength(2);
    for (const option of event.options) expect(visibleText(root)).toContain(option.description);
    // Picking the second option sends the captured pick and shows what it did.
    page?.click(button(root, new RegExp(`^${escapeRe(event.options[1]?.label ?? '')}`)));
    await settle();
    expect(sentAct(1).body).toEqual({
      runId: bodyOf('dungeon-act-event').runId,
      step: bodyOf('dungeon-act-event').step,
      act: bodyOf('dungeon-act-event').act,
    });
    expect(byClass(root, 'dungeon-event')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(visibleText(root)).toContain(resolved.state.lastEvent?.outcome ?? 'no outcome');
  });

  it('opens at the event after a reload of the open run', async () => {
    api.fetchDungeonToday.mockResolvedValue({ ...parseDungeonToday(todayActive), active: pending });
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-event')).toHaveLength(1);
  });
});

describe('the camp, with the real answers', () => {
  const campState = parseDungeonAct(actCampPending).state;

  it('opens the camp after a move to it, with the keepsake offers and the pack at risk', async () => {
    const open = before(campState, {
      step: 5,
      at: 'f2l0',
      path: ['f0l0', 'f1l0', 'f2l0'],
      reachable: ['f3l1'],
    });
    api.fetchDungeonToday.mockResolvedValue({ ...parseDungeonToday(todayActive), active: open });
    api.dungeonAct.mockResolvedValue({ state: campState });
    const { root } = drawTab();
    await settle();
    await goTo(open, 'f3l1', root);
    expect(sentAct().body).toEqual({
      runId: bodyOf('dungeon-act-camp-pending').runId,
      step: bodyOf('dungeon-act-camp-pending').step,
      act: bodyOf('dungeon-act-camp-pending').act,
    });
    expect(byClass(root, 'dungeon-camp')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(0);
    const text = visibleText(root);
    expect(text).toContain('Standing creatures heal 40% HP.');
    expect(text).toContain('Head home with your pack');
    expect(byName(root, 'span', 'Bait: 1')).toHaveLength(1);
    expect(byName(root, 'span', 'Scrap: 5')).toHaveLength(1);
  });

  it('resumes at the camp from today, and takes a keepsake offered by the server', async () => {
    api.fetchDungeonToday.mockResolvedValue(parseDungeonToday(todayActive));
    api.dungeonAct.mockResolvedValue(parseDungeonAct(actCamp));
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-camp')).toHaveLength(1);
    page?.click(button(root, /^Take a keepsake/));
    if (campState.pending?.kind !== 'camp') throw new Error('camp');
    const offer = campState.pending.offers[0];
    expect(visibleText(root)).toContain(offer?.description ?? 'no offer');
    page?.click(button(root, new RegExp(escapeRe(offer?.name ?? '?'))));
    await settle();
    expect(sentAct().body).toMatchObject({
      runId: campState.id,
      step: campState.step,
      act: {
        type: 'camp',
        choice: 'keepsake',
        keepsake: offer?.id,
        order: campState.team.map((c) => c.id),
      },
    });
    // The answer left the camp and the map is back.
    expect(byClass(root, 'dungeon-camp')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
  });

  it('rests with the row as the captured camp state has it', async () => {
    api.fetchDungeonToday.mockResolvedValue(parseDungeonToday(todayActive));
    api.dungeonAct.mockResolvedValue(parseDungeonAct(actCamp));
    const { root } = drawTab();
    await settle();
    page?.click(button(root, /^Rest/));
    await settle();
    expect(sentAct().body['act']).toEqual({
      type: 'camp',
      choice: 'rest',
      order: campState.team.map((c) => c.id),
    });
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
  });

  it('swaps, with the new row from the answer shown after it', async () => {
    const dnd = installDrag();
    onTestFinished(dnd.restore);
    const swapped = parseDungeonAct(actCamp);
    api.fetchDungeonToday.mockResolvedValue(parseDungeonToday(todayActive));
    api.dungeonAct.mockResolvedValue(swapped);
    const { root } = drawTab();
    await settle();
    const fixture = bodyOf('dungeon-act-camp').act;
    if (fixture.type !== 'camp') throw new Error('camp act');
    // The player drags the first creature onto the second (the order of the capture), then swaps.
    const tile = (name: string): FakeElement => {
      const found = byClass(root, 'party-slot').find((e) =>
        (e.getAttribute('aria-label') ?? '').includes(`: ${name},`),
      );
      if (found === undefined) throw new Error(`no tile for ${name}`);
      return found;
    };
    dnd.drag(
      page as Page,
      tile(campState.team[0]?.name ?? ''),
      tile(campState.team[1]?.name ?? ''),
    );
    page?.click(button(root, /^Swap a creature/));
    await settle();
    // Who comes in: Zipmouse, the one creature outside the row.
    const zip = byRole(root, 'option').find((o) => visibleText(o).includes('Zipmouse'));
    if (zip === undefined) throw new Error('no Zipmouse in the picker');
    page?.click(zip);
    await settle();
    expect(visibleText(root)).toContain('Who goes home?');
    page?.click(button(root, /^Cindle/));
    await settle();
    // The new row is arranged before anything is sent: the recruit stands where Cindle stood, last.
    expect(visibleText(root)).toContain('Arrange your row');
    expect(api.dungeonAct).not.toHaveBeenCalled();
    page?.click(button(root, 'Swap and push on'));
    await settle();
    expect(sentAct().body['act']).toEqual(fixture);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(byClass(root, 'run-tile').map((t) => visibleText(t))).toEqual(
      swapped.state.team.map((c) => expect.stringContaining(c.name) as unknown as string),
    );
  });
});

describe('the end of a run, with the real answers', () => {
  async function runEnding(
    answer: DungeonActResponse,
    open: DungeonRunState,
    goes: (root: FakeElement) => Promise<void>,
  ): Promise<{ root: FakeElement; finished: ReturnType<typeof vi.fn> }> {
    vi.useFakeTimers();
    const finished = vi.fn();
    api.fetchDungeonToday.mockResolvedValue({ ...parseDungeonToday(todayActive), active: open });
    api.dungeonAct.mockResolvedValue(answer);
    const { root } = drawTab(null, finished);
    await settle();
    await goes(root);
    return { root, finished };
  }

  it('cleared: the boss fight plays, then "Cleared!" with the pack kept and the path taken', async () => {
    const answer = parseDungeonAct(actCleared);
    const open = before(answer.state, {
      step: 9,
      at: 'f5l0',
      path: answer.state.path.slice(0, -1),
      reachable: ['f6l1'],
    });
    const { root, finished } = await runEnding(answer, open, async (r) => {
      await goTo(open, 'f6l1', r);
    });
    expect(sentAct().body).toEqual({
      runId: bodyOf('dungeon-act-cleared').runId,
      step: bodyOf('dungeon-act-cleared').step,
      act: bodyOf('dungeon-act-cleared').act,
    });
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    expect(finished).not.toHaveBeenCalled();
    await playOut(root);
    const text = visibleText(root);
    const summary = answer.summary;
    expect(text).toContain('Cleared!');
    expect(text).toContain(
      `You defeated the floor boss and advanced to depth ${String(summary?.newDepth)}. You brought your whole pack home.`,
    );
    expect(text).not.toContain('Pack:');
    // The rewards are badges only, with what the run paid.
    expect(byClass(root, 'reward-pile')).toHaveLength(0);
    const badges = visibleText(byClass(root, 'reward-badges')[0] as FakeElement);
    expect(badges).toContain(String(summary?.rewards.bait));
    expect(badges).toContain(String(summary?.rewards.parts.scrap));
    expect(byClass(root, 'dmap')).toHaveLength(1);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('home: heading home from the camp goes straight to the results', async () => {
    const answer = parseDungeonAct(actHome);
    const open = before(answer.state, {
      step: 6,
      pending: parseDungeonAct(actCampPending).state.pending,
    });
    const { root, finished } = await runEnding(answer, open, async (r) => {
      page?.click(button(r, 'Head home with your pack'));
      page?.click(button(r, 'Yes, head home'));
      await settle();
    });
    expect(sentAct().body).toEqual({
      runId: bodyOf('dungeon-act-home').runId,
      step: bodyOf('dungeon-act-home').step,
      act: bodyOf('dungeon-act-home').act,
    });
    expect(byClass(root, 'dungeon-playback')).toHaveLength(0);
    const text = visibleText(root);
    expect(text).toContain('Home safe');
    expect(text).toContain('You headed home from the camp with your whole pack. You stay at depth');
    expect(text).not.toContain('Pack:');
    const badges = visibleText(byClass(root, 'reward-badges')[0] as FakeElement);
    expect(badges).toContain(String(answer.summary?.rewards.bait));
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('defeat: the lost fight plays, then the (empty) pack and the depth unchanged', async () => {
    const answer = parseDungeonAct(actDefeat);
    const hp = answer.room?.hpStart ?? {};
    const open = before(answer.state, {
      step: 0,
      at: null,
      path: [],
      reachable: answer.state.map.nodes.filter((n) => n.floor === 0).map((n) => n.id),
      team: answer.state.team.map((c) => ({ ...c, hp: hp[c.id] ?? c.hpMax })),
    });
    const { root, finished } = await runEnding(answer, open, async (r) => {
      await goTo(open, 'f0l0', r);
    });
    expect(sentAct().body).toEqual({
      runId: bodyOf('dungeon-act-defeat').runId,
      step: bodyOf('dungeon-act-defeat').step,
      act: bodyOf('dungeon-act-defeat').act,
    });
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    await playOut(root);
    const text = visibleText(root);
    expect(text).toContain('Defeated');
    expect(text).toMatch(/You were defeated in room 1 \/ 7 with an empty pack\./);
    expect(text).toContain('No rewards this time.');
    expect(finished).toHaveBeenCalledTimes(1);
  });
});

describe('watching a path run again, with the real replay', () => {
  it('plays each fight in the row that fought it: the swapped-in creature joins after the camp', async () => {
    vi.useFakeTimers();
    const ended = parseDungeonAct(actCleared);
    api.fetchDungeonToday.mockResolvedValue(ended.today);
    api.fetchDungeonReplay.mockResolvedValue(parseDungeonReplay(replayPath));
    const { root } = drawTab();
    await settle();
    expect(visibleText(root)).toContain('Cleared!');
    page?.click(button(root, /Watch again/));
    await settle();
    expect(api.fetchDungeonReplay).toHaveBeenCalledWith(ended.summary?.id);
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    // Watch the stage while the four fights play: which of Cindle (the creature that went home at
    // the camp) and Zipmouse (the one that came in) stand in the row at each moment.
    const seen = { start: false, swapped: false, both: false };
    for (let i = 0; i < 900; i++) {
      const stage = byClass(root, 'dungeon-playback')[0];
      if (stage === undefined) break;
      const text = visibleText(stage);
      const cindle = text.includes('Cindle');
      const zipmouse = text.includes('Zipmouse');
      if (cindle && zipmouse) seen.both = true;
      if (cindle && !zipmouse) seen.start = true;
      if (zipmouse && !cindle) seen.swapped = true;
      // Once the swapped row has been on stage, the old one never comes back.
      if (seen.swapped && cindle) seen.both = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(seen.start).toBe(true);
    expect(seen.swapped).toBe(true);
    expect(seen.both).toBe(false);
  });
});

describe('the route and what happened in each room, with the real answers', () => {
  const dialogOf = (root: FakeElement): FakeElement => byRole(root, 'dialog')[0] as FakeElement;

  it('results: a Map and Rooms switch (the map first), the walked rooms visited, and each room tells its story', () => {
    const summary = parseDungeonAct(actCleared).summary;
    if (summary?.route === undefined) throw new Error('the capture has a route');
    const { route } = summary;
    page = createPage();
    page.draw(
      <DungeonResults
        run={summary}
        today={parseDungeonAct(actCleared).today ?? parseDungeonToday(todayMap)}
        offset={0}
        canRetry={false}
        busy={false}
        error={null}
        onWatch={noop}
        onRetry={noop}
      />,
    );
    const { root } = page;
    // The map opens first; the Rooms view is one tap away.
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    const visited = byClass(root, 'dmap-node').filter((n) =>
      (n.getAttribute('class') ?? '').includes('s-visited'),
    );
    expect(visited).toHaveLength(route.path.length);
    expect(byName(root, 'button', /^Go/)).toHaveLength(0);

    // A fight: the foe's HP at the end, Cleared, the loot it put in the pack and the supply.
    const fight = route.history[0];
    const fightNode = route.map.nodes.find((n) => n.id === fight?.node);
    if (fight?.result !== 'fight' || fightNode === undefined) throw new Error('a fight first');
    page.click(button(root, new RegExp(`^${escapeRe(nodeLabel(fightNode))}\\.`)));
    let text = visibleText(dialogOf(root));
    expect(text).toContain(`HP 0 / ${String(fight.foeHpMax)}`);
    expect(text).toContain('Cleared');
    expect(text).toContain(`Won in ${String(fight.rounds)} round`);
    expect(text).toContain("Earned the run's supply.");
    page.click(button(root, 'Close'));

    // The camp: the server's own line of what was done.
    const camp = route.history.find((e) => e.result === 'camp');
    page.click(button(root, /^Camp\./));
    text = visibleText(dialogOf(root));
    expect(text).toContain(camp?.result === 'camp' ? camp.detail : 'no camp in the capture');
    page.click(button(root, 'Close'));

    // A mystery room: the option picked and what came of it.
    const event = route.history.find((e) => e.result === 'event');
    page.click(button(root, /^Mystery room\. Visited/));
    text = visibleText(dialogOf(root));
    expect(text).toContain(event?.result === 'event' ? event.outcome : 'no event in the capture');
    expect(text).toContain(`You picked: ${event?.result === 'event' ? event.option : ''}`);
    page.click(button(root, 'Close'));

    // The Rooms view lists every room the run went through, in order, each Cleared.
    page.click(button(root, 'Rooms'));
    const panels = byClass(root, 'room-panel');
    expect(panels).toHaveLength(route.path.length);
    const rooms = visibleText(byClass(root, 'room-strip')[0] as FakeElement);
    expect(rooms).toContain('CLEARED');
    expect(rooms).not.toContain('DEFEATED');
    expect(rooms).toContain('Camp');
    expect(rooms).toContain('Swapped a creature');
    expect(rooms).toContain(event?.result === 'event' ? event.outcome : 'no event in the capture');
    expect(byClass(root, 'dmap-node')).toHaveLength(0);
  });

  it('results: a lost fight says Defeat and the HP the foe had left', () => {
    const summary = parseDungeonAct(actDefeat).summary;
    const lost = summary?.route?.history[0];
    if (summary?.route === undefined || lost?.result !== 'fight') throw new Error('a lost fight');
    page = createPage();
    page.draw(
      <DungeonResults
        run={summary}
        today={parseDungeonToday(todayMap)}
        offset={0}
        canRetry={false}
        busy={false}
        error={null}
        onWatch={noop}
        onRetry={noop}
      />,
    );
    page.click(button(page.root, /^Fight: /));
    const text = visibleText(dialogOf(page.root));
    expect(text).toContain('Defeat');
    expect(text).toContain(`HP ${String(lost.foeHpEnd)} / ${String(lost.foeHpMax)}`);
    expect(text).toContain(`Your team fell after ${String(lost.rounds)} round`);
  });

  it('the run map: a visited fight shows its outcome, and a room off the path is out of reach', async () => {
    const answer = parseDungeonAct(actFight);
    api.fetchDungeonToday.mockResolvedValue({
      ...parseDungeonToday(todayActive),
      active: answer.state,
    });
    const { root } = drawTab();
    await settle();
    const first = answer.state.history?.[0];
    if (first?.result !== 'fight') throw new Error('a fight first');
    page?.click(room(answer.state, first.node, root));
    const text = visibleText(dialogOf(root));
    expect(text).toContain(`HP 0 / ${String(first.foeHpMax)}`);
    expect(text).toContain('Cleared');
    page?.click(button(root, 'Close'));
    const stranded = answer.state.map.nodes.find((n) => n.floor === 0 && n.id !== first.node);
    if (stranded === undefined) throw new Error('another entrance room');
    expect(room(answer.state, stranded.id, root).getAttribute('class')).toContain('s-unreachable');
    page?.click(room(answer.state, stranded.id, root));
    expect(visibleText(dialogOf(root))).toContain("You can't reach this room any more.");
  });
});

describe('the Undercroft, with the real answers', () => {
  const dialogOf = (root: FakeElement): FakeElement => byRole(root, 'dialog')[0] as FakeElement;

  async function openRunAt(open: DungeonRunState, answers: DungeonActResponse[]) {
    vi.useFakeTimers();
    api.fetchDungeonToday.mockResolvedValue({ ...parseDungeonToday(todayActive), active: open });
    for (const answer of answers) api.dungeonAct.mockResolvedValueOnce(answer);
    const { root } = drawTab();
    await settle();
    return root;
  }

  it('door, boss, descent card, descend: each move is the captured act, and the card says what is at stake', async () => {
    const ahead = undercroftState('door-ahead');
    const pending = parseDungeonAct(actDescendPending);
    const root = await openRunAt(ahead, [
      parseDungeonAct(actDoor),
      pending,
      parseDungeonAct(actDescend),
    ]);
    // Before the boss there is no band or text above it: the boss wears a down-arrow badge instead.
    expect(visibleText(root)).not.toContain('beat the boss to descend');
    expect(byClass(root, 'dmap-descend')).toHaveLength(1);
    const body = (key: keyof Bodies) => ({
      runId: bodyOf(key).runId,
      step: bodyOf(key).step,
      act: bodyOf(key).act,
    });

    // The carved door says what it could add; walking through says only that a room was added.
    page?.click(room(ahead, 'f5l1', root));
    expect(visibleText(dialogOf(root))).toContain(
      'Step through to add one room to the first Undercroft floor',
    );
    page?.click(button(root, /^Go/));
    await settle();
    expect(sentAct(0).body).toEqual(body('dungeon-act-door'));
    expect(byClass(root, 'dungeon-playback')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    const walked = parseDungeonAct(actDoor).state;
    page?.click(room(walked, 'f5l1', root));
    expect(visibleText(dialogOf(root))).toContain('Added a room to the first Undercroft floor.');
    page?.click(button(root, 'Close'));

    // The floor boss: its fight plays, then the descent card takes the place of the map.
    await goTo(walked, 'f6l1', root);
    expect(sentAct(1).body).toEqual(body('dungeon-act-descend-pending'));
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    await playOut(root);
    expect(byClass(root, 'dungeon-descend')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(0);
    const card = visibleText(root);
    expect(card).toContain('Depth 15 unlocked');
    expect(card).toContain('Banked now');
    expect(card).toContain('Cinder Charm');
    expect(card).toContain('Still at risk');
    expect(byName(root, 'span', 'Essence: 3')).toHaveLength(2);
    expect(card).toContain('4 rooms with a floor boss at the end. Foes are from depth 15.');
    expect(card).toContain(
      'Your creatures catch their breath and heal 20% HP. Downed creatures revive to 10% HP.',
    );
    expect(card).toContain('Depth 15 · The floor boss is down');
    expect(byName(root, 'button', 'Descend')).toHaveLength(1);
    expect(byName(root, 'button', 'Head home with your pack')).toHaveLength(1);

    // Descend: the captured act, then the level below the boss, labelled, with its entrance next.
    page?.click(button(root, 'Descend'));
    await settle();
    expect(sentAct(2).body).toEqual(body('dungeon-act-descend'));
    expect(byClass(root, 'dungeon-descend')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    const text = visibleText(root);
    expect(text).toContain('Undercroft 1 · At the entrance');
    expect(text).toContain('Undercroft 1');
    const down = parseDungeonAct(actDescend).state;
    const nodes = byClass(root, 'dmap-node');
    expect(nodes).toHaveLength(
      down.map.nodes.length + (down.undercroft?.maps[0]?.nodes.length ?? 0),
    );
    const lit = nodes.filter((n) => (n.getAttribute('class') ?? '').includes('s-reachable'));
    expect(lit.map((n) => n.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('Fight: Ember Mite'),
      expect.stringContaining('Fight: Puddle Imp'),
    ]);
    // The day's rooms the run did not walk are out of reach now, and their drawer says so.
    const gone = nodes.filter((n) => (n.getAttribute('aria-label') ?? '').includes('Out of reach'));
    expect(gone.length).toBeGreaterThan(0);
    page?.click(gone[0] as FakeElement);
    expect(visibleText(dialogOf(root))).toContain("You can't reach this room any more.");
  });

  it('heading home from the descent card is the captured home act, and keeps the pack', async () => {
    const pending = parseDungeonAct(actDescendPending).state;
    const home = parseDungeonAct(actHome);
    const root = await openRunAt(pending, [home]);
    expect(byClass(root, 'dungeon-descend')).toHaveLength(1);
    page?.click(button(root, 'Head home with your pack'));
    await settle();
    expect(sentAct().body['act']).toEqual({ type: 'home' });
    expect(sentAct().body['runId']).toBe(pending.id);
    expect(visibleText(root)).toContain('Home safe');
    expect(visibleText(root)).toContain('You headed home from the camp with your whole pack.');
  });

  it('the keeper: the fight plays, then "Cleared! ... 1 Undercroft floor cleared" with the levels on the route map', async () => {
    const keeper = parseDungeonAct(actKeeper);
    const open = undercroftState('keeper');
    const root = await openRunAt(open, [keeper]);
    expect(visibleText(root)).toContain('Undercroft 1 · Room 3 / 4');
    await goTo(open, 'u1f3l1', root);
    expect(sentAct().body).toEqual({
      runId: bodyOf('dungeon-act-keeper').runId,
      step: bodyOf('dungeon-act-keeper').step,
      act: bodyOf('dungeon-act-keeper').act,
    });
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    // The banner names the level and its floors, and the keeper as the keeper.
    expect(visibleText(root)).toContain('Undercroft 1 · Room 4 / 4');
    await playOut(root);
    const text = visibleText(root);
    expect(text).toContain('Cleared!');
    expect(text).toContain(
      'You defeated the floor boss and advanced to depth 15 and cleared 1 Undercroft floor. You brought your whole pack home.',
    );
    // The route map (it opens first) has the level above the day's map, with every room the run walked visited.
    expect(byClass(root, 'dmap-node')).toHaveLength(
      keeper.state.map.nodes.length + (keeper.state.undercroft?.maps[0]?.nodes.length ?? 0),
    );
    const visited = byClass(root, 'dmap-node').filter((n) =>
      (n.getAttribute('class') ?? '').includes('s-visited'),
    );
    expect(visited).toHaveLength(keeper.state.path.length);
    // The floor boss's chest says what it paid.
    page?.click(button(root, /^Undercroft floor boss: Slag Tyrant\./));
    const drawer = visibleText(dialogOf(root));
    expect(drawer).toContain("The floor boss's chest opened.");
    expect(drawer).toContain('Cleared');
    page?.click(button(root, 'Close'));
    // The Rooms view lists every room of both floors in order, the keeper last.
    page?.click(button(root, 'Rooms'));
    const panels = byClass(root, 'room-panel');
    expect(panels).toHaveLength(keeper.state.path.length);
    // Below, the header is "Undercroft 1" over "Room 4 · Boss" (short, so it never wraps); a screen reader hears it whole.
    const last = panels[panels.length - 1] as FakeElement;
    expect(visibleText(last)).toContain('Room 4 · Boss');
    expect(last.getAttribute('aria-label')).toContain('Floor boss');
    expect(visibleText(panels[panels.length - 1] as FakeElement)).toContain('Undercroft 1');
  });
});
