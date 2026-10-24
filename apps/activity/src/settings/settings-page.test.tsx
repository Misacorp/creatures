import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOARD_SETTINGS, type BoardSettings } from '../home/board';
import {
  byClass,
  byName,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { SettingsPage } from './SettingsPage';

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
  settings: BoardSettings = DEFAULT_BOARD_SETTINGS,
  handlers: { onChange?: (next: BoardSettings) => void; onBack?: () => void } = {},
): Page {
  const drawn = createPage();
  page = drawn;
  drawn.draw(
    <SettingsPage
      settings={settings}
      onChange={handlers.onChange ?? (() => undefined)}
      onBack={handlers.onBack ?? (() => undefined)}
    />,
  );
  return drawn;
}

const pressed = (root: FakeElement, name: string): boolean =>
  first(byName(root, 'button', name)).getAttribute('aria-pressed') === 'true';

describe('the Settings page', () => {
  it('is a drill-in with Back at the top, then the title, a section and one row per setting', () => {
    const p = draw();
    const head = first(byClass(p.root, 'drill-head'));
    expect(visibleText(first(byClass(head, 'drill-title')))).toBe('Settings');
    expect(byName(p.root, 'button', /^‹ Back/)).toHaveLength(1);
    expect(find(p.root, (el) => el.localName === 'h4').map((h) => visibleText(h))).toEqual([
      'The notice board',
    ]);
    expect(byClass(p.root, 'setting-row')).toHaveLength(2);
    expect(visibleText(p.root)).toContain('Notices');
    expect(visibleText(p.root)).toContain('Quiet places');
  });

  it('shows the current choices, the defaults being Leaning and Hide', () => {
    const p = draw();
    expect(pressed(p.root, 'Leaning')).toBe(true);
    expect(pressed(p.root, 'Flat')).toBe(false);
    expect(pressed(p.root, 'Swaying')).toBe(false);
    expect(pressed(p.root, 'Hide')).toBe(true);
    expect(pressed(p.root, 'Show')).toBe(false);
    const swaying = draw({ tilt: 'sway', idle: 'show' });
    expect(pressed(swaying.root, 'Swaying')).toBe(true);
    expect(pressed(swaying.root, 'Show')).toBe(true);
  });

  it('hands back the whole settings object with just the one choice changed', () => {
    const onChange = vi.fn();
    const p = draw(DEFAULT_BOARD_SETTINGS, { onChange });
    p.click(first(byName(p.root, 'button', 'Swaying')));
    expect(onChange).toHaveBeenLastCalledWith({ tilt: 'sway', idle: 'hide' });
    p.click(first(byName(p.root, 'button', 'Show')));
    expect(onChange).toHaveBeenLastCalledWith({ tilt: 'still', idle: 'show' });
  });

  it('does nothing when the chosen choice is tapped again', () => {
    const onChange = vi.fn();
    const p = draw(DEFAULT_BOARD_SETTINGS, { onChange });
    p.click(first(byName(p.root, 'button', 'Leaning')));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names each group of choices for screen readers', () => {
    const p = draw();
    const groups = find(p.root, (el) => el.getAttribute('role') === 'group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Notices', 'Quiet places']);
  });

  it('opens How to play from a Help section when it is given, and has no Help section otherwise', () => {
    const plain = draw();
    expect(byName(plain.root, 'button', 'Open How to play')).toHaveLength(0);
    plain.unmount();
    const onHowTo = vi.fn();
    const drawn = createPage();
    page = drawn;
    drawn.draw(
      <SettingsPage
        settings={DEFAULT_BOARD_SETTINGS}
        onChange={() => undefined}
        onBack={() => undefined}
        onHowTo={onHowTo}
      />,
    );
    expect(find(drawn.root, (el) => el.localName === 'h4').map((h) => visibleText(h))).toEqual([
      'Help',
      'The notice board',
    ]);
    drawn.click(first(byName(drawn.root, 'button', 'Open How to play')));
    expect(onHowTo).toHaveBeenCalledOnce();
  });

  it('goes back with Back and with Escape', () => {
    const onBack = vi.fn();
    const p = draw(DEFAULT_BOARD_SETTINGS, { onBack });
    const back = first(byName(p.root, 'button', /^‹ Back/));
    p.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    p.key(back, 'Escape');
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('draws one segmented row per setting with the chosen choice on', () => {
    const p = draw();
    expect(byClass(p.root, 'segmented')).toHaveLength(2);
    expect(find(p.root, (el) => el.getAttribute('class') === 'toggle on')).toHaveLength(2);
  });
});
