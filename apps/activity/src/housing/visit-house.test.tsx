import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { byName, byRole, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { SAMPLE_NOW, sampleHouse, sampleOwn } from './house-sample';
import { refusalEffect, visitDoneLine } from './VisitHouse';

/** A visited house on sample data, the network a stand-in: a refusal that the screen was wrong about today moves the pinned action on. */

const api = vi.hoisted(() => ({ giftHouse: vi.fn(), stampHouse: vi.fn() }));

vi.mock('./housing-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./housing-api')>()),
  ...api,
}));

const { VisitHouse } = await import('./VisitHouse');

let page: Page | null = null;
const today = { gifted: false, stamped: false };

beforeEach(() => {
  api.giftHouse.mockReset();
  api.stampHouse.mockReset();
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 390,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

async function settle(p: Page): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  p.update(() => undefined);
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

async function visit(owned: readonly string[], onToday = vi.fn()): Promise<Page> {
  page = createPage();
  page.draw(
    <VisitHouse
      userId="2222"
      name="Anna"
      today={today}
      giftLeft
      ownedStamps={owned}
      now={SAMPLE_NOW}
      onBack={() => undefined}
      onToday={onToday}
      house={sampleHouse()}
    />,
  );
  await settle(page);
  return page;
}

const STAMPS = sampleOwn('rich').items.stamps;

describe('a visit refused for what the screen did not know', () => {
  it('says what each refusal means for the day', () => {
    expect(refusalEffect('gift_used_today')).toEqual({ gifted: true });
    expect(refusalEffect('stamp_used_today')).toEqual({ stamped: true });
    expect(refusalEffect('gift_cap_reached')).toEqual({ blocked: 'mailbox' });
    expect(refusalEffect('no_house')).toEqual({ blocked: 'gone' });
    expect(refusalEffect('own_house')).toEqual({});
    expect(refusalEffect(undefined)).toEqual({});
    expect(visitDoneLine(today, true, 'mailbox').line).toBe('Their mailbox is full');
    expect(visitDoneLine(today, true, 'gone').line).toBe('That house is gone');
  });

  it('gift_used_today moves the pinned action on to the stamp and reads the list again', async () => {
    api.giftHouse.mockRejectedValue(new ApiError(409, 'gift_used_today'));
    const onToday = vi.fn();
    const p = await visit(STAMPS, onToday);
    p.click(first(byName(p.root, 'button', /^Gift/)));
    await settle(p);
    expect(byName(p.root, 'button', /^Gift/)).toHaveLength(0);
    expect(byName(p.root, 'button', /^Leave a stamp/)).toHaveLength(1);
    expect(visibleText(p.root)).toContain('You gave a gift today.');
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('a full mailbox gets its own words, and the stamp is next', async () => {
    api.giftHouse.mockRejectedValue(new ApiError(409, 'gift_cap_reached'));
    const p = await visit(STAMPS);
    p.click(first(byName(p.root, 'button', /^Gift/)));
    await settle(p);
    expect(visibleText(p.root)).toContain('Their mailbox is full for now.');
    expect(visibleText(p.root)).not.toContain('enough gifts');
    expect(byName(p.root, 'button', /^Gift/)).toHaveLength(0);
    expect(byName(p.root, 'button', /^Leave a stamp/)).toHaveLength(1);
  });

  it('with no stamps to give, a full mailbox ends in a calm line', async () => {
    api.giftHouse.mockRejectedValue(new ApiError(409, 'gift_cap_reached'));
    const p = await visit([]);
    p.click(first(byName(p.root, 'button', /^Gift/)));
    await settle(p);
    expect(visibleText(p.root)).toContain('Their mailbox is full');
    expect(byName(p.root, 'button', /^Gift/)).toHaveLength(0);
  });

  it('stamp_used_today shows the stamp as given', async () => {
    api.giftHouse.mockResolvedValue({
      gift: { amount: 5 },
      today: { gifted: true, stamped: false },
    });
    api.stampHouse.mockRejectedValue(new ApiError(409, 'stamp_used_today'));
    const onToday = vi.fn();
    const p = await visit(STAMPS, onToday);
    p.click(first(byName(p.root, 'button', /^Gift/)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Leave a stamp/)));
    await settle(p);
    p.click(first(byRole(p.root, 'option')));
    await settle(p);
    expect(visibleText(p.root)).toContain('Gift and stamp given today');
    expect(byName(p.root, 'button', /^Leave a stamp/)).toHaveLength(0);
  });
});
