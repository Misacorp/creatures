import { afterEach, describe, expect, it } from 'vitest';
import { PreviewStatus } from './ui/PreviewStatus';
import { byClass, byRole, createPage, type Page } from './test-dom';
import { useJobPreview } from './use-job-preview';

/**
 * The preview hook of the Workshop starters (craft and dismantle): the answer belongs to the creature it was
 * asked for, a new creature starts as loading at once, and an old answer never lands on a new creature.
 */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

interface Deferred {
  resolve: (value: string) => void;
  reject: () => void;
}

function Probe({
  creatureId,
  load,
}: {
  creatureId: string | null;
  load: (id: string) => Promise<string>;
}) {
  const { status, preview } = useJobPreview(creatureId, load, []);
  return (
    <div>
      <span class="status">{status}</span>
      <span class="preview">{preview ?? 'none'}</span>
      <PreviewStatus status={status} what="the odds" />
    </div>
  );
}

/** A loader whose answers the test settles by hand, by creature. */
function loader(): { load: (id: string) => Promise<string>; asked: Map<string, Deferred> } {
  const asked = new Map<string, Deferred>();
  return {
    asked,
    load: (id) =>
      new Promise<string>((resolve, reject) => {
        asked.set(id, { resolve, reject: () => reject(new Error('no')) });
      }),
  };
}

async function settle(p: Page): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  p.update(() => undefined);
}

function text(p: Page, cls: string): string {
  return byClass(p.root, cls)[0]?.textContent ?? '';
}

describe('useJobPreview', () => {
  it('is idle without a creature, then loading, then ready with the answer', async () => {
    const { load, asked } = loader();
    page = createPage();
    page.draw(<Probe creatureId={null} load={load} />);
    expect(text(page, 'status')).toBe('idle');
    expect(asked.size).toBe(0);

    page.draw(<Probe creatureId="a" load={load} />);
    expect(text(page, 'status')).toBe('loading');
    expect(byRole(page.root, 'status').map((el) => el.textContent)).toContain(
      'Loading the odds...',
    );
    asked.get('a')?.resolve('odds of a');
    await settle(page);
    expect(text(page, 'status')).toBe('ready');
    expect(text(page, 'preview')).toBe('odds of a');
    expect(byRole(page.root, 'status')).toHaveLength(0);
  });

  it('starts a new creature as loading at once, and drops a late answer for the old one', async () => {
    const { load, asked } = loader();
    page = createPage();
    page.draw(<Probe creatureId="a" load={load} />);
    asked.get('a')?.resolve('odds of a');
    await settle(page);
    expect(text(page, 'preview')).toBe('odds of a');

    page.draw(<Probe creatureId="b" load={load} />);
    expect(text(page, 'status')).toBe('loading');
    expect(text(page, 'preview')).toBe('none');
    page.draw(<Probe creatureId="c" load={load} />);
    asked.get('b')?.resolve('odds of b');
    await settle(page);
    expect(text(page, 'status')).toBe('loading');
    asked.get('c')?.resolve('odds of c');
    await settle(page);
    expect(text(page, 'preview')).toBe('odds of c');
  });

  it('says it failed, with how to retry, and a new pick tries again', async () => {
    const { load, asked } = loader();
    page = createPage();
    page.draw(<Probe creatureId="a" load={load} />);
    asked.get('a')?.reject();
    await settle(page);
    expect(text(page, 'status')).toBe('failed');
    expect(byRole(page.root, 'alert').map((el) => el.textContent)).toEqual([
      'Could not load the odds. Pick again to retry.',
    ]);
    page.draw(<Probe creatureId="b" load={load} />);
    expect(text(page, 'status')).toBe('loading');
    expect(byRole(page.root, 'alert')).toHaveLength(0);
  });
});
