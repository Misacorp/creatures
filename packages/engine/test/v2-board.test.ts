/**
 * Combat v2: the board's typed events (`FightEvent.board`, docs/design/combat/integration.md section 3). Each kind appears where the rules
 * make it happen, its numbers are the log's own, a creature is named by its key (else its uid), and nothing is built when the fight does not
 * log. Creatures and boss are built by hand; the dice are scripted (`YES` passes any chance above 0, `NO` fails any below 100%).
 */
import type { BoardEvent, FightEvent } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  NO,
  YES,
  boardEvents,
  boss,
  hush,
  move,
  play,
  playScripted,
  spec,
  striker,
  textEvents,
} from './v2-helpers';

type Of<T extends BoardEvent['type']> = Extract<BoardEvent, { type: T }>;
/** The board events of one type, in order. */
const of = <T extends BoardEvent['type']>(r: { events: readonly FightEvent[] }, type: T): Of<T>[] =>
  r.events.flatMap((e) => (e.board?.type === type ? [e.board as Of<T>] : []));
const types = (r: { events: readonly FightEvent[] }) =>
  r.events.flatMap((e) => (e.board ? [e.board.type] : []));

describe('the flow of a round', () => {
  it('a round is round start, the creatures, then the boss turn after the row, then the end of the fight', () => {
    const r = play(striker({ cols: 2, rounds: 2, atk: 60, hp: 10_000 }), [
      spec({ name: 'S' }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 1 }),
    ]);
    expect(boardEvents(r).map((b) => b.type)).toEqual([
      ...['round', 'hit', 'mark', 'reaction', 'hit', 'bossTurn', 'hit'],
      ...['round', 'hit', 'mark', 'reaction', 'hit', 'bossTurn', 'hit'],
      'end',
    ]);
    expect(of(r, 'round').map((b) => b.round)).toEqual([1, 2]);
    expect(of(r, 'bossTurn')).toEqual([
      { type: 'bossTurn', row: 0 },
      { type: 'bossTurn', row: 0 },
    ]);
    expect(of(r, 'end')).toEqual([
      { type: 'end', round: 2, won: false, wiped: false, bossHp: 9_400 },
    ]);
    // The events of a round carry its number.
    expect(r.events.filter((e) => e.board?.type === 'round').map((e) => e.round)).toEqual([1, 2]);
  });

  it('a boss turn follows each row, and the fight ends in the round the boss falls', () => {
    const r = play(boss({ rows: 2, cols: 1, rounds: 5, hp: 150 }), [
      spec({ name: 'F' }),
      spec({ name: 'B', row: 1 }),
    ]);
    // Row 0 hits for 100, the boss turn, row 1 hits for the last 50 and the boss is down before its second turn.
    expect(of(r, 'bossTurn').map((b) => b.row)).toEqual([0]);
    expect(of(r, 'end')).toEqual([{ type: 'end', round: 1, won: true, wiped: false, bossHp: 0 }]);
  });

  it('a wiped team ends the fight', () => {
    const r = play(striker({ atk: 1_000, rounds: 3, hp: 1_000_000 }), [spec({ name: 'A' })]);
    expect(of(r, 'knockout')).toEqual([{ type: 'knockout', who: 'A' }]);
    expect(of(r, 'end')).toEqual([
      { type: 'end', round: 1, won: false, wiped: true, bossHp: 999_900 },
    ]);
  });
});

describe('the numbers are the log’s', () => {
  const r = play(striker({ cols: 3, rounds: 4, atk: 80, hp: 50_000 }), [
    spec({ name: 'S', maxHp: 1_000 }),
    spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000, fx: { interceptHitBackBp: 5_000 } }),
    spec({ name: 'P', role: 'payoff', element: 'spark', col: 2, maxHp: 1_000 }),
  ]);

  it('a hit on a creature has the damage of its text line', () => {
    const lines = r.events.filter((e) => e.kind === 'hit');
    expect(lines.length).toBeGreaterThan(0);
    for (const e of lines) {
      const n = Number(/takes (\d+)/.exec(e.text)?.[1]);
      expect(e.board).toMatchObject({ type: 'hit', from: null, damage: n, blocked: false });
    }
  });

  it('a reaction has the bonus of its text, a mark the counts of its text and a counter its damage', () => {
    for (const e of r.events.filter((x) => x.kind === 'reaction')) {
      const [, el, spent, bonus] = /cashes (\w+) x(\d+) for \+(\d+)/.exec(e.text) ?? [];
      expect(e.board).toMatchObject({
        type: 'reaction',
        mark: el,
        spent: Number(spent),
        bonus: Number(bonus),
      });
    }
    for (const e of r.events.filter((x) => x.kind === 'mark')) {
      const [, el, stacks] = /(\w+) x(\d+)/.exec(e.text) ?? [];
      expect(e.board).toMatchObject({ type: 'mark', element: el, stacks: Number(stacks) });
    }
    expect(of(r, 'reaction').length).toBeGreaterThan(0);
    expect(of(r, 'mark').length).toBeGreaterThan(0);
    for (const e of r.events.filter((x) => x.kind === 'counter'))
      expect(e.board).toEqual({
        type: 'counter',
        from: 'G',
        damage: Number(/for (\d+)/.exec(e.text)?.[1]),
      });
    expect(of(r, 'counter').length).toBeGreaterThan(0);
  });

  it('what the creatures dealt to the boss adds up to the board’s hits, counters and all', () => {
    const hits = of(r, 'hit').filter((h) => h.to === null);
    const counters = of(r, 'counter');
    const total =
      hits.reduce((n, h) => n + h.damage, 0) + counters.reduce((n, c) => n + c.damage, 0);
    expect(total).toBe(r.damage);
  });
});

describe('hits', () => {
  it('a creature’s crit is on its hit: doubled damage, crit true; a dodged hit has dodged true and no damage', () => {
    const golem = boss({ spd: 10, hp: 10_000 });
    // Draws: the boss's dodge roll (1%), then the creature's crit roll.
    const crit = playScripted(golem, [spec()], [NO, YES]).res;
    expect(of(crit, 'hit')).toEqual([
      {
        type: 'hit',
        from: 'A',
        to: null,
        damage: 200,
        crit: true,
        critBp: 20_000,
        blocked: false,
        dodged: false,
      },
    ]);
    const dodged = playScripted(golem, [spec()], [YES]).res;
    expect(of(dodged, 'hit')).toEqual([
      { type: 'hit', from: 'A', to: null, damage: 0, crit: false, blocked: false, dodged: true },
    ]);
  });

  it('a hit under the boss’s armour is Blocked: no damage, blocked true', () => {
    const r = play(boss({ armour: 10_000 }), [spec()]);
    expect(of(r, 'hit')).toEqual([
      { type: 'hit', from: 'A', to: null, damage: 0, crit: false, blocked: true, dodged: false },
    ]);
  });

  it('a boss hit that a creature dodges has dodged true; a boss crit is on the hit', () => {
    const fighter = spec({ spd: 10, maxHp: 1_000 });
    // Draws: the creature's crit roll, then the creature's dodge roll.
    const dodged = playScripted(striker({ atk: 100 }), [fighter], [NO, YES]).res;
    expect(of(dodged, 'hit').filter((h) => h.from === null)).toEqual([
      { type: 'hit', from: null, to: 'A', damage: 0, crit: false, blocked: false, dodged: true },
    ]);
    // Draws: the creature's crit roll, its dodge roll (fails), the boss's crit roll (succeeds).
    const crit = playScripted(
      striker({ atk: 100, critChanceBp: 5_000 }),
      [fighter],
      [NO, NO, YES],
    ).res;
    expect(of(crit, 'hit').filter((h) => h.from === null)).toEqual([
      { type: 'hit', from: null, to: 'A', damage: 200, crit: true, blocked: false, dodged: false },
    ]);
  });

  it('a hit under the creature’s armour is Blocked', () => {
    const r = play(striker({ atk: 10 }), [spec({ baseArmour: 50 })]);
    expect(of(r, 'hit').filter((h) => h.from === null)).toEqual([
      { type: 'hit', from: null, to: 'A', damage: 0, crit: false, blocked: true, dodged: false },
    ]);
  });

  it('a Guard that intercepts is named: the hit is on the creature aimed at, by the Guard, and the Guard takes the damage', () => {
    const r = play(striker({ cols: 2, rounds: 1, atk: 80 }), [
      spec({ name: 'A', maxHp: 1_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000 }),
    ]);
    expect(of(r, 'hit').filter((h) => h.from === null)).toEqual([
      {
        type: 'hit',
        from: null,
        to: 'A',
        by: 'G',
        damage: 80,
        crit: false,
        blocked: false,
        dodged: false,
      },
    ]);
    expect(r.fighters.find((f) => f.name === 'G')?.hp).toBe(920);
  });

  it('a Guard that intercepts has an intercept event naming the Guard and the creature saved, before the hit', () => {
    const r = play(striker({ cols: 2, rounds: 1, atk: 80 }), [
      spec({ name: 'A', maxHp: 1_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000 }),
    ]);
    expect(of(r, 'intercept')).toEqual([{ type: 'intercept', guard: 'G', who: 'A' }]);
    const at = r.events.findIndex((e) => e.board?.type === 'intercept');
    expect(r.events.some((e, k) => k > at && e.board?.type === 'hit' && e.board.by === 'G')).toBe(
      true,
    );
  });

  it('a Guard’s cover on an area hit says what it saved: the hit as it landed plus the cover’s share is the hit without it', () => {
    const open = play(
      striker({ cols: 2, rounds: 1, atk: 100 }, { anchor: 'front', shape: 'all' }),
      [spec({ name: 'A', maxHp: 1_000 }), spec({ name: 'B', col: 1, maxHp: 1_000 })],
    );
    expect(of(open, 'cover')).toEqual([]);
    const r = play(striker({ cols: 3, rounds: 1, atk: 100 }, { anchor: 'front', shape: 'all' }), [
      spec({ name: 'A', maxHp: 1_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 1_000 }),
    ]);
    const covers = of(r, 'cover');
    expect(covers).toHaveLength(1);
    const cover = covers[0];
    const landed = of(r, 'hit').find((h) => h.to === 'A');
    expect(cover).toMatchObject({ guard: 'G', who: 'A' });
    expect((landed?.damage ?? 0) + (cover?.prevented ?? 0)).toBe(100);
    expect(cover?.prevented).toBeGreaterThan(0);
  });

  it('a Support’s boost is on the board for each creature it boosts', () => {
    const r = play(boss({ cols: 3, rounds: 1 }), [
      spec({ name: 'A' }),
      spec({ name: 'S', role: 'support', col: 1 }),
      spec({ name: 'C', col: 2 }),
    ]);
    const boosts = of(r, 'boost');
    expect(boosts.map((b) => `${b.by}>${b.who}`).sort()).toEqual(['S>A', 'S>C']);
    for (const b of boosts) expect(b.bp).toBeGreaterThan(0);
  });

  it('a knocked-out creature has a knockout event right after its hit', () => {
    const r = play(striker({ cols: 2, atk: 500, rounds: 1 }), [
      spec({ name: 'A' }),
      spec({ name: 'B', col: 1 }),
    ]);
    const at = r.events.findIndex((e) => e.board?.type === 'knockout');
    expect(r.events[at - 1]?.text).toBe('A takes 500 and is knocked out');
    expect(of(r, 'knockout')).toEqual([{ type: 'knockout', who: 'A' }]);
  });

  it('the key names a creature when it has one, the uid when it has not', () => {
    const r = play(striker({ cols: 2, rounds: 1 }), [
      spec({ name: 'A', uid: 'u1', key: 'creature-7' }),
      spec({ name: 'B', uid: 'u2', col: 1 }),
    ]);
    expect(of(r, 'hit').map((h) => h.from)).toEqual(['creature-7', 'u2', null]);
    expect(of(r, 'hit').find((h) => h.from === null)?.to).toBe('creature-7');
  });
});

describe('marks, reactions and what the boss sheds', () => {
  it('a Setter’s mark is on the board with its counts, and a sealed one says so', () => {
    const r = play(boss({ rounds: 2, hp: 100_000 }), [spec({ name: 'S', fx: { seal: true } })]);
    expect(of(r, 'mark')).toEqual([
      { type: 'mark', element: 'tide', stacks: 1, sealed: true },
      { type: 'mark', element: 'tide', stacks: 2, sealed: true },
    ]);
  });

  it('a reaction names the Payoff, the mark, the counts spent and the counts left', () => {
    const r = play(boss({ cols: 2, rounds: 1, hp: 100_000 }), [
      spec({ name: 'S', fx: { markStacks: 2 } }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 1 }),
    ]);
    expect(of(r, 'reaction')).toEqual([
      { type: 'reaction', by: 'P', mark: 'tide', spent: 1, bonus: 100, left: 1 },
    ]);
  });

  it('Clean Scales sheds the marks it had when its turn began', () => {
    const r = play(boss({ rounds: 1, hp: 100_000, mods: { shedMarks: true } }), [
      spec({ name: 'S' }),
    ]);
    expect(of(r, 'shed')).toEqual([{ type: 'shed', marks: ['tide'] }]);
    const at = types(r);
    expect(at.indexOf('shed')).toBeGreaterThan(at.indexOf('bossTurn'));
  });
});

describe('moves, silence, heals, Stores and the rest of the board', () => {
  it('an announced move has its slots on the board, the same as the log’s', () => {
    const r = play(
      boss({
        cols: 2,
        rounds: 1,
        moves: [move({ anchor: 'front', shape: 'single' }, { id: 'lance', charged: true })],
      }),
      [spec({ name: 'A' }), spec({ name: 'B', col: 1 })],
    );
    const e = r.events.find((x) => x.kind === 'announce');
    expect(e?.board).toEqual({ type: 'announce', move: 'lance', slots: [[0, 0]] });
    expect(e?.move).toBe('lance');
    expect(e?.slots).toEqual([[0, 0]]);
  });

  it('a silence says who and for how many turns', () => {
    const r = play(boss({ cols: 2, rounds: 1, moves: [hush('row', 3)] }), [
      spec({ name: 'A' }),
      spec({ name: 'B', col: 1 }),
    ]);
    expect(of(r, 'silence')).toEqual([
      { type: 'silence', who: 'A', turns: 3 },
      { type: 'silence', who: 'B', turns: 3 },
    ]);
  });

  it('a heal says who was healed, by how much (what was restored) and by whom', () => {
    const r = play(
      boss({ cols: 2, rounds: 1 }),
      [spec({ name: 'Healer', role: 'support' }), spec({ name: 'Hurt', col: 1 })],
      { carryHp: new Map([['Hurt', 390]]) },
    );
    // A tide Support heals 4% of Max HP (16 of 400), but only 10 are missing.
    expect(of(r, 'heal')).toEqual([{ type: 'heal', who: 'Hurt', amount: 10, by: 'Healer' }]);
  });

  it('a Store change is on the board with its value', () => {
    const fighter = spec({ spd: 10, maxHp: 1_000, fx: { storeDodgeStacks: 1 } });
    // Draws: the creature's crit roll, its dodge roll (it dodges).
    const r = playScripted(striker({ atk: 100, rounds: 2 }), [fighter], [NO, YES, NO, YES]).res;
    expect(of(r, 'store')).toEqual([
      { type: 'store', who: 'A', value: 1 },
      { type: 'store', who: 'A', value: 2 },
    ]);
  });

  it('Bogged Down is on the board with its stacks, and the escalation with its steps and counts', () => {
    const heat = { name: 'Heat', feed: 'rounds', per: 1, cap: 2, grow: { atkBp: 1_000 } } as const;
    const boggedDown = play(boss({ cols: 1, rounds: 3, atk: 1 }), [
      spec({ name: 'Song', fx: { miresAtStart: true } }),
    ]);
    expect(of(boggedDown, 'boggedDown').map((m) => m.stacks)).toEqual([1, 0, 1, 0, 1, 0]);
    const r = play(boss({ cols: 1, rounds: 3, atk: 1, escalation: heat }), [spec({ name: 'A' })]);
    const steps = of(r, 'escalation');
    expect(steps.map((s) => [s.step, s.fall, s.phase])).toEqual([
      [1, 1, false],
      [2, 2, false],
    ]);
    expect(steps.map((s) => s.count)).toEqual([1, 2]);
  });

  it('what the boss resists is on the board when the fight starts', () => {
    const r = play(boss(), [spec()], { resistReaction: 'tide', resistElement: 'ember' });
    expect(boardEvents(r)[0]).toEqual({ type: 'resistance', reaction: 'tide', element: 'ember' });
    expect(of(play(boss(), [spec()]), 'resistance')).toEqual([]);
  });
});

describe('only a fight that logs has them', () => {
  const cast = [spec({ name: 'S' }), spec({ name: 'P', role: 'payoff', element: 'spark', col: 1 })];
  const arena = striker({ cols: 2, rounds: 3, atk: 60 });

  it('without the log option there are no events at all', () => {
    expect(play(arena, cast, { log: false }).events).toEqual([]);
  });

  it('the log’s text is the same with or without the board’s events beside it, and so are the numbers', () => {
    const seeded = (log: boolean) => play(arena, cast, { log });
    const on = seeded(true);
    const off = seeded(false);
    expect(on.damage).toBe(off.damage);
    expect(on.bossHpLeft).toBe(off.bossHpLeft);
    expect(textEvents(on).every((e) => e.text !== '')).toBe(true);
    expect(on.events.filter((e) => e.kind === 'board').every((e) => e.text === '' && e.board)).toBe(
      true,
    );
  });
});
