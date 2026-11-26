import { describe, expect, it } from 'vitest';
import type { RaidView, RowSlotView } from '../raid-api';
import { gridRowsV2 } from '../raid-board-v2';
import { laneStates, ownLaneSpan } from '../raid-board';
import { raidV2Sample } from '../workbench/raid-v2-sample';
import { defaultConfig, resolveConfig } from './config';
import { balanceMayMove, heldView } from './hold';
import { nowInput, nowLine, type NowInput } from './now-line';
import { isHeld, nextFetchIn, playingOf, roundAt, type Playing } from './playing';
import {
  TRAY_TARGET,
  foreignLaneOwner,
  resolveCanvasDrop,
  tapOutcome,
  type DropContext,
} from './taps';

const NOTHING: NowInput = {
  incoming: null,
  playing: null,
  fell: null,
  toPlace: null,
  next: null,
  nextBoss: null,
  order: null,
};

describe('the now line: the first message that applies wins', () => {
  const all: NowInput = {
    incoming: { id: 'r1', text: 'Mira asks to swap Lanternfin for Emberkit' },
    playing: { label: 'Stage 1', round: 3, rounds: 8 },
    fell: 'Stage 2',
    toPlace: { placed: 1, seats: 3 },
    next: { title: 'Stage 1', when: 'Sat 13:37', finale: false },
    nextBoss: 'Monday 13:37',
    order: 'Rally',
  };
  it('an incoming swap request comes first and a tap opens that request', () => {
    const line = nowLine(all);
    expect(line.id).toBe('swap');
    expect(line.tap).toEqual({ kind: 'swap', id: 'r1' });
  });
  it('then a stage playing, with its round, opening the log', () => {
    const line = nowLine({ ...all, incoming: null });
    expect(line).toEqual({
      id: 'playing',
      text: 'Stage 1 is playing · round 3 / 8',
      tap: { kind: 'log' },
    });
  });
  it('then the boss having fallen', () => {
    const line = nowLine({ ...all, incoming: null, playing: null });
    expect(line.text).toBe('The boss fell in Stage 2');
  });
  it('then still to place, with the next time after it', () => {
    const base = { ...all, incoming: null, playing: null, fell: null };
    expect(nowLine({ ...base, toPlace: { placed: 0, seats: 3 } }).text).toBe(
      'Place up to 3 creatures · Stage 1 Sat 13:37',
    );
    expect(nowLine(base).text).toBe('1 / 3 placed · Stage 1 Sat 13:37');
    expect(nowLine(base).tap).toEqual({ kind: 'place' });
  });
  it('then the next time, naming your order before the finale', () => {
    const base = { ...all, incoming: null, playing: null, fell: null, toPlace: null };
    expect(nowLine(base).text).toBe('Stage 1 Sat 13:37');
    const withOrder = nowLine({
      ...base,
      next: { title: 'Finale', when: 'Sun 20:00', finale: true },
    });
    expect(withOrder.text).toBe('Finale Sun 20:00 · your order: Rally');
    expect(withOrder.tap).toEqual({ kind: 'order' });
  });
  it('with nothing left it says when the next raid is', () => {
    expect(nowLine({ ...NOTHING, nextBoss: 'Monday 13:37' }).text).toBe('Next raid Monday 13:37');
    expect(nowLine(NOTHING).text).toBe('No raid right now');
  });
  it('is read from a real week: nothing placed asks to place', () => {
    const { view } = raidV2Sample({
      slot: 1,
      players: 4,
      stagesPlayed: 0,
      mine: 0,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'none',
    });
    const input = nowInput(view, null, view.serverNow);
    expect(input.toPlace?.placed).toBe(0);
    expect(nowLine(input).id).toBe('place');
  });
  it('is read from a real week: a request asked of you leads', () => {
    const { view } = raidV2Sample({
      slot: 1,
      players: 4,
      stagesPlayed: 0,
      mine: 3,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'incoming',
    });
    expect(nowLine(nowInput(view, null, view.serverNow)).id).toBe('swap');
  });
});

describe('which drawer opens for which tap', () => {
  const base = {
    slot: 4,
    swapId: null,
    canEdit: true,
    laneOwner: null,
    config: { creatureTap: 'drawer' as const },
  };
  const mine = { mine: true, creatureId: 'c1' };
  const theirs = { mine: false };
  it('your creature opens its drawer; another player’s opens the read-only one', () => {
    expect(tapOutcome({ ...base, occupant: mine })).toEqual({
      kind: 'open',
      panel: { kind: 'mine', creatureId: 'c1' },
    });
    expect(tapOutcome({ ...base, occupant: theirs })).toEqual({
      kind: 'open',
      panel: { kind: 'theirs', slot: 4 },
    });
  });
  it('an empty seat of yours opens the picker; a locked board refuses', () => {
    expect(tapOutcome({ ...base, occupant: null })).toEqual({
      kind: 'open',
      panel: { kind: 'seat', slot: 4 },
    });
    expect(tapOutcome({ ...base, occupant: null, canEdit: false })).toEqual({ kind: 'locked' });
  });
  it('another player’s free seat is a note, not a drawer', () => {
    expect(tapOutcome({ ...base, occupant: null, laneOwner: 'Mira' })).toEqual({
      kind: 'seat-note',
      owner: 'Mira',
    });
  });
  it('a creature in a swap request opens the request, whoever owns it', () => {
    for (const occupant of [mine, theirs]) {
      expect(tapOutcome({ ...base, occupant, swapId: 's1' })).toEqual({
        kind: 'open',
        panel: { kind: 'swap', id: 's1' },
      });
    }
  });
  it('popover-first shows a popover and lights the creature, with the same drawer behind Open', () => {
    const config = { creatureTap: 'popover-first' as const };
    expect(tapOutcome({ ...base, config, occupant: mine })).toEqual({
      kind: 'popover',
      panel: { kind: 'mine', creatureId: 'c1' },
      lit: 4,
    });
    expect(tapOutcome({ ...base, config, occupant: theirs }).kind).toBe('popover');
    // The seat picker and the swap request are not creatures: they open at once.
    expect(tapOutcome({ ...base, config, occupant: null }).kind).toBe('open');
    expect(tapOutcome({ ...base, config, occupant: mine, swapId: 's1' }).kind).toBe('open');
  });
});

describe('the lane an empty seat is in', () => {
  const cell = (slot: number, owner: string | null, mine = false): RowSlotView => ({
    slot,
    zone: 'front',
    creature:
      owner === null ? null : { ownerName: owner, species: 'splashet', name: 'A', level: 1, mine },
  });
  const grid = { rows: 3, cols: 2 };
  it('belongs to the one other player standing in it', () => {
    const row = [cell(0, null), cell(1, 'Mira'), cell(2, null)];
    expect(foreignLaneOwner(row, grid, 0)).toBe('Mira');
  });
  it('is free when it is yours, empty, or shared', () => {
    expect(foreignLaneOwner([cell(0, null), cell(1, 'You', true)], grid, 0)).toBeNull();
    expect(foreignLaneOwner([cell(0, null), cell(1, null)], grid, 0)).toBeNull();
    expect(foreignLaneOwner([cell(0, 'Jun'), cell(1, 'Mira')], grid, 2)).toBeNull();
    expect(foreignLaneOwner([cell(0, 'Jun'), cell(1, 'Mira'), cell(2, null)], grid, 2)).toBeNull();
  });
});

describe('a hand letting go of a creature', () => {
  const row: RowSlotView[] = [
    { slot: 0, zone: 'front', creature: null },
    {
      slot: 1,
      zone: 'middle',
      creature: {
        ownerName: 'You',
        species: 'splashet',
        name: 'A',
        level: 1,
        mine: true,
        creatureId: 'on',
      },
    },
    {
      slot: 2,
      zone: 'back',
      creature: { ownerName: 'Mira', species: 'cindle', name: 'B', level: 1, mine: false },
    },
    { slot: 3, zone: 'front', creature: null },
  ];
  const ctx: DropContext = {
    locked: false,
    row,
    place: (s) => `seat ${String(s)}`,
    seats: 3,
    out: new Set(['hurt']),
  };
  const slot = (n: number) => ({ kind: 'slot' as const, slot: n });
  it('places a creature from the tray on an empty seat', () => {
    const o = resolveCanvasDrop(ctx, 'off', 'Off', slot(0));
    expect(o.status).toBe('valid');
    expect(o.intent).toEqual({ type: 'place', creatureId: 'off', slot: 0 });
  });
  it('refuses an occupied seat, a creature that is out, and a full board', () => {
    expect(resolveCanvasDrop(ctx, 'off', 'Off', slot(2)).status).toBe('invalid');
    expect(resolveCanvasDrop(ctx, 'hurt', 'Hurt', slot(0)).hint).toMatch(/out this weekend/);
    const full = { ...ctx, seats: 1 };
    expect(resolveCanvasDrop(full, 'off', 'Off', slot(0)).hint).toMatch(/seats are used/);
  });
  it('moves a creature already on the board', () => {
    const o = resolveCanvasDrop(ctx, 'on', 'On', slot(3));
    expect(o.intent).toEqual({ type: 'place', creatureId: 'on', slot: 3 });
  });
  it('a drop on the tray takes it off the board; for one that is off it does nothing', () => {
    expect(resolveCanvasDrop(ctx, 'on', 'On', TRAY_TARGET).intent).toEqual({
      type: 'unplace',
      creatureId: 'on',
    });
    expect(resolveCanvasDrop(ctx, 'off', 'Off', TRAY_TARGET).intent).toBeNull();
  });
  it('a locked board takes nothing, a cancel does nothing', () => {
    expect(resolveCanvasDrop({ ...ctx, locked: true }, 'off', 'Off', slot(0)).status).toBe(
      'invalid',
    );
    expect(resolveCanvasDrop(ctx, 'on', 'On', null).intent).toBeNull();
  });
});

describe('a stage playing out: the outcome is held until it ends', () => {
  const playing: Playing = {
    stage: 1,
    startsAt: 1_000,
    roundMs: 30_000,
    nextRoundAt: 61_000,
    endsAt: 241_000,
  };
  const week = (): RaidView => {
    const { view } = raidV2Sample({
      slot: 1,
      players: 4,
      stagesPlayed: 1,
      mine: 3,
      bestShareBp: 0,
      knockedOut: true,
      swaps: 'none',
    });
    const party = view.party;
    if (party === null) throw new Error('no party');
    return {
      ...view,
      party: {
        ...party,
        results: [
          {
            phase: 'phase1',
            cleared: true,
            essence: 40,
            festivalGrant: null,
            rankChange: null,
          } as never,
        ],
      },
    };
  };
  it('holds the knocked-out marks and the stage result before endsAt, not after', () => {
    const view = week();
    expect(view.v2?.out.length).toBeGreaterThan(0);
    const held = heldView(view, playing, 100_000);
    expect(held.v2?.out).toEqual([]);
    expect(held.party?.results).toEqual([]);
    expect(heldView(view, playing, 241_000)).toBe(view);
    expect(heldView(view, null, 100_000)).toBe(view);
  });
  it('the HUD may not show the Essence until the window ends', () => {
    expect(balanceMayMove(playing, 240_999)).toBe(false);
    expect(balanceMayMove(playing, 241_000)).toBe(true);
    expect(balanceMayMove(null, 0)).toBe(true);
    expect(isHeld(playing, 0)).toBe(true);
  });
  it('holds only the stage that plays: an earlier result stays', () => {
    const view = week();
    const party = view.party;
    if (party === null) throw new Error('no party');
    const two = { ...playing, stage: 2 };
    expect(heldView(view, two, 100_000).party?.results).toHaveLength(1);
  });
  it('fetches once per round, at nextRoundAt, never on a short poll', () => {
    expect(nextFetchIn(playing, 31_000, 300)).toBe(30_300);
    expect(nextFetchIn(playing, 70_000, 300)).toBe(300);
    expect(nextFetchIn({ ...playing, nextRoundAt: null }, 200_000, 300)).toBe(41_300);
    expect(nextFetchIn({ ...playing, nextRoundAt: null }, 250_000, 300)).toBeNull();
  });
  it('joins at the current round', () => {
    expect(roundAt(playing, 500, 8)).toBe(0);
    expect(roundAt(playing, 1_000, 8)).toBe(1);
    expect(roundAt(playing, 61_000, 8)).toBe(3);
    expect(roundAt(playing, 900_000, 8)).toBe(8);
  });
  it('reads playing from the v2 part, and nothing when it is missing', () => {
    const view = week();
    expect(playingOf(view)).toBeNull();
    const v2 = view.v2;
    if (v2 === undefined) throw new Error('no v2');
    expect(playingOf({ v2: { ...v2, playing } as never })?.stage).toBe(1);
  });
});

describe('the config props', () => {
  it('default to the reviewer’s picks on a phone', () => {
    expect(defaultConfig(true)).toEqual({
      seatPlates: 'mine',
      creatureTap: 'popover-first',
      partnerLook: 'badge',
    });
  });
  it('a wide window opens the drawer at once', () => {
    expect(defaultConfig(false)).toEqual({
      seatPlates: 'mine',
      creatureTap: 'drawer',
      partnerLook: 'badge',
    });
  });
  it('a caller’s value wins, a missing one takes the default', () => {
    expect(resolveConfig(true, { seatPlates: 'all' })).toEqual({
      seatPlates: 'all',
      creatureTap: 'popover-first',
      partnerLook: 'badge',
    });
    expect(resolveConfig(true, { creatureTap: 'drawer' }).creatureTap).toBe('drawer');
    expect(resolveConfig(false, undefined)).toEqual(defaultConfig(false));
  });
});

describe('where the board opens on a phone', () => {
  const lanes = (mineCol: number, cols: number) => {
    const sample = raidV2Sample({
      slot: 1,
      players: cols,
      stagesPlayed: 1,
      mine: 3,
      bestShareBp: 0,
      knockedOut: false,
      swaps: 'none',
    });
    const v2 = sample.view.v2;
    const row = sample.view.party?.row ?? [];
    if (v2 === undefined) throw new Error('no v2');
    // Move your lane to `mineCol` by swapping the owners of two columns.
    const at = (slot: number) => row.find((s) => s.slot === slot);
    const grid = { rows: v2.rows, cols: v2.cols };
    const swapped = row.map((s) => {
      const col = Math.floor(s.slot / grid.rows);
      const other = col === 0 ? mineCol : col === mineCol ? 0 : col;
      const from = at(other * grid.rows + (s.slot % grid.rows));
      return { ...s, creature: from?.creature ?? null };
    });
    const occupants = new Map(swapped.map((s) => [s.slot, s.creature] as const));
    return laneStates(
      gridRowsV2(grid).map((r) => ({ zone: r.zone, slots: r.slots })),
      (slot) => {
        const who = occupants.get(slot);
        return who === null || who === undefined ? null : who.mine ? 'mine' : 'other';
      },
    );
  };
  it('opens on your own column, wherever it is', () => {
    expect(ownLaneSpan(lanes(0, 6))).toEqual({ first: 0, last: 0 });
    expect(ownLaneSpan(lanes(4, 6))).toEqual({ first: 4, last: 4 });
  });
});
