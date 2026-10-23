import type { GamesBeat, GamesEventResult } from '@creatures/engine';
import { gamesContent, showLengthMs, showTimeline } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { SAMPLE_DAY, sampleEvent, samplePlayers, sampleShow } from '../workbench/games-show-sample';
import {
  DROP,
  FX_MS,
  MOVE_TICKS,
  SAY_MS,
  SHOW_INTRO_MS,
  SHOW_PODIUM_MS,
  announcementAt,
  announcements,
  buildShowTimeline,
  cursorAt,
  dropAt,
  eventMs,
  finalBoard,
  frameAt,
  hashString,
  liveBoard,
  nextSpanStart,
  podiumOf,
  prepareEvent,
  sayParts,
  sayText,
  scoreText,
  shortOwner,
  stillIn,
} from './show-timeline';

/**
 * The show's timeline (docs/design/valley-games.md): intro, event and podium of each event; what is on
 * screen at a moment, derived from the engine's beats. Synthetic results pin the rules exactly; sample
 * shows from the real engine (seeded) check the invariants on realistic data.
 */

/** A small hand-written result: two actors in the sauna (an endure event, 400 ms ticks). */
function tiny(beats: GamesBeat[], over: Partial<GamesEventResult> = {}): GamesEventResult {
  return {
    eventId: 'sauna-showdown',
    kind: 'endure',
    scene: 'sauna',
    team: 1,
    tickMs: 400,
    ticks: 20,
    actors: [
      {
        a: 0,
        entrantId: 'c0',
        playerId: 'p0',
        teamId: 'p0',
        name: 'Pip',
        speciesId: 'emberkit',
        element: 'ember',
        x: 40,
        y: 60,
      },
      {
        a: 1,
        entrantId: 'c1',
        playerId: 'p1',
        teamId: 'p1',
        name: 'Toasty',
        speciesId: 'emberkit',
        element: 'ember',
        x: 57,
        y: 60,
      },
    ],
    beats,
    standings: [
      { teamId: 'p1', place: 1, score: 19, actors: [1] },
      { teamId: 'p0', place: 2, score: 4, actors: [0] },
    ],
    moments: 1,
    momentTicks: [5],
    scores: [4, 19],
    outAt: [5, null],
    ...over,
  };
}

describe('the show timeline', () => {
  const events = [
    { eventId: 'a', ticks: 10, tickMs: 400 },
    { eventId: 'b', ticks: 25, tickMs: 400 },
  ];
  const tl = buildShowTimeline(events);

  it('puts an intro, the event and a podium after each other for every event', () => {
    expect(tl.spans).toHaveLength(2);
    const [a, b] = tl.spans;
    expect(a).toEqual({
      index: 0,
      eventId: 'a',
      event: 0,
      start: 0,
      eventStart: SHOW_INTRO_MS,
      podiumStart: SHOW_INTRO_MS + 4_000,
      end: SHOW_INTRO_MS + 4_000 + SHOW_PODIUM_MS,
    });
    expect(b?.start).toBe(a?.end);
    expect(b?.podiumStart).toBe((b?.eventStart ?? 0) + 10_000);
    expect(tl.total).toBe(2 * (SHOW_INTRO_MS + SHOW_PODIUM_MS) + 14_000);
  });

  it('is the game package’s timeline, which the server ends the show by', () => {
    const shared = showTimeline(events);
    expect(tl.spans.map((s) => [s.start, s.eventStart, s.podiumStart, s.end])).toEqual(
      shared.map((s) => [s.introMs, s.startMs, s.endMs, s.podiumEndMs]),
    );
    expect(tl.total).toBe(showLengthMs(events));
  });

  it('plays an event nobody entered as its intro card only, in the lineup’s place', () => {
    const withSkip = buildShowTimeline(events, ['a', 'floe-sumo', 'b']);
    expect(withSkip.spans.map((s) => [s.eventId, s.event])).toEqual([
      ['a', 0],
      ['floe-sumo', null],
      ['b', 1],
    ]);
    const skipped = withSkip.spans[1];
    expect(skipped?.end).toBe((skipped?.start ?? 0) + SHOW_INTRO_MS);
    expect(skipped?.eventStart).toBe(skipped?.end);
    expect(cursorAt(withSkip, (skipped?.start ?? 0) + 10)).toMatchObject({
      index: 1,
      phase: 'intro',
    });
    expect(withSkip.total).toBe(tl.total + SHOW_INTRO_MS);
  });

  it('finds the phase at every boundary', () => {
    const [a, b] = tl.spans;
    if (a === undefined || b === undefined) throw new Error('no spans');
    expect(cursorAt(tl, -5)).toMatchObject({ index: 0, phase: 'intro', ms: 0, before: true });
    expect(cursorAt(tl, 0)).toMatchObject({ index: 0, phase: 'intro', ms: 0, before: false });
    expect(cursorAt(tl, a.eventStart - 1)).toMatchObject({ phase: 'intro', ms: SHOW_INTRO_MS - 1 });
    expect(cursorAt(tl, a.eventStart)).toMatchObject({ index: 0, phase: 'event', ms: 0 });
    expect(cursorAt(tl, a.podiumStart - 1)).toMatchObject({ phase: 'event', ms: 3_999 });
    expect(cursorAt(tl, a.podiumStart)).toMatchObject({ phase: 'podium', ms: 0 });
    expect(cursorAt(tl, a.end)).toMatchObject({ index: 1, phase: 'intro', ms: 0 });
    expect(cursorAt(tl, tl.total - 1)).toMatchObject({ index: 1, phase: 'podium', done: false });
    expect(cursorAt(tl, tl.total)).toMatchObject({ index: 1, phase: 'podium', done: true });
    expect(cursorAt(tl, tl.total + 60_000)).toMatchObject({ ms: SHOW_PODIUM_MS, at: tl.total });
    expect(cursorAt(buildShowTimeline([]), 0)).toBeNull();
  });

  it('skips to the next event, and not past the last', () => {
    expect(nextSpanStart(tl, 100)).toBe(tl.spans[1]?.start);
    expect(nextSpanStart(tl, tl.spans[1]?.start ?? 0)).toBeNull();
  });

  it('drops the entrants in one after another and lands them by the end of the drop', () => {
    expect(dropAt(0, 8, 0)).toEqual({ lift: DROP.height, landedMs: null });
    const mid = dropAt(0, 8, DROP.from - DROP.fallMs / 2);
    expect(mid.lift).toBeGreaterThan(0);
    expect(mid.lift).toBeLessThan(DROP.height);
    expect(dropAt(0, 8, DROP.from)).toEqual({ lift: 0, landedMs: 0 });
    // The last one lands at `to`, after the first.
    expect(dropAt(7, 8, DROP.from).lift).toBe(DROP.height);
    expect(dropAt(7, 8, DROP.to).lift).toBe(0);
    expect(dropAt(0, 1, DROP.from).lift).toBe(0);
  });
});

describe('a frame of an event', () => {
  it('moves an actor linearly to a position beat, starting at most MOVE_TICKS before it', () => {
    const p = prepareEvent(
      tiny([{ t: 10, k: 'pos', a: 1, x: 87, y: 60 }], { outAt: [null, null] }),
    );
    const start = 10 - MOVE_TICKS;
    expect(frameAt(p, (start - 1) * 400).actors[1]?.x).toBe(57);
    expect(frameAt(p, start * 400).actors[1]?.x).toBe(57);
    expect(frameAt(p, (start + MOVE_TICKS / 2) * 400).actors[1]?.x).toBeCloseTo(72);
    expect(frameAt(p, 10 * 400).actors[1]?.x).toBe(87);
    expect(frameAt(p, 15 * 400).actors[1]?.x).toBe(87);
  });

  it('walks a creature that went out only after it went out', () => {
    const p = prepareEvent(
      tiny([
        { t: 5, k: 'out', a: 0, cause: 'heat' },
        { t: 5, k: 'state', a: 0, s: 'sweat' },
        { t: 7, k: 'pos', a: 0, x: 40, y: 100 },
        { t: 10, k: 'pos', a: 0, x: 186, y: 100 },
        { t: 10, k: 'state', a: 0, s: 'out' },
      ]),
    );
    const at = (tick: number) => frameAt(p, tick * 400).actors[0];
    expect(at(4.9)).toMatchObject({ x: 40, y: 60, out: false, outMs: null });
    expect(at(5)).toMatchObject({
      x: 40,
      y: 60,
      out: true,
      outMs: 0,
      cause: 'heat',
      state: 'sweat',
    });
    expect(at(6)?.y).toBeCloseTo(80);
    expect(at(7)).toMatchObject({ x: 40, y: 100 });
    expect(at(8.5)?.x).toBeCloseTo(113);
    expect(at(10)).toMatchObject({ x: 186, state: 'out' });
  });

  it('shows an effect for FX_MS after its tick and a line for SAY_MS', () => {
    const p = prepareEvent(
      tiny([
        { t: 2, k: 'say', line: 'endure.steam', a: 1 },
        { t: 3, k: 'fx', fx: 'steam', a: 1 },
      ]),
    );
    expect(frameAt(p, 799).say).toBeNull();
    expect(frameAt(p, 800).say).toMatchObject({ line: 'endure.steam', a: 1, age: 0 });
    expect(frameAt(p, 800 + SAY_MS - 1).say).not.toBeNull();
    expect(frameAt(p, 800 + SAY_MS).say).toBeNull();
    expect(frameAt(p, 1_199).fx).toEqual([]);
    expect(frameAt(p, 1_200).fx).toMatchObject([{ fx: 'steam', a: 1, x: 57, y: 60, age: 0 }]);
    expect(frameAt(p, 1_200 + FX_MS - 1).fx).toHaveLength(1);
    expect(frameAt(p, 1_200 + FX_MS).fx).toEqual([]);
  });

  it('interpolates the heat and keeps states, meters and scores until the next beat', () => {
    const p = prepareEvent(
      tiny([
        { t: 0, k: 'prop', p: 'heat', x: 12, y: 24, f: 20 },
        { t: 4, k: 'prop', p: 'heat', x: 12, y: 24, f: 40 },
        { t: 2, k: 'meter', a: 1, v: 30 },
        { t: 3, k: 'state', a: 1, s: 'sweat' },
        { t: 19, k: 'score', a: 1, v: 19 },
      ]),
    );
    const f = frameAt(p, 2 * 400);
    expect(f.props.heat).toBeCloseTo(30);
    expect(f.actors[1]).toMatchObject({ meter: 30, state: 'idle', score: 0 });
    expect(frameAt(p, 3.5 * 400).actors[1]).toMatchObject({ meter: 30, state: 'sweat' });
    expect(frameAt(p, 0).actors[1]?.meter).toBeUndefined();
    expect(frameAt(p, 8_000).actors[1]?.score).toBe(19);
    // Past the end the frame holds the end.
    expect(frameAt(p, 1e9).ms).toBe(eventMs(p.result));
  });

  it('puts the next pepper on the plate a moment after the last one was eaten', () => {
    const p = prepareEvent(
      tiny(
        [
          { t: 4, k: 'prop', p: 'pepper:0', x: 40, y: 44, f: 0 },
          { t: 8, k: 'prop', p: 'pepper:0', x: 40, y: 44, f: 2 },
        ],
        { eventId: 'pepper-panic', kind: 'feast', scene: 'pepper-table', outAt: [null, null] },
      ),
    );
    const pepper = (tick: number) => frameAt(p, tick * 400).props.peppers.find((x) => x.a === 0);
    expect(pepper(1)?.tier).toBe(0);
    expect(pepper(4.2)?.tier).toBe(0);
    expect(pepper(4.5)).toBeUndefined();
    expect(pepper(5)?.tier).toBe(2);
    expect(pepper(10)).toBeUndefined();
  });

  it('follows the Melon Run pack with the camera, inside the world', () => {
    const p = prepareEvent(sampleEvent('melon-run', samplePlayers(15, 0), 'camera'));
    expect(p.worldWidth).toBeGreaterThan(192);
    let moved = false;
    for (let ms = 0; ms <= eventMs(p.result); ms += 200) {
      const f = frameAt(p, ms);
      expect(f.cameraX).toBeGreaterThanOrEqual(0);
      expect(f.cameraX).toBeLessThanOrEqual(p.worldWidth - 192);
      if (f.cameraX > 0) moved = true;
      const alive = f.actors.filter((a) => !a.out);
      if (alive.length > 0) {
        const lead = Math.max(...alive.map((a) => a.x));
        // The leader is on screen (with a little slack for the camera's easing).
        expect(lead - f.cameraX).toBeGreaterThan(-8);
        expect(lead - f.cameraX).toBeLessThan(192 + 24);
      }
      expect(f.props.melon).not.toBeNull();
    }
    expect(moved).toBe(true);
    // Other kinds never scroll.
    const sauna = prepareEvent(sampleEvent('sauna-showdown', samplePlayers(8, 0), 'camera'));
    expect(frameAt(sauna, 10_000).cameraX).toBe(0);
    expect(sauna.worldWidth).toBe(192);
  });

  it('agrees with the engine on who is out when, for every event in the pool', () => {
    const show = sampleShow(
      gamesContent.events.map((e) => e.id),
      8,
      0,
      'outs',
    );
    for (const r of show.events) {
      const p = prepareEvent(r);
      const end = frameAt(p, eventMs(r));
      r.outAt.forEach((t, a) => {
        expect(end.actors[a]?.out, `${r.eventId} #${String(a)}`).toBe(t !== null);
        if (t !== null) expect(frameAt(p, t * r.tickMs - 1).actors[a]?.out).toBe(false);
      });
    }
  });
});

describe('the boards', () => {
  it('ranks the live board by the kind and the final board by the standings', () => {
    const p = prepareEvent(
      tiny(
        [
          { t: 4, k: 'score', a: 0, v: 3 },
          { t: 4, k: 'score', a: 1, v: 1 },
          { t: 8, k: 'score', a: 1, v: 5 },
        ],
        { eventId: 'pepper-panic', kind: 'feast', scene: 'pepper-table', outAt: [null, null] },
      ),
    );
    expect(liveBoard(p, frameAt(p, 5 * 400)).map((r) => [r.playerId, r.text])).toEqual([
      ['p0', '3'],
      ['p1', '1'],
    ]);
    expect(liveBoard(p, frameAt(p, 9 * 400)).map((r) => r.playerId)).toEqual(['p1', 'p0']);
    expect(finalBoard(p).map((r) => [r.playerId, r.place, r.text])).toEqual([
      ['p1', 1, '19'],
      ['p0', 2, '4'],
    ]);
  });

  it('shows a sitter’s heat on the board while it is in, and its time once out', () => {
    const p = prepareEvent(
      tiny([
        { t: 2, k: 'meter', a: 0, v: 70 },
        { t: 2, k: 'meter', a: 1, v: 20 },
        { t: 5, k: 'out', a: 0, cause: 'heat' },
      ]),
    );
    const early = liveBoard(p, frameAt(p, 3 * 400));
    expect(early.map((r) => [r.playerId, r.text, r.bar])).toEqual([
      ['p1', '', 20],
      ['p0', '', 70],
    ]);
    const late = liveBoard(p, frameAt(p, 6 * 400));
    expect(late[1]).toMatchObject({ playerId: 'p0', out: true, text: '2s' });
    expect(stillIn(p, frameAt(p, 6 * 400))).toEqual({ in: 1, of: 2 });
  });

  it('puts at most three on the podium, ties included, and counts the rest', () => {
    const p = prepareEvent(
      tiny([], {
        standings: [
          { teamId: 'p0', place: 1, score: 9, actors: [0] },
          { teamId: 'p1', place: 1, score: 9, actors: [1] },
        ],
        outAt: [null, null],
      }),
    );
    expect(podiumOf(p)).toMatchObject({ rows: [{ place: 1 }, { place: 1 }], more: 0 });
    const real = prepareEvent(sampleEvent('sauna-showdown', samplePlayers(15, 0), 'podium'));
    const podium = podiumOf(real);
    expect(podium.rows.length).toBeLessThanOrEqual(3);
    expect(podium.rows.every((r) => r.place <= 3)).toBe(true);
  });

  it('writes each kind’s score its own way', () => {
    expect(scoreText('endure', 25, 400)).toBe('10s');
    expect(scoreText('chase', 18, 400)).toBe('18m');
    expect(scoreText('feast', 7, 400)).toBe('7');
    expect(scoreText('swim', 140, 400)).toBe('1.4');
  });
});

describe('the words', () => {
  it('fills a commentary line with names and the number, from the event’s own template', () => {
    const p = prepareEvent(tiny([], { eventId: 'frost-bath', scene: 'frost-bath' }));
    expect(sayParts(p, { line: 'endure.fan', a: 0, b: 1 })).toEqual([
      { k: 'name', a: 0, text: 'Pip' },
      { k: 'text', text: ' rubs ' },
      { k: 'name', a: 1, text: 'Toasty' },
      { k: 'text', text: "'s paws warm." },
    ]);
    expect(sayParts(p, { line: 'endure.half', n: 4 })).toContainEqual({ k: 'num', text: '4' });
    expect(sayParts(p, { line: 'no.such.key' })).toEqual([]);
  });

  it('follows every name with its owner, "(you)" for yours, after a possessive', () => {
    const p = prepareEvent(tiny([], { eventId: 'frost-bath', scene: 'frost-bath' }));
    const owners = { youId: 'p0', names: { p0: 'Misa', p1: 'Aino' } };
    expect(sayParts(p, { line: 'endure.fan', a: 0, b: 1 }, owners)).toEqual([
      { k: 'name', a: 0, text: 'Pip' },
      { k: 'owner', a: 0, text: ' (you)' },
      { k: 'text', text: ' rubs ' },
      { k: 'name', a: 1, text: 'Toasty' },
      { k: 'text', text: "'s" },
      { k: 'owner', a: 1, text: ' (Aino)' },
      { k: 'text', text: ' paws warm.' },
    ]);
    const sauna = prepareEvent(tiny([]));
    expect(sayText(sayParts(sauna, { line: 'endure.duel', a: 1, b: 0 }, owners))).toBe(
      'Last two: Toasty (Aino) and Pip (you)!',
    );
    // A spectator sees every owner by name; a player without a name gets no brackets.
    expect(
      sayText(
        sayParts(sauna, { line: 'endure.out', a: 0 }, { youId: undefined, names: owners.names }),
      ),
    ).toBe('Pip (Misa) heads for the door.');
    expect(sayText(sayParts(sauna, { line: 'endure.out', a: 1 }, { youId: 'p0', names: {} }))).toBe(
      'Toasty heads for the door.',
    );
  });

  it('shortens owners to their first word when a line must fit', () => {
    expect(shortOwner('Misa')).toBe('Misa');
    expect(shortOwner('Kaisa from the Valley')).toBe('Kaisa');
    expect(shortOwner('Maximiliana-Josephine')).toBe('Maximilia…');
    expect([...shortOwner('Maximiliana-Josephine')]).toHaveLength(10);
    // A name that is already short stays whole: bots keep their bot names.
    expect(shortOwner('Bot 12')).toBe('Bot 12');
    expect(shortOwner('Anna Liisa')).toBe('Anna Liisa');
    const p = prepareEvent(tiny([]));
    const owners = { youId: 'p0', names: { p1: 'Aino Marjatta Virtanen' }, short: true };
    expect(sayText(sayParts(p, { line: 'endure.duel', a: 1, b: 0 }, owners))).toBe(
      'Last two: Toasty (Aino) and Pip (you)!',
    );
  });

  it('announces each event, your creatures going out and each podium', () => {
    const p = prepareEvent(tiny([{ t: 5, k: 'out', a: 0, cause: 'heat' }]));
    const tl = buildShowTimeline([p.result]);
    const list = announcements([p], tl, 'p0', { p0: 'Misa', p1: 'Aino' });
    expect(list.map((a) => a.text)).toEqual([
      'Event 1 / 1: Sauna Showdown.',
      'Pip (you) is out.',
      'Gold: Toasty (Aino), Silver: Pip (you).',
    ]);
    expect(list[1]?.at).toBe(SHOW_INTRO_MS + 2_000);
    expect(announcementAt(list, SHOW_INTRO_MS + 2_100)?.text).toBe('Pip (you) is out.');
    expect(announcementAt(list, -1)).toBeNull();
    // A spectator hears no outs.
    expect(announcements([p], tl, undefined)).toHaveLength(2);
  });

  it('gives a player the same colour every time', () => {
    expect(hashString('player-1')).toBe(hashString('player-1'));
    expect(hashString('player-1')).not.toBe(hashString('player-2'));
  });
});

describe('a whole sample day', () => {
  it('lasts about three minutes', () => {
    const show = sampleShow(SAMPLE_DAY, 15, 0, 'length');
    const total = buildShowTimeline(show.events).total;
    expect(total).toBeGreaterThan(120_000);
    expect(total).toBeLessThan(300_000);
  });
});

describe('the server’s show (GET /api/games, fixtures/games-show.json)', () => {
  it('has the same timeline as the server, so the podium card lines up with the awards', async () => {
    const fixture = (await import('../fixtures/games-show.json')).default as unknown as {
      show: {
        showAt: number;
        endsAt: number;
        events: GamesEventResult[];
        timeline: {
          eventId: string;
          introMs: number;
          startMs: number;
          endMs: number;
          podiumEndMs: number;
        }[];
      };
    };
    const { show } = fixture;
    const tl = buildShowTimeline(
      show.events,
      show.timeline.map((s) => s.eventId),
    );
    expect(tl.spans.map((s) => [s.eventId, s.start, s.eventStart, s.podiumStart, s.end])).toEqual(
      show.timeline.map((s) => [s.eventId, s.introMs, s.startMs, s.endMs, s.podiumEndMs]),
    );
    expect(tl.total).toBe(show.endsAt - show.showAt);
    // And it plays: every event prepares and has a frame.
    for (const e of show.events)
      expect(frameAt(prepareEvent(e), 1_000).actors.length).toBeGreaterThan(0);
  });
});

describe('a haul (Log Carry, Pumpkin Push)', () => {
  const players = samplePlayers(8, 0);

  it('gives every team one load in its lane, and the camera follows the leading load', () => {
    for (const id of ['log-carry', 'pumpkin-push']) {
      const p = prepareEvent(sampleEvent(id, players, 'haul'));
      expect(p.loads).toHaveLength(p.teams.length);
      expect(p.loads.every((l) => l.kind === (id === 'log-carry' ? 'log' : 'pumpkin'))).toBe(true);
      expect(p.finishes).toHaveLength(p.teams.length);
      for (const f of p.finishes) expect(p.worldWidth).toBeGreaterThan(f.x);
      const end = eventMs(p.result);
      for (const ms of [0, end / 3, (2 * end) / 3, end]) {
        const f = frameAt(p, ms);
        expect(f.props.loads).toHaveLength(p.teams.length);
        const lead = Math.max(...f.props.loads.map((l) => l.x));
        expect(lead - f.cameraX).toBeGreaterThan(0);
        expect(lead - f.cameraX).toBeLessThan(192);
        // Each team's creatures stand round its load.
        for (const load of f.props.loads) {
          for (const a of p.teams[load.i]?.actors ?? []) {
            expect(Math.abs((f.actors[a]?.y ?? 0) - load.y)).toBeLessThanOrEqual(1);
            expect(Math.abs((f.actors[a]?.x ?? 0) - load.x)).toBeLessThanOrEqual(32);
          }
        }
      }
      expect(frameAt(p, end).cameraX).toBeGreaterThan(0);
      expect(stillIn(p, frameAt(p, end))).toBeNull();
    }
  });

  it('ranks teams over the line first on the live board, in finish order, and shows metres', () => {
    const p = prepareEvent(sampleEvent('log-carry', players, 'haul-board'));
    const end = frameAt(p, eventMs(p.result));
    const board = liveBoard(p, end);
    const finished = board.filter((r) => p.finishT[r.actor] !== null);
    expect(finished.length).toBeGreaterThan(0);
    expect(board.slice(0, finished.length)).toEqual(finished);
    const order = finished.map((r) => p.finishT[r.actor] ?? 0);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(board[0]?.teamId).toBe(finalBoard(p)[0]?.teamId);
    expect(scoreText('haul', 23, 400)).toBe('23m');
  });
});

describe('a retired event (a day stored before it left the pool)', () => {
  it('still prepares, plays and is named', () => {
    const played = sampleEvent('sauna-showdown', samplePlayers(6, 0), 'retired');
    const r = { ...played, eventId: 'sauna-stack', team: 3 as const };
    const p = prepareEvent(r);
    expect(frameAt(p, 2_000).actors).toHaveLength(r.actors.length);
    const timeline = buildShowTimeline([r]);
    expect(timeline.spans[0]?.eventId).toBe('sauna-stack');
    const said = announcements([p], timeline, undefined);
    expect(said[0]?.text).toBe('Event 1 / 1: Sauna Stack.');
    // Its commentary still reads (the kind's lines are still in the content).
    const say = p.says[0];
    if (say === undefined) throw new Error('no commentary');
    expect(sayText(sayParts(p, say)).length).toBeGreaterThan(0);
    const relay = prepareEvent({ ...played, eventId: 'shark-relay', kind: 'swim', team: 3 });
    expect(relay.laps).toBe(2);
    expect(relay.teamScore).toBe('sum');
  });
});
