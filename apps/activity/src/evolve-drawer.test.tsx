import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
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
    // The cost is an Essence badge (the number only), not a sentence.
    expect(
      byClass(byClass(root, 'evolve-cost')[0] as FakeElement, 'part-count').map(visibleText),
    ).toEqual(['20']);
  });

  it('picks nothing at first, says the choice is permanent, and cannot be confirmed yet', () => {
    const { root, onEvolve } = draw();
    expect(forms(root).every((f) => f.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(
      byClass(byClass(root, 'evolve-cost')[0] as FakeElement, 'part-count').map(visibleText),
    ).toEqual(['20']);
    expect(visibleText(root)).toContain('This choice is permanent.');
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

  it('cannot be confirmed while the creature is away or on a job, and says why', () => {
    const away: Creature = { ...creature, away: true };
    page = createPage();
    const onEvolve = vi.fn();
    page.draw(
      <EvolveDrawer open creature={away} busy={false} onEvolve={onEvolve} onClose={vi.fn()} />,
    );
    page.click(forms(page.root)[1] as FakeElement);
    expect(confirm(page.root).hasAttribute('disabled')).toBe(true);
    expect(visibleText(page.root)).toContain('Away on a trip');
    page.click(confirm(page.root));
    expect(onEvolve).not.toHaveBeenCalled();
    page.unmount();
    const onJob: Creature = { ...creature, busy: { kind: 'job', id: 'job-1' } };
    page = createPage();
    page.draw(
      <EvolveDrawer open creature={onJob} busy={false} onEvolve={onEvolve} onClose={vi.fn()} />,
    );
    page.click(forms(page.root)[1] as FakeElement);
    expect(confirm(page.root).hasAttribute('disabled')).toBe(true);
    expect(visibleText(page.root)).toContain('On a job');
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
    expect(visibleText(gold)).toContain('Evolve');
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

  it('opens the screen for a line with one form too, with that form picked, and evolves on the one button', () => {
    const ready = sampleCreature('evolve ready');
    const evolution = { ...ready.evolution! };
    delete evolution.alt;
    const single: Creature = { ...ready, evolution };
    const { page: p, root, onEvolve } = tab([single]);
    p.click(byClass(root, 'cc-do')[0]?.childNodes[0] as FakeElement);
    // The press only opened the screen: nothing was spent yet, and the one form is already picked.
    expect(onEvolve).not.toHaveBeenCalled();
    expect(byRole(root, 'dialog')).toHaveLength(1);
    expect(visibleText(confirm(root))).toBe('Evolve into Pyrelynx');
    expect(confirm(root).hasAttribute('disabled')).toBe(false);
    p.click(confirm(root));
    expect(onEvolve).toHaveBeenCalledTimes(1);
    expect(onEvolve).toHaveBeenCalledWith(single, 'pyrelynx');
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });
});

describe('the evolve screen of a line with one form', () => {
  const ready = sampleCreature('evolve ready');
  const evolution = { ...ready.evolution! };
  delete evolution.alt;
  const single: Creature = { ...ready, evolution };

  function drawSingle(subject: Creature = single) {
    page = createPage();
    const onEvolve = vi.fn();
    page.draw(
      <EvolveDrawer open creature={subject} busy={false} onEvolve={onEvolve} onClose={vi.fn()} />,
    );
    return { page, root: page.root, onEvolve };
  }

  it('shows the one form on one picked card, like a card of two, and says nothing about it', () => {
    const { root } = drawSingle();
    const cards = forms(root);
    expect(cards).toHaveLength(1);
    const card = cards[0] as FakeElement;
    expect(visibleText(card)).toContain('Pyrelynx');
    expect(visibleText(card)).toContain('Payoff');
    expect(visibleText(card)).toContain('Inferno Strike');
    expect(visibleText(card)).toMatch(/HP\s*\d+/);
    expect(visibleText(card)).toMatch(/Atk\s*\d+/);
    expect(visibleText(card)).toMatch(/Spd\s*\d+/);
    // Picked already, and not a button: there is nothing to choose.
    expect(card.getAttribute('class')).toContain('on');
    expect(card.localName).not.toBe('button');
    expect(byClass(root, 'evolve-forms')[0]?.getAttribute('class')).toContain('single');
    // Show, don't tell: no sentence about there being one form.
    expect(visibleText(root)).not.toMatch(/only|one form|single/i);
  });

  it('keeps the cost, the permanent line and the one button, which names the form and works at once', () => {
    const { page: p, root, onEvolve } = drawSingle();
    expect(
      byClass(byClass(root, 'evolve-cost')[0] as FakeElement, 'part-count').map(visibleText),
    ).toEqual(['20']);
    expect(visibleText(root)).toContain('This choice is permanent.');
    const button = confirm(root);
    expect(visibleText(button)).toBe('Evolve into Pyrelynx');
    expect(button.hasAttribute('disabled')).toBe(false);
    p.click(button);
    expect(onEvolve).toHaveBeenCalledTimes(1);
    expect(onEvolve).toHaveBeenCalledWith(single, 'pyrelynx');
  });

  it('still waits for the server: not ready, busy, away or on a job keep the button off', () => {
    const notReady = drawSingle({ ...single, evolution: { ...evolution, available: false } });
    expect(visibleText(confirm(notReady.root))).toBe('Evolve into Pyrelynx');
    expect(confirm(notReady.root).hasAttribute('disabled')).toBe(true);
    notReady.page.click(confirm(notReady.root));
    expect(notReady.onEvolve).not.toHaveBeenCalled();
    page?.unmount();
    const away = drawSingle({ ...single, away: true });
    expect(confirm(away.root).hasAttribute('disabled')).toBe(true);
    expect(visibleText(away.root)).toContain('Away on a trip');
    page?.unmount();
    page = createPage();
    page.draw(<EvolveDrawer open creature={single} busy onEvolve={vi.fn()} onClose={vi.fn()} />);
    expect(confirm(page.root).hasAttribute('disabled')).toBe(true);
  });
});
