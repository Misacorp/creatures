import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import {
  byClass,
  byName,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { DEFAULT_BOARD_SETTINGS, buildBoard, type BoardSettings } from './board';
import { HomePage } from './HomePage';
import { HomeScreen } from './HomeScreen';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(
  state: string,
  settings: BoardSettings = DEFAULT_BOARD_SETTINGS,
  options: { raid?: boolean; onGo?: (place: string) => void; room?: boolean } = {},
): Page {
  const drawn = createPage();
  page = drawn;
  drawn.draw(
    <HomePage
      input={homeInput(state, options.raid ?? true)}
      settings={settings}
      onGo={options.onGo ?? (() => undefined)}
      room={options.room === true ? <div class="the-room">room</div> : undefined}
    />,
  );
  return drawn;
}

const headings = (root: FakeElement): string[] =>
  find(root, (el) => el.localName === 'h3').map((h) => h.textContent.trim());

describe('HomePage', () => {
  it('has the three sections of the Today board on a busy day, with real times', () => {
    const p = draw('busy');
    expect(headings(p.root)).toEqual(['Needs you', 'Coming up']);
    const text = visibleText(p.root);
    expect(text).toContain('The valley today');
    expect(text).toContain('Games lock');
    expect(text).toContain('Raid: Phase 2');
    expect(text).toContain('Raid finale');
    expect(text).toContain('Sun 20:00');
    // One notice button per place that needs the player.
    expect(byClass(p.root, 'hb-need').map((b) => b.getAttribute('data-place'))).toEqual([
      'games',
      'raid',
      'expeditions',
      'workshop',
      'dungeon',
      'collection',
    ]);
  });

  it('opens the place of a notice when it is tapped', () => {
    const onGo = vi.fn();
    const p = draw('busy', DEFAULT_BOARD_SETTINGS, { onGo });
    p.click(first(byName(p.root, 'button', /^Workshop/)));
    expect(onGo).toHaveBeenCalledWith('workshop');
  });

  it('tells the Creatures notice to open with the Needs you filter, and the others plainly', () => {
    const onGo = vi.fn();
    const p = draw('busy', DEFAULT_BOARD_SETTINGS, { onGo });
    expect(
      visibleText(
        first(
          byClass(p.root, 'hb-need').filter((b) => b.getAttribute('data-place') === 'collection'),
        ),
      ),
    ).toContain('can evolve');
    p.click(first(byName(p.root, 'button', /^Creatures/)));
    expect(onGo).toHaveBeenLastCalledWith('collection', true);
  });

  it('has a round pin in the corner, named "Your creatures", that opens the Creatures view', () => {
    const onGo = vi.fn();
    const p = draw('nothing waiting', DEFAULT_BOARD_SETTINGS, { onGo });
    const [pin, ...others] = byName(p.root, 'button', 'Your creatures');
    expect(others).toEqual([]);
    expect(pin?.getAttribute('class')).toContain('hb-starter');
    // The pin is the first thing in the cork, drawn under the papers in the document and over them by the stylesheet.
    p.click(first(byName(p.root, 'button', 'Your creatures')));
    expect(onGo).toHaveBeenCalledWith('collection');
  });

  it('opens the place of every Coming up row, and of every Quiet places row, when tapped', () => {
    const onGo = vi.fn();
    const busy = draw('busy', DEFAULT_BOARD_SETTINGS, { onGo });
    const rows = byClass(busy.root, 'hb-coming-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      onGo.mockClear();
      busy.click(row);
      expect(onGo).toHaveBeenCalledWith(row.getAttribute('data-place'));
    }
    expect(rows.some((r) => r.getAttribute('data-place') === 'raid')).toBe(true);
    expect(rows.some((r) => r.getAttribute('data-place') === 'games')).toBe(true);

    const quiet = draw('nothing going on', { ...DEFAULT_BOARD_SETTINGS, idle: 'show' }, { onGo });
    const quietRows = byClass(quiet.root, 'hb-quiet');
    expect(quietRows).toHaveLength(5);
    for (const row of quietRows) {
      expect(row.localName).toBe('button');
      onGo.mockClear();
      quiet.click(row);
      expect(onGo).toHaveBeenCalledWith(row.getAttribute('data-place'));
    }
  });

  it('opens Games from the medals of The valley today, named by the events', () => {
    const onGo = vi.fn();
    const p = draw('busy', DEFAULT_BOARD_SETTINGS, { onGo });
    const medals = first(byName(p.root, 'button', /^The Games today: /));
    p.click(medals);
    expect(onGo).toHaveBeenCalledWith('games');
  });

  it('makes the sky line a button that opens the forecast (a popover; none without a host)', () => {
    const p = draw('busy');
    const sky = first(byClass(p.root, 'hb-valley-sky'));
    expect(sky.localName).toBe('button');
    expect(sky.getAttribute('aria-haspopup')).toBe('dialog');
    expect(() => {
      p.click(sky);
    }).not.toThrow();
  });

  it('has no button inside a button on the board', () => {
    const p = draw('busy', { ...DEFAULT_BOARD_SETTINGS, idle: 'show' }, { onGo: () => undefined });
    for (const b of find(p.root, (el) => el.localName === 'button')) {
      expect(find(b, (el) => el !== b && el.localName === 'button')).toEqual([]);
    }
  });

  it('leaves the raid rows out when the raid view did not load', () => {
    const p = draw('busy', DEFAULT_BOARD_SETTINGS, { raid: false });
    expect(visibleText(p.root)).not.toContain('Raid finale');
  });

  it('says one calm line, and no "Needs you" buttons, when nothing waits', () => {
    const p = draw('nothing waiting');
    expect(byClass(p.root, 'hb-need')).toHaveLength(0);
    expect(visibleText(p.root)).toContain('All quiet in the valley');
  });

  it('draws the room above the board when it is given one (a phone), and not otherwise', () => {
    expect(
      byClass(draw('busy', DEFAULT_BOARD_SETTINGS, { room: true }).root, 'the-room'),
    ).toHaveLength(1);
    expect(byClass(draw('busy').root, 'the-room')).toHaveLength(0);
  });

  it('marks the board with its tilt option, and gives each paper its lean', () => {
    for (const tilt of ['none', 'still'] as const) {
      const p = draw('busy', { ...DEFAULT_BOARD_SETTINGS, tilt });
      const board = first(byClass(p.root, 'hb'));
      expect(board.getAttribute('data-tilt')).toBe(tilt);
      const lean = buildBoard(homeInput('busy', true), { ...DEFAULT_BOARD_SETTINGS, tilt });
      const raid = first(find(p.root, (el) => el.getAttribute('data-place') === 'raid'));
      expect(raid.style.getPropertyValue('--tilt')).toBe(`${String(lean.tilts['need:raid'])}deg`);
    }
  });

  it('keeps every paper in its lean across a redraw: nothing jumps', () => {
    const p = draw('busy', { ...DEFAULT_BOARD_SETTINGS, tilt: 'still' });
    const before = byClass(p.root, 'hb-paper').map((el) => el.style.getPropertyValue('--tilt'));
    p.draw(
      <HomePage
        input={homeInput('busy', true)}
        settings={{ ...DEFAULT_BOARD_SETTINGS, tilt: 'still' }}
        onGo={() => undefined}
      />,
    );
    expect(byClass(p.root, 'hb-paper').map((el) => el.style.getPropertyValue('--tilt'))).toEqual(
      before,
    );
  });

  it('draws the "How to play" pin beside the starter pin when it can open How to play, and opens it', () => {
    const onHowTo = vi.fn();
    const drawn = createPage();
    page = drawn;
    drawn.draw(
      <HomePage
        input={homeInput('busy', true)}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
        onHowTo={onHowTo}
      />,
    );
    const pin = first(byName(drawn.root, 'button', 'How to play'));
    expect(pin.classList.contains('hb-badge')).toBe(true);
    expect(byClass(drawn.root, 'hb-starter')).toHaveLength(1);
    drawn.click(pin);
    expect(onHowTo).toHaveBeenCalledOnce();
    expect(byName(draw('busy').root, 'button', 'How to play')).toHaveLength(0);
  });

  it('keeps the "How to play" pin on a calm board, and has no Journal or Stats pins', () => {
    const calm = createPage();
    page = calm;
    calm.draw(
      <HomePage
        input={homeInput('nothing waiting', true)}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
        onHowTo={() => undefined}
      />,
    );
    expect(byName(calm.root, 'button', 'How to play')).toHaveLength(1);
    expect(byName(calm.root, 'button', /^(Journal|Stats)/)).toHaveLength(0);
  });

  it('shows no notice for quiet places by default, and a calm one-line notice each with idle shown', () => {
    const hidden = draw('nothing going on');
    expect(byClass(hidden.root, 'hb-quiet')).toHaveLength(0);
    expect(headings(hidden.root)).not.toContain('Quiet places');
    expect(visibleText(hidden.root)).toContain('All quiet in the valley');

    const shown = draw('nothing going on', { ...DEFAULT_BOARD_SETTINGS, idle: 'show' });
    expect(headings(shown.root)).toContain('Quiet places');
    const notices = byClass(shown.root, 'hb-quiet').map((el) => visibleText(el));
    expect(notices).toHaveLength(5);
    expect(notices.some((text) => text.includes('No run waiting'))).toBe(true);
  });
});

describe('HomeScreen', () => {
  it('works out the page from the server clock and the game screen’s data', () => {
    const input = homeInput('busy', true);
    const drawn = createPage();
    page = drawn;
    drawn.draw(
      <HomeScreen
        {...input}
        offset={HOME_NOW - Date.now()}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
      />,
    );
    expect(visibleText(drawn.root)).toContain('Needs you');
    expect(visibleText(drawn.root)).toContain('Games lock');
  });
});
