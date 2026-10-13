import { RULES, expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import {
  destinationCards,
  nextNightStart,
  nightText,
  nightWindowText,
  turnCatalogue,
} from './destination-view';
import { parseDestinations } from './expedition-parse';
import destinationsFixture from './fixtures/expedition-destinations.json';
import stateOffer from './fixtures/expedition-state-offer.json';

const view = parseDestinations(destinationsFixture);
const creatures = parseGameState(stateOffer).creatures;
const cindle = creatures.find((c) => c.species === 'cindle');
const splashet = creatures.find((c) => c.species === 'splashet');
if (cindle === undefined || splashet === undefined)
  throw new Error('the fixture creatures changed');

const TZ = 'Europe/Helsinki';

describe('the destination catalogue', () => {
  const cards = destinationCards(view, cindle, TZ);
  const card = (id: string) => {
    const found = cards.find((c) => c.id === id);
    if (found === undefined) throw new Error(`no card ${id}`);
    return found;
  };

  it('has a card for every place the server lists, in its order, with name, flavour and element', () => {
    expect(cards.map((c) => c.id)).toEqual(view.destinations.map((d) => d.id));
    expect(card('tidepools')).toMatchObject({ name: 'Tidepools', element: 'tide' });
    expect(card('old-crossroads').element).toBeNull();
    for (const c of cards) expect(c.flavor.length, c.id).toBeGreaterThan(10);
  });

  it('lists who lives there: the deeper area last, flagged', () => {
    const embers = card('ember-caves').residents;
    expect(embers.filter((r) => !r.deep).map((r) => r.species)).toEqual([
      'cindle',
      'ashmole',
      'mossback',
    ]);
    expect(embers.filter((r) => r.deep).map((r) => r.species)).toEqual(['solmane']);
  });

  it('shows only the species the player has found as known, the rest as unknown', () => {
    const tide = card('tidepools').residents;
    const known = tide.filter((r) => r.known);
    expect(known.map((r) => r.species)).toEqual(['mistnewt']);
    expect(known[0]?.name).toBe('Mistnewt');
    for (const r of tide.filter((x) => !x.known)) expect(r.name).toBe('???');
  });

  it('counts a species found by any of your creatures, but only the explorer opens the deeper area', () => {
    const other = destinationCards(view, splashet, TZ).find((c) => c.id === 'tidepools');
    expect(other?.residents.find((r) => r.species === 'mistnewt')?.known).toBe(true);
    const mine = destinationCards(view, cindle, TZ).find((c) => c.id === 'tidepools');
    expect(mine?.residents.find((r) => r.species === 'mistnewt')?.known).toBe(true);
    // Familiarity belongs to the creature, so the card carries neither stars nor trips.
    expect('stars' in (mine ?? {})).toBe(false);
    expect('trips' in (mine ?? {})).toBe(false);
  });

  it('opens the deeper area on the card only for an explorer with a star there', () => {
    const starry = {
      ...view,
      familiarity: [
        {
          creatureId: cindle.id,
          destination: 'tidepools',
          trips: 5,
          found: [],
          shiny: false,
          stars: 1,
          deepChanceBp: 3000,
        },
      ],
    };
    const tide = (who: typeof cindle | undefined) =>
      destinationCards(starry, who, TZ).find((c) => c.id === 'tidepools');
    expect(tide(cindle)?.deepOpen).toBe(true);
    expect(tide(splashet)?.deepOpen).toBe(false);
    expect(tide(undefined)?.deepOpen).toBe(false);
  });

  it('puts a plain fact in the description only where there is one: the night window of Moonlit Reef', () => {
    expect(card('moonlit-reef').facts).toEqual([nightWindowText()]);
    expect(nightWindowText()).toBe(
      `Only open at night, ${String(RULES.expeditions.night.fromHour).padStart(2, '0')}:00 to ${String(RULES.expeditions.night.toHour).padStart(2, '0')}:00 server time.`,
    );
    expect(cards.filter((c) => c.facts.length > 0).map((c) => c.id)).toEqual(['moonlit-reef']);
  });

  it('shows the weekly twist on the special place only', () => {
    expect(card('moonlit-reef').twist).toEqual({
      name: expeditionContent.specials.twists.find((t) => t.id === 'rich-pickings')?.name,
      description: view.special.description,
      festival: false,
    });
    expect(cards.filter((c) => c.twist !== null).map((c) => c.id)).toEqual(['moonlit-reef']);
  });

  it('is open for a creature that has the rank and for places nothing closes', () => {
    expect(card('tidepools').locked).toEqual([]);
    expect(card('old-crossroads').locked).toEqual([]);
  });

  it('says why a place is closed: the rank of this explorer, the night, the Festival', () => {
    const forSplashet = destinationCards(view, splashet, TZ);
    const crossroads = forSplashet.find((c) => c.id === 'old-crossroads');
    expect(crossroads?.locked.map((l) => l.kind)).toEqual(['rank']);
    expect(crossroads?.locked[0]?.text).toContain(`rank ${String(card('old-crossroads').minRank)}`);
    expect(crossroads?.locked[0]?.text).toContain('rank 1');
    // The reef needs a higher rank than the fixture's best explorer and a night.
    const reef = card('moonlit-reef');
    expect(reef.locked.map((l) => l.kind)).toEqual(['rank', 'night']);
    expect(reef.locked[1]?.text).toContain('Night only');
    expect(reef.locked[1]?.text).toMatch(/Opens \w{3} 20:00/);
    expect(card('festival-grounds').locked).toEqual([
      { kind: 'festival', text: 'Only open in Festival weeks.' },
    ]);
  });

  it('opens the night places at night and the Festival Grounds in Festival weeks', () => {
    const open = parseDestinations({
      ...destinationsFixture,
      night: true,
      festivalWeek: true,
      destinations: destinationsFixture.destinations.map((d) => ({ ...d, closed: [] })),
    });
    const all = destinationCards(open, cindle, TZ);
    expect(all.find((c) => c.id === 'festival-grounds')?.locked).toEqual([]);
    expect(all.find((c) => c.id === 'moonlit-reef')?.locked.map((l) => l.kind)).toEqual(['rank']);
  });

  it('skips a place the content does not know', () => {
    const odd = parseDestinations({
      ...destinationsFixture,
      destinations: [
        ...destinationsFixture.destinations,
        { id: 'new-place', minRank: 1, nightOnly: false, festivalOnly: false, closed: [] },
      ],
    });
    expect(destinationCards(odd, cindle, TZ)).toHaveLength(view.destinations.length);
  });
});

describe('the night window', () => {
  const { fromHour } = RULES.expeditions.night;
  const local = (at: number, zone: string): string =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);

  it('finds the next time it turns night in the guild timezone', () => {
    // 2027-01-15 12:00 UTC is 14:00 in Helsinki: the night starts at 20:00 local, 18:00 UTC.
    const noon = Date.UTC(2027, 0, 15, 12, 0);
    expect(nextNightStart(noon, TZ)).toBe(Date.UTC(2027, 0, 15, 18, 0));
    expect(local(nextNightStart(noon, TZ) ?? 0, TZ)).toBe(`${String(fromHour)}:00`);
    // Summer time: the same wall clock, an hour earlier in UTC.
    const summer = Date.UTC(2027, 6, 15, 9, 0);
    expect(nextNightStart(summer, TZ)).toBe(Date.UTC(2027, 6, 15, 17, 0));
  });

  it('is right on the day the clocks change', () => {
    // Europe/Helsinki ends summer time on 2026-10-25 (04:00 local becomes 03:00).
    const before = Date.UTC(2026, 9, 25, 5, 0);
    const start = nextNightStart(before, TZ);
    expect(start).not.toBeNull();
    expect(local(start ?? 0, TZ)).toBe(`${String(fromHour)}:00`);
    // Winter time then: 20:00 local is 18:00 UTC.
    expect(start).toBe(Date.UTC(2026, 9, 25, 18, 0));
  });

  it('works in another zone and answers null for one that does not exist', () => {
    const noon = Date.UTC(2027, 0, 15, 12, 0);
    // New York is five hours behind UTC in January: 20:00 local is 01:00 UTC the next day.
    expect(nextNightStart(noon, 'America/New_York')).toBe(Date.UTC(2027, 0, 16, 1, 0));
    expect(nextNightStart(noon, 'Nowhere/Land')).toBeNull();
  });

  it('is already night at night: the next start is now', () => {
    const late = Date.UTC(2027, 0, 15, 20, 30);
    expect(nextNightStart(late, TZ)).toBe(late - (late % 60_000));
  });

  it('writes the window and, with a timezone, when it opens', () => {
    const noon = Date.UTC(2027, 0, 15, 12, 0);
    const text = nightText(noon, TZ);
    expect(text).toContain('Night only (20:00 to 06:00 server time)');
    expect(text).toContain('Opens Fri 20:00.');
    expect(nightText(noon, null)).toBe('Night only (20:00 to 06:00 server time).');
    expect(nightText(noon, 'Nowhere/Land')).toBe('Night only (20:00 to 06:00 server time).');
  });
});

describe('turning the pages of the catalogue', () => {
  it('wraps round in both directions', () => {
    expect(turnCatalogue(0, 1, 7)).toBe(1);
    expect(turnCatalogue(6, 1, 7)).toBe(0);
    expect(turnCatalogue(0, -1, 7)).toBe(6);
    expect(turnCatalogue(3, 0, 7)).toBe(3);
    expect(turnCatalogue(0, 1, 0)).toBe(0);
  });
});
