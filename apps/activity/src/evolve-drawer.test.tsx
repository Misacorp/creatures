import { afterEach, describe, expect, it, vi } from 'vitest';
import { Collection } from './Collection';
import { EvolveDrawer } from './EvolveDrawer';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature } from './creature-card-sample';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const creature = sampleCreature('evolve choice');

function draw(options: { busy?: boolean; available?: boolean } = {}): {
  page: Page;
  root: FakeElement;
  onEvolve: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  page = createPage();
  const onEvolve = vi.fn();
  const onClose = vi.fn();
  const subject =
    options.available === false && creature.evolution !== undefined
      ? { ...creature, evolution: { ...creature.evolution, available: false } }
      : creature;
  page.draw(
    <EvolveDrawer
      open
      creature={subject}
      busy={options.busy === true}
      onEvolve={onEvolve}
      onClose={onClose}
    />,
  );
  return { page, root: page.root, onEvolve, onClose };
}

function forms(root: FakeElement): FakeElement[] {
  return byClass(root, 'evolve-form');
}

function confirm(root: FakeElement): FakeElement {
  const button = find(
    root,
    (el) => el.localName === 'button' && (el.getAttribute('class') ?? '').includes('primary'),
  )[0];
  if (button === undefined) throw new Error('no confirm button');
  return button;
}

describe('the evolve screen', () => {
  it('shows both forms side by side with name, element, role, ability and numbers', () => {
    const { root } = draw();
    expect(byRole(root, 'dialog')).toHaveLength(1);
    const [thornbuck, sunfawn] = forms(root);
    expect(visibleText(thornbuck as FakeElement)).toContain('Thornbuck');
    expect(visibleText(thornbuck as FakeElement)).toContain('Guard');
    expect(visibleText(thornbuck as FakeElement)).toContain('Ironbark Guard');
    expect(visibleText(sunfawn as FakeElement)).toContain('Sunfawn');
    expect(visibleText(sunfawn as FakeElement)).toContain('Support');
    expect(visibleText(sunfawn as FakeElement)).toContain('Sunny Patch');
    expect(visibleText(sunfawn as FakeElement)).toContain('6%');
    for (const form of [thornbuck, sunfawn]) {
      expect(visibleText(form as FakeElement)).toMatch(/HP\s*\d+/);
      expect(visibleText(form as FakeElement)).toMatch(/Atk\s*\d+/);
      expect(visibleText(form as FakeElement)).toMatch(/Spd\s*\d+/);
    }
    expect(visibleText(root)).toContain('20 Essence');
  });

  it('picks nothing at first, says the choice is permanent, and cannot be confirmed yet', () => {
    const { root, onEvolve } = draw();
    expect(forms(root).every((f) => f.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(visibleText(root)).toContain('20 Essence. This choice is permanent.');
    const button = confirm(root);
    expect(visibleText(button)).toBe('Pick a form');
    expect(button.hasAttribute('disabled')).toBe(true);
    page?.click(button);
    expect(onEvolve).not.toHaveBeenCalled();
  });

  it('picks a form, names it on the button and sends the creature and that form', () => {
    const { page: p, root, onEvolve } = draw();
    const sunfawn = forms(root)[1] as FakeElement;
    p.click(sunfawn);
    expect(forms(root)[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(forms(root)[0]?.getAttribute('aria-pressed')).toBe('false');
    const button = confirm(root);
    expect(visibleText(button)).toBe('Evolve into Sunfawn');
    expect(button.hasAttribute('disabled')).toBe(false);
    p.click(button);
    expect(onEvolve).toHaveBeenCalledTimes(1);
    expect(onEvolve).toHaveBeenCalledWith(creature, 'sunfawn');
  });

  it('changes its mind before confirming: the last pick is the one sent', () => {
    const { page: p, root, onEvolve } = draw();
    p.click(forms(root)[1] as FakeElement);
    p.click(forms(root)[0] as FakeElement);
    p.click(confirm(root));
    expect(onEvolve).toHaveBeenCalledWith(creature, 'thornbuck');
  });

  it('does nothing while busy, or when the server says it is not ready', () => {
    const busy = draw({ busy: true });
    expect(forms(busy.root).every((f) => f.hasAttribute('disabled'))).toBe(true);
    expect(confirm(busy.root).hasAttribute('disabled')).toBe(true);
    page?.unmount();
    const notReady = draw({ available: false });
    notReady.page.click(forms(notReady.root)[0] as FakeElement);
    expect(confirm(notReady.root).hasAttribute('disabled')).toBe(true);
    notReady.page.click(confirm(notReady.root));
    expect(notReady.onEvolve).not.toHaveBeenCalled();
  });

  it('closes by its close button', () => {
    const { page: p, root, onClose } = draw();
    p.click(byName(root, 'button', 'Close')[0] as FakeElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws text only: no markup from anywhere, and no inline style of its own', () => {
    const { root } = draw();
    const withStyle = find(
      root,
      (el) => el.hasAttribute('style') && !(el.getAttribute('class') ?? '').includes('drawer'),
    );
    expect(withStyle).toHaveLength(0);
  });
});

describe('the Creatures tab and the evolve screen', () => {
  const noop = (): void => undefined;

  function tab(creatures: (typeof creature)[], onEvolve = vi.fn()) {
    page = createPage();
    page.draw(
      <Collection
        state={{ ...SAMPLE_STATE, creatures, pending: [] }}
        gear={SAMPLE_GEAR}
        busy={false}
        catchActions={{ chooseMany: () => Promise.resolve(true) }}
        onEquip={() => Promise.resolve(true)}
        onRibbon={noop}
        onEvolve={onEvolve}
        onRename={noop}
        onLounge={noop}
        onSlotTalent={noop}
      />,
    );
    return { page, root: page.root, onEvolve };
  }

  it('opens the screen for a line with two forms, and evolves with the form that was picked', () => {
    const { page: p, root, onEvolve } = tab([creature]);
    expect(byRole(root, 'dialog')).toHaveLength(0);
    const gold = byClass(root, 'cc-do')[0]?.childNodes[0] as FakeElement;
    expect(visibleText(gold)).toContain('Choose an evolution');
    p.click(gold);
    // The press only opened the screen: nothing was spent yet.
    expect(onEvolve).not.toHaveBeenCalled();
    expect(byRole(root, 'dialog')).toHaveLength(1);
    p.click(forms(root)[1] as FakeElement);
    p.click(confirm(root));
    expect(onEvolve).toHaveBeenCalledTimes(1);
    expect(onEvolve).toHaveBeenCalledWith(creature, 'sunfawn');
    // The screen is gone once the form is sent.
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });

  it('evolves a line with one form at once, without the screen', () => {
    const single = sampleCreature('evolve ready');
    const { page: p, root, onEvolve } = tab([single]);
    p.click(byClass(root, 'cc-do')[0]?.childNodes[0] as FakeElement);
    expect(byRole(root, 'dialog')).toHaveLength(0);
    expect(onEvolve).toHaveBeenCalledTimes(1);
    expect(onEvolve).toHaveBeenCalledWith(single);
  });
});
