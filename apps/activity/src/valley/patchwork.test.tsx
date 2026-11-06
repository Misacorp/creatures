/**
 * Patchwork pieces on the client (V-FORGE-12): the blueprints in the list the valley's Forge shows, their look, the order editor's shard
 * choice ("Most held" by default, with the pile now holding most shown as an icon) and what it sends.
 */
import {
  VALLEY_ELEMENTS,
  patchworkBlueprint,
  patchworkBlueprints,
  type ValleyView,
} from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRequest } from '../api';
import { Blueprints } from '../Blueprints';
import { SAMPLE_GEAR } from '../creature-card-sample';
import { blueprintViews, gearName } from '../gear-view';
import { itemArt } from '../gear-sprites';
import { PopoverHost } from '../PopoverHost';
import { expandRows, validateSprite } from '../sprites/sprite-data';
import {
  byClass,
  byName,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { sampleAnvil, sampleOrder, withAnvils } from './forge-sample';
import { isPatchwork, mostHeldElement } from './forge-view';
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
const [a] = free;
if (a === undefined) throw new Error('fixture');
const PATCH_HAT = 'patchwork-hat';
const hat = patchworkBlueprint(PATCH_HAT)!;

/** The spoken labels of the badges (anything with an aria-label) inside the element. */
const labelsIn = (root: FakeElement): string[] =>
  find(root, (el) => el !== root && el.hasAttribute('aria-label')).map(
    (el) => el.getAttribute('aria-label') ?? '',
  );
/** Whether the page has a list with this name. */
const hasList = (root: FakeElement, name: string): boolean =>
  find(root, (el) => el.localName === 'ul' && el.getAttribute('aria-label') === name).length > 0;
/** The list of a recipe card by its name ("Needs", "Makes"). */
const listOf = (root: FakeElement, name: string): FakeElement => {
  const list = find(
    root,
    (el) => el.localName === 'ul' && el.getAttribute('aria-label') === name,
  )[0];
  if (list === undefined) throw new Error(`no ${name} list`);
  return list;
};

/** A visit whose shelf holds these shards (the rest zero). */
function visitWith(
  shards: Partial<Record<(typeof VALLEY_ELEMENTS)[number], number>>,
  orders = [] as ReturnType<typeof sampleOrder>[],
): ValleyView {
  const visit = withAnvils(sampleValley(free, []), [sampleAnvil('a1', a.id, orders)]);
  return {
    ...visit,
    forge: {
      ...visit.forge,
      shelf: {
        scrap: 500,
        essence: 0,
        shards: { tide: 0, ember: 0, grove: 0, spark: 0, mire: 0, ...shards },
      },
    },
  };
}

describe('the patchwork blueprints in the lists', () => {
  it('are there with the valley systems on, one per slot with the price from the content, and not otherwise', () => {
    const plain = blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills);
    expect(plain.some((b) => b.patchwork !== undefined)).toBe(false);
    const valley = blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills, true);
    const made = valley.filter((b) => b.patchwork !== undefined);
    expect(made.map((b) => [b.baseId, b.slot, b.element])).toEqual(
      patchworkBlueprints().map((b) => [b.id, b.slot, null]),
    );
    expect(made[0]?.patchwork).toEqual({ scrap: hat.scrap, shards: hat.shards });
    expect(valley.length).toBe(plain.length + 3);
    expect(gearName(PATCH_HAT)).toBe(hat.name);
  });

  it('are drawn: the slot’s plain piece with patches, a well-formed 12x12 sprite each, three different ones', () => {
    const shapes = new Set<string>();
    for (const bp of patchworkBlueprints()) {
      const art = itemArt(bp.id);
      expect(() => {
        validateSprite(art.sprite, { width: 12, height: 12 });
      }, bp.id).not.toThrow();
      expect(art.sprite).toBe(itemArt(bp.id).sprite);
      shapes.add(expandRows(art.sprite).join('/'));
      // Each of the five shard colours is on the piece.
      const used = new Set(expandRows(art.sprite).join(''));
      for (const key of ['a', 'b', 'c', 'd', 'e'])
        expect(used.has(key), `${bp.id} ${key}`).toBe(true);
    }
    expect(shapes.size).toBe(3);
  });

  it('shows the pile held most, and whether it is a patchwork order', () => {
    expect(mostHeldElement({ tide: 3, ember: 30, grove: 12, spark: 0, mire: 0 })).toBe('ember');
    expect(mostHeldElement({ tide: 0, ember: 0, grove: 0, spark: 0, mire: 0 })).toBe('tide');
    expect(mostHeldElement({ tide: 5, ember: 5, grove: 5, spark: 5, mire: 5 })).toBe('tide');
    expect(isPatchwork({ blueprintId: PATCH_HAT })).toBe(true);
    expect(isPatchwork({ blueprintId: 'kelp-cap' })).toBe(false);
    expect(isPatchwork({ blueprintId: null })).toBe(false);
  });

  it('list in the Blueprints section with a count badge for scrap and for the shard, and an Order button', () => {
    const p = createPage();
    page = p;
    const ordered: string[] = [];
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <Blueprints
          gear={SAMPLE_GEAR}
          creatures={[]}
          busy={false}
          loadPreview={() => Promise.reject(new Error('no preview'))}
          onCraft={() => Promise.resolve(false)}
          order={{
            reason: null,
            onOrder: (id) => ordered.push(id),
            shards: { tide: 1, ember: 30, grove: 2, spark: 0, mire: 0 },
          }}
        />
      </PopoverHost>,
    );
    const rows = byClass(p.root, 'blueprint').filter((li) => /Patchwork/.test(visibleText(li)));
    expect(rows.length).toBe(3);
    const first = rows[0] as FakeElement;
    // Costs are icons with numbers: the scrap badge and the shard badge of the pile held most (Ember), no quality line.
    const labels = labelsIn(first);
    expect(labels.some((l) => /scrap/i.test(l) && l.includes(String(hat.scrap)))).toBe(true);
    expect(labels.some((l) => /ember/i.test(l) && l.includes(String(hat.shards)))).toBe(true);
    expect(visibleText(first)).not.toMatch(/Quality/);
    p.click(byClass(first, 'bp-act')[0] as FakeElement);
    expect(ordered).toEqual([patchworkBlueprints()[0]?.id]);
  });
});

describe('the order editor for a patchwork blueprint', () => {
  const blueprints = blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills, true);

  function editor(
    open: Parameters<typeof OrderEditor>[0]['open'],
    visit: ValleyView,
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
  const opened = { kind: 'add', anvilId: 'a1', opener: null, baseId: PATCH_HAT } as const;

  it('defaults to "most held", shows which pile that is as an icon, hides Reach, and sends no element', () => {
    const sent: OrderRequest[] = [];
    const p = editor(opened, visitWith({ tide: 3, ember: 30, grove: 12 }), sent);
    expect(visibleText(p.root)).toMatch(/Most held/);
    expect(hasList(p.root, 'Reach')).toBe(false);
    // The recipe takes the blueprint's price: scrap and the shard of the Ember pile (the most held), as icons.
    const needs = labelsIn(listOf(p.root, 'Needs'));
    expect(
      needs.some((l) => /scrap/i.test(l ?? '') && l?.includes(`need ${String(hat.scrap)}`)),
    ).toBe(true);
    expect(
      needs.some((l) => /ember/i.test(l ?? '') && l?.includes(`need ${String(hat.shards)}`)),
    ).toBe(true);
    // It makes the plainest Ember hat.
    expect(labelsIn(listOf(p.root, 'Makes'))).toEqual(['Coal-Warm Cap: 1']);
    p.click(byName(p.root, 'button', /Add to the queue/)[0] as HTMLElement);
    expect(sent).toEqual([
      { action: 'add', seatId: 'a1', blueprintId: PATCH_HAT, count: 1, reach: 'none' },
    ]);
  });

  it('follows the biggest pile as the shelf changes while "most held" is on', () => {
    const p = editor(opened, visitWith({ tide: 40, ember: 30 }), []);
    expect(labelsIn(listOf(p.root, 'Makes'))).toEqual(['Kelp Cap: 1']);
  });

  it('lets the player name an element: Grove is sent, and the piece shown is the Grove one', () => {
    const sent: OrderRequest[] = [];
    const p = editor(opened, visitWith({ tide: 3, ember: 30, grove: 12 }), sent);
    p.click(byName(p.root, 'button', /^Shards: most held, now Ember/)[0] as HTMLElement);
    // The drill lists "Most held" and the five elements, each with its shard icon and what is held.
    expect(visibleText(p.root)).toMatch(/Which shards/);
    const grove = byName(p.root, 'button', /^Grove/)[0];
    if (grove === undefined) throw new Error('no grove choice');
    expect(labelsIn(grove).some((l) => l.includes('12'))).toBe(true);
    p.click(grove);
    expect(labelsIn(listOf(p.root, 'Makes'))).toEqual(['Acorn Cap: 1']);
    p.click(byName(p.root, 'button', /Add to the queue/)[0] as HTMLElement);
    expect(sent).toEqual([
      {
        action: 'add',
        seatId: 'a1',
        blueprintId: PATCH_HAT,
        count: 1,
        reach: 'none',
        element: 'grove',
      },
    ]);
  });

  it('editing a patchwork order has no Reach and no shard choice, and sends a count only', () => {
    const sent: OrderRequest[] = [];
    const order = sampleOrder('o1', PATCH_HAT, 3, {
      needs: { scrap: hat.scrap, shardElement: null, shard: hat.shards, essence: 0 },
    });
    const p = editor(
      { kind: 'edit', orderId: 'o1', opener: null },
      visitWith({ ember: 30 }, [order]),
      sent,
    );
    expect(hasList(p.root, 'Reach')).toBe(false);
    expect(byName(p.root, 'button', /^Shards:/)).toHaveLength(0);
    p.click(byName(p.root, 'button', /One more piece/)[0] as HTMLElement);
    p.click(byName(p.root, 'button', /^Save/)[0] as HTMLElement);
    expect(sent).toEqual([{ action: 'edit', orderId: 'o1', count: 4, reach: 'none' }]);
  });

  it('keeps a proper blueprint’s order as it was: Reach shown, no shard slot', () => {
    const p = editor(
      { kind: 'add', anvilId: 'a1', opener: null, baseId: 'kelp-cap' },
      visitWith({ tide: 30 }),
      [],
    );
    expect(hasList(p.root, 'Reach')).toBe(true);
    expect(byName(p.root, 'button', /^Shards:/)).toHaveLength(0);
  });
});
