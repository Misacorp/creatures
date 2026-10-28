import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, type FakeElement, type Page } from './test-dom';
import { presetProps } from './workbench/props';
import { ENTRIES } from './workbench/registry';

/**
 * A guard against a flow growing a second frame (ux-patterns.md, "A flow reachable from several places": the item
 * card's Dismantle once drew its own copy of the wizard, with the gold button inside the scrolling card instead of
 * pinned). Every `WizardFooter` the workbench draws, in every preset of every page, must sit in a pinned footer slot:
 * a `Drawer`'s (`.drawer-footer`) or, on a wide screen, a `SidePanel`'s (`.side-panel-foot`), never in scrolling content. The one page that is allowed not to is the Wizard demo
 * itself, whose "plain" placement shows that the pieces also work in a card; the product never uses that.
 */

const DEMO_OF_THE_PIECES = 'WizardView';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

/** True when `node` or an ancestor has the class. */
function within(node: FakeElement, className: string): boolean {
  for (let n: FakeElement | null = node; n !== null; n = n.parentNode) {
    if (
      typeof n.getAttribute === 'function' &&
      (n.getAttribute('class') ?? '').split(' ').includes(className)
    ) {
      return true;
    }
  }
  return false;
}

describe('every wizard footer sits in a pinned footer slot', () => {
  const drawn: string[] = [];

  for (const entry of ENTRIES) {
    if (entry.name === DEMO_OF_THE_PIECES) continue;
    const variants = [{ name: 'default', props: entry.defaults }, ...entry.presets];
    for (const preset of variants) {
      it(`${entry.name}: ${preset.name}`, () => {
        page = createPage();
        try {
          page.draw(<>{entry.render(presetProps(entry, preset))}</>);
        } catch {
          // A page that needs a real browser (scrolling, `window`) cannot be drawn in the fake DOM; the flows named
          // below must still be drawn (the last test), so a skipped page cannot hide a footer there.
          return;
        }
        for (const footer of byClass(page.root, 'wizard-footer')) {
          drawn.push(entry.name);
          expect(
            within(footer, 'drawer-footer') || within(footer, 'side-panel-foot'),
            `${entry.name} / ${preset.name}: a WizardFooter is outside a pinned footer slot`,
          ).toBe(true);
          expect(within(footer, 'drawer-body')).toBe(false);
        }
      });
    }
  }

  it('has seen the footers of the flows that use one (the guard is not drawing nothing)', () => {
    // The flows that use a wizard footer today (a job's drawer, the dismantle scenes, the send form, the place panel).
    for (const name of ['JobDrawer', 'CreaturePage', 'SendForm', 'ExpeditionWorld']) {
      expect(drawn, `${name} drew no wizard footer: the guard no longer covers it`).toContain(name);
    }
  });
});
