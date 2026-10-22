import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { sampleCreature, sampleRoster } from './creature-card-sample';
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
import { EquipHost } from './equip-from-card';
import { PopoverHost } from './PopoverHost';
import { glossaryEntry } from '@creatures/game';
import {
  SAMPLE_EVENT,
  SAMPLE_KEEPSAKES,
  sampleActFight,
  sampleRoom,
  sampleState,
  sampleCampCreatures,
  sampleStateCamp,
  sampleStateEvent,
  SAMPLE_CURSE,
  SAMPLE_DOOR_TREASURES,
  SAMPLE_TREASURES,
  chasmEvent,
  doorEvent,
  sampleDoorSummary,
  sampleStateCursed,
  sampleChasmSummary,
  sampleStateMid,
  sampleSummary,
  sampleToday,
  omitKey,
} from './dungeon-path-samples';
import type { DungeonAct, DungeonRunState, DungeonTreasureView } from './dungeon-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  FakeElement,
  find,
  visibleText,
  type Page,
} from './test-dom';
import { installDrag } from './test-drag';

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
    // The pack (the backpack, its loot named for a screen reader) and its "?", which says what a defeat costs.
    expect(byName(root, 'ul', /^In your pack:/)).toHaveLength(1);
    expect(byName(root, 'span', 'Bait: 2')).toHaveLength(1);
    expect(byName(root, 'span', 'Scrap: 1')).toHaveLength(1);
    expect(glossaryEntry('dungeon-pack')?.lines.join(' ')).toMatch(/A defeat keeps half/);
    // A keepsake chip, named for what it does.
    expect(byName(root, 'button', /Lantern Moth: Your creatures crit/)).toHaveLength(1);
  });

  it('says the pack is empty, and has no keepsake row when there are none', () => {
    const { root } = draw(<DungeonRunStrip state={sampleState()} />);
    expect(visibleText(byClass(root, 'run-pack')[0] as FakeElement)).toContain('Empty');
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
    // The pack has the same "?", which says what a defeat costs.
    const pack = byClass(root, 'run-pack')[0] as FakeElement;
    expect(byName(pack, 'button', 'What is Pack?')).toHaveLength(1);
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
    expect(byClass(root, 'choice')).toHaveLength(2);
    expect(visibleText(button(root, /Take one coin/))).toBe('Take one coin You gain 1 scrap.');
    expect(visibleText(button(root, /Take the pile/))).toBe(
      'Take the pile 50%: 3 scrap. 50%: every creature loses 20% HP.',
    );
  });

  it('is a pixel panel with its scene as body text, and no `.pix` on single elements', () => {
    const { root } = draw(<DungeonEvent event={SAMPLE_EVENT} busy={false} onPick={noop} />);
    expect(byClass(root, 'reveal-card')[0]?.getAttribute('class')).toContain('pix-panel');
    expect(byClass(root, 'event-scene')[0]?.getAttribute('class')).toContain('prose');
    expect(byClass(root, 'pix')).toHaveLength(0);
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
    expect(byClass(root, 'choice').every((b) => b.hasAttribute('disabled'))).toBe(true);
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
    expect(text).toContain('Standing creatures heal 40% HP.');
    expect(text).toContain('Take a keepsake');
    expect(text).toContain('Swap a creature');
    expect(visibleText(button(root, 'Head home with your pack'))).toBe('Head home with your pack');
    expect(text).toContain('Drag a creature onto another to swap places.');
    // Three choices in the list; the home button is outside it.
    expect(byClass(root, 'choice')).toHaveLength(3);
    expect(byClass(root, 'camp-home')[0]?.textContent).toContain('Head home with your pack');
  });

  it('rests with the row as it stands', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, /^Rest/));
    expect(acts).toEqual([{ type: 'camp', choice: 'rest', order: state.team.map((c) => c.id) }]);
  });

  it("shows the row on the entry board, with each creature's HP under it", () => {
    const root = drawCamp(noop);
    const tiles = byClass(root, 'party-slot');
    expect(tiles).toHaveLength(3);
    const hp = byClass(root, 'slot-hp-text').map((e) => e.textContent);
    expect(hp).toEqual(state.team.map((t) => `${String(t.hp)} / ${String(t.hpMax)} HP`));
    // The one that is down says so in red, with its numbers, and is told apart by more than colour.
    const down = state.team.findIndex((t) => t.hp <= 0);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(byClass(root, 'slot-hp')[down]?.getAttribute('class')).toContain('ko');
    expect(tiles[down]?.getAttribute('aria-label')).toContain('knocked out');
    // The old Left and Right buttons are gone.
    expect(byClass(root, 'run-move')).toHaveLength(0);
  });

  it('sends the new order with the choice after a creature was dragged onto another', () => {
    const dnd = installDrag();
    onTestFinished(dnd.restore);
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    const [a, b, c] = state.team.map((t) => t.id) as [string, string, string];
    const tile = (id: string): FakeElement => {
      const name = state.team.find((t) => t.id === id)?.name ?? '';
      const found = byClass(root, 'party-slot').find((e) =>
        (e.getAttribute('aria-label') ?? '').includes(`: ${name},`),
      );
      if (found === undefined) throw new Error(`no tile for ${name}`);
      return found;
    };
    dnd.drag(page as Page, tile(c), tile(a));
    // The HP moved with the creature: the row now reads c, b, a.
    expect(byClass(root, 'slot-hp-text').map((e) => e.textContent)).toEqual(
      [c, b, a].map((id) => {
        const t = state.team.find((x) => x.id === id);
        return `${String(t?.hp)} / ${String(t?.hpMax)} HP`;
      }),
    );
    page?.click(button(root, /^Rest/));
    expect(acts).toEqual([{ type: 'camp', choice: 'rest', order: [c, b, a] }]);
  });

  it("opens a creature's popover on a tap, with what it wears in this run", () => {
    // The popover listens on the window; the drag helper's fake window takes the listeners.
    onTestFinished(installDrag().restore);
    const root = draw(
      <PopoverHost onOpenHowTo={noop}>
        <DungeonCamp
          team={state.team}
          pack={state.pack}
          camp={camp}
          creatures={owned}
          busy={false}
          onAct={noop}
        />
      </PopoverHost>,
    ).root;
    const worn = state.team.find((c) => c.gear.length > 0);
    if (worn === undefined) throw new Error('the sample team wears nothing');
    const tile = byClass(root, 'party-slot').find((e) =>
      (e.getAttribute('aria-label') ?? '').includes(`: ${worn.name},`),
    );
    if (tile === undefined) throw new Error('no tile');
    expect(tile.getAttribute('aria-label')).toContain('Shows its role, element and gear.');
    page?.click(tile);
    expect(byClass(page?.document.body ?? root, 'gear-list')).toHaveLength(1);
  });

  it('never moves a creature on taps: two taps on two creatures leave the order as it was', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    const [first, , third] = byClass(root, 'party-slot') as [FakeElement, FakeElement, FakeElement];
    page?.click(first);
    page?.click(third);
    expect(first.getAttribute('class')).not.toContain('selected');
    page?.click(button(root, /^Rest/));
    expect(acts).toEqual([{ type: 'camp', choice: 'rest', order: state.team.map((c) => c.id) }]);
  });

  it('opens the two keepsakes, takes one, and can go back', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, /^Take a keepsake/));
    expect(visibleText(root)).toContain("Wayfarer's Charm");
    expect(visibleText(root)).toContain('Every creature gets 12% more Attack and 12% more HP.');
    expect(visibleText(root)).toContain('Foes have 10% less HP.');
    page?.click(button(root, /^‹ Back/));
    expect(visibleText(root)).toContain('Standing creatures heal');
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
    // Picking who goes home does not send anything yet: the new row is arranged first.
    page?.click(button(root, /^Cindle/));
    expect(acts).toEqual([]);
    expect(visibleText(root)).toContain('Arrange your row');
    // The next step opens with the focus on its Back, as every drill-in does.
    expect((byName(root, 'button', /^‹ Back/)[0] as FakeElement).focused).toBeGreaterThan(0);
  });

  it('arranges the row after the swap, with the new creature in place and at full HP, and sends that order', () => {
    const dnd = installDrag();
    onTestFinished(dnd.restore);
    const acts: DungeonAct[] = [];
    const incoming = owned[4]?.id ?? '';
    const out = state.team[2]?.id ?? '';
    const [a, b] = state.team.map((t) => t.id) as [string, string];
    const root = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={owned}
        busy={false}
        onAct={(x) => acts.push(x)}
        initialStep="arrange"
        initialIncoming={incoming}
        initialOut={out}
      />,
    ).root;
    expect(visibleText(root)).toContain('Arrange your row');
    const tiles = byClass(root, 'party-slot');
    expect(tiles).toHaveLength(3);
    // The new creature stands where the one that left stood, at full HP; the others keep their HP.
    expect(byClass(root, 'slot-hp-text').map((e) => e.textContent)[2]).toBe('Full HP');
    expect(byClass(root, 'slot-hp-text').map((e) => e.textContent)[0]).toBe(
      `${String(state.team[0]?.hp)} / ${String(state.team[0]?.hpMax)} HP`,
    );
    // Move the recruit to the left end by dragging it there.
    dnd.drag(page as Page, tiles[2] as FakeElement, tiles[0] as FakeElement);
    expect(byClass(root, 'slot-hp-text').map((e) => e.textContent)[0]).toBe('Full HP');
    page?.click(button(root, 'Swap and push on'));
    expect(acts).toEqual([
      { type: 'camp', choice: 'swap', out, in: incoming, order: [incoming, b, a] },
    ]);
  });

  it('goes back from the arranging step to who goes home, and sends nothing', () => {
    const acts: DungeonAct[] = [];
    const root = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={owned}
        busy={false}
        onAct={(x) => acts.push(x)}
        initialStep="arrange"
        initialIncoming={owned[4]?.id ?? ''}
        initialOut={state.team[2]?.id ?? ''}
      />,
    ).root;
    page?.click(button(root, /^‹ Back/));
    expect(visibleText(root)).toContain('Who goes home?');
    expect(acts).toEqual([]);
  });

  it('puts "‹ Back" at the top of each step, before its choices, and has no Back at the bottom', () => {
    const steps = [
      ['keepsake', 'Take a keepsake', 'to the camp'],
      ['out', 'Who goes home?', 'to the camp'],
      ['arrange', 'Arrange your row', 'to who goes home'],
    ] as const;
    for (const [step, title, to] of steps) {
      const root = draw(
        <DungeonCamp
          team={state.team}
          pack={state.pack}
          camp={camp}
          creatures={owned}
          busy={false}
          onAct={noop}
          initialStep={step}
          initialIncoming={owned[4]?.id ?? ''}
          initialOut={state.team[2]?.id ?? ''}
        />,
      ).root;
      const head = byClass(root, 'drill-head')[0] as FakeElement;
      expect(head, step).toBeDefined();
      expect(visibleText(head), step).toContain('‹ Back');
      expect(visibleText(head), step).toContain(title);
      expect(byName(head, 'button', `‹ Back ${to}`), step).toHaveLength(1);
      // The head is the first thing in the step and the only Back there is.
      const buttons = byName(root, 'button', /Back/);
      expect(buttons, step).toHaveLength(1);
      expect(byClass(root, 'camp-step')[0]?.childNodes[0], step).toBe(head);
      // The step opens with the focus on Back, so Escape has something to hear it.
      expect((byName(head, 'button', /Back/)[0] as FakeElement).focused, step).toBeGreaterThan(0);
    }
  });

  it('goes back one step on Escape, like Back, and not while an act is running', () => {
    const acts: DungeonAct[] = [];
    const root = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={owned}
        busy={false}
        onAct={(x) => acts.push(x)}
        initialStep="arrange"
        initialIncoming={owned[4]?.id ?? ''}
        initialOut={state.team[2]?.id ?? ''}
      />,
    ).root;
    page?.key(byClass(root, 'camp-step')[0] as FakeElement, 'Escape');
    expect(visibleText(root)).toContain('Who goes home?');
    page?.key(byClass(root, 'camp-step')[0] as FakeElement, 'Escape');
    expect(visibleText(root)).toContain('Standing creatures heal');
    expect(acts).toEqual([]);
    const busy = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={owned}
        busy={true}
        onAct={noop}
        initialStep="keepsake"
      />,
    ).root;
    page?.key(byClass(busy, 'camp-step')[0] as FakeElement, 'Escape');
    expect(visibleText(busy)).toContain('Take a keepsake');
    expect(byName(busy, 'button', /^‹ Back/)[0]?.hasAttribute('disabled')).toBe(true);
  });

  it('is a pixel panel: the font is set once on the card, and its reading text keeps the body font', () => {
    const root = drawCamp(noop);
    const card = byClass(root, 'reveal-card')[0] as FakeElement;
    expect(card.getAttribute('class')).toContain('pix-panel');
    // No `.pix` on single elements any more (the choice names inherit the panel's font).
    expect(byClass(root, 'pix')).toHaveLength(0);
    expect(byClass(card, 'prose').length).toBeGreaterThan(0);
  });

  it('cannot swap when the player has nobody outside the row, and says why', () => {
    const root = drawCamp(noop, { creatures: owned.slice(0, 0) });
    expect(button(root, /^Swap a creature/).hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('You have no other creatures to bring in.');
  });

  it('says nobody is left to swap in when the player owns only the row (the workbench preset)', () => {
    const root = drawCamp(noop, { creatures: sampleCampCreatures(3) });
    expect(button(root, /^Swap a creature/).hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('You have no other creatures to bring in.');
  });

  it('asks once more before heading home, then ends the run and keeps the pack', () => {
    const acts: DungeonAct[] = [];
    const root = drawCamp((a) => acts.push(a));
    page?.click(button(root, 'Head home with your pack'));
    expect(acts).toEqual([]);
    expect(visibleText(root)).toContain('You keep your whole pack:');
    // The pack is badges, not a sentence.
    const kept = byName(root, 'ul', 'Your pack')[0];
    expect(byName(kept as FakeElement, 'span', 'Bait: 2')).toHaveLength(1);
    expect(byName(kept as FakeElement, 'span', 'Scrap: 1')).toHaveLength(1);
    page?.click(button(root, 'Not yet'));
    expect(visibleText(button(root, 'Head home with your pack'))).toBe('Head home with your pack');
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
    expect(byClass(root, 'run-row')).toHaveLength(1);
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
    // The row is the camp card's own (to rearrange): the strip above does not show it a second time.
    expect(byClass(root, 'run-row')).toHaveLength(0);
    expect(byClass(root, 'party-slot')).toHaveLength(3);
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

  /** The same, inside the popover host, so a glossary tag is the button it is in the game. */
  function resultsWithHelp(run: ReturnType<typeof sampleSummary>): FakeElement {
    page ??= createPage();
    page.draw(
      <PopoverHost onOpenHowTo={noop}>
        <DungeonResults
          run={run}
          today={today}
          offset={0}
          canRetry={false}
          busy={false}
          error={null}
          onWatch={noop}
          onRetry={noop}
        />
      </PopoverHost>,
    );
    return page.root;
  }

  const titleOf = (root: FakeElement): FakeElement =>
    byClass(root, 'result-title')[0] as FakeElement;

  /** The creatures of a run's team as the server paid them experience: one level up with a treat, one plain, one waiting. */
  function withExperience(run: ReturnType<typeof sampleSummary>): ReturnType<typeof sampleSummary> {
    const [a, b, c] = run.team.map((m) => m.id) as [string, string, string];
    const base = { treatTimes: null, dayEffects: [], gold: false, waiting: false, treat: false };
    return {
      ...run,
      rewards: {
        ...run.rewards,
        experience: [
          {
            ...base,
            creatureId: a,
            gained: 260,
            treat: true,
            treatTimes: 2,
            levelBefore: 7,
            level: 8,
            exp: 90,
            needed: 330,
          },
          { ...base, creatureId: b, gained: 130, levelBefore: 7, level: 7, exp: 190, needed: 330 },
          {
            ...base,
            creatureId: c,
            gained: 90,
            levelBefore: 10,
            level: 10,
            exp: 380,
            needed: 380,
            waiting: true,
          },
        ],
      },
    };
  }

  it('says how a cleared run ended: a green title, one summing-up line, and the rewards as badges only', () => {
    const root = results(sampleSummary('cleared'));
    const text = visibleText(root);
    expect(visibleText(titleOf(root))).toBe('Cleared!');
    expect(titleOf(root).getAttribute('class')).toContain('good');
    expect(text).toContain(
      'You defeated the floor boss and advanced to depth 4. You brought your whole pack home.',
    );
    // The old depth sentence and the pack line are gone.
    expect(text).not.toContain('Depth 3 to 4');
    expect(text).not.toContain('Pack:');
    expect(text).not.toContain('half kept');
    expect(find(root, (e) => e.localName === 's')).toHaveLength(0);
    // The loot pile picture is gone: only the badges (with their "?" help) show.
    expect(byClass(root, 'reward-pile')).toHaveLength(0);
    expect(byClass(root, 'reward-badges')).toHaveLength(1);
    expect(visibleText(byClass(root, 'reward-badges')[0] as FakeElement)).toContain('3');
  });

  it('puts the keepsakes under the team, as chips, and not in the rewards', () => {
    const root = results(sampleSummary('cleared'));
    const text = visibleText(root);
    expect(text.indexOf('Your team')).toBeGreaterThan(-1);
    expect(text.indexOf('Keepsakes')).toBeGreaterThan(text.indexOf('Your team'));
    expect(text.indexOf('Keepsakes')).toBeLessThan(text.indexOf('Next run'));
    const rewards = byClass(root, 'reward-row')[0] as FakeElement;
    expect(visibleText(rewards)).not.toContain('Keepsakes');
    // The keepsake is a chip, not a sentence: its text is in the tap.
    expect(byName(root, 'button', /^Lantern Moth: Your creatures crit/)).toHaveLength(1);
    expect(text).not.toContain('Your creatures crit 5 points more often.');
  });

  it('does not repeat the title in a badge, and says nothing about an empty pack beyond the rewards note', () => {
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
    expect(visibleText(empty)).toContain('with an empty pack.');
    expect(visibleText(empty)).not.toContain('half of your loot pack');
  });

  it('says home safe in green and defeated in red, in their own words', () => {
    const homeRoot = results(sampleSummary('home'));
    expect(visibleText(titleOf(homeRoot))).toBe('Home safe');
    expect(titleOf(homeRoot).getAttribute('class')).toContain('good');
    expect(visibleText(homeRoot)).toContain(
      'You headed home from the camp with your whole pack. You stay at depth 3.',
    );
    const root = results(sampleSummary('defeat'));
    expect(visibleText(titleOf(root))).toBe('Defeated');
    expect(titleOf(root).getAttribute('class')).toContain('bad');
    expect(visibleText(root)).toContain(
      'You were defeated in room 3 / 7 and kept half of your loot pack.',
    );
    expect(visibleText(root)).not.toContain('Defeated:');
  });

  it('says a loss below the floor boss was in the Undercroft', () => {
    const root = results({ ...sampleSummary('defeat'), cleared: true, newDepth: 4 });
    expect(visibleText(titleOf(root))).toBe('Lost in the Undercroft');
    expect(titleOf(root).getAttribute('class')).toContain('bad');
    expect(visibleText(root)).toContain(
      'You defeated the first floor boss and advanced to depth 4. You were defeated in the Undercroft and kept half of your loot pack.',
    );
  });

  it('has a Map and Rooms switch for a run with a route, and shows the map first', () => {
    const root = results(sampleSummary('cleared'));
    const map = button(root, 'Map');
    const rooms = button(root, 'Rooms');
    expect(byName(root, 'button', 'Fights')).toHaveLength(0);
    expect(map.getAttribute('aria-pressed')).toBe('true');
    expect(rooms.getAttribute('aria-pressed')).toBe('false');
    // The map is the left button.
    const toggle = byClass(root, 'route-toggle')[0] as FakeElement;
    expect(byName(toggle, 'button', /.*/).map((b) => visibleText(b))).toEqual(['Map', 'Rooms']);
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    expect(byClass(root, 'dmap')).toHaveLength(1);
  });

  it('swaps to the map of the route: the walked rooms visited, no Go, and to the rooms and back', () => {
    const run = sampleSummary('cleared');
    const root = results(run);
    const nodes = byClass(root, 'dmap-node');
    expect(nodes).toHaveLength(run.route?.map.nodes.length ?? -1);
    const visited = nodes.filter((n) => (n.getAttribute('class') ?? '').includes('s-visited'));
    expect(visited).toHaveLength(run.route?.path.length ?? -1);
    expect(nodes.some((n) => (n.getAttribute('class') ?? '').includes('s-unreachable'))).toBe(
      false,
    );
    expect(nodes.some((n) => (n.getAttribute('class') ?? '').includes('s-reachable'))).toBe(false);
    expect(byName(root, 'button', /^Go/)).toHaveLength(0);
    page?.click(button(root, 'Rooms'));
    expect(button(root, 'Rooms').getAttribute('aria-pressed')).toBe('true');
    expect(byClass(root, 'dmap')).toHaveLength(0);
    expect(byClass(root, 'room-strip')).toHaveLength(1);
    page?.click(button(root, 'Map'));
    expect(byClass(root, 'room-strip')).toHaveLength(0);
    expect(byClass(root, 'dmap')).toHaveLength(1);
  });

  it('lists every room of a cleared run in order, not only the fights; only the fights are Cleared', () => {
    const run = sampleSummary('cleared');
    const root = results(run);
    page?.click(button(root, 'Rooms'));
    const panels = byClass(root, 'room-panel');
    // Seven rooms: four fights (one an elite, the last the floor boss), a mystery room, the camp and a cache.
    expect(panels).toHaveLength(run.route?.path.length ?? -1);
    expect(panels.map((p) => p.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Room 1: .*Cleared\.$/),
      'Room 2: Glowing Pool. You gain 1 scrap.',
      expect.stringMatching(/^Room 3 · Elite: Fierce .*Cleared\.$/),
      'Room 4: Camp. Rested.',
      'Room 5: Cache. 1 Bait · 1 Scrap.',
      expect.stringMatching(/^Room 6: .*Cleared\.$/),
      expect.stringMatching(/^Room 7 · Floor boss: Drowned Warden, Thorns\. Cleared\.$/),
    ]);
    const text = visibleText(byClass(root, 'room-strip')[0] as FakeElement);
    // A stamp on the four fights only: a mystery room, the camp and a cache have none.
    expect(text.match(/CLEARED/g)).toHaveLength(4);
    expect(text).not.toContain('DEFEATED');
    // A line of what happened in the rooms that are not fights, as text.
    expect(text).toContain('Rested');
    expect(text).toContain('1 Bait · 1 Scrap');
    expect(text).toContain('You gain 1 scrap.');
  });

  it('marks the room the run fell in as Defeated, and every room before it Cleared', () => {
    const root = results(sampleSummary('defeat'));
    page?.click(button(root, 'Rooms'));
    const panels = byClass(root, 'room-panel');
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => (p.getAttribute('class') ?? '').split(' ')[1])).toEqual([
      'cleared',
      'cleared',
      'defeat',
    ]);
    expect(visibleText(panels[2] as FakeElement)).toContain('DEFEATED');
    expect(visibleText(panels[2] as FakeElement)).toContain('HP left');
    expect(panels[2]?.getAttribute('aria-label')).toMatch(/Defeated\.$/);
    expect(panels[0]?.getAttribute('aria-label')).toMatch(/Cleared\.$/);
  });

  it('lists the rooms of a run that headed home from the camp, the camp last and not stamped', () => {
    const root = results(sampleSummary('home'));
    page?.click(button(root, 'Rooms'));
    const panels = byClass(root, 'room-panel');
    expect(panels).toHaveLength(4);
    expect(panels[3]?.getAttribute('aria-label')).toBe('Room 4: Camp. Rested.');
    expect(byClass(panels[3] as FakeElement, 'rp-banner')).toHaveLength(0);
  });

  /** What an experience bar says to a screen reader. */
  const barOf = (member: FakeElement): string | null =>
    find(member, (e) => e.getAttribute('role') === 'progressbar')[0]?.getAttribute(
      'aria-valuetext',
    ) ?? null;

  it('shows each creature with the shared experience row: its name, levels, +N, the multiplier and the bar', () => {
    const run = withExperience(sampleSummary('cleared'));
    const root = results(run);
    const members = byClass(root, 'team-member');
    expect(members).toHaveLength(3);
    // One list under the team's row, headed "Experience", a row for each creature in the same order.
    const list = byClass(root, 'team-xp')[0] as FakeElement;
    expect(visibleText(byClass(list, 'xp-caption')[0] as FakeElement)).toBe('Experience');
    const rows = byClass(list, 'xp-row');
    expect(rows).toHaveLength(3);
    // A level up with a treat: Sproutle, Lv 7 to 8, Level up!, +260, the 2x chip, the bar.
    const first = visibleText(rows[0] as FakeElement);
    expect(first).toContain('Sproutle');
    expect(first).toContain('Lv 7 → 8');
    expect(first).toContain('+260');
    expect(first).toContain('Level up!');
    expect(visibleText(byClass(rows[0] as FakeElement, 'xp-times')[0] as FakeElement)).toBe('2x');
    expect(barOf(rows[0] as FakeElement)).toBe('90 / 330, +260');
    expect(byRole(rows[0] as FakeElement, 'progressbar')[0]?.getAttribute('aria-label')).toBe(
      "Sproutle's experience",
    );
    // The old prose is gone, and so is the worded Treat tag (the chip's breakdown says it).
    expect(first).not.toContain('Treat');
    expect(first).not.toContain('+260 experience');
    // No level up, no treat: the plain gain and the bar; no Level up! and no multiplier.
    const second = visibleText(rows[1] as FakeElement);
    expect(barOf(rows[1] as FakeElement)).toBe('190 / 330, +130');
    expect(second).toContain('+130');
    expect(second).not.toContain('Level up!');
    expect(byClass(rows[1] as FakeElement, 'xp-boost')).toHaveLength(0);
    // A creature waiting at its level says so, shortly.
    expect(visibleText(rows[2] as FakeElement)).toContain('Waiting');
    // A creature with its row shows no separate level under its HP.
    expect(byClass(members[0] as FakeElement, 'tm-level')).toHaveLength(0);
    // The old sentence is gone.
    expect(visibleText(root)).not.toContain('(treat)');
    expect(visibleText(root)).not.toContain('level 7 to 8');
  });

  it('lists one sent home at a camp too', () => {
    const run = withExperience(sampleSummary('cleared'));
    const [a, b, c] = run.team.map((m) => m.id) as [string, string, string];
    const [pa, pb, pc] = run.rewards.experience ?? [];
    if (pa === undefined || pb === undefined || pc === undefined) throw new Error('sample');
    const root = results({
      ...run,
      rewards: {
        ...run.rewards,
        experience: [...(run.rewards.experience ?? []), { ...pa, creatureId: 'gone', gained: 70 }],
        recap: [
          { creatureId: a, name: 'A', speciesId: 'cindle' },
          { creatureId: b, name: 'B', speciesId: 'cindle' },
          { creatureId: c, name: 'C', speciesId: 'cindle' },
          { creatureId: 'gone', name: 'Pip', speciesId: 'cindle' },
        ],
      },
    });
    const rows = byClass(byClass(root, 'team-xp')[0] as FakeElement, 'xp-row');
    expect(rows).toHaveLength(4);
    // No reason line under any bar: just the experience.
    expect(byClass(root, 'xp-note')).toHaveLength(0);
    // The creature that is not in the final row is there, by its recap name, tagged.
    const gone = visibleText(rows[3] as FakeElement);
    expect(gone).toContain('Pip');
    expect(gone).toContain('Went home');
    expect(gone).toContain('+70');
    expect(visibleText(rows[0] as FakeElement)).not.toContain('Went home');
    // The team's row of sprites is still the three that finished.
    expect(byClass(root, 'team-member')).toHaveLength(3);
  });

  it("puts the day's Boons and Omens into the multiplier, never a line under the row", () => {
    const run = withExperience(sampleSummary('cleared'));
    const [paid] = run.rewards.experience ?? [];
    if (paid === undefined) throw new Error('the sample pays experience');
    const root = results({
      ...run,
      rewards: {
        ...run.rewards,
        experience: [{ ...paid, dayEffects: [{ name: 'Cold Snap', bp: -2000 }] }],
      },
    });
    const rows = byClass(byClass(root, 'team-xp')[0] as FakeElement, 'xp-row');
    expect(rows).toHaveLength(1);
    expect(visibleText(rows[0] as FakeElement)).not.toContain('Cold Snap');
    expect(visibleText(rows[0] as FakeElement)).not.toContain('gave');
    // Treat 2x and Cold Snap -20%: 1.6x.
    expect(visibleText(byClass(rows[0] as FakeElement, 'xp-times')[0] as FakeElement)).toBe('1.6x');
  });

  it('shows a creature the run paid nothing only its level, with no row', () => {
    const base = sampleSummary('cleared');
    const rewards = { ...base.rewards };
    delete rewards.experience;
    const root = results({ ...base, rewards });
    expect(byClass(root, 'team-xp')).toHaveLength(0);
    const members = byClass(root, 'team-member');
    expect(members.every((m) => byClass(m, 'tm-level').length === 1)).toBe(true);
  });

  it('keeps the HP line, red for a creature that is down', () => {
    const run = sampleSummary('defeat');
    const root = results({
      ...run,
      team: run.team.map((m, i) => (i === 0 ? { ...m, hpEnd: 0 } : m)),
    });
    const members = byClass(root, 'team-member');
    expect(members[0]?.getAttribute('class')).toContain('ko');
    expect(visibleText(members[0] as FakeElement)).toContain(
      `0 / ${String(run.team[0]?.hpMax)} HP`,
    );
  });

  it('opens what happened in a room when it is tapped on the results map', () => {
    const root = results(sampleSummary('defeat'));
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

  it('says when the day resets and in how long, without naming the timezone', () => {
    const root = results(sampleSummary('cleared'));
    const next = byClass(root, 'dungeon-next')[0] as FakeElement;
    const line = byName(next, 'p', /^Resets at /)[0] as FakeElement;
    expect(visibleText(line)).toMatch(/^Resets at [A-Z][a-z]{2} \d{1,2}:\d{2}, in \d/);
    expect(visibleText(next)).not.toContain('Europe/');
  });

  it('lists gear as find boxes under the resources, with no "?" on the resource badges', () => {
    const base = sampleSummary('cleared');
    const gear = [
      { id: 'g1', baseId: 'kelp-cap', rarity: 'common' as const, itemLevel: 4 },
      { id: 'g2', baseId: 'forge-scarf', rarity: 'rare' as const, itemLevel: 6 },
    ];
    const root = resultsWithHelp({ ...base, rewards: { ...base.rewards, gear } });
    expect(byClass(root, 'find-row')).toHaveLength(2);
    const badges = byClass(root, 'reward-badges')[0] as FakeElement;
    const tags = find(badges, (e) => e.localName === 'button');
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => (t.getAttribute('class') ?? '').includes('gtag-chip'))).toBe(true);
  });

  it('gives the streak bonus its own titled section with the gift, and no lone parts under the gear', () => {
    const base = sampleSummary('cleared');
    const root = results({
      ...base,
      rewards: {
        ...base.rewards,
        streak: { day: 7, bait: 0, essence: 1, parts: { scrap: 1 } },
      },
    });
    const section = byClass(root, 'streak-bonus')[0] as FakeElement;
    expect(visibleText(byName(section, 'h4', /Streak Bonus/)[0] as FakeElement)).toBe(
      '7 Day Streak Bonus',
    );
    expect(byClass(section, 'sprite').length).toBeGreaterThan(0);
    const badges = byClass(section, 'reward-badges')[0] as FakeElement;
    expect(byClass(badges, 'part-count')).toHaveLength(2);
    // The old sentence is gone, and the bonus is not drawn as a loot list of its own.
    expect(visibleText(root)).not.toContain('streak bonus:');
    expect(byClass(root, 'loot-parts')).toHaveLength(0);
  });

  it('has no streak section when the run paid no bonus', () => {
    const root = results(sampleSummary('cleared'));
    expect(byClass(root, 'streak-bonus')).toHaveLength(0);
  });

  it('shows the streak as a titled row: "Streak" with a help button, the days, then the reset line', () => {
    const root = resultsWithHelp(sampleSummary('cleared'));
    const next = byClass(root, 'dungeon-next')[0] as FakeElement;
    const title = byClass(next, 'dungeon-streak-title')[0] as FakeElement;
    expect(title.localName).toBe('h5');
    expect(visibleText(title)).toContain('Streak');
    const help = find(title, (e) => e.localName === 'button')[0] as FakeElement;
    expect(help.getAttribute('aria-label')).toMatch(/^What is /);
    const streak = byClass(next, 'dungeon-streak')[0] as FakeElement;
    const order = (streak.childNodes as FakeElement[]).map((n) => n.getAttribute('class') ?? '');
    expect(order[0]).toContain('dungeon-streak-title');
    expect(order[1]).toContain('streak-track');
    expect(order[2]).toContain('dungeon-streak-reset');
  });

  it('has no empty-rewards note when the run paid something', () => {
    const root = results(sampleSummary('cleared'));
    expect(byClass(root, 'no-rewards')).toHaveLength(0);
    expect(visibleText(root)).not.toContain('No rewards this time.');
  });

  it('says a room the run did not go to was not visited', () => {
    const root = results(sampleSummary('home'));
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

  it('keeps a plain title and line for a run from before the map', () => {
    const old = { ...sampleSummary('cleared') } as Record<string, unknown>;
    for (const key of ['outcome', 'path', 'pack', 'keepsakes', 'route']) delete old[key];
    const root = results(old as unknown as ReturnType<typeof sampleSummary>);
    expect(visibleText(titleOf(root))).toBe('Cleared!');
    expect(visibleText(root)).toContain('You cleared all 4 rooms and went from depth 3 to 4.');
    expect(visibleText(root)).not.toContain('Pack');
    expect(byName(root, 'button', 'Map')).toHaveLength(0);
    expect(byClass(root, 'badge')).toHaveLength(0);
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
    expect(visibleText(page.root)).toContain('Home safe');
    expect(visibleText(page.root)).toContain('You headed home from the camp with your whole pack.');
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
    expect(visibleText(page.root)).toContain('Defeated');
    expect(visibleText(page.root)).toContain('kept half of your loot pack.');
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

describe('the Blue Chasm', () => {
  it('shows its treasure between the scene and the choice, for every kind of prize', () => {
    for (const treasure of Object.values(SAMPLE_TREASURES)) {
      page?.unmount();
      page = createPage();
      page.draw(<DungeonEvent event={chasmEvent(treasure)} busy={false} onPick={noop} />);
      const root = page.root;
      const text = visibleText(root);
      expect(text).toContain('Blue Chasm');
      expect(text).toContain('A narrow wooden plank crosses a bottomless chasm');
      expect(text).toContain('The treasure');
      expect(byClass(root, 'event-treasure')).toHaveLength(1);
      expect(byClass(root, 'dungeon-treasure').length).toBeGreaterThan(0);
      // The prize sits before the two choices in the card.
      expect(text.indexOf('The treasure')).toBeLessThan(text.indexOf('Cross the plank'));
      // The odds are in the option itself.
      expect(visibleText(button(root, /Cross the plank/))).toContain('50%');
      expect(visibleText(button(root, /Don't risk it/))).toContain('Nothing happens.');
    }
  });

  it('draws the prize as the find it is: the piece, the blueprint, the supplies or the shards', () => {
    const shown = (treasure: (typeof SAMPLE_TREASURES)[keyof typeof SAMPLE_TREASURES]): string => {
      page?.unmount();
      page = createPage();
      page.draw(<DungeonEvent event={chasmEvent(treasure)} busy={false} onPick={noop} />);
      return visibleText(byClass(page.root, 'event-treasure')[0] as FakeElement);
    };
    expect(shown(SAMPLE_TREASURES.gear)).toContain('Epic');
    expect(shown(SAMPLE_TREASURES.blueprint)).toContain('Blueprint: Felt Hat');
    expect(shown(SAMPLE_TREASURES.supplies)).toMatch(/2/);
    expect(shown(SAMPLE_TREASURES.shards)).toMatch(/2/);
  });

  describe('inspecting the Epic piece before choosing', () => {
    const drawRoom = (treasure: DungeonTreasureView): Page => {
      Reflect.set(globalThis, 'window', {
        innerHeight: 800,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      });
      page?.unmount();
      page = createPage();
      page.draw(
        <PopoverHost onOpenHowTo={noop}>
          <EquipHost creatures={[sampleCreature('growing')]} onEquip={noop}>
            <DungeonEvent event={chasmEvent(treasure)} busy={false} onPick={noop} />
          </EquipHost>
        </PopoverHost>,
      );
      return page;
    };

    it('opens the full item card with the real stats and lines, and no Equip button', () => {
      const p = drawRoom(SAMPLE_TREASURES.gear);
      const row = byClass(p.root, 'find-row-button')[0] as FakeElement;
      p.click(row);
      expect(byClass(p.root, 'idc')).toHaveLength(1);
      const card = SAMPLE_TREASURES.gear.card;
      const text = visibleText(byClass(p.root, 'idc')[0] as FakeElement);
      expect(card.stats.length).toBeGreaterThan(0);
      expect(text).toContain('HP 70');
      for (const line of card.lines) expect(text).toContain(line.text);
      // Not owned: no Equip, though an Equip host is there.
      expect(byClass(p.root, 'pop-action').filter((b) => visibleText(b) === 'Equip')).toHaveLength(
        0,
      );
    });

    it('stays a plain row when the room has no card (a room saved before it)', () => {
      const bare = omitKey(SAMPLE_TREASURES.gear, 'card');
      const p = drawRoom(bare);
      expect(byClass(p.root, 'find-row-button')).toHaveLength(0);
      expect(visibleText(p.root)).toContain('Epic');
    });
  });

  it('shows no treasure block in a room that has none, and picks like any room', () => {
    page = createPage();
    page.draw(<DungeonEvent event={SAMPLE_EVENT} busy={false} onPick={noop} />);
    expect(byClass(page.root, 'event-treasure')).toHaveLength(0);
    const picked: (0 | 1)[] = [];
    page.draw(
      <DungeonEvent
        event={chasmEvent()}
        busy={false}
        onPick={(o) => {
          picked.push(o);
        }}
      />,
    );
    page.click(button(page.root, /Cross the plank/));
    page.click(button(page.root, /Don't risk it/));
    expect(picked).toEqual([0, 1]);
  });

  const today = sampleToday();
  const results = (run: ReturnType<typeof sampleChasmSummary>): FakeElement => {
    page?.unmount();
    page = createPage();
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
  };

  it('shows a won blueprint on the end screen as a find, and no lost-treasure note', () => {
    const root = results(sampleChasmSummary('won'));
    const text = visibleText(root);
    expect(text).toContain('Blueprint: Felt Hat');
    expect(byClass(root, 'treasure-lost')).toHaveLength(0);
  });

  it('says a treasure taken and then lost with the run was lost, and shows what it was', () => {
    const root = results(sampleChasmSummary('lost'));
    const lost = byClass(root, 'treasure-lost')[0] as FakeElement;
    expect(visibleText(lost)).toContain('Treasure lost');
    expect(visibleText(lost)).toContain('a defeat keeps nothing of it');
    expect(byClass(lost, 'find-row')).toHaveLength(1);
  });

  it('shows the fall as the room of a defeat, with what the plank did', () => {
    const run = sampleChasmSummary('fell');
    const root = results(run);
    expect(run.outcome).toBe('defeat');
    expect(byClass(root, 'treasure-lost')).toHaveLength(0);
    // The route names the room and the line of what happened in it.
    page?.click(button(root, /Rooms/));
    const text = visibleText(root);
    expect(text).toContain('Blue Chasm');
    expect(text).toContain('the whole team falls into the chasm');
  });
});

describe('the Cursed Idol curse on the run', () => {
  it('shows the curse as a warning note under the pack and keepsakes, with its plain line', () => {
    const { root } = draw(<DungeonRunStrip state={sampleStateCursed()} />);
    const notes = byClass(root, 'run-curse');
    expect(notes).toHaveLength(1);
    const text = visibleText(notes[0] as FakeElement);
    expect(text).toContain('Curse');
    expect(text).toContain("Idol's Curse.");
    expect(text).toContain(SAMPLE_CURSE.description);
    expect(text).toContain('Until the run ends.');
    // A warning note (not an error), with a chip that opens the glossary entry.
    expect(byClass(root, 'alert').length).toBeGreaterThan(0);
    expect(glossaryEntry('curse')?.title).toBe('Curse');
  });

  it('shows no curse note on a run without one', () => {
    const { root } = draw(<DungeonRunStrip state={sampleStateMid()} />);
    expect(byClass(root, 'run-curse')).toHaveLength(0);
    expect(byClass(root, 'run-curses')).toHaveLength(0);
  });

  it('shows the curse on the end screen next to the keepsakes', () => {
    const run = { ...sampleSummary('home'), curses: [SAMPLE_CURSE] };
    const { root } = draw(
      <DungeonResults
        run={run}
        today={sampleToday()}
        offset={0}
        canRetry={false}
        busy={false}
        error={null}
        onWatch={noop}
        onRetry={noop}
      />,
    );
    expect(visibleText(byClass(root, 'run-curse')[0] as FakeElement)).toContain(
      'Foes deal 20% more damage.',
    );
  });
});

describe('the Hungry Door', () => {
  it('shows its Rare-tier treasure between the scene and the choice, with the exact outcomes', () => {
    for (const treasure of Object.values(SAMPLE_DOOR_TREASURES)) {
      page?.unmount();
      page = createPage();
      page.draw(<DungeonEvent event={doorEvent(treasure)} busy={false} onPick={noop} />);
      const root = page.root;
      const text = visibleText(root);
      expect(text).toContain('Hungry Door');
      expect(byClass(root, 'event-treasure')).toHaveLength(1);
      expect(text.indexOf('The treasure')).toBeLessThan(text.indexOf('Feed it'));
      expect(visibleText(button(root, /Feed it/))).toContain('highest-level creature goes home');
      expect(visibleText(button(root, /Pry it open/))).toContain('40%');
      expect(visibleText(button(root, /Pry it open/))).toContain('60%');
    }
    expect(SAMPLE_DOOR_TREASURES.gear.rarity).toBe('rare');
  });

  it('opens the full item card of the Rare piece before choosing, with no Equip button', () => {
    Reflect.set(globalThis, 'window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const p = draw(
      <PopoverHost onOpenHowTo={noop}>
        <EquipHost creatures={[sampleCreature('growing')]} onEquip={noop}>
          <DungeonEvent event={doorEvent()} busy={false} onPick={noop} />
        </EquipHost>
      </PopoverHost>,
    );
    p.click(byClass(p.root, 'find-row-button')[0] as FakeElement);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    const text = visibleText(byClass(p.root, 'idc')[0] as FakeElement);
    for (const line of SAMPLE_DOOR_TREASURES.gear.card.lines) expect(text).toContain(line.text);
    expect(byClass(p.root, 'pop-action').filter((b) => visibleText(b) === 'Equip')).toHaveLength(0);
  });

  it('turns Feed it off with the reason when only one creature stands, and Pry it open still picks', () => {
    const picked: (0 | 1)[] = [];
    const { root } = draw(
      <DungeonEvent
        event={doorEvent(undefined, 'Needs two creatures standing.')}
        busy={false}
        onPick={(o) => {
          picked.push(o);
        }}
      />,
    );
    const feed = button(root, /Feed it/);
    expect(visibleText(feed)).toContain('Needs two creatures standing.');
    expect(feed.hasAttribute('disabled')).toBe(true);
    expect(button(root, /Pry it open/).hasAttribute('disabled')).toBe(false);
    page?.click(feed);
    page?.click(button(root, /Pry it open/));
    expect(picked).toEqual([1]);
  });

  it('says on the end screen which creature went home, with the treasure it bought', () => {
    const run = sampleDoorSummary();
    const { root } = draw(
      <DungeonResults
        run={run}
        today={sampleToday()}
        offset={0}
        canRetry={false}
        busy={false}
        error={null}
        onWatch={noop}
        onRetry={noop}
      />,
    );
    page?.click(button(root, /Rooms/));
    const text = visibleText(root);
    expect(text).toContain('Hungry Door');
    expect(text).toContain('Pip heads home. You take the treasure.');
  });
});
