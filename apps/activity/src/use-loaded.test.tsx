import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, type Page } from './test-dom';
import { useLoaded } from './use-loaded';

/**
 * The one-shot load hook: the value, whether it failed and why, and (on request) a clean slate when what
 * is loaded changes.
 */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

interface Pending {
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

function loader(): { load: (id: string) => Promise<string>; asked: Map<string, Pending> } {
  const asked = new Map<string, Pending>();
  return {
    asked,
    load: (id) =>
      new Promise<string>((resolve, reject) => {
        asked.set(id, { resolve, reject });
      }),
  };
}

function Probe({
  id,
  load,
  reset,
}: {
  id: string;
  load: (id: string) => Promise<string>;
  reset: boolean;
}) {
  const loaded = useLoaded(() => load(id), [id], undefined, reset);
  return (
    <div>
      <span class="value">{loaded.value ?? 'none'}</span>
      <span class="failed">{String(loaded.failed)}</span>
      <span class="error">
        {loaded.failed && loaded.error instanceof Error ? loaded.error.message : ''}
      </span>
    </div>
  );
}

async function settle(p: Page): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  p.update(() => undefined);
}

function text(p: Page, cls: string): string {
  return byClass(p.root, cls)[0]?.textContent ?? '';
}

describe('useLoaded', () => {
  it('gives the value, and the reason a load failed until a later one works', async () => {
    const { load, asked } = loader();
    page = createPage();
    page.draw(<Probe id="a" load={load} reset={false} />);
    expect(text(page, 'value')).toBe('none');
    asked.get('a')?.reject(new Error('the server said no'));
    await settle(page);
    expect(text(page, 'failed')).toBe('true');
    expect(text(page, 'error')).toBe('the server said no');

    page.draw(<Probe id="b" load={load} reset={false} />);
    asked.get('b')?.resolve('b is here');
    await settle(page);
    expect(text(page, 'value')).toBe('b is here');
    expect(text(page, 'failed')).toBe('false');
  });

  it('keeps the last value while the next loads, unless asked to start clean', async () => {
    const { load, asked } = loader();
    page = createPage();
    page.draw(<Probe id="a" load={load} reset={false} />);
    asked.get('a')?.resolve('a is here');
    await settle(page);
    page.draw(<Probe id="b" load={load} reset={false} />);
    expect(text(page, 'value')).toBe('a is here');

    page.unmount();
    const fresh = loader();
    page = createPage();
    page.draw(<Probe id="a" load={fresh.load} reset />);
    fresh.asked.get('a')?.resolve('a is here');
    await settle(page);
    page.draw(<Probe id="b" load={fresh.load} reset />);
    expect(text(page, 'value')).toBe('none');
    fresh.asked.get('b')?.resolve('b is here');
    await settle(page);
    expect(text(page, 'value')).toBe('b is here');
  });
});
