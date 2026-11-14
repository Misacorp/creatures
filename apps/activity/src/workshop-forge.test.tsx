import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEAR_STATE, SAMPLE_GEAR } from './creature-card-sample';
import type { GearActions } from './gear-actions';
import { byName, createPage, visibleText, type Page } from './test-dom';
import { PopoverHost } from './PopoverHost';
import { sampleAnvil, sampleOrder, withAnvils } from './valley/forge-sample';
import { sampleValley } from './valley/signpost-sample';
import { trayStates } from './valley/tray-state';
import { Workshop, type ForgeMode } from './Workshop';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  page?.unmount();
  page = null;
});

const actions: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  checkDismantle: () => Promise.resolve({ locked: [] }),
  dismantlePile: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};

const creatures = GEAR_STATE.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [smith] = creatures;
if (smith === undefined) throw new Error('fixture');
const blueprint = SAMPLE_GEAR.blueprints[0]?.baseId ?? 'kelp-cap';

function draw(forge: ForgeMode | undefined, sent: unknown[] = []): Page {
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <Workshop
        state={{ ...GEAR_STATE, creatures }}
        gear={SAMPLE_GEAR}
        failed={false}
        offset={0}
        busy={false}
        reveal={null}
        actions={actions}
        onRetry={() => undefined}
        onClaimed={() => undefined}
        onDismissReveal={() => undefined}
        {...(forge === undefined ? {} : { forge })}
      />
    </PopoverHost>,
  );
  void sent;
  return p;
}

function forgeMode(anvils: ReturnType<typeof sampleAnvil>[], sent: unknown[] = []): ForgeMode {
  const visit = withAnvils(sampleValley(creatures, []), anvils);
  const ok = () => Promise.resolve(true);
  return {
    visit,
    trayInput: { trips: [], jobs: null, now: 0, ...trayStates(visit) },
    acorns: 500,
    actions: {
      post: ok,
      buyAnvil: ok,
      buyKit: ok,
      setKit: ok,
      order: (request) => {
        sent.push(request);
        return Promise.resolve(true);
      },
    },
    onOpenPaddock: () => undefined,
    onOpenMarket: () => undefined,
    inside: true,
  };
}

describe('the Workshop with the Forge on', () => {
  it('is the Forge canvas: anvils in the scene, no job slots or supply crafts, the bag and plans behind the chest and the table', () => {
    const p = draw(forgeMode([sampleAnvil('a1', smith.id, [sampleOrder('o1', blueprint, 2)])]));
    const text = visibleText(p.root);
    expect(text).not.toMatch(/Craft supplies/);
    expect(byName(p.root, 'button', /^Anvil 1/).length).toBe(1);
    // The bag and the plans are not on the page: they open from the scene.
    expect(byName(p.root, 'button', /^Order$/).length).toBe(0);
    expect(text).not.toMatch(/Filter and sort/);
    p.click(byName(p.root, 'button', /^The bag/)[0] as never);
    expect(visibleText(p.root)).toMatch(/Filter and sort/);
  });

  it('a blueprint’s Order (from the plans) opens the order wizard with that blueprint picked', () => {
    const sent: unknown[] = [];
    const p = draw(forgeMode([sampleAnvil('a1', smith.id, [])], sent), sent);
    p.click(byName(p.root, 'button', /^The plans/)[0] as never);
    const order = byName(p.root, 'button', /^Order$/)[0];
    if (order === undefined) throw new Error('no order button');
    p.click(order);
    expect(visibleText(p.root)).toMatch(/The order/);
    p.click(byName(p.root, 'button', /Add to the queue/)[0] ?? order);
    expect(sent).toEqual([
      expect.objectContaining({ action: 'add', seatId: 'a1', blueprintId: blueprint, count: 1 }),
    ]);
  });

  it('with no anvil yet a blueprint cannot be ordered, and says so', () => {
    const p = draw(forgeMode([]));
    p.click(byName(p.root, 'button', /^The plans/)[0] as never);
    const order = byName(p.root, 'button', /^Order$/)[0];
    expect(order?.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(p.root)).toMatch(/Buy an anvil to order pieces/);
  });

  it('with the Forge off the Workshop is as it was: job slots, crafts, no anvils, no filter', () => {
    const p = draw(undefined);
    const text = visibleText(p.root);
    expect(text).not.toMatch(/Anvil 1/);
    expect(text).not.toMatch(/Filter and sort/);
    expect(text).toMatch(/Craft supplies/);
    expect(byName(p.root, 'button', /^Craft$/).length).toBeGreaterThan(0);
  });
});
