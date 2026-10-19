import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, find, nameOf, visibleText, type Page } from '../test-dom';
import { ActionButton } from './ActionButton';

/** The stylesheet as text: the tests' DOM has no layout, so the centring rule is checked in the source. */
const styles = import.meta.glob<string>('../styles/components/action-button.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const css = styles['../styles/components/action-button.css'] ?? '';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function drawn(props: Partial<Parameters<typeof ActionButton>[0]> = {}, onClick = vi.fn()) {
  page?.unmount();
  page = createPage();
  page.draw(<ActionButton label="Evolve" onClick={onClick} {...props} />);
  const [button] = byClass(page.root, 'action-btn');
  if (button === undefined) throw new Error('no button');
  return button;
}

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the ActionButton', () => {
  it('is a gold button with the label and a detail beside it, named by both', () => {
    const button = drawn({ detail: '20 Essence' });
    expect(button.localName).toBe('button');
    expect(button.getAttribute('class')).toContain('primary');
    expect(visibleText(button)).toBe('Evolve 20 Essence');
    expect(nameOf(button)).toBe('Evolve 20 Essence');
    expect(byClass(button, 'ab-detail')).toHaveLength(1);
  });

  it('draws no detail element, and so keeps no room for one, when the detail is missing, empty or blank', () => {
    for (const detail of [undefined, '', '   ']) {
      const button = drawn({ detail });
      expect(byClass(button, 'ab-detail')).toHaveLength(0);
      expect(find(button, (e) => e.localName === 'small')).toHaveLength(0);
      expect(visibleText(button)).toBe('Evolve');
      // Only the label is inside: no spacer or empty line that could take height.
      expect(button.childNodes).toHaveLength(1);
    }
  });

  it('calls onClick when pressed, and not when disabled', () => {
    const onClick = vi.fn();
    const button = drawn({ detail: 'Cost' }, onClick);
    page?.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    const off = vi.fn();
    const disabled = drawn({ disabled: true }, off);
    expect(disabled.hasAttribute('disabled')).toBe(true);
    page?.click(disabled);
    expect(off).not.toHaveBeenCalled();
  });

  it('marks the wide and the large looks', () => {
    const plain = drawn();
    expect(plain.getAttribute('class')).not.toContain('wide');
    expect(plain.getAttribute('class')).not.toContain('large');
    const big = drawn({ wide: true, large: true });
    expect(big.getAttribute('class')).toContain('wide');
    expect(big.getAttribute('class')).toContain('large');
  });

  it('shows text, never markup', () => {
    const button = drawn({ detail: '<b>x</b>' });
    expect(visibleText(button)).toContain('<b>x</b>');
    expect(find(button, (e) => e.localName === 'b')).toHaveLength(0);
  });
});

describe('the ActionButton look (the root cause of the padding under the text)', () => {
  it('centres its rows in the box instead of leaving them at the top', () => {
    const body = rule('.action-btn');
    // A flex box with a minimum height and baseline alignment puts the row at the top: the spare height
    // ends up under the text. `align-content: center` is what centres the row (or two rows).
    expect(body).toContain('display: flex');
    expect(body).toContain('align-content: center');
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    // The padding is symmetric (no bottom-only padding).
    expect(body).toContain('padding-block');
    expect(body).not.toMatch(/padding-bottom/);
  });
});
