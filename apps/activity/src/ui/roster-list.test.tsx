import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PickerOption } from '../roster-picker';
import { byClass, byRole, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { RosterList } from './RosterList';
import { RosterPicker } from './RosterPicker';

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

function option(id: string, over: Partial<PickerOption> = {}): PickerOption {
  return {
    id,
    name: id,
    species: 'sproutle',
    level: 5,
    element: 'grove',
    role: 'guard',
    onBoard: false,
    disabled: null,
    effect: null,
    recommended: false,
    ...over,
  };
}

const OPTIONS = [
  option('stuck', { disabled: 'On a job', busy: 'job' }),
  option('a'),
  option('b', { onBoard: true }),
  option('off', { name: 'Take off', action: true }),
];

function drawList(onPick = vi.fn(), cls?: string): Page {
  page = createPage();
  page.draw(
    <RosterList
      options={OPTIONS}
      placedNote="Wears it now"
      showEffects={false}
      onPick={onPick}
      {...(cls === undefined ? {} : { class: cls })}
    />,
  );
  return page;
}

describe('the shared creature list', () => {
  it('is a listbox with an option for each entry, the reason on the one that cannot be picked', () => {
    const p = drawList();
    expect(byRole(p.root, 'listbox')).toHaveLength(1);
    const options = byRole(p.root, 'option');
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.getAttribute('aria-disabled'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(visibleText(first(options))).toContain('On a job');
    expect(visibleText(options[2] as FakeElement)).toContain('Wears it now');
  });

  it('draws a busy reason as the status badge, any other reason as text, in the pixel font', () => {
    page = createPage();
    page.draw(
      <RosterList
        options={[
          option('j', { disabled: 'On a job', busy: 'job' }),
          option('t', { disabled: 'Away on a trip', busy: 'away' }),
          option('l', { disabled: 'Needs level 12' }),
        ]}
        placedNote="Wears it now"
        showEffects={false}
        reasonSide
        onPick={() => undefined}
      />,
    );
    const [job, trip, level] = byRole(page.root, 'option') as [
      FakeElement,
      FakeElement,
      FakeElement,
    ];
    expect(first(byClass(job, 'badge')).getAttribute('class')).toContain('busy');
    expect(visibleText(first(byClass(job, 'badge')))).toBe('On a job');
    expect(first(byClass(trip, 'badge')).getAttribute('class')).toContain('away');
    // The words after "Away" are kept for assistive technology.
    expect(visibleText(trip)).toContain('Away on a trip');
    expect(job.getAttribute('aria-disabled')).toBe('true');
    expect(byClass(level, 'badge')).toHaveLength(0);
    expect(visibleText(first(byClass(level, 'ro-side')))).toBe('Needs level 12');
    expect(first(byRole(page.root, 'listbox')).getAttribute('class')).toContain('pix-panel');
  });

  it('shows an action option as its name alone, with no sprite, level or tags', () => {
    const p = drawList();
    const action = byRole(p.root, 'option')[3] as FakeElement;
    expect(visibleText(action)).toBe('Take off');
    expect(byClass(action, 'ro-tags')).toHaveLength(0);
    expect(byClass(action, 'ro-level')).toHaveLength(0);
  });

  it('takes the focus on the first option that can be picked, and only that one is a tab stop', () => {
    const p = drawList();
    const options = byRole(p.root, 'option');
    expect(options[1]?.focused).toBeGreaterThan(0);
    expect(options.map((o) => o.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
  });

  it('picks with a tap or Enter, never an option that cannot be picked', () => {
    const onPick = vi.fn();
    const p = drawList(onPick);
    const options = byRole(p.root, 'option');
    p.click(first(options));
    expect(onPick).not.toHaveBeenCalled();
    p.click(options[1] as FakeElement);
    expect(onPick).toHaveBeenLastCalledWith('a');
    // The tap on the disabled option moved the active option to it: two Downs reach "b".
    p.key(first(byRole(p.root, 'listbox')), 'ArrowDown');
    p.key(first(byRole(p.root, 'listbox')), 'ArrowDown');
    p.key(first(byRole(p.root, 'listbox')), 'Enter');
    expect(onPick).toHaveBeenLastCalledWith('b');
  });

  it('puts the note and the reason at the right of the row with reasonSide, not under the name', () => {
    page = createPage();
    page.draw(
      <RosterList
        options={OPTIONS}
        placedNote="Wears it now"
        showEffects={false}
        reasonSide
        onPick={() => undefined}
      />,
    );
    const options = byRole(page.root, 'option');
    const stuck = first(options);
    const side = first(byClass(stuck, 'ro-side'));
    expect(visibleText(side)).toBe('On a job');
    // A direct child of the row, after the text column: the row's own alignment centres it.
    expect((stuck.childNodes as FakeElement[]).at(-1)).toBe(side);
    expect(byClass(first(byClass(stuck, 'ro-text')), 'ro-reason')).toHaveLength(0);
    const wearer = options[2] as FakeElement;
    expect(visibleText(first(byClass(wearer, 'ro-side')))).toBe('Wears it now');
    // Nothing to say, nothing drawn.
    expect(byClass(options[1] as FakeElement, 'ro-side')).toHaveLength(0);
  });

  it('keeps them under the name by default (the raid and dungeon sheet)', () => {
    const p = drawList();
    expect(byClass(p.root, 'ro-side')).toHaveLength(0);
    expect(byClass(first(byRole(p.root, 'option')), 'ro-reason')).toHaveLength(1);
  });

  it('can be drawn flat, for a drawer body that scrolls instead of the list', () => {
    const p = drawList(vi.fn(), 'flat');
    expect(first(byRole(p.root, 'listbox')).getAttribute('class')).toBe(
      'roster-list pix-panel flat',
    );
  });
});

describe('the creature sheet that opens from a page', () => {
  function drawSheet(over: { status?: string } = {}) {
    const onClose = vi.fn();
    const behind = vi.fn();
    page = createPage();
    page.draw(
      <div onKeyDown={behind}>
        <RosterPicker
          title="Choose a creature"
          {...over}
          options={OPTIONS}
          placedNote="Wears it now"
          showEffects={false}
          anchor={() => null}
          onPick={() => undefined}
          onClose={onClose}
        />
      </div>,
    );
    return { p: page, onClose, behind };
  }

  it('has a dialog with its title, the Close button and the shared list; the status line is optional', () => {
    const { p } = drawSheet();
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialog.getAttribute('aria-label')).toBe('Choose a creature');
    expect(byRole(dialog, 'listbox')).toHaveLength(1);
    expect(byClass(dialog, 'sheet-status')).toHaveLength(0);
    page?.unmount();
    expect(byClass(drawSheet({ status: '2 / 3 placed' }).p.root, 'sheet-status')).toHaveLength(1);
  });

  it('closes on Escape', () => {
    const { p, onClose } = drawSheet();
    p.key(first(byRole(p.root, 'dialog')), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
