import type { ComponentChildren } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import { ExpeditionWorld } from './ExpeditionWorld';
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
const SLOTS: Slots = { total: 2, used: 1, rankSum: 2, tripsFinished: 3, next: null };
const offered = state.expeditions[0];
if (offered === undefined) throw new Error('fixtures changed');
const home: Trip = { ...offered, offer: null, pushOn: null };
const AFTER = offered.endsAt + 3_600_000;

function draw(
  trips: readonly Trip[],
  options: { wide?: boolean; reveal?: ComponentChildren | null; claimed?: Trip[] } = {},
): Page {
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ExpeditionWorld
        trips={trips}
        creatures={creatures}
        slots={SLOTS}
        stock={{}}
        bait={0}
        view={view}
        viewFailed={false}
        onRetry={() => undefined}
        timezone="Europe/Helsinki"
        forecast={null}
        serverNow={AFTER}
        busy={false}
        wide={options.wide ?? true}
        reveal={options.reveal ?? null}
        onSend={() => Promise.resolve(true)}
        onClaim={(trip) => options.claimed?.push(trip)}
        onPushOn={() => undefined}
      />
    </PopoverHost>,
  );
  return p;
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

const panel = (p: Page) => one(byClass(p.root, 'place-panel'), 'panel');

describe('the world map on a wide screen', () => {
  it('has the map, the shelf and a panel that asks "Where to?" while nothing is chosen', () => {
    const p = draw([home]);
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(byClass(p.root, 'trip-shelf')).toHaveLength(1);
    expect(byClass(p.root, 'out-strip')).toHaveLength(0);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    const aside = panel(p);
    expect(visibleText(aside)).toContain('Where to?');
    expect(visibleText(aside)).toContain(
      'Pick a place on the map to see who lives there and send an explorer.',
    );
    // Named by its heading.
    const heading = p.document.getElementById(aside.getAttribute('aria-labelledby') ?? '');
    expect(heading?.textContent).toBe('Where to?');
    expect(visibleText(aside)).not.toContain('rank');
  });

  it('fills the panel with the chosen place and its whole send form, without moving the focus', () => {
    const p = draw([home]);
    const before = p.document.activeElement;
    p.click(marker(p, 'tidepools'));
    const aside = panel(p);
    const text = visibleText(aside);
    expect(text).toContain('Tidepools');
    expect(text).toContain('Lives here');
    expect(byClass(aside, 'trip-row')).toHaveLength(1);
    expect(byClass(aside, 'explorer-picker')).toHaveLength(1);
    expect(byClass(aside, 'send-button')).toHaveLength(1);
    expect(p.document.activeElement).toBe(before);
    // A screen reader hears which place was chosen.
    expect(byRole(p.root, 'status').map((el) => el.textContent)).toContain('Tidepools chosen');
    expect(marker(p, 'tidepools').getAttribute('aria-pressed')).toBe('true');
    // Choosing another place replaces it; choosing the same place again clears the panel.
    p.click(marker(p, 'ember-caves'));
    expect(visibleText(panel(p))).toContain('Ember Caves');
    p.click(marker(p, 'ember-caves'));
    expect(visibleText(panel(p))).toContain('Where to?');
  });

  it('selects the place of a shelf card', () => {
    const p = draw([home]);
    p.click(one(byName(p.root, 'button', /at Tidepools: open/), 'shelf card'));
    expect(visibleText(panel(p))).toContain('Tidepools');
  });

  it('shows the push-on choice in the panel with a Back to the place', () => {
    const p = draw([offered]);
    p.click(marker(p, 'tidepools'));
    p.click(one(byName(panel(p), 'button', /^Decide/), 'Decide'));
    expect(byClass(panel(p), 'push-on')).toHaveLength(1);
    expect(byClass(panel(p), 'send-button')).toHaveLength(0);
    p.click(one(byName(panel(p), 'button', /Back/), 'Back'));
    expect(byClass(panel(p), 'push-on')).toHaveLength(0);
    expect(byClass(panel(p), 'send-button')).toHaveLength(1);
  });

  it('claims from the shelf without marking the reveal fresh and shows the reveal in the panel', () => {
    const claimed: Trip[] = [];
    const p = draw([home], { claimed });
    consumeFreshReveal();
    p.click(
      one(byName(byClass(p.root, 'trip-shelf')[0] as FakeElement, 'button', 'Claim'), 'Claim'),
    );
    expect(claimed).toEqual([home]);
    // The panel is on screen, so the page is not told to jump to the card.
    expect(consumeFreshReveal()).toBe(false);
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <ExpeditionWorld
          trips={[]}
          creatures={creatures}
          slots={SLOTS}
          stock={{}}
          bait={0}
          view={view}
          viewFailed={false}
          onRetry={() => undefined}
          timezone="Europe/Helsinki"
          forecast={null}
          serverNow={AFTER}
          busy={false}
          wide
          reveal={
            <section id="trip-result-heading" class="reveal-card">
              Back from the Tidepools
            </section>
          }
          onSend={() => Promise.resolve(true)}
          onClaim={() => undefined}
          onPushOn={() => undefined}
        />
      </PopoverHost>,
    );
    const aside = panel(p);
    expect(aside.getAttribute('aria-labelledby')).toBe('trip-result-heading');
    expect(visibleText(aside)).toContain('Back from the Tidepools');
    expect(visibleText(aside)).not.toContain('Where to?');
  });
});

describe('the world map on a narrow screen', () => {
  it('has the strip under the map and no shelf or panel', () => {
    const p = draw([home], { wide: false });
    expect(byClass(p.root, 'out-strip')).toHaveLength(1);
    expect(byClass(p.root, 'trip-shelf')).toHaveLength(0);
    expect(byClass(p.root, 'place-panel')).toHaveLength(0);
    expect(p.root.querySelectorAll('[data-place]')).toHaveLength(8);
  });

  it('shows every place as open, with the time rule only as a line on its marker', () => {
    const p = draw([], { wide: false });
    for (const el of p.root.querySelectorAll('[data-place]')) {
      expect(el.hasAttribute('disabled')).toBe(false);
    }
    expect(marker(p, 'moonlit-reef').getAttribute('aria-label')).toMatch(/Moonlit Reef, Opens/);
  });
});
