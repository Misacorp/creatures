/**
 * The Cave canvas's decisions, proved on pure functions (the component tests in `CaveCanvas.test.tsx` only check they are wired): the now
 * line's words, which drawer a tap opens and which opens by itself, what a creature let go of does, the hold (nothing of a room's answer
 * shows before its playback ends), the map's size and where a dragged map opens, and when the Cave is a canvas at all.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_MAP, sampleState } from '../dungeon-map-sample';
import { sampleStateCamp, sampleSummary, sampleToday } from '../dungeon-path-samples';
import { roomPlate } from '../dungeon-map';
import { undercroftState } from '../dungeon-undercroft-sample';
import type { DungeonRunState } from '../dungeon-types';
import { mapV2 } from '../workbench/dungeon-v2-sample';
import { caveCanvasOn } from './flag';
import { heldOf, release, runEndedForPhase, shownRun, type CaveView } from './hold';
import { mapSize, startOffset } from './map-size';
import { nowLine, playingRoom, roomPlace } from './now-line';
import { routeRows } from './route';
import { allNodes, roomContext, sceneMapOf } from './scene-model';
import {
  MOUTH_TARGET,
  TRAY_TARGET,
  autoKey,
  autoPanel,
  nowTapPanel,
  pendingPanel,
  resolveCaveDrop,
} from './taps';

const midway = (): DungeonRunState => sampleState('midway') as DungeonRunState;
const names: Record<string, string> = { a: 'Ash', b: 'Bo', c: 'Cy', d: 'Di' };
const nameOf = (id: string): string => names[id] ?? id;

describe('the now line', () => {
  it('before a run: pick the team, then the team is ready', () => {
    expect(nowLine({ screen: 'setup', blocked: false, placed: 1 })).toEqual({
      id: 'pick',
      text: 'Pick your team · Enter the cave',
      tap: null,
    });
    const ready = nowLine({ screen: 'setup', blocked: false, placed: 3 });
    expect(ready.tap).toBe('enter');
    expect(ready.text).toMatch(/Enter the cave/);
  });

  it('a blocked day says so and opens the reason', () => {
    expect(nowLine({ screen: 'setup', blocked: true, placed: 3 })).toEqual({
      id: 'blocked',
      text: 'Not today',
      tap: 'blocked',
    });
  });

  it('on the map: the next room to choose, counted from 1', () => {
    expect(nowLine({ screen: 'run', state: midway() }).text).toBe(
      'Room 3 of 7: choose the next room',
    );
    const entrance = sampleState('entrance') as DungeonRunState;
    expect(nowLine({ screen: 'run', state: entrance }).text).toBe(
      'Room 1 of 7: choose the next room',
    );
  });

  it('at the camp, a mystery room and the way down it names the choice and a tap opens it', () => {
    const camp = nowLine({ screen: 'run', state: sampleStateCamp() });
    expect(camp).toEqual({ id: 'camp', text: 'Camp: rest, keepsake or swap', tap: 'pending' });
    const down = nowLine({ screen: 'run', state: undercroftState('descent') });
    expect(down.id).toBe('descend');
    expect(down.tap).toBe('pending');
  });

  it('in the Undercroft the floor is named for the level', () => {
    const run = undercroftState('keeper');
    expect(nowLine({ screen: 'run', state: run }).text).toMatch(/^Undercroft 1 · Room \d of \d/);
  });

  it('during a fight it is the room and its foe; the run over reads the same', () => {
    const room = playingRoom({ node: 'f2l1', foe: { name: 'Drift Wisp' } }, 7);
    expect(nowLine({ screen: 'playing', room }).text).toBe('Room 3 of 7: Drift Wisp');
    expect(nowLine({ screen: 'playing', room: null }).text).toBe('A fight');
    expect(nowLine({ screen: 'results' }).text).toBe('The run is over');
  });

  it('an elite foe is named fierce, and a room in the Undercroft says its level', () => {
    expect(playingRoom({ node: 'f1l0', elite: true, foe: { name: 'Imp' } }, 7).foe).toBe(
      'Fierce Imp',
    );
    expect(roomPlace('u1f1l0', 4)).toBe('Undercroft 1 · Room 2 of 4');
  });
});

describe('which drawer opens', () => {
  it('a choice the run waits on opens by itself, a plain map does not', () => {
    const view = (state: DungeonRunState): CaveView => ({ kind: 'run', state });
    expect(autoPanel({ view: view(midway()), blocked: false, retry: false })).toBeNull();
    expect(autoPanel({ view: view(sampleStateCamp()), blocked: false, retry: false })).toEqual({
      kind: 'camp',
    });
    expect(pendingPanel(undercroftState('descent'))).toEqual({ kind: 'descend' });
  });

  it('a blocked day and the first-day retry open their card; a fight and a watched run open nothing', () => {
    expect(autoPanel({ view: { kind: 'setup' }, blocked: true, retry: false })).toEqual({
      kind: 'blocked',
    });
    expect(autoPanel({ view: { kind: 'setup' }, blocked: false, retry: true })).toEqual({
      kind: 'retry',
    });
    expect(autoPanel({ view: { kind: 'setup' }, blocked: false, retry: false })).toBeNull();
    const run = sampleSummary('cleared');
    expect(autoPanel({ view: { kind: 'results', run }, blocked: false, retry: false })).toEqual({
      kind: 'result',
    });
    const input = { rooms: [], row: [], landmark: false, total: 7 };
    const fight: CaveView = {
      kind: 'fight',
      input,
      before: midway(),
      after: midway(),
      summary: null,
    };
    expect(autoPanel({ view: fight, blocked: false, retry: false })).toBeNull();
  });

  it('the key changes with the screen, and with a new choice at the same kind of place, not with a tapped room', () => {
    const a = sampleStateCamp();
    const key = (s: DungeonRunState) =>
      autoKey({ view: { kind: 'run', state: s }, blocked: false, retry: false });
    expect(key(a)).not.toBe(key({ ...a, step: a.step + 1 }));
    expect(key(midway())).toBe(key({ ...midway(), step: 99 }));
    expect(autoKey({ view: { kind: 'setup' }, blocked: true, retry: false })).toBe('blocked');
  });

  it('a tap on the now line opens what it names', () => {
    expect(nowTapPanel('enter', null)).toEqual({ kind: 'enter' });
    expect(nowTapPanel('pending', sampleStateCamp())).toEqual({ kind: 'camp' });
    expect(nowTapPanel('pending', null)).toBeNull();
    expect(nowTapPanel(null, midway())).toBeNull();
  });
});

describe('a creature let go of at the cave mouth', () => {
  const empty = [null, null, null] as const;

  it('dropped on the cave mouth, a creature takes the first free place', () => {
    const r = resolveCaveDrop(['a', null, 'c'], 'b', MOUTH_TARGET, nameOf);
    expect(r.slots).toEqual(['a', 'b', 'c']);
    expect(r.outcome.status).toBe('valid');
  });

  it('a full team refuses another, and says what to do', () => {
    const r = resolveCaveDrop(['a', 'b', 'c'], 'd', MOUTH_TARGET, nameOf);
    expect(r.slots).toEqual(['a', 'b', 'c']);
    expect(r.outcome.status).toBe('invalid');
    expect(r.outcome.hint).toMatch(/full/);
  });

  it('dropped on the tray, a creature of the team comes off it; one that is not stays off', () => {
    expect(resolveCaveDrop(['a', 'b', null], 'a', TRAY_TARGET, nameOf).slots).toEqual([
      null,
      'b',
      null,
    ]);
    const off = resolveCaveDrop(['a', 'b', null], 'd', TRAY_TARGET, nameOf);
    expect(off.slots).toEqual(['a', 'b', null]);
    expect(off.outcome.status).toBe('none');
  });

  it('on a place of the row it moves, swaps, or (from the tray) takes an empty one only', () => {
    expect(resolveCaveDrop(['a', 'b', null], 'a', { kind: 'slot', slot: 1 }, nameOf).slots).toEqual(
      ['b', 'a', null],
    );
    expect(resolveCaveDrop(empty, 'd', { kind: 'slot', slot: 2 }, nameOf).slots).toEqual([
      null,
      null,
      'd',
    ]);
    const taken = resolveCaveDrop(['a', null, null], 'd', { kind: 'slot', slot: 0 }, nameOf);
    expect(taken.slots).toEqual(['a', null, null]);
    expect(taken.outcome.status).toBe('invalid');
  });

  it('anywhere else is a cancel, and nothing moves while the run is being sent', () => {
    expect(resolveCaveDrop(['a', null, null], 'a', null, nameOf).outcome.status).toBe('none');
    const busy = resolveCaveDrop(['a', null, null], 'b', MOUTH_TARGET, nameOf, true);
    expect(busy.slots).toEqual(['a', null, null]);
    expect(busy.outcome.status).toBe('invalid');
  });
});

describe('the hold: nothing of a room answer shows before its playback ends', () => {
  const before = midway();
  const after: DungeonRunState = {
    ...before,
    step: before.step + 1,
    pack: { ...before.pack, bait: before.pack.bait + 9 },
    team: before.team.map((c) => ({ ...c, hp: 1 })),
  };
  const input = { rooms: [], row: [], landmark: false, total: 7 };

  it('while a fight plays the canvas shows the run as it was before it, never the answer', () => {
    const view: CaveView = { kind: 'fight', input, before, after, summary: null };
    expect(shownRun(view)).toBe(before);
    expect(shownRun(view)).not.toBe(after);
    expect(shownRun({ kind: 'run', state: after })).toBe(after);
    expect(shownRun({ kind: 'setup' })).toBeNull();
  });

  it('the scene, Route and Pack read the held run: its pack and its history are the old ones', () => {
    const view: CaveView = { kind: 'fight', input, before, after, summary: null };
    const scene = sceneMapOf(view, sampleToday({ rules: 2 }));
    expect(scene.run).toBe(before);
    expect(scene.run?.history).toBe(before.history);
  });

  it('the answer part that waits (today, a reload on a finished run) is kept, then released once', () => {
    const today = sampleToday({ rules: 2, canRun: false });
    const held = heldOf({ today });
    expect(held).toEqual({ today, reload: false });
    const calls: string[] = [];
    const apply = {
      accept: () => calls.push('accept'),
      load: () => calls.push('load'),
    };
    // Nothing is applied while it is held: only `release` applies it.
    expect(calls).toEqual([]);
    release(held, apply);
    expect(calls).toEqual(['accept']);
    release(heldOf({ summary: sampleSummary('cleared') }), apply);
    expect(calls).toEqual(['accept', 'load']);
    release(null, apply);
    expect(calls).toHaveLength(2);
  });

  it('the valley Cave line does not flip to "over" mid-fight on the canvas; the page flips it at once', () => {
    const fight = { kind: 'fight', summary: sampleSummary('cleared') };
    expect(runEndedForPhase(fight, true)).toBe(false);
    expect(runEndedForPhase(fight, false)).toBe(true);
    expect(runEndedForPhase({ kind: 'fight', summary: null }, false)).toBe(false);
  });
});

describe('the map on the scene', () => {
  const layout = { width: 320, height: 532 };

  it('fits the box when it can be read, and is not dragged', () => {
    const size = mapSize({ width: 374, height: 520 }, layout, false);
    expect(size.tall).toBe(false);
    expect(size.size).toBeLessThanOrEqual(374);
  });

  it('keeps a readable size and is dragged when the Undercroft makes it too tall', () => {
    const size = mapSize({ width: 374, height: 520 }, { width: 320, height: 1300 }, true);
    expect(size.tall).toBe(true);
    expect(size.size).toBeGreaterThanOrEqual(320 * 0.95);
  });

  it('drops the names of plain fights only when the map is drawn small', () => {
    expect(mapSize({ width: 374, height: 520 }, layout, false).dense).toBe(false);
    expect(mapSize({ width: 300, height: 900 }, { width: 520, height: 532 }, false).dense).toBe(
      true,
    );
  });

  it('a dragged map opens with the team in the middle, never past either end', () => {
    expect(startOffset(900, 56, 1300, 520)).toBe(900 + 28 - 260);
    expect(startOffset(10, 56, 1300, 520)).toBe(0);
    expect(startOffset(1250, 56, 1300, 520)).toBe(1300 - 520);
    expect(startOffset(100, 56, 400, 520)).toBe(0);
  });
});

describe('the scene model', () => {
  it('before a run it is the day (the picked depth) with no run on it', () => {
    const today = sampleToday({ rules: 2, map: mapV2(SAMPLE_MAP, 6), depth: 6 });
    const scene = sceneMapOf({ kind: 'setup' }, today);
    expect(scene.run).toBeNull();
    expect(scene.map).toBe(today.map);
  });

  it('a finished run shows the route it walked, and every room can be named', () => {
    const run = sampleSummary('cleared');
    const scene = sceneMapOf({ kind: 'results', run }, sampleToday({ rules: 2 }));
    expect(scene.run?.status).toBe('done');
    expect(allNodes(scene).length).toBeGreaterThan(0);
    expect(roomContext(scene).ahead).toBeNull();
  });

  it('plates name a plain fight by its foe, the rest by kind', () => {
    const elite = SAMPLE_MAP.nodes.find((n) => n.kind === 'elite');
    const camp = SAMPLE_MAP.nodes.find((n) => n.kind === 'camp');
    const boss = SAMPLE_MAP.nodes.find((n) => n.kind === 'boss');
    expect(elite && roomPlate(elite)).toBe('Elite');
    expect(camp && roomPlate(camp)).toBe('Camp');
    expect(boss && roomPlate(boss)).toBe('Floor boss');
    const fight = SAMPLE_MAP.nodes.find((n) => n.kind === 'fight');
    expect(fight && roomPlate(fight)).toBe(fight?.foe?.name);
  });

  it('the route lists the rooms walked, in order, as plain lines', () => {
    const run = midway();
    const rows = routeRows(
      run.history,
      allNodes(sceneMapOf({ kind: 'run', state: run }, sampleToday())),
    );
    expect(rows.length).toBe(run.history?.length ?? 0);
    for (const row of rows) {
      expect(row.title).not.toBe('');
      expect(row.text).not.toBe('');
    }
  });
});

describe('when the Cave is a canvas', () => {
  const base = sampleToday({ rules: 2, canRun: true, active: null, last: null });

  it('only with the valley on and the day on combat v2', () => {
    expect(caveCanvasOn(true, base)).toBe(true);
    expect(caveCanvasOn(false, base)).toBe(false);
    expect(caveCanvasOn(true, { ...base, rules: undefined })).toBe(false);
    expect(caveCanvasOn(true, null)).toBe(false);
  });

  it('an open run decides by its own rules: a v1 run goes on the page', () => {
    const open = { ...midway(), status: 'active' as const };
    expect(caveCanvasOn(true, { ...base, canRun: false, active: { ...open, rules: 2 } })).toBe(
      true,
    );
    const v1 = { ...open };
    delete (v1 as { rules?: 2 }).rules;
    expect(caveCanvasOn(true, { ...base, canRun: false, active: v1 })).toBe(false);
  });

  it('a finished v1 run stays on the page too', () => {
    const last = sampleSummary('cleared');
    expect(caveCanvasOn(true, { ...base, canRun: false, last })).toBe(false);
    expect(caveCanvasOn(true, { ...base, canRun: false, last: { ...last, rules: 2 } })).toBe(true);
  });
});
