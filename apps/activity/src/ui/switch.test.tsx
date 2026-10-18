import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { Switch } from './Switch';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function drawn(props: { on: boolean; disabled?: boolean }, onChange = vi.fn()): FakeElement {
  page = createPage();
  page.draw(
    <Switch on={props.on} onChange={onChange} label="Compare" disabled={props.disabled === true} />,
  );
  const [button] = byClass(page.root, 'switch');
  if (button === undefined) throw new Error('no switch');
  return button;
}

describe('the Switch', () => {
  it('is a real button with role switch, aria-checked and its label', () => {
    const off = drawn({ on: false });
    expect(off.localName).toBe('button');
    expect(off.getAttribute('role')).toBe('switch');
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(visibleText(off)).toBe('Compare');
  });

  it('says on in aria-checked and in a class the look uses', () => {
    const on = drawn({ on: true });
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(on.getAttribute('class')).toContain('on');
    page?.unmount();
    expect(drawn({ on: false }).getAttribute('class')).not.toContain('on');
  });

  it('asks for the other state when pressed', () => {
    const onChange = vi.fn();
    const off = drawn({ on: false }, onChange);
    page?.click(off);
    expect(onChange).toHaveBeenCalledWith(true);
    page?.unmount();
    const on = drawn({ on: true }, onChange);
    page?.click(on);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does nothing when it is disabled', () => {
    const onChange = vi.fn();
    const disabled = drawn({ on: true, disabled: true }, onChange);
    expect(disabled.hasAttribute('disabled')).toBe(true);
    page?.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });
});
