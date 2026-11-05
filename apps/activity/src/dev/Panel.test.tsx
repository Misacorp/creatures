import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';

/**
 * The panel's Raid section as a test bench: the steps are listed in the order they are used, each button runs its tool with the body the
 * server expects, an error code becomes a plain sentence, and a played stage opens its replay at once. The network and the replay screen
 * are stand-ins (the server side is `apps/worker/test/dev-tools-raid-bench.test.ts`).
 */

const runTool = vi.fn<(tool: string, body: Record<string, unknown>) => Promise<unknown>>();

vi.mock('./dev-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dev-api')>()),
  runTool: (tool: string, body: Record<string, unknown>) => runTool(tool, body),
  fetchDevState: () => Promise.resolve(null),
  fetchDevEvents: () => Promise.resolve([]),
}));

vi.mock('../build-info', () => ({
  readBuildInfo: () => ({ branch: null, commit: null, environment: null }),
  buildRows: () => [],
}));

vi.mock('../Replay', () => ({
  Replay: (props: { weekId: string; party: number; phase: string; rules?: number }) => (
    <div
      class="replay-stand-in"
      data-week={props.weekId}
      data-party={String(props.party)}
      data-phase={props.phase}
      data-rules={String(props.rules)}
    />
  ),
}));

const { default: DevPanel } = await import('./Panel');

let page: Page | null = null;

beforeEach(() => {
  runTool.mockReset();
});

afterEach(() => {
  page?.unmount();
  page = null;
});

/** The panel on the Raid tab with its drawer open. */
async function openPanel(): Promise<Page> {
  page = createPage();
  const changed = vi.fn();
  page.draw(<DevPanel tab="raid" creatures={[]} onChanged={changed} />);
  const [fab] = byClass(page.root, 'dev-fab');
  if (fab === undefined) throw new Error('no DEV button');
  page.click(fab);
  await Promise.resolve();
  return page;
}

/** Presses a button: the fake DOM does not submit a form on a click, so the form it belongs to is submitted. */
function press(p: Page, label: string): void {
  const [button] = byName(p.root, 'button', label);
  if (button === undefined) throw new Error(`no button ${label}`);
  let form = button.parentNode;
  while (form !== null && form.localName !== 'form') form = form.parentNode;
  if (form === null) throw new Error(`no form around ${label}`);
  p.event(form, 'submit');
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('the Raid section of the dev panel', () => {
  it('lists the bench in the order it is used', async () => {
    const p = await openPanel();
    const text = visibleText(p.root);
    const order = [
      'Clear the board',
      'Fill the empty spots',
      'Boss and Boss Rank',
      'Play stage 1',
      'Play stage 2',
      'Play the finale',
      'Watch the finale live',
    ].map((label) => text.indexOf(label));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The tools the bench replaced have no control.
    for (const gone of [
      'Jump the week to',
      'Resolve now',
      'Festival week',
      'Run a full simulated week',
    ]) {
      expect(text).not.toContain(gone);
    }
  });

  it('shows the ranks with their bosses in the Boss Rank list', async () => {
    const p = await openPanel();
    const options = byName(p.root, 'option', /^Rank \d+/).map((o) => visibleText(o));
    expect(options.length).toBeGreaterThanOrEqual(15);
    expect(options[0]).toBe('Rank 1 · Tidal Colossus');
    expect(options).toContain('Rank 8 · Storm Sovereign');
  });

  it('clears the board, fills it and sets a rank with the right bodies', async () => {
    runTool.mockResolvedValue({ ok: true, result: { rank: 4, added: 3, boardFull: false } });
    const p = await openPanel();
    const click = async (label: string): Promise<void> => {
      press(p, label);
      await flush();
    };
    await click('Clear the board');
    expect(runTool).toHaveBeenLastCalledWith('raid-clear', {});
    await click('Fill');
    expect(runTool).toHaveBeenLastCalledWith('raid-fill', {});
    expect(visibleText(p.root)).toContain('3 simulated players added.');
    await click('Set');
    expect(runTool).toHaveBeenLastCalledWith('raid-rank', { rank: 1 });
  });

  it('opens the replay at once after a stage is played, and closes the drawer', async () => {
    runTool.mockResolvedValue({
      ok: true,
      result: {
        weekId: '2027-W02',
        stage: 2,
        live: false,
        bossFell: false,
        watch: { week: '2027-W02', party: 3, phase: 'stage2' },
      },
    });
    const p = await openPanel();
    press(p, 'Play stage 2');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('raid-play', { stage: 'stage2' });
    const [replay] = byClass(p.root, 'replay-stand-in');
    expect(replay?.getAttribute('data-week')).toBe('2027-W02');
    expect(replay?.getAttribute('data-party')).toBe('3');
    // The replay screen takes a v2 week's stage 2 as `phase2`, with the rules named.
    expect(replay?.getAttribute('data-phase')).toBe('phase2');
    expect(replay?.getAttribute('data-rules')).toBe('2');
    expect(byClass(p.root, 'dev-drawer')).toHaveLength(0);
  });

  it('starts the finale live without a replay', async () => {
    runTool.mockResolvedValue({
      ok: true,
      result: { weekId: '2027-W02', stage: 3, live: true, watch: null, bossFell: false },
    });
    const p = await openPanel();
    press(p, 'Watch the finale live');
    await flush();
    expect(runTool).toHaveBeenLastCalledWith('raid-play', { stage: 'finale', live: true });
    expect(byClass(p.root, 'replay-stand-in')).toHaveLength(0);
    expect(visibleText(p.root)).toContain('The finale started live.');
  });

  it('turns a refusal into a plain sentence', async () => {
    const p = await openPanel();
    const sentence = async (label: string, error: string): Promise<string> => {
      runTool.mockResolvedValueOnce({ ok: false, error });
      press(p, label);
      await flush();
      return visibleText(byClass(p.root, 'dev-status')[0] ?? p.root);
    };
    expect(await sentence('Play stage 2', 'play_stage1_first')).toContain('Play stage 1 first.');
    expect(await sentence('Play the finale', 'play_stage2_first')).toContain('Play stage 2 first.');
    expect(await sentence('Play stage 2', 'boss_fell')).toContain('The boss already fell.');
    expect(await sentence('Set', 'fought')).toContain('Clear the board first.');
    expect(await sentence('Play stage 1', 'already_played')).toContain('Clear the board');
    expect(byClass(p.root, 'replay-stand-in')).toHaveLength(0);
  });
});
