import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byRole, createPage, type Page } from '../../test-dom';
import { initialWorld } from '../world';
import { masteryFact } from './mastery';
import { Tray } from './Tray';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {}
    disconnect(): void {}
  },
);

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('the tray’s mastery pips', () => {
  const world = initialWorld();
  const creatures = world.creatures.slice(0, 3);

  function draw(step: (index: number) => number): Page {
    page = createPage();
    page.draw(
      <Tray
        world={world}
        creatures={creatures}
        held={null}
        onPick={() => undefined}
        label="Your creatures"
        mastery={(c) => ({ step: step(creatures.indexOf(c)), kind: 'smithing' })}
      />,
    );
    return page;
  }

  it('draws the shared PipRow with a spoken label for a creature that has started', () => {
    const p = draw(() => 2);
    expect(byClass(p.root, 'pips')).toHaveLength(creatures.length);
    expect(byClass(p.root, 'pv-mastery-pip')).toHaveLength(0);
    const rows = byRole(p.root, 'img');
    expect(rows[0]?.getAttribute('aria-label')).toBe('Smithing: Expert, 2 / 3');
    expect(byClass(p.root, 'on')).toHaveLength(2 * creatures.length);
  });

  it('shows no pips at all at step 0, so there are no empty boxes next to the level', () => {
    const p = draw((i) => (i === 0 ? 0 : 3));
    expect(byClass(p.root, 'pips')).toHaveLength(creatures.length - 1);
  });

  it('says the same words in the spoken words', () => {
    expect(masteryFact(2, 'smithing')).toEqual({ label: 'Smithing', value: 'Expert, 2 / 3' });
    expect(masteryFact(0, 'keeping')).toEqual({ label: 'Keeping', value: 'Novice, not started' });
  });
});
