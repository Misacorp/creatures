import { RULES, content, dungeonContent, MAX_ROOM_ROUNDS } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import dungeonReplay from './fixtures/dungeon-replay.json';
import { parseDungeonReplay } from './dungeon-parse';
import { raidMaxRounds, roomMaxRounds, roundLabel } from './stage-rounds';
import { forecastNextRound } from './telegraph';

/**
 * The stage must show the fight's LIMIT ("Round 2 / 6"), never how long the pre-computed fight really
 * lasted, which would give the result away (Misa, 2026-10-15). These tests pin the limit to the
 * content, and guard the screens that pass it to the stage.
 */

const REPLAY = parseDungeonReplay(dungeonReplay);

describe('roundLabel', () => {
  it('writes the round against the limit', () => {
    expect(roundLabel(2, 6)).toBe('Round 2 / 6');
    expect(roundLabel(1, 12)).toBe('Round 1 / 12');
  });

  it('writes only the round when there is no limit', () => {
    expect(roundLabel(2, null)).toBe('Round 2');
  });
});

describe('roomMaxRounds', () => {
  it('is the foe\'s own "rounds" in the content, for every foe', () => {
    for (const foe of dungeonContent.foes) {
      expect(roomMaxRounds(foe.id), foe.id).toBe(foe.rounds);
      expect(foe.rounds).toBeLessThanOrEqual(MAX_ROOM_ROUNDS);
    }
  });

  it('is null for a foe the content does not have', () => {
    expect(roomMaxRounds('retired-foe')).toBeNull();
  });

  it('does not depend on how long a stored fight lasted', () => {
    for (const room of REPLAY.rooms) {
      const max = roomMaxRounds(room.foe.id);
      expect(max).not.toBeNull();
      // Whatever the fight's real length was, every round of it is shown against the same limit.
      for (let actual = 1; actual <= (max ?? 0); actual++) {
        expect(roundLabel(actual, roomMaxRounds(room.foe.id))).toBe(
          `Round ${String(actual)} / ${String(max)}`,
        );
      }
    }
  });

  it('is more than the fight lasted when the fight ended early (the spoiler this prevents)', () => {
    const early = REPLAY.rooms.filter((r) => r.rounds < (roomMaxRounds(r.foe.id) ?? 0));
    for (const room of early) {
      expect(roundLabel(room.rounds, roomMaxRounds(room.foe.id))).not.toBe(
        `Round ${String(room.rounds)} / ${String(room.rounds)}`,
      );
    }
  });
});

describe('raidMaxRounds', () => {
  it("is the boss's finaleRounds for the finale", () => {
    for (const boss of content.bosses) {
      expect(raidMaxRounds('finale', boss.id), boss.id).toBe(boss.finaleRounds);
    }
  });

  it("is the rules' rounds for a phase, whatever the boss", () => {
    for (const phase of RULES.raid.phases) {
      if (phase.id === 'finale') continue;
      for (const boss of content.bosses) {
        expect(raidMaxRounds(phase.id, boss.id)).toBe(phase.rounds);
      }
    }
  });

  it('falls back to the rules for a finale of an unknown boss', () => {
    const finale = RULES.raid.phases.find((p) => p.id === 'finale');
    expect(raidMaxRounds('finale', 'retired-boss')).toBe(finale?.rounds ?? null);
  });
});

describe('the forecast follows the limit, not the fight length', () => {
  it('still warns on the last round a short fight played', () => {
    // A foe that strikes every 3 rounds: the warning for round 3 shows in round 2 against the limit
    // (6), but would be missing against a length of 2, which would also give that length away.
    const foe = dungeonContent.foes.find((f) => f.gimmicks.some((g) => 'every' in g.trigger));
    expect(foe).toBeDefined();
    const id = foe?.id ?? '';
    const names = { gimmicks: {} };
    const limit = roomMaxRounds(id);
    expect(forecastNextRound(id, 2, limit, ['a', 'b', 'c'], [], names, 'row')).not.toBeNull();
    expect(forecastNextRound(id, 2, 2, ['a', 'b', 'c'], [], names, 'row')).toBeNull();
  });

  it('has no last round at all without a limit', () => {
    const foe = dungeonContent.foes.find((f) => f.gimmicks.some((g) => 'every' in g.trigger));
    expect(
      forecastNextRound(foe?.id ?? '', 2, null, ['a', 'b', 'c'], [], { gimmicks: {} }, 'row'),
    ).not.toBeNull();
  });
});

/** The screens that give the stage and the round overlay their count (read as source). */
const screens = import.meta.glob<string>(['./DungeonPlayback.tsx', './Replay.tsx', './Live.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the screens pass the limit, never the stored fight length', () => {
  const source = (name: string): string => screens[name] ?? '';

  it('finds the sources', () => {
    for (const name of ['./DungeonPlayback.tsx', './Replay.tsx', './Live.tsx']) {
      expect(source(name).length, name).toBeGreaterThan(100);
    }
  });

  it('does not hand the dungeon room\'s or the replay\'s own "rounds" to the stage or the playback', () => {
    const leaks = /\brounds\s*[:=]\s*\{?\s*(?:room|data|replay|result|summary)\.rounds\b/;
    expect(source('./DungeonPlayback.tsx')).not.toMatch(leaks);
    expect(source('./Replay.tsx')).not.toMatch(leaks);
  });

  it("takes the dungeon limit from the content by foe id, and the raid replay's from the rules", () => {
    expect(source('./DungeonPlayback.tsx')).toContain('roomMaxRounds(room.foe.id)');
    expect(source('./Replay.tsx')).toContain('raidMaxRounds(data.phase, data.boss.id)');
  });

  it("shows the live finale against the fight's configured round count, which is the boss's limit", () => {
    expect(source('./Live.tsx')).toContain('rounds={fight.rounds}');
  });
});
