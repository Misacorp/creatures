import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { FoldRow } from './FoldRow';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function drawn(open: boolean, onToggle = vi.fn()): FakeElement {
  page = createPage();
  page.draw(
    <FoldRow open={open} onToggle={onToggle} controls="folded-things">
      3 more need Crafting level 3
    </FoldRow>,
  );
  const [row] = byClass(page.root, 'fold-row');
  if (row === undefined) throw new Error('no fold row');
  return row;
}

describe('the FoldRow', () => {
  it('is a real button with its label', () => {
    const row = drawn(false);
    expect(row.localName).toBe('button');
    expect(row.getAttribute('type')).toBe('button');
    expect(visibleText(row)).toBe('3 more need Crafting level 3');
  });

  it('says closed or open in aria-expanded', () => {
    expect(drawn(false).getAttribute('aria-expanded')).toBe('false');
    page?.unmount();
    expect(drawn(true).getAttribute('aria-expanded')).toBe('true');
  });

  it('names the folded content in aria-controls', () => {
    expect(drawn(false).getAttribute('aria-controls')).toBe('folded-things');
  });

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn();
    const row = drawn(false, onToggle);
    page?.click(row);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
