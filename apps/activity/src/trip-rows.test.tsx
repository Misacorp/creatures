import { afterEach, describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import type { Slots, Trip } from './expedition-types';
import stateOffer from './fixtures/expedition-state-offer.json';
import pushOnFixture from './fixtures/expedition-push-on.json';
import { OutStrip } from './OutStrip';
import { byClass, byName, createPage, visibleText, type Page } from './test-dom';
import { TripActions } from './TripActions';
import { TripRow } from './TripRow';
import { TripShelf } from './TripShelf';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const state = parseGameState(stateOffer);
const creatures = state.creatures;
const HOUR = 3_600_000;

const offered = state.expeditions[0];
const pushed = parseGameState(pushOnFixture.state).expeditions[0];
if (offered === undefined || pushed?.pushOn == null) throw new Error('fixtures changed');
const push = pushed.pushOn;

const plain: Trip = { ...offered, offer: null, pushOn: null };
const OUT = plain.startedAt + (plain.endsAt - plain.startedAt) / 2;
const HOME = plain.endsAt + HOUR;

function calls() {
  const log: string[] = [];
  return {
    log,
    onClaim: (t: Trip) => log.push(`claim ${t.id}`),
    onDecide: (t: Trip) => log.push(`decide ${t.id}`),
    onOpen: (id: string) => log.push(`open ${id}`),
  };
}

function actions(trip: Trip, now: number, busy = false, compact = true) {
  const c = calls();
  const p = createPage();
  page = p;
  p.draw(
    <TripActions
      trip={trip}
      serverNow={now}
      busy={busy}
      onClaim={c.onClaim}
      onDecide={c.onDecide}
      compact={compact}
    />,
  );
  return { p, c };
}

describe('TripActions', () => {
  it('claims a trip that is home', () => {
    const { p, c } = actions(plain, HOME);
    const [button] = byName(p.root, 'button', 'Claim');
    expect(button?.getAttribute('class')).toContain('primary');
    p.click(button!);
    expect(c.log).toEqual([`claim ${plain.id}`]);
  });

  it('recalls a trip that is out, saying what it keeps', () => {
    const { p, c } = actions(plain, OUT);
    const [button] = byName(p.root, 'button', /^Recall \(keeps \d+ hours? of finds\)$/);
    expect(visibleText(button!)).toBe('Recall');
    p.click(button!);
    expect(c.log).toEqual([`claim ${plain.id}`]);
  });

  it('keeps the card words at full size', () => {
    const { p } = actions(plain, OUT, false, false);
    expect(visibleText(p.root)).toMatch(/^Recall \(keeps \d+ hours? of finds\)$/);
  });

  it('comes home early during a push-on, skipping it', () => {
    const { p, c } = actions(pushed, push.startedAt + HOUR);
    const [button] = byName(p.root, 'button', 'Come home now (skips the push-on)');
    expect(visibleText(button!)).toBe('Come home');
    p.click(button!);
    expect(c.log).toEqual([`claim ${pushed.id}`]);
  });

  it('asks to decide when a push-on is on offer, and does not claim', () => {
    const { p, c } = actions(offered, offered.endsAt);
    p.click(byName(p.root, 'button', 'Decide')[0]!);
    expect(c.log).toEqual([`decide ${offered.id}`]);
  });

  it('does nothing while busy', () => {
    const { p, c } = actions(plain, HOME, true);
    p.click(byName(p.root, 'button', 'Claim')[0]!);
    expect(c.log).toEqual([]);
  });
});

describe('TripRow', () => {
  it('shows the name, length, status, a bar and the one button', () => {
    const c = calls();
    page = createPage();
    page.draw(
      <TripRow
        trip={plain}
        creature={creatures[0]}
        serverNow={OUT}
        busy={false}
        onClaim={c.onClaim}
        onDecide={c.onDecide}
      />,
    );
    const text = visibleText(page.root);
    expect(text).toContain('Cindle');
    expect(text).toContain('12 h');
    expect(text).toMatch(/Back in 5 h/);
    expect(byName(page.root, 'div', /% done/)).toHaveLength(1);
    expect(byName(page.root, 'button', /.*/)).toHaveLength(1);
  });

  it('says Home! and claims', () => {
    const c = calls();
    page = createPage();
    page.draw(
      <TripRow
        trip={plain}
        creature={creatures[0]}
        serverNow={HOME}
        busy={false}
        onClaim={c.onClaim}
        onDecide={c.onDecide}
      />,
    );
    expect(visibleText(page.root)).toContain('Home!');
    page.click(byName(page.root, 'button', 'Claim')[0]!);
    expect(c.log).toEqual([`claim ${plain.id}`]);
  });

  it('says Push on? and decides', () => {
    const c = calls();
    page = createPage();
    page.draw(
      <TripRow
        trip={offered}
        creature={creatures[0]}
        serverNow={offered.endsAt}
        busy={false}
        onClaim={c.onClaim}
        onDecide={c.onDecide}
      />,
    );
    expect(visibleText(page.root)).toContain('Push on?');
    page.click(byName(page.root, 'button', 'Decide')[0]!);
    expect(c.log).toEqual([`decide ${offered.id}`]);
  });
});

describe('OutStrip', () => {
  const trips: Trip[] = [plain, { ...offered, id: 'second', destination: 'ember-flats' }];

  it('draws a chip per trip and opens the place of the tapped one', () => {
    const c = calls();
    page = createPage();
    page.draw(<OutStrip trips={trips} creatures={creatures} serverNow={OUT} onOpen={c.onOpen} />);
    const chips = byClass(page.root, 'out-chip');
    expect(chips).toHaveLength(2);
    page.click(chips[1]!);
    page.click(chips[0]!);
    expect(c.log).toEqual(['open ember-flats', `open ${plain.destination}`]);
  });

  it('marks a trip that is home and says Home!', () => {
    page = createPage();
    page.draw(
      <OutStrip trips={[plain]} creatures={creatures} serverNow={HOME} onOpen={() => {}} />,
    );
    expect(visibleText(page.root)).toContain('Home!');
    expect(byClass(page.root, 'attention')).toHaveLength(1);
  });

  it('draws nothing when no trip is out', () => {
    page = createPage();
    page.draw(<OutStrip trips={[]} creatures={creatures} serverNow={OUT} onOpen={() => {}} />);
    expect(page.root.childNodes).toHaveLength(0);
  });
});

describe('TripShelf', () => {
  function shelf(slots: Slots, trips: Trip[], busy = false) {
    const c = calls();
    page = createPage();
    page.draw(
      <TripShelf
        trips={trips}
        creatures={creatures}
        slots={slots}
        serverNow={OUT}
        busy={busy}
        onClaim={c.onClaim}
        onDecide={c.onDecide}
        onOpen={c.onOpen}
      />,
    );
    return c;
  }
  const slots = (total: number, next: Slots['next']): Slots => ({
    total,
    used: 1,
    rankSum: 2,
    tripsFinished: 2,
    next,
  });

  it('lists running trips then free slots, and says in the header what opens the next slot', () => {
    shelf(slots(3, { kind: 'trips', at: 5 }), [plain]);
    expect(byClass(page!.root, 'free')).toHaveLength(2);
    expect(byClass(page!.root, 'trip-slot')).toHaveLength(3);
    const next = byClass(page!.root, 'trip-shelf-next');
    expect(next).toHaveLength(1);
    expect(visibleText(next[0]!)).toContain('finish 5 trips (2 so far)');
  });

  it('has no next-slot line when every slot is open', () => {
    shelf(slots(2, null), [plain]);
    expect(byClass(page!.root, 'trip-shelf-next')).toHaveLength(0);
    expect(byClass(page!.root, 'free')).toHaveLength(1);
  });

  it('opens the place from the card and acts from its button without opening', () => {
    const c = shelf(slots(1, null), [plain]);
    page!.click(byClass(page!.root, 'trip-slot-open')[0]!);
    expect(c.log).toEqual([`open ${plain.destination}`]);
    page!.click(byName(page!.root, 'button', /^Recall/)[0]!);
    expect(c.log).toEqual([`open ${plain.destination}`, `claim ${plain.id}`]);
  });
});
