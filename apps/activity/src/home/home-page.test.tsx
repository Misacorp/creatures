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
    ]);
  });

  it('opens the place of a notice when it is tapped', () => {
    const onGo = vi.fn();
    const p = draw('busy', DEFAULT_BOARD_SETTINGS, { onGo });
    p.click(first(byName(p.root, 'button', /^Workshop/)));
    expect(onGo).toHaveBeenCalledWith('workshop');
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
    for (const tilt of ['none', 'still', 'sway'] as const) {
      const p = draw('busy', { ...DEFAULT_BOARD_SETTINGS, tilt });
      const board = first(byClass(p.root, 'hb'));
      expect(board.getAttribute('data-tilt')).toBe(tilt);
      const lean = buildBoard(homeInput('busy', true), { ...DEFAULT_BOARD_SETTINGS, tilt });
      const raid = first(find(p.root, (el) => el.getAttribute('data-place') === 'raid'));
      expect(raid.style.getPropertyValue('--tilt')).toBe(`${String(lean.tilts['need:raid'])}deg`);
      expect(raid.style.getPropertyValue('--sway-delay')).not.toBe('');
    }
  });

  it('keeps every paper in its lean across a redraw: nothing jumps', () => {
    const p = draw('busy');
    const before = byClass(p.root, 'hb-paper').map((el) => el.style.getPropertyValue('--tilt'));
    p.draw(
      <HomePage
        input={homeInput('busy', true)}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
      />,
    );
    expect(byClass(p.root, 'hb-paper').map((el) => el.style.getPropertyValue('--tilt'))).toEqual(
      before,
    );
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
