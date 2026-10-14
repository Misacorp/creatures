import { describe, expect, it } from 'vitest';
import { needsPlacement, nowAction } from './raid-now';
import type { RaidView } from './raid-api';

const HOUR = 3_600_000;
// Friday 2026-10-09 13:37 in Helsinki (UTC+3 in October) is 10:37 UTC.
const FRIDAY = Date.UTC(2026, 9, 9, 10, 37);
const schedule = {
  weekStart: FRIDAY - 4 * 24 * HOUR,
  phase1: FRIDAY,
  phase2: FRIDAY + 24 * HOUR,
  finale: FRIDAY + 2 * 24 * HOUR + 6 * HOUR + 23 * 60_000,
};

const party = { party: 1 } as unknown as NonNullable<RaidView['party']>;
const placed = { creatureId: 'a', species: 'splashet', name: 'A', level: 1, slot: 0 };
const loose = { ...placed, creatureId: 'b', slot: null };

function view(patch: {
  next?: RaidView['next'];
  party?: RaidView['party'];
  you?: Partial<RaidView['you']>;
}) {
  return {
    schedule,
    timezone: 'Europe/Helsinki',
    next:
      'next' in patch ? (patch.next ?? null) : { event: 'phase1' as const, at: schedule.phase1 },
    party: 'party' in patch ? (patch.party ?? null) : party,
    you: {
      inRoster: true,
      optOut: false,
      canEdit: true,
      canOptOut: true,
      team: { mode: 'auto' as const, creatures: [placed, placed, placed] },
      ...patch.you,
    },
  };
}

describe('nowAction', () => {
  it('asks for a team while a creature has no slot, during Preparation', () => {
    const action = nowAction(
      view({ you: { team: { mode: 'auto', creatures: [placed, loose, loose] } } }),
      'before',
      FRIDAY - 10 * HOUR,
    );
    expect(action.kind).toBe('set-team');
    expect(action.label).toBe('Set your team');
    expect(action.target).toBe('placement');
  });

  it('counts down to the next phase once the team is placed', () => {
    const now = FRIDAY - 2 * HOUR - 10 * 60_000;
    const action = nowAction(view({}), 'before', now);
    expect(action.kind).toBe('countdown');
    expect(action.label).toBe('Phase 1 in 2 h 10 m');
    expect(action.detail).toBe('Fri 13:37 (Europe/Helsinki)');
    expect(action.target).toBeNull();
  });

  it('counts down to 20:00 on finale day', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    const action = nowAction(view({ next }), 'before', schedule.finale - 3 * HOUR);
    expect(action.kind).toBe('finale-countdown');
    expect(action.label).toBe('Finale in 3 h');
    expect(action.detail).toContain('Sun 20:00');
  });

  it('says "Watch live" in the lobby and while the finale is on', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    for (const window of ['lobby', 'live'] as const) {
      const action = nowAction(view({ next }), window, schedule.finale - 90_000);
      expect(action).toMatchObject({ kind: 'watch-live', label: 'Watch live', target: 'live' });
    }
  });

  it('says when the finale starts, or that it is on', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    expect(nowAction(view({ next }), 'lobby', schedule.finale - 90_000).detail).toBe(
      'Finale starts in 1:30',
    );
    expect(nowAction(view({ next }), 'live', schedule.finale + 1000).detail).toBe(
      'The finale is on now',
    );
  });

  it('puts live first even when a creature is unplaced: the row is closed by then', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    const unplaced = { team: { mode: 'auto' as const, creatures: [loose] } };
    expect(nowAction(view({ next, you: unplaced }), 'live', schedule.finale).kind).toBe(
      'watch-live',
    );
  });

  it('names the next boss when the week is done', () => {
    const action = nowAction(view({ next: null }), 'after', schedule.finale + 5 * HOUR);
    expect(action.kind).toBe('week-done');
    expect(action.label).toBe('Next boss Monday 13:37');
    expect(action.target).toBeNull();
  });

  it('does not ask for a team when edits are closed', () => {
    const closed = { canEdit: false, team: { mode: 'auto' as const, creatures: [loose] } };
    expect(nowAction(view({ you: closed }), 'before', FRIDAY - HOUR).kind).toBe('countdown');
  });

  it('says a phase is happening now once its time has passed', () => {
    const action = nowAction(view({}), 'before', FRIDAY + 1000);
    expect(action).toMatchObject({ kind: 'resolving', label: 'Phase 1 is happening now' });
  });

  it('only states that the week is sat out, with nothing to tap', () => {
    const action = nowAction(view({ party: null, you: { optOut: true } }), 'before', FRIDAY - HOUR);
    expect(action).toMatchObject({ kind: 'sitting-out', target: null });
  });

  it('tells a player outside the roster how to join, with nothing to tap', () => {
    const action = nowAction(
      view({ party: null, you: { inRoster: false, team: null } }),
      'before',
      FRIDAY - HOUR,
    );
    expect(action).toMatchObject({ kind: 'not-in', target: null });
  });
});

describe('needsPlacement', () => {
  it('is false without a party, without a team and when everything is placed', () => {
    expect(needsPlacement(view({ party: null }))).toBe(false);
    expect(needsPlacement(view({ you: { team: null } }))).toBe(false);
    expect(needsPlacement(view({}))).toBe(false);
  });

  it('is true while any team creature has no slot', () => {
    const team = { mode: 'chosen' as const, creatures: [placed, placed, loose] };
    expect(needsPlacement(view({ you: { team } }))).toBe(true);
  });
});
