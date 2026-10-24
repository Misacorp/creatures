import { GAMES_FAVOURS, RULES, gamesIsSmall, glossaryEntry } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { BUNDLED_GLYPHS } from './glyphs';
import {
  creatureXp,
  emptyEvents,
  entryOf,
  favourView,
  gamesAlert,
  gamesXpChange,
  nextRefetchAt,
  pickerRows,
  sizeFavourOf,
  placeMedal,
  recordText,
  replayStart,
  screenOf,
  slotsOf,
  withSlot,
} from './games-view';
import { getSpecies } from './game';
import type { GamesView, LineupEvent } from './games-types';
import { ALERT_TEXT } from './tab-alerts';
import { GAMES_FIXTURES, GAMES_SELF_ID, gamesRoster } from './workbench/games-tab-sample';

const F = GAMES_FIXTURES;
const LINEUP = F.entries.next.lineup;
const event = (id: string) => {
  const found = LINEUP.find((e) => e.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};
const roster = gamesRoster();
const at = (view: GamesView, next: Partial<GamesView['next']>): GamesView => ({
  ...view,
  next: { ...view.next, ...next },
});

describe('what an event favours', () => {
  it('has a picture and a glossary entry for every favour', () => {
    for (const f of GAMES_FAVOURS) {
      const v = favourView(f);
      expect(glossaryEntry(v.entry), `${f}: ${v.entry}`).toBeDefined();
      if (v.icon.kind === 'glyph') expect(Object.hasOwn(BUNDLED_GLYPHS, v.icon.id), f).toBe(true);
      expect(v.label.length).toBeGreaterThan(1);
    }
    expect(favourView('ember').icon).toEqual({ kind: 'element', element: 'ember' });
    expect(favourView('guard').entry).toBe('role-guard');
  });
});

describe('slots and entries', () => {
  it('gives a solo event one slot and the team event three, in order', () => {
    const next = { entries: { 'log-carry': ['a', 'b'], 'melon-run': ['c'] } };
    expect(slotsOf(next, event('log-carry'))).toEqual(['a', 'b', null]);
    expect(slotsOf(next, event('melon-run'))).toEqual(['c']);
    expect(slotsOf(next, event('pepper-panic'))).toEqual([null]);
    expect(entryOf(next, 'b')).toBe('log-carry');
    expect(entryOf(next, 'z')).toBeNull();
  });

  it('sets, appends, replaces and clears one slot', () => {
    expect(withSlot([], 0, 'a')).toEqual(['a']);
    expect(withSlot(['a'], 2, 'b')).toEqual(['a', 'b']);
    expect(withSlot(['a', 'b'], 0, 'c')).toEqual(['c', 'b']);
    expect(withSlot(['a', 'b'], 0, null)).toEqual(['b']);
    expect(withSlot(['a', 'b'], 1, 'a')).toEqual(['a']);
  });

  it('lists the picker good fits first, then the rest, each by name; this team last', () => {
    const ids = roster.map((c) => c.id);
    const next = {
      ...F.entries.next,
      entries: { 'pepper-panic': [ids[5] ?? ''], 'log-carry': [ids[1] ?? ''] },
      goodFit: { 'log-carry': [ids[3] ?? '', ids[4] ?? '', ids[5] ?? ''] },
      badges: { 'log-carry': { [ids[4] ?? '']: 3 }, 'melon-run': { [ids[0] ?? '']: 1 } },
    };
    const rows = pickerRows(next, event('log-carry'), 1, roster);
    expect(rows).toHaveLength(roster.length);
    const last = rows[rows.length - 1];
    expect(last?.id).toBe(ids[1]);
    expect(last?.disabled).toBe('In this team');
    const moving = rows.find((r) => r.id === ids[5]);
    expect(moving?.note).toBe('In Pepper Panic');
    expect(moving?.onBoard).toBe(true);
    // The good fits first (the free ones before the one in another event), then the rest by name.
    const names = (list: typeof rows) => list.map((r) => r.name);
    const good = rows.filter((r) => r.goodFit);
    expect(good.map((r) => r.id).sort()).toEqual([ids[3], ids[4], ids[5]].sort());
    expect(rows.slice(0, 3)).toEqual(good);
    expect(rows[2]?.id).toBe(ids[5]);
    expect(names(rows.slice(0, 2))).toEqual([...names(rows.slice(0, 2))].sort());
    const rest = rows.slice(3, -1);
    expect(rest.every((r) => !r.goodFit)).toBe(true);
    expect(names(rest)).toEqual([...names(rest)].sort((a, b) => a.localeCompare(b)));
    // Only this event's badge counts; no score of any kind on a row.
    expect(rows.find((r) => r.id === ids[4])?.wins).toBe(3);
    expect(rows.find((r) => r.id === ids[0])?.wins).toBe(0);
    expect(rows.every((r) => !('fit' in r))).toBe(true);
  });

  it('the sample roster has the species the capture gave each id', () => {
    const species = new Map(roster.map((c) => [c.id, c.species]));
    const mine = (F.show.show?.events ?? []).flatMap((e) =>
      e.actors.filter((a) => a.playerId === GAMES_SELF_ID),
    );
    expect(mine.length).toBeGreaterThan(0);
    for (const a of mine) expect(species.get(a.entrantId)).toBe(a.speciesId);
  });
});

describe('the picker’s size mark', () => {
  const base = LINEUP[0];
  if (base === undefined) throw new Error('no lineup');
  const withFavours = (favours: LineupEvent['favours']): LineupEvent => ({ ...base, favours });
  const small = (speciesId: string): boolean => {
    const species = getSpecies(speciesId);
    if (species === undefined) throw new Error(speciesId);
    return gamesIsSmall(species);
  };

  it('reads the size an event favours', () => {
    expect(sizeFavourOf(withFavours(['hp', 'small']))).toBe('small');
    expect(sizeFavourOf(withFavours(['big', 'atk']))).toBe('big');
    expect(sizeFavourOf(withFavours(['hp', 'ember']))).toBeNull();
  });

  it('marks the creatures that have the favoured size, by the one size rule', () => {
    // The sample roster is all young; add an evolved one and a single-stage line (big at stage 1).
    const first = roster[0];
    if (first === undefined) throw new Error('no roster');
    const mixed = [
      ...roster,
      { ...first, id: 'c-evolved', species: 'tidewing' },
      { ...first, id: 'c-single', species: 'lanternfin' },
    ];
    const smallRows = pickerRows(F.entries.next, withFavours(['small']), 0, mixed);
    const bigRows = pickerRows(F.entries.next, withFavours(['big']), 0, mixed);
    const speciesOf = new Map(mixed.map((c) => [c.id, c.species]));
    expect(smallRows.find((r) => r.id === 'c-single')?.size).toBeNull();
    expect(bigRows.find((r) => r.id === 'c-single')?.size).toBe('big');
    expect(bigRows.find((r) => r.id === 'c-evolved')?.size).toBe('big');
    expect(smallRows.some((r) => r.size === 'small')).toBe(true);
    expect(bigRows.some((r) => r.size === 'big')).toBe(true);
    for (const r of smallRows) {
      expect(r.size, r.id).toBe(small(speciesOf.get(r.id) ?? '') ? 'small' : null);
    }
    for (const r of bigRows) {
      expect(r.size, r.id).toBe(small(speciesOf.get(r.id) ?? '') ? null : 'big');
    }
    const plain = pickerRows(F.entries.next, withFavours(['hp']), 0, roster);
    expect(plain.every((r) => r.size === null)).toBe(true);
  });
});

describe('the phase, the pip and when to ask again', () => {
  it('shows the lineup, the stands after the lock and the show while it plays', () => {
    expect(screenOf(F.entries, F.entries.serverNow)).toBe('lineup');
    expect(screenOf(F.locked, F.locked.serverNow)).toBe('stands');
    expect(screenOf(F.show, F.show.serverNow)).toBe('show');
    expect(screenOf(F.after, F.after.serverNow)).toBe('lineup');
  });

  it('pips while the show plays, and for empty events while a free creature could go', () => {
    expect(gamesAlert(null, roster, 0)).toBeNull();
    expect(gamesAlert(F.show, roster, F.show.serverNow)).toBe(ALERT_TEXT.gamesLive);
    expect(gamesAlert(F.entries, roster, F.entries.serverNow)).toBe(ALERT_TEXT.gamesEntries);
    expect(emptyEvents(F.entries.next, roster)).toHaveLength(F.entries.next.lineup.length);
    const all = at(F.entries, {
      entries: Object.fromEntries(LINEUP.map((e, i) => [e.id, [roster[i]?.id ?? '']])),
    });
    expect(gamesAlert(all, roster, all.serverNow)).toBeNull();
    // Nobody free: every creature is in an event already.
    const one = roster.slice(0, 1);
    const busy = at(F.entries, { entries: { 'melon-run': [one[0]?.id ?? ''] } });
    expect(gamesAlert(busy, one, busy.serverNow)).toBeNull();
    // After the lock there is nothing to enter.
    expect(gamesAlert(F.locked, roster, F.locked.serverNow)).toBeNull();
  });

  it('asks again at the lock, at the show and after it ends', () => {
    const { entries, locked, show } = F;
    expect(nextRefetchAt(entries, entries.serverNow)).toBe(entries.next.lockAt);
    expect(nextRefetchAt(locked, locked.serverNow)).toBe(locked.next.showAt);
    const end = show.show?.endsAt ?? 0;
    expect(nextRefetchAt(show, show.serverNow)).toBe(end + 1_500);
    expect(nextRefetchAt(entries, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});

describe('results and records', () => {
  it('gives the medal of a place', () => {
    expect([1, 2, 3, 4].map(placeMedal)).toEqual(['gold', 'silver', 'bronze', null]);
  });

  it("splits a team's experience between its creatures, a pin's to its owner", () => {
    const pin = RULES.games.xp.pin;
    const team = { eventId: 'x', creatureIds: ['a', 'b'], place: 2, medal: null, xp: 180 };
    expect(creatureXp({ ...team, pin: false, pins: [] }, 'a')).toBe(90);
    const pinned = { ...team, xp: 180 + pin, pin: true, pins: ['b'] };
    expect(creatureXp(pinned, 'a')).toBe(90);
    expect(creatureXp(pinned, 'b')).toBe(90 + pin);
  });

  it('fills the bar back from where the creature is now', () => {
    const c = { level: 5, exp: 30, expNeeded: 300, species: 'cindle', nickname: null };
    const small = gamesXpChange(c, 20);
    expect(small.from).toBe(5);
    expect(small.gained).toBe(20);
    const crossed = gamesXpChange(c, 90);
    expect(crossed.from).toBe(4);
    expect(crossed.to).toBe(5);
  });

  it('writes a record in seconds, metres, peppers or laps', () => {
    expect(recordText({ eventId: 'melon-run', best: 18, unit: 'm' })).toBe('18 m');
    expect(recordText({ eventId: 'pepper-panic', best: 1, unit: 'peppers' })).toBe('1 pepper');
    expect(recordText({ eventId: 'pepper-panic', best: 7, unit: 'peppers' })).toBe('7 peppers');
    expect(recordText({ eventId: 'shark-derby', best: 150, unit: 'centilaps' })).toBe('1.5 laps');
    expect(recordText({ eventId: 'bucket-brigade', best: 87, unit: 'percent' })).toBe('87%');
    expect(recordText({ eventId: 'crate-tower', best: 1, unit: 'crates' })).toBe('1 crate');
    expect(recordText({ eventId: 'crate-tower', best: 9, unit: 'crates' })).toBe('9 crates');
    expect(recordText({ eventId: 'kite-flight', best: 14, unit: 'm' })).toBe('14 m');
    expect(recordText({ eventId: 'sauna-showdown', best: 50, unit: 'ticks' })).toMatch(
      /^\d+(\.\d)? s$/,
    );
  });

  it("starts an event's replay at its intro", () => {
    const show = F.after.show;
    if (show === null) throw new Error('no show');
    expect(replayStart(show, 'melon-run')).toBe(0);
    expect(replayStart(show, 'pepper-panic')).toBe(show.timeline[1]?.introMs);
  });
});
