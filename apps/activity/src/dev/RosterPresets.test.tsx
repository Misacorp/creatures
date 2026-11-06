import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, find, visibleText, type Page } from '../test-dom';
import { parsePresetChoices, presetLine, type PresetChoices } from './dev-api';

/** The roster preset picker: its list, the confirmation word, and the body it sends. The network is a stand-in. */

const CHOICES: PresetChoices = {
  players: [
    { userId: '111', name: 'Ann', creatures: 5, items: 0 },
    { userId: '222', name: 'Bo', creatures: 9, items: 12 },
  ],
  presets: [
    { id: 'week-2', name: 'Week 2', creatures: 7, minLevel: 10, maxLevel: 14, items: 15 },
    { id: 'week-8', name: 'Week 8', creatures: 18, minLevel: 11, maxLevel: 25, items: 22 },
  ],
};

vi.mock('./dev-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dev-api')>()),
  fetchPresetChoices: () => Promise.resolve(CHOICES),
}));

const { RosterPresets, confirmWord, presetBody, typedMatches } = await import('./RosterPresets');

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

async function draw(onApply: (body: Record<string, unknown>) => void): Promise<Page> {
  page = createPage();
  page.draw(<RosterPresets busy={false} version={0} onApply={onApply} />);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  return page;
}

const button = (p: Page) => {
  const [b] = byName(p.root, 'button', 'Replace creatures and bag');
  if (b === undefined) throw new Error('no button');
  return b;
};
/** The select or the input of the nth field of the form. */
const field = (p: Page, tag: 'select' | 'input', index: number) => {
  const [el] = find(p.root, (e) => e.localName === tag).slice(index, index + 1);
  if (el === undefined) throw new Error(`no ${tag} ${String(index)}`);
  return el;
};
const submit = (p: Page): void => {
  const form = button(p).parentNode;
  if (form === null) throw new Error('no form');
  p.event(form, 'submit');
};

describe('the roster preset picker', () => {
  it('lists everyone, the players with what they own, and the presets', async () => {
    const p = await draw(vi.fn());
    const options = byClass(p.root, 'dev-field').flatMap((f) =>
      byName(f, 'option', /./).map((o) => visibleText(o)),
    );
    expect(options).toEqual([
      'Everyone (2)',
      'Ann (5 creatures, 0 items)',
      'Bo (9 creatures, 12 items)',
      'Week 2',
      'Week 8',
    ]);
    expect(visibleText(p.root)).toContain('7 creatures, level 10 to 14, 15 items.');
  });

  it('needs "everyone" typed for everyone, and sends that body', async () => {
    const onApply = vi.fn();
    const p = await draw(onApply);
    expect(button(p).hasAttribute('disabled')).toBe(true);
    expect(visibleText(p.root)).toContain('Type everyone to confirm');
    p.type(field(p, 'input', 0), 'Ann');
    expect(button(p).hasAttribute('disabled')).toBe(true);
    p.type(field(p, 'input', 0), ' Everyone ');
    expect(button(p).hasAttribute('disabled')).toBe(false);
    submit(p);
    expect(onApply).toHaveBeenCalledWith({
      preset: 'week-2',
      everyone: true,
      confirm: ' Everyone ',
    });
  });

  it('needs the picked player’s name, and sends the player and the preset', async () => {
    const onApply = vi.fn();
    const p = await draw(onApply);
    const player = field(p, 'select', 0);
    player.value = '222';
    p.event(player, 'change');
    const preset = field(p, 'select', 1);
    preset.value = 'week-8';
    p.event(preset, 'change');
    expect(visibleText(p.root)).toContain('Type Bo to confirm');
    p.type(field(p, 'input', 0), 'bo');
    submit(p);
    expect(onApply).toHaveBeenCalledWith({ preset: 'week-8', userId: '222', confirm: 'bo' });
  });
});

describe('the picker’s helpers', () => {
  it('knows the word to type and whether it was typed', () => {
    expect(confirmWord(CHOICES, 'everyone')).toBe('everyone');
    expect(confirmWord(CHOICES, '111')).toBe('Ann');
    expect(confirmWord(CHOICES, 'zzz')).toBeNull();
    expect(typedMatches('  ANN ', 'Ann')).toBe(true);
    expect(typedMatches('Ann', null)).toBe(false);
    expect(presetBody('222', 'week-2', 'Bo')).toEqual({
      preset: 'week-2',
      userId: '222',
      confirm: 'Bo',
    });
  });

  it('reads the server’s list and refuses a wrong shape', () => {
    expect(parsePresetChoices(CHOICES)).toEqual(CHOICES);
    expect(parsePresetChoices({ players: [{ userId: 1 }], presets: [] })).toBeNull();
    expect(parsePresetChoices({})).toBeNull();
    expect(
      presetLine({ id: 'x', name: 'X', creatures: 3, minLevel: 30, maxLevel: 30, items: 9 }),
    ).toBe('3 creatures, level 30, 9 items');
  });
});
