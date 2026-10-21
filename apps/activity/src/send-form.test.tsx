import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGameState, type Creature } from './api';
import type { SendRequest } from './expedition-api';
import { parseDestinations } from './expedition-parse';
import destinationsFixture from './fixtures/expedition-destinations.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import { PopoverHost } from './PopoverHost';
import { SEND_STEP_HEAD, SendFooter, SendForm } from './SendForm';
import { FakeElement, byClass, createPage, visibleText, type Page } from './test-dom';
import { useSendForm } from './use-send-form';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const view = parseDestinations(destinationsFixture);
const STOCK = { 'lure-basic': 2, 'satchel-basic': 3 };
const slots = { total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null };
const base: Creature[] = parseGameState(stateOffer).creatures.map((c) => ({
  ...c,
  away: false,
  busy: null,
}));
/** One explorer of rank 4, who may go to the Moonlit Reef; the rest are below it. */
const veteran: Creature[] = base.map((c, i) =>
  i === 0 ? { ...c, explorer: { ...c.explorer, rank: 4 } } : c,
);

function Harness({
  creatures,
  destination,
  layout,
  onSend,
}: {
  creatures: readonly Creature[];
  destination: string;
  layout: 'steps' | 'panel';
  onSend: (request: SendRequest) => Promise<boolean>;
}) {
  const form = useSendForm({
    creatures,
    view,
    destination,
    slots,
    stock: STOCK,
    bait: 0,
    timezone: 'Europe/Helsinki',
  });
  const final = form.step === 'ready';
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <SendForm form={form} layout={layout} busy={false} onSend={onSend} />
      {layout === 'steps' && (
        <SendFooter form={form} mode={final ? 'send' : 'next'} busy={false} onSend={onSend} />
      )}
    </PopoverHost>
  );
}

function draw(
  layout: 'steps' | 'panel',
  destination: string,
  creatures: readonly Creature[] = base,
  onSend: (request: SendRequest) => Promise<boolean> = () => Promise.resolve(true),
): FakeElement {
  page = createPage();
  page.draw(
    <Harness creatures={creatures} destination={destination} layout={layout} onSend={onSend} />,
  );
  return page.root;
}

const button = (root: FakeElement): FakeElement => {
  const [found] = byClass(root, 'send-button');
  if (found === undefined) throw new Error('no footer button');
  return found;
};
const disabled = (el: FakeElement) => el.hasAttribute('disabled');

describe('the send form in steps', () => {
  it('draws one section per step and walks Who, Pack, Ready with Next and Send', () => {
    const root = draw('steps', 'tidepools');
    expect(byClass(root, 'explorer-picker')).toHaveLength(1);
    expect(byClass(root, 'supply-cell')).toHaveLength(0);
    expect(visibleText(button(root))).toBe('Next');
    expect(disabled(button(root))).toBe(false);
    page?.click(button(root));
    expect(byClass(root, 'explorer-picker')).toHaveLength(0);
    expect(byClass(root, 'supply-cell')).toHaveLength(12);
    expect(byClass(root, 'length-options')).toHaveLength(1);
    page?.click(button(root));
    expect(byClass(root, 'supply-cell')).toHaveLength(0);
    expect(byClass(root, 'trip-summary')).toHaveLength(1);
    expect(visibleText(button(root))).toMatch(/^Send .+ to Tidepools for 12 h/);
  });

  it('names the steps for the sheet around it', () => {
    expect(Object.values(SEND_STEP_HEAD).map((s) => s.title)).toEqual([
      'Who goes',
      'Pack up',
      'Ready',
    ]);
  });

  it('greys a creature below the place rank with its reason, and cannot go on without an explorer', () => {
    const root = draw('steps', 'moonlit-reef');
    const rows = byClass(root, 'pick');
    expect(rows.length).toBe(base.length);
    expect(rows.every((r) => (r.getAttribute('class') ?? '').includes('busy'))).toBe(true);
    expect(visibleText(root)).toContain('Needs explorer rank 4 for this place');
    expect(disabled(button(root))).toBe(true);
    // The reason is on the screen next to the button, not only in a disabled state.
    expect(byClass(root, 'reason')[0]).toBeDefined();
    expect(visibleText(byClass(root, 'reason')[0] as FakeElement)).toContain(
      'Needs explorer rank 4',
    );
  });
});

describe('a place the clock shuts', () => {
  it('shows when Moonlit Reef opens next to Send, and Send is disabled by day', () => {
    const root = draw('panel', 'moonlit-reef', veteran);
    expect(visibleText(root)).toContain('Opens tonight at 20:00');
    expect(disabled(button(root))).toBe(true);
    const [rule] = byClass(root, 'send-rule');
    expect(visibleText(rule as FakeElement)).toBe('Opens tonight at 20:00');
    // Nothing else is wrong, so the rule is the only reason on the screen.
    expect(byClass(root, 'reason')).toHaveLength(0);
  });

  it('lets the steps before Send go on', () => {
    const root = draw('steps', 'moonlit-reef', veteran);
    expect(disabled(button(root))).toBe(false);
    page?.click(button(root));
    page?.click(button(root));
    expect(visibleText(root)).toContain('Opens tonight at 20:00');
    expect(disabled(button(root))).toBe(true);
  });
});

describe('the send form as a panel', () => {
  it('stacks every section with one Send button at the bottom', () => {
    const root = draw('panel', 'tidepools');
    expect(byClass(root, 'explorer-picker')).toHaveLength(1);
    expect(byClass(root, 'supply-cell')).toHaveLength(12);
    expect(byClass(root, 'trip-summary')).toHaveLength(1);
    expect(byClass(root, 'send-button')).toHaveLength(1);
    expect(disabled(button(root))).toBe(false);
  });

  it('sends the same request as the old screen for the same choices, and puts the kit down after', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const root = draw('panel', 'tidepools', base, onSend);
    const lure = byClass(root, 'supply-cell').find((c) =>
      (c.getAttribute('aria-label') ?? '').includes('Plain Lure'),
    );
    if (lure === undefined) throw new Error('no lure');
    page?.click(lure);
    page?.click(button(root));
    expect(onSend).toHaveBeenCalledTimes(1);
    const request = onSend.mock.calls[0]?.[0] as SendRequest;
    const first = [...base].sort((a, b) => b.explorer.rank - a.explorer.rank)[0];
    expect(request).toEqual({
      creatureId: first?.id,
      destination: 'tidepools',
      duration: 'long',
      supplies: [{ id: 'lure-basic', source: 'owned' }],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(byClass(root, 'supply-packed')).toHaveLength(0);
  });
});
