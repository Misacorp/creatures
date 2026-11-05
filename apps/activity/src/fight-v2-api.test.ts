import { describe, expect, it } from 'vitest';
import {
  isBoardEvent,
  isRulesV2,
  parseLiveV2,
  parseReplayV2,
  parseStatsV2,
  stagePhaseOf,
} from './fight-v2-api';
import { liveSample, replaySample, statsSample } from './workbench/fight-v2-sample';

/** The wire: what the server's JSON would look like after a round trip. */
const wire = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

describe('the v2 payloads the engine and the server make', () => {
  it('a stored stage parses, events and all', () => {
    const sample = replaySample({ slot: 5, players: 4, stage: 2, seed: 'api' });
    const parsed = parseReplayV2(wire(sample));
    expect(parsed.events.length).toBe(sample.events.length);
    expect(parsed.boss.rows).toBe(sample.boss.rows);
    expect(parsed.phase).toBe('stage2');
    expect(parsed.fighters[0]?.knackName).not.toBeNull();
  });

  it('every board event the engine emits in a fight passes the check', () => {
    for (const slot of [1, 3, 4, 5]) {
      const sample = replaySample({ slot, players: 5, stage: 1, seed: 'api' });
      for (const event of sample.events) {
        if (event.board !== undefined) expect(isBoardEvent(wire(event.board))).toBe(true);
      }
    }
  });

  it('the events of a mixed party (intercepts, covers, boosts, a crit multiplier) pass the check, and a bad field does not', () => {
    const types = new Set<string>();
    for (const seed of ['api', 'fold', 'juice']) {
      const sample = replaySample({ slot: 4, players: 5, stage: 1, seed, party: 'mixed' });
      for (const event of sample.events) {
        if (event.board === undefined) continue;
        types.add(event.board.type);
        expect(isBoardEvent(wire(event.board))).toBe(true);
      }
    }
    for (const type of ['cover', 'boost', 'reaction', 'hit']) expect(types.has(type)).toBe(true);
    expect(isBoardEvent({ type: 'intercept', guard: 'a', who: 'b' })).toBe(true);
    expect(isBoardEvent({ type: 'intercept', guard: 'a' })).toBe(false);
    expect(isBoardEvent({ type: 'cover', guard: 'a', who: 'b', prevented: -1 })).toBe(false);
    expect(isBoardEvent({ type: 'boost', who: 'a', by: 'b', bp: 1500 })).toBe(true);
    const hit = {
      type: 'hit',
      from: 'a',
      to: null,
      damage: 1,
      crit: true,
      blocked: false,
      dodged: false,
    };
    expect(isBoardEvent({ ...hit, critBp: 26_000 })).toBe(true);
    expect(isBoardEvent({ ...hit, critBp: 'x' })).toBe(false);
  });

  it('a payload with an event it cannot read is refused whole', () => {
    const sample = wire(replaySample({ slot: 1, players: 4, stage: 1, seed: 'api' })) as {
      events: unknown[];
    };
    sample.events[1] = { round: 1, turn: 0, kind: 'board', text: '', board: { type: 'explode' } };
    expect(() => parseReplayV2(sample)).toThrow('unexpected replay');
    const noHit = wire(replaySample({ slot: 1, players: 4, stage: 1, seed: 'api' })) as {
      events: { board?: { type: string } }[];
    };
    const at = noHit.events.findIndex((e) => e.board?.type === 'hit');
    noHit.events[at] = {
      round: 1,
      turn: 0,
      kind: 'board',
      text: '',
      board: { type: 'hit' },
    } as never;
    expect(() => parseReplayV2(noHit)).toThrow();
  });

  it('a shipped (v1) replay is not a v2 one', () => {
    expect(isRulesV2({ rules: { guardHpBp: 1, guardArmorBp: 1 } })).toBe(false);
    expect(isRulesV2({ rules: 2 })).toBe(true);
    expect(() => parseReplayV2({ rules: null })).toThrow();
  });

  it('the live finale parses in every state: the lobby, the fight, the end', () => {
    const opts = { slot: 4, players: 4, stage: 3, seed: 'api' } as const;
    for (const round of [0, 1, 4, 8]) {
      const snap = liveSample(opts, { round, ability: 'shield-wall', row: 1 });
      const parsed = parseLiveV2(wire(snap));
      expect(parsed.round).toBe(round);
      expect(parsed.abilities[0]?.kind).toBe('shieldWall');
    }
    const lobby = parseLiveV2(
      wire({
        ...liveSample(opts, { round: 0 }),
        status: 'lobby',
        boss: null,
        bossDef: null,
        card: null,
      }),
    );
    expect(lobby.status).toBe('lobby');
    // A fight with no boss card is not a fight we can draw.
    expect(() => parseLiveV2(wire({ ...liveSample(opts, { round: 2 }), card: null }))).toThrow(
      'unexpected finale',
    );
  });

  it('the after-action numbers parse and a stage maps to the name the routes take', () => {
    const stats = parseStatsV2(wire(statsSample({ slot: 4, players: 4, stage: 1, seed: 'api' })));
    expect(stats.players.length).toBe(4);
    expect(() => parseStatsV2({ ...stats, rules: 1 })).toThrow('unexpected fight stats');
    expect(stagePhaseOf('phase1')).toBe('stage1');
    expect(stagePhaseOf('phase2')).toBe('stage2');
    expect(stagePhaseOf('finale')).toBe('finale');
    // A name the server already uses is kept (it once turned into the finale, whose replay does not exist yet).
    expect(stagePhaseOf('stage1')).toBe('stage1');
    expect(stagePhaseOf('stage2')).toBe('stage2');
  });
});
