import { ACCOUNT_STATS, RULES, expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import { parseProfile } from './expedition-parse';
import profileFixture from './fixtures/expedition-profile.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import {
  ANY_PLACE_NAME,
  bonusSummary,
  bonusText,
  explorerRows,
  journalPlaces,
  journalProgressText,
  milestoneName,
  milestoneBonusText,
  milestoneViews,
  statLabel,
  statRows,
} from './journal-view';

const profile = parseProfile(profileFixture);

describe('the journal', () => {
  const places = journalPlaces(profile);

  it('groups every page by place, the pages of anywhere last, none twice and none lost', () => {
    const ids = places.flatMap((p) => p.pages.map((page) => page.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(expeditionContent.journal.entries.length);
    expect(places.at(-1)?.name).toBe(ANY_PLACE_NAME);
    expect(places[0]?.place).toBe(expeditionContent.destinations[0]?.id);
    expect(places.find((p) => p.place === 'tidepools')?.name).toBe('Tidepools');
  });

  it('shows the words of a found page and only a blank for the others', () => {
    const tide = places.find((p) => p.place === 'tidepools');
    const found = tide?.pages.find((p) => p.id === 'tide-first-pool');
    expect(found?.found).toBe(true);
    expect(found?.title?.length).toBeGreaterThan(2);
    expect(found?.text?.length).toBeGreaterThan(20);
    const blank = tide?.pages.find((p) => !p.found);
    expect(blank).toMatchObject({ title: null, text: null });
    for (const place of places) {
      for (const page of place.pages) {
        expect(page.found === (page.title !== null), page.id).toBe(true);
      }
    }
  });

  it('counts the pages found in each place and in all', () => {
    expect(places.find((p) => p.place === 'tidepools')).toMatchObject({ found: 1 });
    expect(places.reduce((n, p) => n + p.found, 0)).toBe(profile.journal.found.length);
    expect(journalProgressText(profile)).toBe('1 / 41 pages found');
  });

  it('lists the sets of each place with their progress, from the server', () => {
    const tide = places.find((p) => p.place === 'tidepools');
    expect(tide?.sets).toEqual([
      {
        id: 'tide-ledger',
        name: expect.any(String) as string,
        found: 1,
        total: 3,
        complete: false,
      },
    ]);
    const done = journalPlaces({
      journal: {
        ...profile.journal,
        sets: profile.journal.sets.map((s) => ({ ...s, found: s.total })),
      },
    });
    expect(done.flatMap((p) => p.sets).every((s) => s.complete)).toBe(true);
  });

  it('still works if the server leaves a set out: it counts from the pages', () => {
    const bare = journalPlaces({ journal: { ...profile.journal, sets: [] } });
    const tide = bare.find((p) => p.place === 'tidepools');
    expect(tide?.sets[0]).toMatchObject({ found: 1, total: 3 });
  });
});

describe('the profile', () => {
  it('names every account stat the rules record, in the order of the rules', () => {
    const rows = statRows(profile.stats);
    expect(rows.map((r) => r.stat)).toEqual([...ACCOUNT_STATS]);
    for (const row of rows) {
      expect(row.label.length, row.stat).toBeGreaterThan(4);
      expect(row.label, row.stat).not.toContain('_');
    }
    expect(rows.find((r) => r.stat === 'trips_finished')?.value).toBe(3);
    expect(statRows({}).every((r) => r.value === 0)).toBe(true);
    expect(statLabel('brand_new_stat')).toBe('brand new stat');
  });

  it('names every milestone of the rules, and has a fallback for a new one', () => {
    for (const m of RULES.expeditions.milestones) {
      expect(milestoneName(m.id), m.id).not.toBe(m.id);
      expect(milestoneName(m.id)[0]).toBe(milestoneName(m.id)[0]?.toUpperCase());
    }
    expect(milestoneName('night-owl')).toBe('Night owl');
  });

  it('shows each milestone with progress capped at its goal and its tiny bonus', () => {
    const views = milestoneViews(profile.milestones);
    expect(views).toHaveLength(RULES.expeditions.milestones.length);
    const first = views[0];
    expect(first?.progress).toBe('Trips finished: 3 / 5');
    expect(first).toMatchObject({ value: 3, max: 5 });
    expect(first?.reached).toBe(false);
    const over = milestoneViews([{ ...profile.milestones[0]!, value: 99, reached: true }]);
    expect(over[0]).toMatchObject({
      progress: 'Trips finished: 5 / 5',
      value: 5,
      max: 5,
      reached: true,
    });
  });

  it('shows a milestone bonus value only once it is reached', () => {
    const base = profile.milestones[0]!;
    const locked = milestoneViews([{ ...base, reached: false }])[0];
    expect(locked?.bonus).toBeNull();
    expect(locked?.name).toBe(milestoneName(base.id));
    const open = milestoneViews([{ ...base, value: base.at, reached: true }])[0];
    expect(open?.bonus).toBe(bonusText(base.bonus));
    expect(open?.bonus).toMatch(/^\+/);
    expect(milestoneBonusText({ reached: false, bonus: base.bonus })).toBeNull();
    // No locked milestone leaks a value, whatever the rules say.
    for (const view of milestoneViews(profile.milestones.map((m) => ({ ...m, reached: false })))) {
      expect(view.bonus, view.id).toBeNull();
    }
  });

  it('writes a bonus as words and sums the ones that are on', () => {
    expect(bonusText({ kind: 'parts', bp: 100 })).toBe('+1% parts from trips');
    expect(bonusText({ kind: 'xp', bp: 200 })).toBe('+2% explorer XP');
    expect(bonusText({ kind: 'other', bp: 50 })).toBe('+0.5% other');
    expect(bonusSummary(profile.bonuses)).toBeNull();
    expect(bonusSummary({ rarityBp: 100, partsBp: 0, offerBp: 100, xpBp: 0 })).toBe(
      '+1% rare catches, +1% chance of a push-on choice',
    );
  });

  it('lists the explorers with their names, the highest rank first', () => {
    const creatures = parseGameState(stateOffer).creatures;
    const rows = explorerRows(profile, creatures);
    expect(rows.map((r) => r.name)).toEqual(
      [...rows].sort((a, b) => b.rank - a.rank).map((r) => r.name),
    );
    expect(rows[0]).toMatchObject({ name: 'Cindle', rank: 4 });
    // A creature the state does not list is left out.
    expect(explorerRows(profile, [])).toEqual([]);
  });
});
