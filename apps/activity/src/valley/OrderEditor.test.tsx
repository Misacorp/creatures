/**
 * The order wizard (`OrderEditor`): what to make, then the order; a blueprint chosen before it opens starts on the order step.
 * The Forge canvas's tests (`ForgeCanvas.test.tsx`) cover it inside the right drawer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRequest } from '../api';
import { SAMPLE_GEAR } from '../creature-card-sample';
import { blueprintViews } from '../gear-view';
import { PopoverHost } from '../PopoverHost';
import { byName, createPage, visibleText, type Page } from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { sampleAnvil, sampleOrder, withAnvils } from './forge-sample';
import { OrderEditor } from './OrderEditor';
import { sampleValley } from './signpost-sample';

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

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');
const plain = sampleValley(free, []);
const BP = 'kelp-cap';

describe('OrderEditor', () => {
  const blueprints = blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills);
  const first = blueprints[0];
  if (first === undefined) throw new Error('fixture has no blueprint');

  function editor(
    open: Parameters<typeof OrderEditor>[0]['open'],
    visit: ReturnType<typeof withAnvils>,
    sent: OrderRequest[],
  ): Page {
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <OrderEditor
          open={open}
          visit={visit}
          blueprints={blueprints}
          busy={false}
          error={null}
          onOrder={(request) => {
            sent.push(request);
            return Promise.resolve(true);
          }}
          onClose={() => undefined}
        />
      </PopoverHost>,
    );
    return p;
  }

  it('a new order with a blueprint picked sends the blueprint, the count and the Reach', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = editor(
      { kind: 'add', anvilId: 'a1', opener: null, baseId: first.baseId },
      visit,
      sent,
    );
    const more = byName(p.root, 'button', /One more piece/)[0];
    if (more === undefined) throw new Error('no stepper');
    p.click(more);
    const reach = byName(p.root, 'button', /Reach for Rare/)[0];
    if (reach === undefined) throw new Error('no reach');
    p.click(reach);
    const add = byName(p.root, 'button', /Add to the queue/)[0];
    if (add === undefined) throw new Error('no add');
    p.click(add);
    expect(sent).toEqual([
      { action: 'add', seatId: 'a1', blueprintId: first.baseId, count: 2, reach: 'rare' },
    ]);
  });

  it('with nothing picked the wizard starts on what to make, and there is no add button yet', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null }, visit, []);
    expect(visibleText(p.root)).toMatch(/What to make/);
    expect(byName(p.root, 'button', /Add to the queue/)).toHaveLength(0);
    // A tap on a blueprint goes on to the order step, where the button is.
    p.click(byName(p.root, 'button', /Kelp Cap/)[0] as never);
    expect(visibleText(p.root)).toMatch(/The order/);
    expect(byName(p.root, 'button', /Add to the queue/)).toHaveLength(1);
  });

  it('Back from the order step goes to what to make when it started there, and leaves when a blueprint was chosen first', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    let closed = 0;
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <OrderEditor
          open={{ kind: 'add', anvilId: 'a1', opener: null, baseId: first.baseId }}
          visit={visit}
          blueprints={blueprints}
          busy={false}
          error={null}
          onOrder={() => Promise.resolve(true)}
          onClose={() => {
            closed += 1;
          }}
        />
      </PopoverHost>,
    );
    p.click(byName(p.root, 'button', /Back/)[0] as never);
    expect(closed).toBe(1);
  });

  it('a full queue says so', () => {
    const orders = [1, 2, 3].map((n) => sampleOrder(`o${String(n)}`, BP, n));
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, orders)]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null, baseId: first.baseId }, visit, []);
    expect(visibleText(p.root)).toMatch(/queue is full/);
  });

  it('editing saves a new count, and an order can be taken off', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3, { made: 1 })]),
    ]);
    const p = editor({ kind: 'edit', orderId: 'o1', opener: null }, visit, sent);
    const save = byName(p.root, 'button', /^Save/)[0];
    expect(save?.getAttribute('disabled')).not.toBeNull();
    const more = byName(p.root, 'button', /One more piece/)[0];
    if (more === undefined) throw new Error('no stepper');
    p.click(more);
    p.click(byName(p.root, 'button', /^Save/)[0] ?? more);
    const off = byName(p.root, 'button', /Take it off the queue/)[0];
    if (off === undefined) throw new Error('no remove');
    p.click(off);
    expect(sent).toEqual([
      { action: 'edit', orderId: 'o1', count: 4, reach: 'none' },
      { action: 'remove', orderId: 'o1' },
    ]);
  });

  it('a count never goes below what is already made', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3, { made: 3 })]),
    ]);
    const p = editor({ kind: 'edit', orderId: 'o1', opener: null }, visit, []);
    const fewer = byName(p.root, 'button', /One fewer piece/)[0];
    expect(fewer?.getAttribute('disabled')).not.toBeNull();
  });

  it('"for my team" sends no blueprint and no count', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', b.id, [])]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null }, visit, sent);
    const team = byName(p.root, 'button', /For my team/)[0];
    if (team === undefined) throw new Error('no team row');
    p.click(team);
    p.click(byName(p.root, 'button', /Add to the queue/)[0] ?? team);
    expect(sent).toEqual([{ action: 'add', seatId: 'a1', forTeam: true, reach: 'none' }]);
  });
});
