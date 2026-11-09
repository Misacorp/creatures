import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';

/** The Valley group of the dev panel: shown only with the valley systems on, and the wipe waits for its typed word. */

const runTool = vi.fn<(tool: string, body: Record<string, unknown>) => Promise<unknown>>();

vi.mock('./dev-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dev-api')>()),
  runTool: (tool: string, body: Record<string, unknown>) => runTool(tool, body),
  fetchDevState: () => Promise.resolve(null),
  fetchDevEvents: () => Promise.resolve([]),
  fetchPresetChoices: () => Promise.resolve(null),
}));
vi.mock('../build-info', () => ({
  readBuildInfo: () => ({ branch: null, commit: null, environment: null }),
  buildRows: () => [],
}));
vi.mock('../Replay', () => ({ Replay: () => <div /> }));

const { default: DevPanel } = await import('./Panel');

let page: Page | null = null;
beforeEach(() => {
  runTool.mockReset();
});
afterEach(() => {
  page?.unmount();
  page = null;
});

async function openPanel(valleySystems: boolean): Promise<Page> {
  page = createPage();
  page.draw(
    <DevPanel tab="raid" creatures={[]} valleySystems={valleySystems} onChanged={vi.fn()} />,
  );
  const [fab] = byClass(page.root, 'dev-fab');
  if (fab === undefined) throw new Error('no DEV button');
  page.click(fab);
  await Promise.resolve();
  const [valley] = byName(page.root, 'button', /^Valley$/);
  if (valley !== undefined) page.click(valley);
  await Promise.resolve();
  return page;
}

function submitFormOf(p: Page, label: string): void {
  const [button] = byName(p.root, 'button', label);
  if (button === undefined) throw new Error(`no button ${label}`);
  let form = button.parentNode;
  while (form !== null && form.localName !== 'form') form = form.parentNode;
  if (form === null) throw new Error(`no form around ${label}`);
  p.event(form, 'submit');
}

describe('the Valley group', () => {
  it('is hidden without the valley systems', async () => {
    const p = await openPanel(false);
    expect(visibleText(p.root)).not.toContain('Play days');
    expect(visibleText(p.root)).not.toContain('Valley fresh');
  });

  it('lists every valley tool with the valley systems on', async () => {
    const p = await openPanel(true);
    const text = visibleText(p.root);
    for (const label of [
      'Valley fresh',
      'Play days',
      'Make the bots',
      'Play one day',
      'Month report',
      'Visitor arrives now',
      'Teacher arrives now',
      'Announce next teacher',
      "Tick a creature's trial",
      'Hold the ceremony now',
    ]) {
      expect(text, label).toContain(label);
    }
  });

  it('does not wipe until "everyone" is typed', async () => {
    const p = await openPanel(true);
    submitFormOf(p, 'Valley fresh');
    await Promise.resolve();
    expect(runTool).not.toHaveBeenCalled();
  });

  it('runs a timed tool with its body', async () => {
    runTool.mockResolvedValue({ ok: true, result: {} });
    const p = await openPanel(true);
    submitFormOf(p, 'Teacher arrives now');
    await Promise.resolve();
    expect(runTool).toHaveBeenCalledWith('school-teacher', { mode: 'arrive' });
  });
});
