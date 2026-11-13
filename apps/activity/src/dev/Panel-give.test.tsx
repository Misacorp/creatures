import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, find, visibleText, type Page } from '../test-dom';
import type { PresetChoices } from './dev-api';

/**
 * The panel's layout and its target player: sections in a nav under group headings, the target picker at the top, and a
 * per-player tool sending the target's id (and a server-wide one never doing so). The network is a stand-in.
 */

const runTool = vi.fn<(tool: string, body: Record<string, unknown>) => Promise<unknown>>();

const PLAYERS: PresetChoices = {
  you: '111',
  players: [
    {
      userId: '111',
      name: 'Ann',
      creatures: 1,
      items: 0,
      roster: [{ id: 'mine', species: 'cindle', level: 3 }],
    },
    {
      userId: '222',
      name: 'Bo',
      creatures: 2,
      items: 5,
      roster: [
        { id: 'bo-1', species: 'splashet', level: 9 },
        { id: 'bo-2', species: 'cindle', level: 2 },
      ],
    },
  ],
  presets: [{ id: 'week-2', name: 'Week 2', creatures: 7, minLevel: 10, maxLevel: 14, items: 15 }],
};

vi.mock('./dev-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dev-api')>()),
  runTool: (tool: string, body: Record<string, unknown>) => runTool(tool, body),
  fetchDevState: () => Promise.resolve(null),
  fetchDevEvents: () => Promise.resolve([]),
  fetchPresetChoices: () => Promise.resolve(PLAYERS),
}));

vi.mock('../build-info', () => ({
  readBuildInfo: () => ({ branch: null, commit: null, environment: null }),
  buildRows: () => [],
}));

vi.mock('../Replay', () => ({ Replay: () => <div class="replay-stand-in" /> }));

const { default: DevPanel } = await import('./Panel');

let page: Page | null = null;

beforeEach(() => {
  runTool.mockReset();
  runTool.mockResolvedValue({ ok: true, result: { balances: { bait: 5, essence: 0 } } });
});

afterEach(() => {
  page?.unmount();
  page = null;
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function openPanel(tab: 'home' | 'raid' | 'collection' = 'home'): Promise<Page> {
  page = createPage();
  page.draw(
    <DevPanel
      tab={tab}
      creatures={[]}
      onChanged={() => {
        /* nothing to reload */
      }}
    />,
  );
  const [fab] = byClass(page.root, 'dev-fab');
  if (fab === undefined) throw new Error('no DEV button');
  page.click(fab);
  await flush();
  return page;
}

function press(p: Page, label: string): void {
  const [button] = byName(p.root, 'button', label);
  if (button === undefined) throw new Error(`no button ${label}`);
  let form = button.parentNode;
  while (form !== null && form.localName !== 'form') form = form.parentNode;
  if (form === null) throw new Error(`no form around ${label}`);
  p.event(form, 'submit');
}

const navItem = (p: Page, title: string) => {
  const [nav] = byClass(p.root, 'dev-nav');
  const [item] = byName(nav ?? p.root, 'button', title);
  if (item === undefined) throw new Error(`no nav item ${title}`);
  return item;
};

describe('the sections', () => {
  it('lists them in a nav under group headings, and opens Give first on a page with no section of its own', async () => {
    const p = await openPanel('home');
    const [nav] = byClass(p.root, 'dev-nav');
    const text = visibleText(nav ?? p.root);
    for (const word of [
      'Players',
      'Game systems',
      'Tools',
      'Give',
      'Raid',
      'Clock',
      'Build and account',
    ]) {
      expect(text).toContain(word);
    }
    expect(navItem(p, 'Give').getAttribute('aria-pressed')).toBe('true');
    expect(visibleText(p.root)).toContain('Give a roster preset');
  });

  it('opens the current tab’s section, and switches with the nav', async () => {
    const p = await openPanel('raid');
    expect(navItem(p, 'Raid').getAttribute('aria-pressed')).toBe('true');
    expect(visibleText(p.root)).toContain('Clear the board');
    p.click(navItem(p, 'Clock'));
    await flush();
    expect(visibleText(p.root)).toContain('Next 13:37');
    expect(visibleText(p.root)).not.toContain('Clear the board');
  });

  it('closes with Close', async () => {
    const p = await openPanel();
    const [close] = byClass(p.root, 'dev-close');
    if (close === undefined) throw new Error('no Close');
    p.click(close);
    await flush();
    expect(byClass(p.root, 'dev-drawer')).toHaveLength(0);
  });
});

describe('the target player', () => {
  const picker = (p: Page) => {
    const [bar] = byClass(p.root, 'dev-target');
    const [select] = find(bar ?? p.root, (e) => e.localName === 'select');
    if (select === undefined) throw new Error('no target picker');
    return select;
  };

  it('lists You first, then the other players, and says who the tools act on', async () => {
    const p = await openPanel();
    const options = byName(picker(p), 'option', /./).map((o) => visibleText(o));
    expect(options).toEqual(['You (Ann, 1 creatures, 0 items)', 'Bo (2 creatures, 5 items)']);
    expect(visibleText(p.root)).toContain('The tools below act on you.');
  });

  it('sends no user id for You, and the target’s id for a per-player tool', async () => {
    const p = await openPanel();
    const bait = find(
      p.root,
      (e) => e.localName === 'input' && e.getAttribute('type') === 'number',
    )[0];
    if (bait === undefined) throw new Error('no number field');
    // The first number field of Give is the creature's level: use the currency form's own.
    const form = byName(p.root, 'button', 'Apply').find((b) => {
      let f = b.parentNode;
      while (f !== null && f.localName !== 'form') f = f.parentNode;
      return f !== null && visibleText(f).includes('Give Bait or Essence');
    });
    if (form === undefined) throw new Error('no currency form');
    let formEl = form.parentNode;
    while (formEl !== null && formEl.localName !== 'form') formEl = formEl.parentNode;
    if (formEl === null) throw new Error('no form');
    const [baitInput] = find(formEl, (e) => e.localName === 'input');
    if (baitInput === undefined) throw new Error('no bait input');
    p.type(baitInput, '50');
    p.event(formEl, 'submit');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('grant-currency', { bait: 50 });

    const select = picker(p);
    select.value = '222';
    p.event(select, 'change');
    await flush();
    expect(visibleText(p.root)).toContain('The tools below act on this player, not on you.');
    expect(visibleText(p.root)).toContain('Give Bait or Essence for Bo');
    p.event(formEl, 'submit');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('grant-currency', { bait: 50, userId: '222' });
    expect(visibleText(p.root)).toContain('Give Bait or Essence (Bo)');
  });

  it('never sends a user id for a tool about the whole server', async () => {
    const p = await openPanel('raid');
    const select = picker(p);
    select.value = '222';
    p.event(select, 'change');
    await flush();
    expect(visibleText(p.root)).toContain('This section does not act on a player');
    press(p, 'Clear the board');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('raid-clear', {});
  });

  it('lists the target’s creatures in the creature pickers', async () => {
    const p = await openPanel('collection');
    const select = picker(p);
    select.value = '222';
    p.event(select, 'change');
    await flush();
    const labels = byName(p.root, 'option', /\(Lv \d+\)/).map((o) => visibleText(o));
    expect(labels).toContain('Splashet (Lv 9)');
    expect(labels).not.toContain('Cindle (Lv 3)');
  });

  it('gives the roster preset to the target, after their name is typed', async () => {
    runTool.mockResolvedValue({ ok: true, result: { players: 1, creatures: 7, items: 15 } });
    const p = await openPanel();
    const select = picker(p);
    select.value = '222';
    p.event(select, 'change');
    await flush();
    expect(visibleText(p.root)).toContain('Type Bo to confirm');
    const [confirm] = find(
      p.root,
      (e) => e.localName === 'input' && e.getAttribute('type') === 'text',
    );
    if (confirm === undefined) throw new Error('no confirmation field');
    p.type(confirm, 'bo');
    press(p, 'Replace creatures and bag');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('apply-roster-preset', {
      preset: 'week-2',
      userId: '222',
      confirm: 'bo',
    });
  });
});
