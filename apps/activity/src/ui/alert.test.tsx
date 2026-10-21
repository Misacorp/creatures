import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { Alert, ALERT_DISMISS_MS, type AlertLevel } from './Alert';

let page: Page | null = null;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  page?.unmount();
  page = null;
});

function draw(node: preact.ComponentChild): Page {
  page = createPage();
  page.draw(node);
  return page;
}

describe('an alert', () => {
  it('has its level in its class, an icon, the bold title and the message', () => {
    const p = draw(
      <Alert level="info" title="Heads up.">
        The raid starts on Sunday.
      </Alert>,
    );
    const [root] = byClass(p.root, 'alert');
    expect(root?.getAttribute('class')).toBe('alert alert-info');
    expect(byClass(p.root, 'alert-icon')).toHaveLength(1);
    expect(visibleText(byClass(p.root, 'alert-title')[0] ?? p.root)).toBe('Heads up.');
    expect(visibleText(p.root)).toBe('Heads up. The raid starts on Sunday.');
    expect(byClass(p.root, 'alert-close')).toHaveLength(0);
  });

  it('puts the message on its own line under the title when stacked', () => {
    const p = draw(
      <Alert level="success" title="Done" layout="stacked">
        Saved.
      </Alert>,
    );
    expect(byClass(p.root, 'alert-text')[0]?.getAttribute('class')).toContain('stacked');
  });

  it('interrupts a screen reader only at the alert level', () => {
    const roles = (['info', 'success', 'warning', 'alert'] as AlertLevel[]).map((level) => {
      const p = draw(<Alert level={level}>Text</Alert>);
      const role = byClass(p.root, 'alert')[0]?.getAttribute('role');
      p.unmount();
      page = null;
      return role;
    });
    expect(roles).toEqual(['status', 'status', 'status', 'alert']);
  });

  it('slides out on the X, then is gone and says so', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const p = draw(
      <Alert level="warning" onDismiss={onDismiss}>
        Your bag is full.
      </Alert>,
    );
    const [x] = byName(p.root, 'button', 'Dismiss');
    if (x === undefined) throw new Error('no X');
    p.click(x);
    expect(byClass(p.root, 'alert')[0]?.getAttribute('class')).toContain('leaving');
    expect(onDismiss).not.toHaveBeenCalled();
    p.update(() => {
      vi.advanceTimersByTime(ALERT_DISMISS_MS);
    });
    expect(byClass(p.root, 'alert')).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('goes at once with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onDismiss = vi.fn();
    const p = draw(
      <Alert level="alert" onDismiss={onDismiss} dismissLabel="Close the error">
        It failed.
      </Alert>,
    );
    const [x] = byName(p.root, 'button', 'Close the error');
    if (x === undefined) throw new Error('no X');
    p.click(x);
    expect(byClass(p.root, 'alert')).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
