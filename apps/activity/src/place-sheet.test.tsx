import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import { ExpeditionWorld } from './ExpeditionWorld';
import type { SendRequest } from './expedition-api';
import { parseDestinations } from './expedition-parse';
import type { Slots, Trip } from './expedition-types';
import destinationsFixture from './fixtures/expedition-destinations.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import { PopoverHost } from './PopoverHost';
import { consumeFreshReveal } from './reveal-arrive';
import {
  FakeElement,
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type Page,
} from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const view = parseDestinations(destinationsFixture);
const state = parseGameState(stateOffer);
const creatures: Creature[] = state.creatures.map((c) => ({ ...c, away: false, busy: null }));
const SLOTS: Slots = { total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null };
const STOCK = { 'lure-basic': 2, 'satchel-basic': 3 };

const offered = state.expeditions[0];
if (offered === undefined) throw new Error('fixtures changed');
/** A trip that has ended with nothing on offer: home, to claim. */
const home: Trip = { ...offered, offer: null, pushOn: null };
/** A trip that has ended and waits for its push-on choice (the server rolled one). */
const choosing: Trip = offered;
const AFTER = offered.endsAt + 3_600_000;

interface Calls {
  sent: SendRequest[];
  claimed: Trip[];
  pushed: [Trip, string][];
}

function draw(
  trips: readonly Trip[],
  options: { slots?: Slots; started?: boolean; wide?: boolean } = {},
): { p: Page; calls: Calls } {
  const calls: Calls = { sent: [], claimed: [], pushed: [] };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ExpeditionWorld
        trips={trips}
        creatures={creatures}
        slots={options.slots ?? SLOTS}
        stock={STOCK}
        bait={0}
        view={view}
        viewFailed={false}
        onRetry={() => undefined}
        timezone="Europe/Helsinki"
        forecast={null}
        serverNow={AFTER}
        busy={false}
        wide={options.wide ?? false}
        reveal={null}
        onSend={(request) => {
          calls.sent.push(request);
          return Promise.resolve(options.started ?? true);
        }}
        onClaim={(trip) => calls.claimed.push(trip)}
        onPushOn={(trip, goalId) => calls.pushed.push([trip, goalId])}
      />
    </PopoverHost>,
  );
  return { p, calls };
}

function marker(p: Page, id: string): FakeElement {
  const found = p.root.querySelector(`[data-place="${id}"]`);
  if (found === null) throw new Error(`no marker ${id}`);
  return found;
}

function one(list: FakeElement[], what: string): FakeElement {
  const [found] = list;
  if (found === undefined) throw new Error(`no ${what}`);
  return found;
}

const dialog = (p: Page) => byRole(p.root, 'dialog')[0];
const footerButton = (p: Page) => one(byClass(p.root, 'send-button'), 'footer button');
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe('a place on the phone map', () => {
  it('opens its sheet from a marker, with the place, its explorers and a gold send button', () => {
    const { p } = draw([{ ...home, destination: 'tidepools' }]);
    expect(dialog(p)).toBeUndefined();
    p.click(marker(p, 'tidepools'));
    const sheet = one(byRole(p.root, 'dialog'), 'dialog');
    const text = visibleText(sheet);
    expect(text).toContain('Tidepools');
    expect(text).toContain('Lives here');
    expect(byClass(sheet, 'trip-row')).toHaveLength(1);
    expect(visibleText(footerButton(p))).toBe('Send an explorer here');
    expect(footerButton(p).getAttribute('class')).toContain('primary');
    expect(footerButton(p).hasAttribute('disabled')).toBe(false);
  });

  it('opens the same sheet from a chip of the out strip', () => {
    const { p } = draw([home]);
    p.click(one(byName(p.root, 'button', /at Tidepools: Home!/), 'chip'));
    expect(visibleText(one(byRole(p.root, 'dialog'), 'dialog'))).toContain('Tidepools');
  });

  it('says why when every slot is out, and cannot send', () => {
    const { p } = draw([home], { slots: { ...SLOTS, used: 2 } });
    p.click(marker(p, 'ember-caves'));
    expect(footerButton(p).hasAttribute('disabled')).toBe(true);
    expect(visibleText(one(byRole(p.root, 'dialog'), 'dialog'))).toContain(
      'All 2 expedition slots are in use',
    );
  });

  it('walks Who, Pack and Ready inside the same sheet and sends the chosen trip', async () => {
    const { p, calls } = draw([]);
    p.click(marker(p, 'tidepools'));
    p.click(footerButton(p));
    // Who goes: the explorer list, Back at the top, the gold button now says Next.
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(byClass(p.root, 'explorer-picker')).toHaveLength(1);
    expect(visibleText(one(byClass(p.root, 'drill-head'), 'head'))).toContain('Who goes');
    expect(visibleText(footerButton(p))).toBe('Next');
    p.click(footerButton(p));
    expect(visibleText(one(byClass(p.root, 'drill-head'), 'head'))).toContain('Pack up');
    expect(byClass(p.root, 'supply-cell').length).toBeGreaterThan(0);
    p.click(footerButton(p));
    expect(visibleText(one(byClass(p.root, 'drill-head'), 'head'))).toContain('Ready');
    expect(visibleText(footerButton(p))).toMatch(/^Send .+ to Tidepools for 12 h/);
    p.click(footerButton(p));
    expect(calls.sent).toHaveLength(1);
    const first = [...creatures].sort((a, b) => b.explorer.rank - a.explorer.rank)[0];
    expect(calls.sent[0]).toEqual({
      creatureId: first?.id,
      destination: 'tidepools',
      duration: 'long',
      supplies: [],
    });
    await settle();
    // The trip started: the sheet is gone and the marker has the focus back.
    expect(dialog(p)).toBeUndefined();
    expect(p.document.activeElement).toBe(marker(p, 'tidepools'));
  });

  it('keeps the sheet open when the trip did not start', async () => {
    const { p, calls } = draw([], { started: false });
    p.click(marker(p, 'tidepools'));
    p.click(footerButton(p));
    p.click(footerButton(p));
    p.click(footerButton(p));
    p.click(footerButton(p));
    await settle();
    expect(calls.sent).toHaveLength(1);
    expect(dialog(p)).toBeDefined();
  });

  it('goes one step back with Back and Escape, and from Who back to the place', () => {
    const { p } = draw([]);
    p.click(marker(p, 'tidepools'));
    p.click(footerButton(p));
    p.click(footerButton(p));
    expect(visibleText(one(byClass(p.root, 'drill-head'), 'head'))).toContain('Pack up');
    // Back from Pack: to Who.
    p.click(one(byName(p.root, 'button', /Back/), 'Back'));
    expect(byClass(p.root, 'explorer-picker')).toHaveLength(1);
    // Escape on Who: to the place, not out of the sheet.
    p.key(one(byClass(p.root, 'drill-head'), 'head'), 'Escape');
    expect(byClass(p.root, 'explorer-picker')).toHaveLength(0);
    expect(visibleText(footerButton(p))).toBe('Send an explorer here');
    expect(dialog(p)).toBeDefined();
    // Escape on the place sheet itself closes it.
    p.key(one(byClass(p.root, 'place-body'), 'place body'), 'Escape');
    expect(dialog(p)).toBeUndefined();
  });

  it('answers Escape from the footer button as one step back too', () => {
    const { p } = draw([]);
    p.click(marker(p, 'tidepools'));
    p.click(footerButton(p));
    p.click(footerButton(p));
    p.key(footerButton(p), 'Escape');
    expect(byClass(p.root, 'explorer-picker')).toHaveLength(1);
    expect(dialog(p)).toBeDefined();
  });

  it('gives the focus back to the marker when the sheet is closed', () => {
    const { p } = draw([]);
    p.click(marker(p, 'ember-caves'));
    p.click(one(byClass(p.root, 'drawer-close'), 'close'));
    expect(dialog(p)).toBeUndefined();
    expect(p.document.activeElement).toBe(marker(p, 'ember-caves'));
  });

  it('gives the focus back to the chip that opened it', () => {
    const { p } = draw([home]);
    const chip = one(byName(p.root, 'button', /at Tidepools: Home!/), 'chip');
    p.click(chip);
    p.click(one(byClass(p.root, 'drawer-close'), 'close'));
    expect(p.document.activeElement).toBe(chip);
  });

  it('claims a trip that is home: closes the sheet and marks the reveal as fresh', () => {
    const { p, calls } = draw([home]);
    consumeFreshReveal();
    p.click(marker(p, 'tidepools'));
    p.click(one(byName(p.root, 'button', 'Claim'), 'Claim'));
    expect(calls.claimed).toEqual([home]);
    expect(dialog(p)).toBeUndefined();
    expect(consumeFreshReveal()).toBe(true);
  });

  it('shows the push-on choice for Decide, inside the same sheet, and goes back to the place', () => {
    const { p, calls } = draw([choosing]);
    p.click(marker(p, 'tidepools'));
    p.click(one(byName(p.root, 'button', /^Decide/), 'Decide'));
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(byRole(p.root, 'group')[0]?.getAttribute('aria-label')).toBe('Push on or come home');
    expect(visibleText(one(byClass(p.root, 'drill-head'), 'head'))).toContain('Push on?');
    // Back, then in again, then choose a goal: the request goes up and the sheet shows the place.
    p.click(one(byName(p.root, 'button', /Back/), 'Back'));
    expect(byClass(p.root, 'push-on')).toHaveLength(0);
    p.click(one(byName(p.root, 'button', /^Decide/), 'Decide'));
    const [goal] = byName(p.root, 'button', /^Push on:/);
    p.click(goal as FakeElement);
    expect(calls.pushed).toHaveLength(1);
    expect(calls.pushed[0]?.[0]).toBe(choosing);
    expect(byClass(p.root, 'push-on')).toHaveLength(0);
  });

  it('comes home from the push-on choice with a claim', () => {
    const { p, calls } = draw([choosing]);
    p.click(marker(p, 'tidepools'));
    p.click(one(byName(p.root, 'button', /^Decide/), 'Decide'));
    p.click(one(byName(p.root, 'button', 'Come home'), 'Come home'));
    expect(calls.claimed).toEqual([choosing]);
    expect(dialog(p)).toBeUndefined();
  });
});
