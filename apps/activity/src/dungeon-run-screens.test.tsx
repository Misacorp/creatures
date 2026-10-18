import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleRoster } from './creature-card-sample';
import { ApiError } from './api';
import { Dungeon } from './Dungeon';
import { DungeonCamp } from './DungeonCamp';
import { DungeonEvent } from './DungeonEvent';
import { DungeonPlayback } from './DungeonPlayback';
import { DungeonPrerun } from './DungeonPrerun';
import { ROOM_CARD_MS, arenaOutOfView, fightScroll, roomInput } from './dungeon-playback';
import { DungeonResults } from './DungeonResults';
import { DungeonRun } from './DungeonRun';
import { DungeonRunStrip, KEEPSAKE_ONLY_LINE } from './DungeonRunStrip';
import { PopoverHost } from './PopoverHost';
import { glossaryEntry } from '@creatures/game';
import {
  SAMPLE_EVENT,
  SAMPLE_KEEPSAKES,
  sampleActFight,
  sampleRoom,
  sampleState,
  sampleStateCamp,
  sampleStateEvent,
  sampleStateMid,
  sampleSummary,
  sampleToday,
  omitKey,
} from './dungeon-path-samples';
import type { DungeonAct, DungeonRunState } from './dungeon-types';
import { byClass, byName, createPage, FakeElement, find, visibleText, type Page } from './test-dom';

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
  // The little the fake DOM leaves out, that the run's screens ask a browser for.
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
});

const noop = (): void => undefined;

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page = createPage();
  page.draw(vnode);
  return page;
}

function button(root: FakeElement, name: RegExp | string): FakeElement {
  const found = byName(root, 'button', name)[0];
  if (found === undefined) throw new Error(`no button ${String(name)}`);
  return found;
}

/** Lets the promises of a click (the request, the state it sets) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('the strip of an open run', () => {
  it('shows where the run is, the row with its HP, the keepsakes and the pack at risk', () => {
    const { root } = draw(<DungeonRunStrip state={sampleStateMid()} />);
    const text = visibleText(root);
    expect(text).toContain('Depth 3 · Room 2 / 7');
    // The row, left to right, with HP in words; the third creature is knocked out.
    expect(byClass(root, 'run-tile')).toHaveLength(3);
    expect(text).toContain('Sproutle');
    expect(text).toContain('84 / 281 HP');
    expect(text).toContain('Knocked out');
    expect(byClass(root, 'run-tile').map((t) => t.getAttribute('class'))).toEqual([
      'team-member run-tile low',
      'team-member run-tile ok',
      'team-member run-tile ko',
    ]);
    // The pack and its warning.
    expect(text).toContain('In your pack:');
    expect(byName(root, 'span', 'Bait: 2')).toHaveLength(1);
    expect(byName(root, 'span', 'Scrap: 1')).toHaveLength(1);
    expect(text).toContain('At risk');
    // A keepsake chip, named for what it does.
    expect(byName(root, 'button', /Lantern Moth: Your creatures crit/)).toHaveLength(1);
  });

  it('says the pack is empty, with no warning, and has no keepsake row when there are none', () => {
    const { root } = draw(<DungeonRunStrip state={sampleState()} />);
    expect(visibleText(root)).toContain('Your pack is empty.');
    expect(visibleText(root)).not.toContain('At risk');
    expect(byClass(root, 'run-keepsakes')).toHaveLength(0);
    expect(visibleText(root)).toContain('Depth 3 · At the entrance');
  });

  it('says what the last mystery room did, but not while another is open', () => {
    const { root } = draw(<DungeonRunStrip state={sampleStateMid()} />);
    expect(visibleText(root)).toContain('Glowing Pool: Drink.');
    expect(visibleText(root)).toContain('Every creature healed 25% of its max HP.');
    const open: DungeonRunState = sampleStateEvent();
    page?.draw(<DungeonRunStrip state={{ ...open, lastEvent: sampleStateMid().lastEvent }} />);
    expect(visibleText(root)).not.toContain('Glowing Pool: Drink');
  });

  it('draws names as text, never as markup', () => {
    const state = sampleState();
    const sneaky = { ...state.team[0], name: '<img src=x onerror=alert(1)>' };
    const { root } = draw(
      <DungeonRunStrip state={{ ...state, team: [sneaky as never, ...state.team.slice(1)] }} />,
    );
    expect(visibleText(root)).toContain('<img src=x onerror=alert(1)>');
    expect(find(root, (e) => e.localName === 'img')).toHaveLength(0);
  });

  it('opens a keepsake sheet with its text when its chip is tapped, and says it lasts only this run', () => {
    const { root, document } = draw(<DungeonRunStrip state={sampleStateMid()} />);
    page?.click(button(root, /Lantern Moth/));
    const sheet = find(document.body, (e) => e.getAttribute('role') === 'dialog')[0];
    expect(sheet).toBeDefined();
    expect(visibleText(sheet as FakeElement)).toContain('Your creatures crit 5 points more often.');
    expect(visibleText(sheet as FakeElement)).toContain(KEEPSAKE_ONLY_LINE);
  });

  it('labels the keepsakes with a "?" that explains they last only for the run', () => {
    const { root } = draw(
      <PopoverHost onOpenHowTo={noop}>
        <DungeonRunStrip state={sampleStateMid()} />
      </PopoverHost>,
    );
    const row = byClass(root, 'run-keepsakes-row')[0] as FakeElement;
    expect(visibleText(row)).toContain('Keepsakes');
    expect(byName(row, 'button', 'What is Keepsake?')).toHaveLength(1);
    expect(glossaryEntry('keepsake')?.lines.join(' ')).toMatch(/When the run ends it is gone/);
    expect(glossaryEntry('keepsake')?.lines.join(' ')).toMatch(/do not keep it/);
  });
});

describe('a mystery room', () => {
  it('shows the name, the scene and both options with their exact outcomes', () => {
    const { root } = draw(<DungeonEvent event={SAMPLE_EVENT} busy={false} onPick={noop} />);
    const text = visibleText(root);
    expect(text).toContain('Sleeping Beetle');
    expect(text).toContain('A round beetle snores on a small pile of coins.');
    expect(byClass(root, 'event-option')).toHaveLength(2);
    expect(visibleText(button(root, /Take one coin/))).toBe('Take one coin You gain 1 scrap.');
    expect(visibleText(button(root, /Take the pile/))).toBe(
      'Take the pile 50%: 3 scrap. 50%: every creature loses 20% HP.',
    );
  });

  it('picks option 0 or 1 and waits while an act is on its way', () => {
    const picked: (0 | 1)[] = [];
    const { root } = draw(
      <DungeonEvent
        event={SAMPLE_EVENT}
        busy={false}
        onPick={(o) => {
          picked.push(o);
        }}
      />,
    );
    page?.click(button(root, /Take the pile/));
    page?.click(button(root, /Take one coin/));
    expect(picked).toEqual([1, 0]);
    page?.draw(<DungeonEvent event={SAMPLE_EVENT} busy={true} onPick={noop} />);
    expect(byClass(root, 'event-option').every((b) => b.hasAttribute('disabled'))).toBe(true);
  });
});

describe('the camp', () => {
  const state = sampleStateCamp();
  const owned = sampleRoster(5);
  const camp = state.pending?.kind === 'camp' ? state.pending : { offers: [], restBp: 0 };

  function drawCamp(
    onAct: (a: DungeonAct) => void,
    options: { creatures?: typeof owned; initialStep?: 'menu' | 'keepsake' | 'out' } = {},
  ): FakeElement {
    return draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={options.creatures ?? owned}
        busy={false}
        onAct={onAct}
        {...(options.initialStep === undefined ? {} : { initialStep: options.initialStep })}
      />,
    ).root;
  }

  it('offers Rest, a keepsake and Swap with their exact effects, and heading home apart', () => {
    const root = drawCamp(noop);
    const text = visibleText(root);
    expect(text).toContain('The camp');
    expect(text).toContain('Standing creatures recover 40% HP.');
    expect(text).toContain('Take a keepsake');
    expect(text).toContain('Swap a creature');
    expect(visibleText(button(root, 'Head home with your pack'))).toBe('Head home with your pack');
    expect(text).toContain('Push on and a defeat keeps only half your pack.');
    // Three choices in the list; the home button is outside it.
    expect(byClass(root, 'camp-choice')).toHaveLength(3);
    expect(byClass(root, 'camp-home')[0]?.textContent).toContain('Head home with your pack');
  });

  it('rests with the row as it stands', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, /^Rest/));
    expect(acts).toEqual([{ type: 'camp', choice: 'rest', order: state.team.map((c) => c.id) }]);
  });

  it('sends the new order with the choice after the row was moved', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    const [a, b, c] = state.team.map((t) => t.id) as [string, string, string];
    page?.click(button(root, `Move ${state.team[2]?.name ?? ''} left`));
    page?.click(button(root, `Move ${state.team[2]?.name ?? ''} left`));
    page?.click(button(root, /^Rest/));
    expect(acts).toEqual([{ type: 'camp', choice: 'rest', order: [c, a, b] }]);
    expect(b).toBeDefined();
  });

  it('cannot move the left creature further left, or the right one further right', () => {
    const root = drawCamp(noop);
    expect(button(root, `Move ${state.team[0]?.name ?? ''} left`).hasAttribute('disabled')).toBe(
      true,
    );
    expect(button(root, `Move ${state.team[2]?.name ?? ''} right`).hasAttribute('disabled')).toBe(
      true,
    );
    expect(button(root, `Move ${state.team[1]?.name ?? ''} left`).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('opens the two keepsakes, takes one, and can go back', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, /^Take a keepsake/));
    expect(visibleText(root)).toContain("Wayfarer's Charm");
    expect(visibleText(root)).toContain('Every creature gets 12% more Attack and 12% more HP.');
    expect(visibleText(root)).toContain('Foes have 10% less HP.');
    page?.click(button(root, 'Back'));
    expect(visibleText(root)).toContain('Standing creatures recover');
    page?.click(button(root, /^Take a keepsake/));
    page?.click(button(root, /Chalk Mark/));
    expect(acts).toEqual([
      {
        type: 'camp',
        choice: 'keepsake',
        keepsake: SAMPLE_KEEPSAKES[2]?.id,
        order: state.team.map((c) => c.id),
      },
    ]);
  });

  it('asks who goes home after the creature coming in is picked, with the knocked-out one plain to see', () => {
    const acts: DungeonAct[] = [];
    const incoming = owned[4]?.id ?? '';
    const root = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={owned}
        busy={false}
        onAct={(a) => acts.push(a)}
        initialStep="out"
        initialIncoming={incoming}
      />,
    ).root;
    const text = visibleText(root);
    expect(text).toContain('Who goes home?');
    expect(text).toContain('Level 12 · Knocked out');
    expect(byClass(root, 'camp-out')).toHaveLength(3);
    expect(
      byClass(root, 'camp-out').filter((b) => b.getAttribute('class')?.includes(' ko')),
    ).toHaveLength(1);
    page?.click(button(root, /^Cindle/));
    expect(acts).toEqual([
      {
        type: 'camp',
        choice: 'swap',
        out: state.team[2]?.id,
        in: incoming,
        order: state.team.map((c) => c.id),
      },
    ]);
  });

  it('cannot swap when the player has nobody outside the row, and says why', () => {
    const root = drawCamp(noop, { creatures: owned.slice(0, 0) });
    expect(button(root, /^Swap a creature/).hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('You have no other creatures to bring in.');
  });

  it('asks once more before heading home, then ends the run and keeps the pack', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, 'Head home with your pack'));
    expect(acts).toEqual([]);
    expect(visibleText(root)).toContain('You keep your whole pack: 2 Bait · 1 Scrap.');
    page?.click(button(root, 'Not yet'));
    expect(visibleText(root)).toContain('Push on and a defeat keeps only half your pack.');
    page?.click(button(root, 'Head home with your pack'));
    page?.click(button(root, 'Yes, head home'));
    expect(acts).toEqual([{ type: 'home' }]);
  });
});

describe('the run on screen', () => {
  const creatures = sampleRoster(5);

  it('shows the strip and the event card, and no map, while a mystery room is open', () => {
    const acts: DungeonAct[] = [];
    const { root } = draw(
      <DungeonRun
        state={sampleStateEvent()}
        creatures={creatures}
        busy={false}
        error={null}
        onAct={(a) => acts.push(a)}
      />,
    );
    expect(byClass(root, 'dungeon-run-strip')).toHaveLength(1);
    expect(byClass(root, 'dungeon-event')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(0);
    page?.click(button(root, /Take one coin/));
    expect(acts).toEqual([{ type: 'event', option: 0 }]);
  });

  it('shows the camp card, and no map, at the camp', () => {
    const { root } = draw(
      <DungeonRun
        state={sampleStateCamp()}
        creatures={creatures}
        busy={false}
        error={null}
        onAct={noop}
      />,
    );
    expect(byClass(root, 'dungeon-camp')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(0);
  });

  it('shows the map under the strip when nothing is pending, and an error above it', () => {
    const { root } = draw(
      <DungeonRun
        state={sampleStateMid()}
        creatures={creatures}
        busy={false}
        error="Your run moved on in another window. The map was refreshed."
        onAct={noop}
      />,
    );
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(byClass(root, 'dmap')).toHaveLength(1);
    expect(visibleText(root)).toContain('Your run moved on in another window.');
  });
});

describe('the results of a path run', () => {
  const today = sampleToday();
  function results(run: ReturnType<typeof sampleSummary>): FakeElement {
    page ??= createPage();
    page.draw(
      <DungeonResults
        run={run}
        today={today}
        offset={0}
        canRetry={false}
        busy={false}
        error={null}
        onWatch={noop}
        onRetry={noop}
      />,
    );
    return page.root;
  }

  it('says how a cleared run ended: the pack on one line (all kept) and the keepsakes as chips', () => {
    const root = results(sampleSummary('cleared'));
    const text = visibleText(root);
    expect(text).toContain('Cleared! Depth 3 to 4');
    // One line, not Found and Kept, with the kinds as icons and numbers.
    expect(text).toMatch(/Pack\s*:\s*all kept/);
    expect(text).not.toContain('Found:');
    expect(text).not.toContain('Kept:');
    expect(byName(root, 'span', 'Bait: 3')).toHaveLength(1);
    expect(byName(root, 'span', 'Essence: 1')).toHaveLength(1);
    expect(byName(root, 'span', 'Scrap: 2')).toHaveLength(1);
    expect(find(root, (e) => e.localName === 's')).toHaveLength(0);
    // The keepsake is a chip, not a sentence: its text is in the tap.
    expect(byName(root, 'button', /^Lantern Moth: Your creatures crit/)).toHaveLength(1);
    expect(text).not.toContain('Your creatures crit 5 points more often.');
    expect(byClass(root, 'room-panel')).toHaveLength(3);
    expect(byClass(root, 'path')).toHaveLength(1);
  });

  it('does not repeat the headline in a badge, and has no pack line for an empty pack', () => {
    const root = results(sampleSummary('cleared'));
    expect(byClass(root, 'badge')).toHaveLength(0);
    const empty = results(
      sampleSummary('defeat', {
        pack: {
          found: { bait: 0, essence: 0, scrap: 0 },
          kept: { bait: 0, essence: 0, scrap: 0 },
        },
      }),
    );
    expect(visibleText(empty)).not.toContain('Pack');
  });

  it('says home safe and defeated in their own words, striking through what was lost', () => {
    const home = visibleText(results(sampleSummary('home')));
    expect(home).toContain('Home safe with your whole pack');
    expect(home).toMatch(/Pack\s*:\s*all kept/);
    const root = results(sampleSummary('defeat'));
    const defeated = visibleText(root);
    expect(defeated).toContain('Defeated: half your pack made it home');
    expect(defeated).toMatch(/Pack\s*:\s*half kept/);
    expect(defeated).toContain('Still at depth 3. Beat the floor boss to go deeper.');
    // What was found is struck and dim before what came home; spoken as found and kept.
    expect(find(root, (e) => e.localName === 's').map((e) => visibleText(e))).toEqual(['3', '3']);
    expect(byName(root, 'span', 'Bait: found 3, kept 2')).toHaveLength(1);
    expect(byName(root, 'span', 'Scrap: found 3, kept 2')).toHaveLength(1);
  });

  it('has a Fights and Map switch for a run with a route, and shows the fights first', () => {
    const root = results(sampleSummary('cleared'));
    const fights = button(root, 'Fights');
    const map = button(root, 'Map');
    expect(fights.getAttribute('aria-pressed')).toBe('true');
    expect(map.getAttribute('aria-pressed')).toBe('false');
    expect(byClass(root, 'room-strip')).toHaveLength(1);
    expect(byClass(root, 'dmap')).toHaveLength(0);
  });

  it('swaps to the map of the route: the walked rooms visited, no Go, and back to the fights', () => {
    const run = sampleSummary('cleared');
    const root = results(run);
    page?.click(button(root, 'Map'));
    expect(button(root, 'Map').getAttribute('aria-pressed')).toBe('true');
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    const nodes = byClass(root, 'dmap-node');
    expect(nodes).toHaveLength(run.route?.map.nodes.length ?? -1);
    const visited = nodes.filter((n) => (n.getAttribute('class') ?? '').includes('s-visited'));
    expect(visited).toHaveLength(run.route?.path.length ?? -1);
    expect(nodes.some((n) => (n.getAttribute('class') ?? '').includes('s-unreachable'))).toBe(
      false,
    );
    expect(nodes.some((n) => (n.getAttribute('class') ?? '').includes('s-reachable'))).toBe(false);
    expect(byName(root, 'button', /^Go/)).toHaveLength(0);
    page?.click(button(root, 'Fights'));
    expect(byClass(root, 'room-strip')).toHaveLength(1);
    expect(byClass(root, 'dmap')).toHaveLength(0);
  });

  it('opens what happened in a room when it is tapped on the results map', () => {
    const root = results(sampleSummary('defeat'));
    page?.click(button(root, 'Map'));
    page?.click(button(root, /^Fierce Flicker Swarm/));
    const dialog = find(root, (e) => e.getAttribute('role') === 'dialog')[0] as FakeElement;
    const text = visibleText(dialog);
    expect(text).toContain('Defeat');
    expect(text).toContain('HP 128 / 428');
    expect(text).toContain('Your team fell after 6 rounds.');
    expect(byName(dialog, 'button', /^Go/)).toHaveLength(0);
  });

  it('marks the room where the run was lost with a red cross, and ticks the cleared ones', () => {
    const run = sampleSummary('defeat');
    const root = results(run);
    page?.click(button(root, 'Map'));
    expect(byClass(root, 'dmap-lost')).toHaveLength(1);
    expect(byClass(root, 'dmap-check')).toHaveLength((run.route?.path.length ?? 0) - 1);
    const lost = byClass(root, 'dmap-node').filter((n) => byClass(n, 'dmap-lost').length > 0);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.getAttribute('aria-label')).toMatch(/^Fierce Flicker Swarm/);
  });

  it('says no rewards kindly, with a small sad picture and a hint', () => {
    const none = {
      bait: 0,
      essence: 0,
      parts: {},
      gear: [],
      supplies: [],
      converted: [],
      streak: null,
    };
    const base = sampleSummary('defeat');
    const root = results({ ...base, rewards: { ...base.rewards, ...none } });
    const text = visibleText(root);
    expect(text).toContain('No rewards this time.');
    expect(text).toContain('Beat at least one room next time.');
    expect(text).not.toContain('Nothing this time');
    expect(byClass(root, 'no-rewards')).toHaveLength(1);
    expect(byClass(root, 'no-rewards-art')[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has no empty-rewards note when the run paid something', () => {
    const root = results(sampleSummary('cleared'));
    expect(byClass(root, 'no-rewards')).toHaveLength(0);
    expect(visibleText(root)).not.toContain('No rewards this time.');
  });

  it('says a room the run did not go to was not visited', () => {
    const root = results(sampleSummary('home'));
    page?.click(button(root, 'Map'));
    page?.click(button(root, /^Fight: Puddle Imp/));
    const dialog = find(root, (e) => e.getAttribute('role') === 'dialog')[0] as FakeElement;
    expect(visibleText(dialog)).toContain('Your run did not go here.');
  });

  it('has no switch and no map for a run that came without a route', () => {
    const bare = omitKey(sampleSummary('cleared'), 'route');
    const root = results(bare);
    expect(byName(root, 'button', 'Map')).toHaveLength(0);
    expect(byClass(root, 'route-toggle')).toHaveLength(0);
    expect(byClass(root, 'room-strip')).toHaveLength(1);
    expect(visibleText(root)).toContain('Fights');
  });

  it('keeps the old headline and no pack lines for a run from before the map', () => {
    const old = { ...sampleSummary('cleared') } as Record<string, unknown>;
    for (const key of ['outcome', 'path', 'pack', 'keepsakes', 'route']) delete old[key];
    const root = results(old as unknown as ReturnType<typeof sampleSummary>);
    expect(visibleText(root)).toContain('Dungeon cleared!');
    expect(visibleText(root)).not.toContain('Pack');
    expect(byName(root, 'button', 'Map')).toHaveLength(0);
    expect(byClass(root, 'badge')).toHaveLength(1);
    expect(byClass(root, 'path')).toHaveLength(0);
  });
});

describe('the tab', () => {
  const creatures = sampleRoster(5);

  function drawTab(): Page {
    return draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={noop}
        onCanRunChange={noop}
        onRunFinished={noop}
      />,
    );
  }

  it('shows the map in preview on the pre-run card, with Enter and no way to go to a room', async () => {
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ canRun: true }));
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-card')).toHaveLength(1);
    expect(byClass(root, 'dungeon-preview')).toHaveLength(1);
    expect(byClass(root, 'dmap')).toHaveLength(1);
    // The three-room strip is only for a server that sends no map.
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    expect(byName(root, 'button', 'Enter the dungeon')).toHaveLength(1);
  });

  it('falls back to the three-room strip when the server sends no map', async () => {
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ canRun: true, map: null }));
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-preview')).toHaveLength(0);
    expect(byClass(root, 'room-strip')).toHaveLength(1);
  });

  it('enters with the team, then shows the run it opened', async () => {
    const open = sampleState();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ canRun: true }));
    api.startDungeonRun.mockResolvedValue({
      state: open,
      today: sampleToday({ canRun: false, active: open }),
    });
    const started = vi.fn();
    page = createPage();
    page.draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={started}
        onCanRunChange={noop}
        onRunFinished={noop}
      />,
    );
    await settle();
    page.click(button(page.root, 'Enter the dungeon'));
    await settle();
    expect(api.startDungeonRun).toHaveBeenCalledTimes(1);
    const sent = api.startDungeonRun.mock.calls[0]?.[0] as {
      team: string[];
      idempotencyKey: string;
    };
    expect(sent.team).toHaveLength(3);
    expect(new Set(sent.team).size).toBe(3);
    expect(sent.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(started).toHaveBeenCalledTimes(1);
    expect(byClass(page.root, 'dungeon-run-map')).toHaveLength(1);
    expect(byClass(page.root, 'dungeon-card')).toHaveLength(0);
  });

  it('shows an already open run again when entering says one is open', async () => {
    const open = sampleStateMid();
    api.fetchDungeonToday
      .mockResolvedValueOnce(sampleToday({ canRun: true }))
      .mockResolvedValueOnce(sampleToday({ canRun: false, active: open }));
    api.startDungeonRun.mockRejectedValue(new ApiError(409, 'run_active'));
    const { root } = drawTab();
    await settle();
    page?.click(button(root, 'Enter the dungeon'));
    await settle();
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(visibleText(root)).toContain('Your run is still open.');
  });

  it('opens an open run straight away, at its mystery room, after a reload', async () => {
    const open = sampleStateEvent();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    const { root } = drawTab();
    await settle();
    expect(byClass(root, 'dungeon-event')).toHaveLength(1);
    expect(visibleText(root)).toContain('Sleeping Beetle');
    expect(byClass(root, 'dungeon-card')).toHaveLength(0);
  });

  it('sends an event pick with the run, the step and a key, then shows the map again with the outcome', async () => {
    const open = sampleStateEvent();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    const after = sampleStateMid({
      step: 4,
      lastEvent: {
        name: 'Sleeping Beetle',
        option: 'Take one coin',
        outcome: 'You gained 1 scrap.',
      },
    });
    api.dungeonAct.mockResolvedValue({ state: after });
    const { root } = drawTab();
    await settle();
    page?.click(button(root, /Take one coin/));
    await settle();
    expect(api.dungeonAct).toHaveBeenCalledTimes(1);
    const sent = api.dungeonAct.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      runId: open.id,
      step: open.step,
      act: { type: 'event', option: 0 },
    });
    expect(String(sent['idempotencyKey'])).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(byClass(root, 'dungeon-event')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(visibleText(root)).toContain('Sleeping Beetle: Take one coin. You gained 1 scrap.');
  });

  it('keeps the key of an act whose answer never came, and gives the next act a fresh one', async () => {
    const open = sampleStateEvent();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    api.dungeonAct
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ state: sampleStateMid({ step: 4 }) });
    const { root } = drawTab();
    await settle();
    page?.click(button(root, /Take one coin/));
    await settle();
    expect(visibleText(root)).toContain('Could not reach');
    page?.click(button(root, /Take one coin/));
    await settle();
    const keys = api.dungeonAct.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('reloads today quietly and shows the run again when the step is stale', async () => {
    const open = sampleStateEvent();
    const moved = sampleStateMid({ step: 5 });
    api.fetchDungeonToday
      .mockResolvedValueOnce(sampleToday({ active: open, canRun: false }))
      .mockResolvedValueOnce(sampleToday({ active: moved, canRun: false }));
    api.dungeonAct.mockRejectedValue(new ApiError(409, 'stale_step'));
    const { root } = drawTab();
    await settle();
    page?.click(button(root, /Take one coin/));
    await settle();
    expect(api.fetchDungeonToday).toHaveBeenCalledTimes(2);
    // The run as the server has it now: on the map, with the plain line of what happened.
    expect(byClass(root, 'dungeon-event')).toHaveLength(0);
    expect(byClass(root, 'dungeon-run-map')).toHaveLength(1);
    expect(visibleText(root)).toContain('Your run moved on in another window.');
  });

  it('goes straight to the results when heading home ends the run', async () => {
    const open = sampleStateCamp();
    const summary = sampleSummary('home');
    const finished = vi.fn();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    api.dungeonAct.mockResolvedValue({
      state: { ...open, status: 'done', outcome: 'home', pending: null },
      summary,
      today: sampleToday({ canRun: false, blocked: 'already_run', last: summary }),
    });
    page = createPage();
    page.draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={noop}
        onCanRunChange={noop}
        onRunFinished={finished}
      />,
    );
    await settle();
    page.click(button(page.root, 'Head home with your pack'));
    page.click(button(page.root, 'Yes, head home'));
    await settle();
    expect(api.dungeonAct.mock.calls[0]?.[0]).toMatchObject({ act: { type: 'home' } });
    expect(visibleText(page.root)).toContain('Home safe with your whole pack');
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('plays the fight a move answers with, and returns to the map after it', async () => {
    const open = sampleState();
    const answer = sampleActFight();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    api.dungeonAct.mockResolvedValue(answer);
    const { root } = drawTab();
    await settle();
    // The Go button lives in the map's drawer: open the room, then go.
    const room = byName(root, 'button', /^Fight: Puddle Imp.*Show details/)[0];
    expect(room).toBeDefined();
    page?.click(room as FakeElement);
    page?.click(button(page.root, /^Go/));
    await settle();
    expect(api.dungeonAct.mock.calls[0]?.[0]).toMatchObject({
      act: { type: 'move', node: 'f0l0' },
    });
    expect(byClass(root, 'dungeon-playback')).toHaveLength(1);
    expect(byClass(root, 'dungeon-run')).toHaveLength(0);
  });

  /** A move into a fight that ended the run: the room, the summary and the fresh day. */
  function lostFight(): void {
    const open = sampleState();
    const summary = sampleSummary('defeat');
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    api.dungeonAct.mockResolvedValue({
      state: { ...open, status: 'done', outcome: 'defeat' },
      room: sampleRoom({ cleared: false }),
      summary,
      today: sampleToday({ canRun: false, blocked: 'already_run', last: summary }),
    });
  }

  async function goIntoFirstRoom(root: FakeElement): Promise<void> {
    page?.click(byName(root, 'button', /^Fight: Puddle Imp.*Show details/)[0] as FakeElement);
    page?.click(button(root, /^Go/));
    await settle();
  }

  it('shows the results after the fight that ended the run, and reloads the balances then', async () => {
    vi.useFakeTimers();
    lostFight();
    const finished = vi.fn();
    page = createPage();
    page.draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={noop}
        onCanRunChange={noop}
        onRunFinished={finished}
      />,
    );
    await settle();
    await goIntoFirstRoom(page.root);
    expect(byClass(page.root, 'dungeon-playback')).toHaveLength(1);
    // The fight is on screen: the run is paid, but the balances wait for the end of the fight.
    expect(finished).not.toHaveBeenCalled();
    // The banner, then every beat of the fight, then the rest on the result: one second at a time,
    // so each render and each effect gets its turn.
    for (let i = 0; i < 200 && byClass(page.root, 'dungeon-playback').length > 0; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(visibleText(page.root)).toContain('Defeated: half your pack made it home');
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('still reloads the balances when the player leaves in the middle of that fight', async () => {
    lostFight();
    const finished = vi.fn();
    page = createPage();
    page.draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={noop}
        onCanRunChange={noop}
        onRunFinished={finished}
      />,
    );
    await settle();
    await goIntoFirstRoom(page.root);
    expect(finished).not.toHaveBeenCalled();
    page.unmount();
    page = null;
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('returns to the map after a fight that did not end the run', async () => {
    vi.useFakeTimers();
    const open = sampleState();
    api.fetchDungeonToday.mockResolvedValue(sampleToday({ active: open, canRun: false }));
    api.dungeonAct.mockResolvedValue(sampleActFight());
    const finished = vi.fn();
    page = createPage();
    page.draw(
      <Dungeon
        creatures={creatures}
        forecast={null}
        bait={100}
        draft={null}
        onDraftChange={noop}
        onRunStarted={noop}
        onCanRunChange={noop}
        onRunFinished={finished}
      />,
    );
    await settle();
    await goIntoFirstRoom(page.root);
    expect(byClass(page.root, 'dungeon-playback')).toHaveLength(1);
    for (let i = 0; i < 200 && byClass(page.root, 'dungeon-playback').length > 0; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(byClass(page.root, 'dungeon-playback')).toHaveLength(0);
    expect(byClass(page.root, 'dungeon-run-map')).toHaveLength(1);
    // The run is open still: nothing was paid, nothing to reload.
    expect(finished).not.toHaveBeenCalled();
  });
});

describe('the banner of an elite fight', () => {
  it('names the foe Fierce and tags it Elite, with the floor', () => {
    const room = sampleRoom({ elite: true, node: 'f2l1' });
    const { root } = draw(
      <DungeonPlayback input={roomInput(sampleState().team, room, false, 7)} onDone={noop} />,
    );
    const banner = byClass(root, 'room-banner')[0];
    expect(banner).toBeDefined();
    const text = visibleText(banner as FakeElement);
    expect(text).toContain('FIGHT');
    expect(text).toContain('Room 3 / 7');
    expect(text).toContain('Elite');
    expect(text).toContain('Fierce Bramble Hound');
    expect(visibleText(root)).toContain('Room 3 / 7');
  });

  it('is a plain fight banner for an ordinary room', () => {
    const { root } = draw(
      <DungeonPlayback
        input={roomInput(sampleState().team, sampleRoom(), false, 7)}
        onDone={noop}
      />,
    );
    const text = visibleText(byClass(root, 'room-banner')[0] as FakeElement);
    expect(text).not.toContain('Elite');
    expect(text).not.toContain('Fierce');
    expect(text).toContain('Bramble Hound');
  });
});

describe('the arena comes into view when a fight starts', () => {
  const input = (): ReturnType<typeof roomInput> =>
    roomInput(sampleState().team, sampleRoom(), false, 7);

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('scrolls to the arena (not the page top) once the new screen has laid out', async () => {
    vi.useFakeTimers();
    const { root } = draw(<DungeonPlayback input={input()} onDone={noop} />);
    const arena = byClass(root, 'dungeon-arena')[0] as FakeElement;
    expect(byClass(arena, 'room-banner')).toHaveLength(1);
    expect(arena.scrolled).toBe(0);
    await advance(20);
    expect(arena.scrolled).toBe(1);
    expect(byClass(root, 'dungeon-playback')[0]?.scrolled).toBe(0);
  });

  it('does not scroll again when the banner ends and the arena is still in view', async () => {
    vi.useFakeTimers();
    Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 10, bottom: 420 }));
    const { root } = draw(<DungeonPlayback input={input()} onDone={noop} />);
    const arena = byClass(root, 'dungeon-arena')[0] as FakeElement;
    await advance(ROOM_CARD_MS + 100);
    expect(byClass(arena, 'room-banner')).toHaveLength(0);
    expect(arena.scrolled).toBe(1);
  });

  it('brings the arena back when the fight begins and the page has moved away from it', async () => {
    vi.useFakeTimers();
    Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: -120, bottom: 290 }));
    const { root } = draw(<DungeonPlayback input={input()} onDone={noop} />);
    const arena = byClass(root, 'dungeon-arena')[0] as FakeElement;
    await advance(ROOM_CARD_MS + 100);
    expect(arena.scrolled).toBe(2);
  });

  it('scrolls to the arena in a replay of several rooms (Watch again) too', async () => {
    vi.useFakeTimers();
    const rooms = [sampleRoom(), sampleRoom({ index: 1, node: 'f1l2' })];
    const { root } = draw(
      <DungeonPlayback
        input={{ ...roomInput(sampleState().team, rooms[0] as never, false, 7), rooms }}
        onDone={noop}
      />,
    );
    await advance(20);
    expect((byClass(root, 'dungeon-arena')[0] as FakeElement).scrolled).toBe(1);
  });
});

describe('the arena scroll helper', () => {
  it('is out of view when the arena is cut off at the top or the bottom', () => {
    expect(arenaOutOfView({ top: 8, bottom: 420 }, 700)).toBe(false);
    expect(arenaOutOfView({ top: -1, bottom: 420 }, 700)).toBe(true);
    expect(arenaOutOfView({ top: 300, bottom: 710 }, 700)).toBe(true);
  });

  it('glides to the arena, or jumps for a player who asks for less motion', () => {
    expect(fightScroll(false)).toEqual({ behavior: 'smooth', block: 'start' });
    expect(fightScroll(true)).toEqual({ behavior: 'auto', block: 'start' });
  });
});

describe('the pre-run card', () => {
  function prerun(today: ReturnType<typeof sampleToday>): FakeElement {
    page ??= createPage();
    page.draw(<DungeonPrerun today={today} />);
    return page.root;
  }

  it('shows the map with start markers and no caption or supply line under it', () => {
    const root = prerun(sampleToday());
    expect(byClass(root, 'dungeon-preview')).toHaveLength(1);
    expect(byClass(root, 'dmap-start').length).toBeGreaterThan(0);
    const text = visibleText(root);
    expect(text).not.toContain("Today's map, the same for everyone");
    expect(text).not.toContain('Tap a room to see what is there');
    expect(text).not.toContain('take home a supply');
    expect(byClass(root, 'supply-promise')).toHaveLength(0);
    expect(text).not.toContain('beat the boss to descend');
  });

  it('puts the way-down badge on the floor boss from depth 8, and not before', () => {
    expect(byClass(prerun(sampleToday({ depth: 8 })), 'dmap-descend')).toHaveLength(1);
    page?.unmount();
    page = null;
    expect(byClass(prerun(sampleToday({ depth: 7 })), 'dmap-descend')).toHaveLength(0);
  });
});
