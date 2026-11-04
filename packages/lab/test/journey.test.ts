/** The journey on the game's raid rules: seats follow the piece, the lock sets the HP, replacements come from the player's own spares. */
import { describe, expect, it } from 'vitest';
import { wideBoss } from '@creatures/engine/v2';
import {
  JOURNEY_SERVERS,
  NEW_PLAYER_JOIN_WEEK,
  coverageServer,
  journeyOf,
  journeyWeekend,
  playJourneyWeekend,
  presentIn,
  seatsOf,
  smallParty,
} from '../src/journey';
import { DEDICATED, MIXED } from '../src/path';
import { TRACK_ORDER, slotBoss } from '../src/track';

const slotOf = (bossId: string): number => TRACK_ORDER.indexOf(bossId) + 1;

describe('the seats of a piece', () => {
  it('each player brings as many creatures as the piece has seats (Storm Sovereign 2, Cinder Wyrm 4)', () => {
    for (const [boss, seats] of [
      ['storm-sovereign', 2],
      ['cinder-wyrm', 4],
      ['tidal-colossus', 3],
    ] as const) {
      const slot = slotOf(boss);
      expect(seatsOf(slot)).toBe(seats);
      const w = journeyWeekend(DEDICATED, slot, 12, 'expected', 'seats');
      expect(w.seats).toBe(seats);
      expect(w.players).toHaveLength(4);
      for (const p of w.players) {
        expect(p.team).toHaveLength(seats);
        expect(p.team.map((c) => c.row)).toEqual(Array.from({ length: seats }, (_, r) => r));
        expect(p.team.every((c) => c.owner === p.owner)).toBe(true);
      }
    }
  });

  it('the spares are the ranks after the seats, in rank order, and the owner’s own', () => {
    const w = journeyWeekend(DEDICATED, slotOf('cinder-wyrm'), 16, 'expected', 'spares');
    for (const p of w.players) {
      expect(p.spares.length).toBeGreaterThan(0);
      expect(p.spares.every((s) => s.owner === p.owner)).toBe(true);
      // Next-strongest first: the spares step in in the order of the roster's ranks, so their levels never rise.
      const levels = p.spares.map((s) => s.level);
      expect(levels).toEqual([...levels].sort((a, b) => b - a));
    }
  });
});

describe('the stage 1 lock', () => {
  it('the weekend HP is the boss widened for the players at stage 1', () => {
    const server = coverageServer(8);
    const slot = slotOf('tidal-colossus');
    const base = slotBoss(slot);
    const before = journeyWeekend(server, slot, NEW_PLAYER_JOIN_WEEK - 1, 'expected', 'lock');
    const after = journeyWeekend(server, slot, NEW_PLAYER_JOIN_WEEK, 'expected', 'lock');
    expect(before.party).toBe(7);
    expect(after.party).toBe(8);
    expect(before.boss.hp).toBe(wideBoss(base, 7).hp);
    expect(after.boss.hp).toBe(wideBoss(base, 8).hp);
    expect(after.boss.hp).toBeGreaterThan(before.boss.hp);
    expect(after.boss.cols).toBe(8);
  });

  it('four players fight the slot’s own boss, and every stage starts from the HP the last left', () => {
    const slot = slotOf('tidal-colossus');
    const w = journeyWeekend(DEDICATED, slot, 8, 'slow', 'lock4');
    expect(w.boss.hp).toBe(slotBoss(slot).hp);
    const r = playJourneyWeekend(w, 'lock4');
    expect(r.stages.length).toBeGreaterThan(0);
    let left = w.boss.hp;
    for (const s of r.stages) {
      expect(s.bossHpLeft).toBeLessThanOrEqual(left);
      left = s.bossHpLeft;
    }
  });
});

describe('replacements from the player’s own spares', () => {
  // A hard boss at an early week for a slow server: creatures fall.
  const w = journeyWeekend(DEDICATED, slotOf('thornmother'), 4, 'slow', 'replace');
  const r = playJourneyWeekend(w, 'replace');

  it('a weekend with knockouts brings spares, each owner’s own, each once, in order', () => {
    expect(r.replacements).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const stage of r.stages)
      for (const f of stage.fighters) {
        const m = /^(p\d+):spare(\d+)$/.exec(f.uid);
        if (!m || seen.has(f.uid)) continue;
        expect(f.owner).toBe(m[1]);
        // The spare steps in once, at the next number for its owner; later stages it fights on as the same creature.
        expect(Number(m[2])).toBe([...seen].filter((k) => k.startsWith(`${m[1]}:`)).length);
        seen.add(f.uid);
      }
    expect(seen.size).toBe(r.replacements);
  });

  it('nobody who was knocked out fights again, and no player brings more than their seats', () => {
    const out = new Set<string>();
    for (const stage of r.stages) {
      const perOwner = new Map<string, number>();
      for (const f of stage.fighters) {
        expect(out.has(f.uid)).toBe(false);
        perOwner.set(f.owner, (perOwner.get(f.owner) ?? 0) + 1);
      }
      for (const n of perOwner.values()) expect(n).toBeLessThanOrEqual(w.seats);
      for (const f of stage.fighters) if (f.hp <= 0) out.add(f.uid);
    }
  });

  it('a creature keeps the Knack and talents it fought with', () => {
    const first = new Map<string, { knack: unknown; talents: readonly string[] }>();
    for (const stage of r.stages)
      for (const f of stage.fighters) {
        const was = first.get(f.uid);
        if (was) {
          expect(f.knack).toBe(was.knack);
          expect(f.talents).toEqual(was.talents);
        } else first.set(f.uid, { knack: f.knack, talents: f.talents });
      }
    expect(first.size).toBeGreaterThan(w.seats);
  });
});

describe('the servers', () => {
  it('a new player is not there before their week', () => {
    const s = coverageServer(5);
    expect(presentIn(s, 1).players).toHaveLength(4);
    expect(presentIn(s, NEW_PLAYER_JOIN_WEEK).players).toHaveLength(5);
    expect(JOURNEY_SERVERS.map((x) => x.id)).toEqual([
      'dedicated',
      'mixed',
      'builders',
      'mixed5',
      'mixed8',
      'mixed15',
      'small1',
      'small2',
      'small3',
    ]);
    expect(
      [coverageServer(5), coverageServer(8), coverageServer(15)].map((x) => x.players.length),
    ).toEqual([5, 8, 15]);
    expect([1, 2, 3].map((n) => smallParty(n as 1 | 2 | 3).players.length)).toEqual([1, 2, 3]);
  });

  it('a path on the game’s rules is a whole 24-week walk and the same for the same seed', () => {
    const a = journeyOf(MIXED, 'expected', 0, undefined, { determination: 'off' });
    const b = journeyOf(MIXED, 'expected', 0, undefined, { determination: 'off' });
    expect(a).toEqual(b);
    expect(a.fought).toHaveLength(24);
    expect(a.reached[0]).toBe(1);
  });
});
