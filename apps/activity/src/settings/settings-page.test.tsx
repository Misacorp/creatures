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
import type { DmKind, Notifications, NotificationsApi } from '../notifications-api';
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

  it('shows the current choices, the defaults being Flat and Hide', () => {
    const p = draw();
    expect(pressed(p.root, 'Flat')).toBe(true);
    expect(pressed(p.root, 'Leaning')).toBe(false);
    expect(byName(p.root, 'button', 'Swaying')).toHaveLength(0);
    expect(pressed(p.root, 'Hide')).toBe(true);
    expect(pressed(p.root, 'Show')).toBe(false);
    const leaning = draw({ tilt: 'still', idle: 'show' });
    expect(pressed(leaning.root, 'Leaning')).toBe(true);
    expect(pressed(leaning.root, 'Show')).toBe(true);
  });

  it('hands back the whole settings object with just the one choice changed', () => {
    const onChange = vi.fn();
    const p = draw(DEFAULT_BOARD_SETTINGS, { onChange });
    p.click(first(byName(p.root, 'button', 'Leaning')));
    expect(onChange).toHaveBeenLastCalledWith({ tilt: 'still', idle: 'hide' });
    p.click(first(byName(p.root, 'button', 'Show')));
    expect(onChange).toHaveBeenLastCalledWith({ tilt: 'none', idle: 'show' });
  });

  it('does nothing when the chosen choice is tapped again', () => {
    const onChange = vi.fn();
    const p = draw(DEFAULT_BOARD_SETTINGS, { onChange });
    p.click(first(byName(p.root, 'button', 'Flat')));
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

const OFF: Notifications = {
  kinds: { trip: false, job: false, finale: false, stall: false },
  blocked: false,
  available: true,
};

const flush = async (p: Page): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  p.update(() => undefined);
};

interface Fake extends NotificationsApi {
  saved: Partial<Record<DmKind, boolean>>[];
  answers: ((value: Notifications) => void)[];
  failures: ((reason: unknown) => void)[];
}

/** A fake server: `load` answers `start`; each `save` waits until the test answers or fails it. */
function fakeApi(start: Notifications | Error): Fake {
  const fake: Fake = {
    saved: [],
    answers: [],
    failures: [],
    load: () => (start instanceof Error ? Promise.reject(start) : Promise.resolve(start)),
    save: (kinds) =>
      new Promise<Notifications>((resolve, reject) => {
        fake.saved.push(kinds);
        fake.answers.push(resolve);
        fake.failures.push(reject);
      }),
  };
  return fake;
}

async function drawWithDms(api: NotificationsApi): Promise<Page> {
  const drawn = createPage();
  page = drawn;
  drawn.draw(
    <SettingsPage
      settings={DEFAULT_BOARD_SETTINGS}
      onChange={() => undefined}
      onBack={() => undefined}
      notifications={api}
    />,
  );
  await flush(drawn);
  return drawn;
}

describe('the Discord DMs section', () => {
  it('is not drawn without the notifications api, nor where the server cannot send DMs', async () => {
    expect(visibleText(draw().root)).not.toContain('Discord DMs');
    const p = await drawWithDms(fakeApi({ ...OFF, available: false }));
    expect(visibleText(p.root)).not.toContain('Discord DMs');
  });

  it('draws a row per kind with the saved choices, off by default', async () => {
    const p = await drawWithDms(fakeApi({ ...OFF, kinds: { ...OFF.kinds, finale: true } }));
    expect(find(p.root, (el) => el.localName === 'h4').map((h) => visibleText(h))).toEqual([
      'The notice board',
      'Discord DMs',
    ]);
    const text = visibleText(p.root);
    for (const name of ['Trips home', 'Workshop jobs', 'Raid finale', 'Prize Stall']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('A DM 10 minutes before Sunday');
    const group = (name: string) =>
      find(
        p.root,
        (el) => el.getAttribute('aria-label') === name && el.getAttribute('role') === 'group',
      )[0];
    const on = (name: string) => {
      const g = group(name);
      if (g === undefined) throw new Error(name);
      return pressed(g, 'On');
    };
    expect([on('Trips home'), on('Workshop jobs'), on('Raid finale'), on('Prize Stall')]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(byClass(p.root, 'alert')).toHaveLength(0);
  });

  it('saves a change at once, shows it, and takes the server answer', async () => {
    const api = fakeApi(OFF);
    const p = await drawWithDms(api);
    const trips = find(
      p.root,
      (el) => el.getAttribute('aria-label') === 'Trips home',
    )[0] as FakeElement;
    p.click(first(byName(trips, 'button', 'On')));
    expect(api.saved).toEqual([{ trip: true }]);
    const row = () =>
      find(p.root, (el) => el.getAttribute('aria-label') === 'Trips home')[0] as FakeElement;
    expect(pressed(row(), 'On')).toBe(true);
    api.answers[0]?.({ ...OFF, kinds: { ...OFF.kinds, trip: true } });
    await flush(p);
    expect(pressed(row(), 'On')).toBe(true);
    p.click(first(byName(row(), 'button', 'Off')));
    expect(api.saved).toEqual([{ trip: true }, { trip: false }]);
  });

  it('puts the choice back and says so when the save fails', async () => {
    const api = fakeApi(OFF);
    const p = await drawWithDms(api);
    const stall = () =>
      find(p.root, (el) => el.getAttribute('aria-label') === 'Prize Stall')[0] as FakeElement;
    p.click(first(byName(stall(), 'button', 'On')));
    api.failures[0]?.(new Error('nope'));
    await flush(p);
    expect(pressed(stall(), 'Off')).toBe(true);
    expect(visibleText(p.root)).toContain('Could not save that.');
  });

  it('explains a block and still lets the player flip a setting to try again', async () => {
    const api = fakeApi({ ...OFF, blocked: true });
    const p = await drawWithDms(api);
    expect(visibleText(p.root)).toContain('allow direct messages from server members');
    expect(visibleText(p.root)).toContain('Privacy Settings');
    const jobs = find(
      p.root,
      (el) => el.getAttribute('aria-label') === 'Workshop jobs',
    )[0] as FakeElement;
    p.click(first(byName(jobs, 'button', 'On')));
    expect(api.saved).toEqual([{ job: true }]);
    api.answers[0]?.({ ...OFF, kinds: { ...OFF.kinds, job: true } });
    await flush(p);
    expect(visibleText(p.root)).not.toContain('Privacy Settings');
  });

  it('says when the settings cannot be loaded, and tries again', async () => {
    let calls = 0;
    const api: NotificationsApi = {
      load: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve(OFF);
      },
      save: () => Promise.resolve(OFF),
    };
    const p = await drawWithDms(api);
    expect(visibleText(p.root)).toContain('Could not load these.');
    p.click(first(byName(p.root, 'button', 'Try again')));
    await flush(p);
    expect(visibleText(p.root)).toContain('Trips home');
  });
});
