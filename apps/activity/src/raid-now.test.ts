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
/** The player's team when they placed one creature of three. */
const one = { creatures: [placed] };

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
      canEdit: true,
      team: { creatures: [placed, placed, placed] },
      ...patch.you,
    },
  };
}

describe('nowAction', () => {
  it('asks a joined player with fewer than three placed to set their team, during Preparation', () => {
    const action = nowAction(view({ you: { team: one } }), 'before', FRIDAY - 10 * HOUR);
    expect(action.kind).toBe('set-team');
    expect(action.label).toBe('Set your team');
    expect(action.detail).toContain('Only the creatures you place fight.');
    expect(action.target).toBe('placement');
  });

  it('asks a player who has not joined to join by placing a creature', () => {
    const action = nowAction(
      view({ you: { inRoster: false, team: null } }),
      'before',
      FRIDAY - 10 * HOUR,
    );
    expect(action).toMatchObject({
      kind: 'set-team',
      label: "Join this week's raid",
      target: 'placement',
    });
    expect(action.detail).toContain('Place a creature on the board before the finale');
  });

  it('does not ask for more than the player owns', () => {
    const two = { creatures: [placed, { ...placed, creatureId: 'b', slot: 1 }] };
    // Two creatures owned, both placed: nothing more to ask.
    expect(nowAction(view({ you: { team: two } }), 'before', FRIDAY - HOUR, 2).kind).toBe(
      'countdown',
    );
    expect(nowAction(view({ you: { team: two } }), 'before', FRIDAY - HOUR, 3).kind).toBe(
      'set-team',
    );
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

  it('puts live first even when fewer than three are placed: the row is closed by then', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    expect(nowAction(view({ next, you: { team: one } }), 'live', schedule.finale).kind).toBe(
      'watch-live',
    );
  });

  it('does not offer a live view to a player who is not in the raid', () => {
    const next = { event: 'finale' as const, at: schedule.finale };
    const out = view({ next, party: null, you: { inRoster: false, team: null } });
    expect(nowAction(out, 'live', schedule.finale).kind).toBe('not-in');
  });

  it('names the next boss when the week is done', () => {
    const action = nowAction(view({ next: null }), 'after', schedule.finale + 5 * HOUR);
    expect(action.kind).toBe('week-done');
    expect(action.label).toBe('Next boss Monday 13:37');
    expect(action.target).toBeNull();
  });

  it('does not ask for a team when edits are closed', () => {
    const closed = { canEdit: false, team: one };
    expect(nowAction(view({ you: closed }), 'before', FRIDAY - HOUR).kind).toBe('countdown');
  });

  it('says a phase is happening now once its time has passed', () => {
    const action = nowAction(view({}), 'before', FRIDAY + 1000);
    expect(action).toMatchObject({ kind: 'resolving', label: 'Phase 1 is happening now' });
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
  it('is false without a board to place on, when edits are closed and when everything is placed', () => {
    expect(needsPlacement(view({ party: null }))).toBe(false);
    expect(needsPlacement(view({ you: { canEdit: false, team: one } }))).toBe(false);
    expect(needsPlacement(view({}))).toBe(false);
  });

  it('is true for a player who has not joined, and while fewer than three are placed', () => {
    expect(needsPlacement(view({ you: { inRoster: false, team: null } }))).toBe(true);
    expect(needsPlacement(view({ you: { team: one } }))).toBe(true);
  });

  it('counts only the creatures the player owns', () => {
    expect(needsPlacement(view({ you: { team: one } }), 1)).toBe(false);
    expect(needsPlacement(view({ you: { team: one } }), 2)).toBe(true);
  });
});
