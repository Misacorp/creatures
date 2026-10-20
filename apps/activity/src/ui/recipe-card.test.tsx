import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, nameOf, visibleText, type Page } from '../test-dom';
import { conversionViews } from '../conversion-view';
import { RecipeCard, type RecipeCardProps } from './RecipeCard';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function view(have: number) {
  const found = conversionViews('refine', { 'lure-basic': have }, {})[0];
  if (found === undefined) throw new Error('no view');
  return found;
}

function drawn(props: Partial<RecipeCardProps> = {}, onStart = vi.fn()) {
  page?.unmount();
  page = createPage();
  const v = view(3);
  page.draw(
    <RecipeCard
      inputs={v.inputs}
      outputs={v.outputs}
      actionLabel="Refine"
      onStart={onStart}
      {...props}
    />,
  );
  const [button] = byName(page.root, 'button', 'Refine');
  if (button === undefined) throw new Error('no button');
  return button;
}

describe('the RecipeCard', () => {
  it('shows each input as have / need, an arrow and the outputs', () => {
    drawn();
    const root = page?.root;
    if (root === undefined) throw new Error('no page');
    const text = visibleText(root);
    expect(text).toContain('3 / 3');
    expect(text).toContain('Plain Lure');
    expect(text).toContain('Sweet Lure');
    expect(byClass(root, 'recipe-arrow')).toHaveLength(1);
    expect(byClass(root, 'short')).toHaveLength(0);
  });

  it('marks a short input and says why it cannot start', () => {
    const v = view(1);
    const button = drawn({ inputs: v.inputs, disabledReason: 'Needs 2 more Plain Lure.' }, vi.fn());
    const root = page?.root;
    if (root === undefined) throw new Error('no page');
    expect(visibleText(root)).toContain('1 / 3');
    expect(byClass(root, 'short')).toHaveLength(1);
    expect(visibleText(root)).toContain('Needs 2 more Plain Lure.');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('calls onStart when pressed, and not when disabled or busy', () => {
    const start = vi.fn();
    const go = drawn({}, start);
    page?.click(go);
    expect(start).toHaveBeenCalledTimes(1);

    const off = vi.fn();
    const locked = drawn({ disabledReason: 'Needs Crafting level 3.' }, off);
    page?.click(locked);
    const working = drawn({ busy: true }, off);
    page?.click(working);
    expect(off).not.toHaveBeenCalled();
  });

  it('shows the time badge and names the button by its words', () => {
    const button = drawn({
      duration: { key: 't', icon: { kind: 'glyph', id: 'hourglass' }, amount: '2 h' },
    });
    expect(nameOf(button)).toBe('Refine');
    expect(visibleText(page?.root as never)).toContain('2 h');
  });

  it('renders text as text, never markup', () => {
    drawn({ disabledReason: '<b>x</b>' });
    const root = page?.root;
    if (root === undefined) throw new Error('no page');
    expect(visibleText(root)).toContain('<b>x</b>');
    expect(byName(root, 'b', /./)).toHaveLength(0);
  });
});
