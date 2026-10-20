import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversionCrafting } from './ConversionCrafting';
import { SAMPLE_GEAR, sampleRoster } from './creature-card-sample';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(stock: Record<string, number>, onStart = vi.fn()): FakeElement {
  page = createPage();
  page.draw(
    <ConversionCrafting
      gear={SAMPLE_GEAR}
      creatures={sampleRoster(3)}
      stock={stock}
      busy={false}
      onStart={onStart}
    />,
  );
  return page.root;
}

describe('Refine and recycle in the Workshop', () => {
  it('says what it is for when there is nothing to work on', () => {
    const root = draw({});
    expect(visibleText(root)).toContain('can be refined or recycled here');
    expect(byClass(root, 'recipe-card')).toHaveLength(0);
  });

  it('lists a refine and a recycle card for the supplies held, with the verbs on the buttons', () => {
    const root = draw({ 'lure-basic': 3, 'lantern-good': 1 });
    expect(byClass(root, 'recipe-card')).toHaveLength(3);
    expect(byName(root, 'button', 'Refine')).toHaveLength(2);
    expect(byName(root, 'button', 'Recycle')).toHaveLength(1);
    expect(visibleText(root)).toContain('3 / 3');
  });

  it('keeps the button off, with the reason, when inputs are missing', () => {
    const root = draw({ 'lure-basic': 1 });
    const [refine] = byName(root, 'button', 'Refine');
    expect(refine?.hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('Needs 2 more Plain Lure.');
  });

  it('opens the creature picker for a card, and starts nothing before the player confirms', () => {
    const onStart = vi.fn();
    const root = draw({ 'lantern-good': 1 }, onStart);
    const [recycle] = byName(root, 'button', 'Recycle');
    if (recycle === undefined) throw new Error('no Recycle button');
    expect(recycle.hasAttribute('disabled')).toBe(false);
    page?.click(recycle);
    expect(byClass(root, 'job-starter')).toHaveLength(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});
