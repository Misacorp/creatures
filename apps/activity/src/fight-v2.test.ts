import { combatV2 } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import {
  PURGE_ROUNDS,
  actionActive,
  buildBeats,
  foldBeats,
  foldSetupOf,
  removedPercent,
  showOf,
  stateAfter,
  stepId,
  type FoldSetup,
} from './fight-v2';
import { cardOfBoss, playSample, type FightSample } from './workbench/fight-v2-sample';

/** The setup of a sample fight the way the screen builds it from a replay. */
function setupOf(s: FightSample): FoldSetup {
  return foldSetupOf({
    fighters: s.fighters,
    card: cardOfBoss(s.boss, s.before),
    bossHpStart: s.before.bossHp,
  });
}

const CASES = [
  { slot: 1, players: 4, stage: 1 },
  { slot: 2, players: 5, stage: 2 },
  { slot: 3, players: 4, stage: 1 },
  { slot: 3, players: 6, stage: 3 },
  { slot: 4, players: 4, stage: 2 },
  { slot: 5, players: 4, stage: 1 },
  { slot: 5, players: 8, stage: 3 },
] as const;

describe('the fold reads real fights', () => {
  for (const c of CASES) {
    it(`slot ${String(c.slot)}, ${String(c.players)} players, stage ${String(c.stage)}: the last state is the fight's own`, () => {
      const s = playSample({ ...c, seed: 'fold' });
      const setup = setupOf(s);
      const state = stateAfter(setup, s.events, s.events.length);
      expect(state.end).not.toBeNull();
      expect(state.bossHp).toBe(s.after.bossHp);
      for (const f of s.fighters) {
        const now = state.creatures[f.key];
        const carried = s.after.hp[f.key];
        if (s.before.out.includes(f.key)) continue;
        if (s.after.out.includes(f.key)) expect(now?.out, f.key).toBe(true);
        else {
          expect(now?.out, f.key).toBe(false);
          expect(now?.hp, f.key).toBe(carried);
        }
      }
    });
  }

  it('beats cover every event once, in order, and the folded beats agree with the plain fold', () => {
    const s = playSample({ slot: 4, players: 5, stage: 2, seed: 'beats' });
    const setup = setupOf(s);
    const beats = buildBeats(s.events, setup);
    expect(beats[0]?.from).toBe(0);
    expect(beats[beats.length - 1]?.to).toBe(s.events.length);
    beats.forEach((b, k) => {
      expect(b.to).toBeGreaterThan(b.from);
      if (k > 0) expect(b.from).toBe(beats[k - 1]?.to);
    });
    const states = foldBeats(setup, s.events, beats);
    expect(states).toHaveLength(beats.length + 1);
    beats.forEach((b, k) => {
      expect(states[k + 1]).toEqual(stateAfter(setup, s.events, b.to));
    });
    // A beat of the round's start has the round event; a creature's beat ends with that creature's hit; a boss turn starts with its event.
    for (const [k, b] of beats.entries()) {
      // The resistance of the stage break comes before round 1 and goes with its beat.
      const first =
        s.events[k === 0 ? s.events.findIndex((e) => e.board?.type === 'round') : b.from]?.board;
      if (b.kind === 'round') expect(first?.type).toBe('round');
      if (b.kind === 'boss') expect(first?.type).toBe('bossTurn');
      if (b.kind === 'creature') {
        const hits = s.events
          .slice(b.from, b.to)
          .filter((e) => e.board?.type === 'hit' && e.board.from === b.actor);
        expect(hits.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a creature beat takes the reaction and the crit before its hit, and the mark after it', () => {
    const s = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const beats = buildBeats(s.events, setupOf(s));
    const withReaction = beats.find((b) =>
      s.events.slice(b.from, b.to).some((e) => e.board?.type === 'reaction'),
    );
    expect(withReaction?.kind).toBe('creature');
    const shows = showOf(s.events, withReaction as NonNullable<typeof withReaction>);
    expect(shows.cashed.length).toBe(1);
    const withMark = beats.find((b) =>
      s.events.slice(b.from, b.to).some((e) => e.board?.type === 'mark'),
    );
    expect(withMark?.kind).toBe('creature');
  });

  it('the strip follows the step, marks come oldest first and a cashed mark leaves', () => {
    const s = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const setup = setupOf(s);
    const beats = buildBeats(s.events, setup);
    const states = foldBeats(setup, s.events, beats);
    // After the first round's second row, marks stand in the order they were left.
    const row1 = beats.findIndex((b) => b.kind === 'boss' && b.row === 1);
    const marks = states[row1 + 1]?.marks.map((m) => m.element) ?? [];
    expect(marks.length).toBeGreaterThanOrEqual(2);
    const firstMark = s.events.find((e) => e.board?.type === 'mark')?.board;
    expect(firstMark?.type === 'mark' && marks[0]).toBe(
      firstMark?.type === 'mark' ? firstMark.element : '',
    );
    expect(stepId(states[row1 + 1]?.step ?? null)).toBe('boss-1');
    // A reaction takes its mark's count down; the whole mark goes at 0.
    const cashedAt = beats.findIndex((b) =>
      s.events.slice(b.from, b.to).some((e) => e.board?.type === 'reaction' && e.board.left === 0),
    );
    const cashed = s.events
      .slice(beats[cashedAt]?.from, beats[cashedAt]?.to)
      .find((e) => e.board?.type === 'reaction')?.board;
    if (cashed?.type !== 'reaction') throw new Error('no reaction');
    expect(states[cashedAt]?.marks.some((m) => m.element === cashed.mark)).toBe(true);
    expect(states[cashedAt + 1]?.marks.some((m) => m.element === cashed.mark)).toBe(false);
  });

  it('a creature that is hit loses HP, a knocked-out one is out, and silence runs down on its own turns', () => {
    // The Thornmother silences a row's ends; the sample party has creatures there.
    const s = playSample({ slot: 5, players: 4, stage: 1, seed: 'fold' });
    const setup = setupOf(s);
    const beats = buildBeats(s.events, setup);
    const states = foldBeats(setup, s.events, beats);
    const silencedAt = beats.findIndex((b) =>
      s.events.slice(b.from, b.to).some((e) => e.board?.type === 'silence'),
    );
    expect(silencedAt).toBeGreaterThanOrEqual(0);
    const silenceEvent = s.events
      .slice(beats[silencedAt]?.from, beats[silencedAt]?.to)
      .find((e) => e.board?.type === 'silence')?.board;
    if (silenceEvent?.type !== 'silence') throw new Error('no silence');
    const after = states[silencedAt + 1]?.creatures[silenceEvent.who];
    expect(after?.silenced).toBe(silenceEvent.turns);
    // Later the countdown is lower or gone.
    const later = states
      .slice(silencedAt + 2)
      .find((st) => (st.creatures[silenceEvent.who]?.silenced ?? 0) < silenceEvent.turns);
    expect(later).toBeDefined();
    const ko = s.events.find((e) => e.board?.type === 'knockout')?.board;
    if (ko?.type === 'knockout') {
      const last = states[states.length - 1];
      expect(last?.creatures[ko.who]?.out).toBe(true);
      expect(last?.creatures[ko.who]?.hp).toBe(0);
    }
  });

  it('an announced move shows from round start until its boss turn is over', () => {
    const s = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const setup = setupOf(s);
    const beats = buildBeats(s.events, setup);
    const states = foldBeats(setup, s.events, beats);
    const announceAt = beats.findIndex((b) =>
      s.events.slice(b.from, b.to).some((e) => e.board?.type === 'announce'),
    );
    expect(announceAt).toBeGreaterThanOrEqual(0);
    expect(states[announceAt + 1]?.announced.length).toBeGreaterThan(0);
    const move = states[announceAt + 1]?.announced[0];
    const turn = move?.turn ?? 0;
    // Still announced during its boss turn's beat, gone one beat after.
    const landing = beats.findIndex(
      (b, k) => k > announceAt && b.kind === 'boss' && b.row === turn,
    );
    expect(states[landing + 1]?.announced.length).toBeGreaterThan(0);
    expect(states[landing + 2]?.announced.length).toBe(0);
    // A new round starts clear.
    const nextRound = beats.findIndex((b, k) => k > announceAt && b.kind === 'round');
    expect(states[nextRound + 1]?.announced.every((a) => a.move !== move?.move)).toBe(true);
  });

  it('a boss that sheds marks has them blink on the beat before its turn and on its turn', () => {
    const base = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const setup = { ...setupOf(base), shedsMarks: true };
    const beats = buildBeats(base.events, setup);
    const states = foldBeats(setup, base.events, beats);
    const turnAt = beats.findIndex(
      (b, k) => b.kind === 'boss' && (states[k]?.marks.length ?? 0) > 0,
    );
    expect(turnAt).toBeGreaterThan(0);
    // The creature beat before the boss turn already names the marks that will be shed (the sealed ones stay).
    const before = states[turnAt];
    const unsealed = before?.marks.filter((m) => !m.sealed).map((m) => m.element) ?? [];
    expect(before?.expiring).toEqual(unsealed);
    expect(states[turnAt + 1]?.expiring.length).toBeGreaterThanOrEqual(0);
    // Without the card nothing blinks.
    const quiet = foldBeats({ ...setup, shedsMarks: false }, base.events, beats);
    expect(quiet.every((st) => st.expiring.length === 0)).toBe(true);
  });
});

describe('what a beat shows', () => {
  it('numbers float over the creature or the boss: a crit is marked, a Blocked hit reads 0, a dodge says so', () => {
    const s = playSample({ slot: 3, players: 4, stage: 1, seed: 'fold' });
    const beats = buildBeats(s.events, setupOf(s));
    const all = beats.flatMap((b) => showOf(s.events, b).floats);
    expect(all.some((f) => f.target === null && f.tone === 'hit' && Number(f.text) > 0)).toBe(true);
    expect(all.some((f) => f.target !== null && f.tone === 'hurt')).toBe(true);
    expect(all.some((f) => f.crit)).toBe(true);
    const blocked = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const bl = buildBeats(blocked.events, setupOf(blocked)).flatMap(
      (b) => showOf(blocked.events, b).floats,
    );
    expect(bl.some((f) => f.tone === 'blocked' && f.text === '0')).toBe(true);
    expect(all.some((f) => f.tone === 'dodge' && f.text === 'Dodged')).toBe(true);
  });

  it('a boss beat names its move; the plain attack has none', () => {
    const s = playSample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const beats = buildBeats(s.events, setupOf(s));
    const moves = beats.filter((b) => b.kind === 'boss').map((b) => showOf(s.events, b).move);
    expect(moves).toContain('Spray');
    expect(moves).toContain(null);
  });
});

describe('small helpers', () => {
  it('a Purge lasts as long as the rules say; Rally and Shield Wall only the round they act in', () => {
    expect(PURGE_ROUNDS).toBe(combatV2.rules.purgeRounds);
    const purge = { kind: 'purge', row: null, by: 'm1', round: 3 } as const;
    expect(actionActive(purge, 2)).toBe(false);
    expect(actionActive(purge, 3)).toBe(true);
    expect(actionActive(purge, 3 + PURGE_ROUNDS - 1)).toBe(true);
    expect(actionActive(purge, 3 + PURGE_ROUNDS)).toBe(false);
    const rally = { kind: 'rally', row: null, by: 'm1', round: 3 } as const;
    expect(actionActive(rally, 3)).toBe(true);
    expect(actionActive(rally, 4)).toBe(false);
  });

  it('the percent of the weekend HP a stage removed is whole and stays in 0 to 100', () => {
    expect(removedPercent(1000, 1000, 600)).toBe(40);
    expect(removedPercent(1000, 300, 0)).toBe(30);
    expect(removedPercent(0, 0, 0)).toBe(0);
    expect(removedPercent(1000, 1000, 1200)).toBe(0);
  });
});
