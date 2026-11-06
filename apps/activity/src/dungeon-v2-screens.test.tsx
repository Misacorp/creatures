/**
 * The dungeon's screens on a run of combat v2, from real engine fights (`workbench/dungeon-v2-sample.ts`): a room plays on the stage's
 * single row, the map's drawer shows the foe's move tiles and leaves out a modifier that does nothing there, the camp and the strip say
 * "Out" for a creature at 0 HP, and the descent gets a downed creature back up, as on v1. A v1 run draws what it always did.
 */
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DungeonCamp } from './DungeonCamp';
import { DungeonDescend } from './DungeonDescend';
import { DungeonMap } from './DungeonMap';
import { DungeonPlayback } from './DungeonPlayback';
import { DungeonRunStrip } from './DungeonRunStrip';
import { SAMPLE_MAP, sampleState } from './dungeon-map-sample';
import { ROOM_CARD_MS, ROOM_END_MS } from './dungeon-playback';
import { tileLabel } from './dungeon-run';
import { OUT_UNTIL_CAMP } from './dungeon-text';
import { sampleCampCreatures, sampleStateCamp, sampleStateMid } from './dungeon-path-samples';
import { undercroftState } from './dungeon-undercroft-sample';
import { byClass, createPage, find, visibleText, FakeElement, type Page } from './test-dom';
import { mapV2, sampleRoomV2 } from './workbench/dungeon-v2-sample';

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    matchMedia: () => ({ matches: true }),
  });
  Reflect.set(globalThis, 'requestAnimationFrame', (cb: (t: number) => void) =>
    setTimeout(() => {
      cb(Date.now());
    }, 16),
  );
  Reflect.set(globalThis, 'cancelAnimationFrame', (id: number) => {
    clearTimeout(id);
  });
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 10, bottom: 420 }));
});

afterEach(() => {
  vi.useRealTimers();
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
});

const noop = (): void => undefined;

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page = createPage();
  page.draw(vnode);
  return page;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('a v2 room on the stage', () => {
  const played = () => sampleRoomV2({ foe: 'bramble-hound', depth: 3, level: 22, seed: 'play-1' });
  const input = (room: ReturnType<typeof played>['room']) => ({
    row: room.row ?? [],
    rooms: [room],
    landmark: false,
    total: 7,
  });

  it('opens with the banner (the foe, its last move, the room’s place) over a stage of one row of three', () => {
    const { room } = played();
    const { root } = draw(<DungeonPlayback input={input(room)} onDone={noop} />);
    const banner = byClass(root, 'room-banner')[0];
    expect(banner).toBeDefined();
    const text = visibleText(banner as FakeElement);
    expect(text).toContain('Bramble Hound');
    expect(text).toContain('Room 2 / 7');
    // The foe's trick is its last move from the card, with its plain label.
    const move = room.card.moves.at(-1);
    expect(text).toContain(move?.name);
    expect(text).toContain(move?.label);
    // The stage under it is the v2 stage in its single row: three tiles, no lane header, no owner badge.
    expect(byClass(root, 'stage-v2')).toHaveLength(1);
    expect(byClass(root, 'raid-board')[0]?.getAttribute('class')).toContain('single');
    expect(byClass(root, 'party-slot')).toHaveLength(3);
    expect(byClass(root, 'board-lane-head')).toHaveLength(0);
    expect(byClass(root, 'slot-owner')).toHaveLength(0);
    // Each tile has the creature's role, its Knack and its carried HP.
    expect(byClass(root, 'slot-role')).toHaveLength(3);
    expect(byClass(root, 'slot-knack').length).toBeGreaterThan(0);
    expect(byClass(root, 'slot-carried')).toHaveLength(3);
    // The turn strip is the line, then the foe.
    expect(visibleText(byClass(root, 'turn-strip')[0] as FakeElement)).toBe('TeamFoe');
  });

  it('leaves a room modifier that does nothing on v2 (Thorns) out of the banner, and names one that does', () => {
    const { room } = played();
    const thorns = { id: 'thorns', name: 'Thorns', description: 'Every hit sends damage back.' };
    const { root } = draw(
      <DungeonPlayback input={input({ ...room, modifier: thorns })} onDone={noop} />,
    );
    expect(byClass(root, 'rb-twist')).toHaveLength(0);
    expect(visibleText(root)).not.toContain('Thorns');
    page?.unmount();
    const flooded = draw(<DungeonPlayback input={input(room)} onDone={noop} />);
    expect(visibleText(byClass(flooded.root, 'rb-twist')[0] as FakeElement)).toContain('Flooded');
  });

  it('plays the stored fight beat by beat, ends on the result line and moves on', async () => {
    vi.useFakeTimers();
    const { room } = played();
    const onDone = vi.fn();
    const { root } = draw(<DungeonPlayback input={input(room)} onDone={onDone} />);
    expect(byClass(root, 'room-banner')).toHaveLength(1);
    await advance(ROOM_CARD_MS + 50);
    expect(byClass(root, 'room-banner')).toHaveLength(0);
    // Beats land: the foe's HP bar takes damage.
    const bar = (): string =>
      find(root, (e) =>
        (e.getAttribute('aria-label') ?? '').startsWith('Bramble Hound HP'),
      )[0]?.getAttribute('aria-label') ?? '';
    expect(bar()).toBe(`Bramble Hound HP: ${String(room.foe.hpMax)} / ${String(room.foe.hpMax)}`);
    const full = bar();
    for (let i = 0; i < 20 && bar() === full; i++) await advance(1_000);
    expect(bar()).not.toBe(full);
    for (let i = 0; i < 60 && byClass(root, 'dungeon-room-result')[0]?.textContent === ''; i++) {
      await advance(1_000);
    }
    expect(visibleText(byClass(root, 'dungeon-room-result')[0] as FakeElement)).toBe(
      room.cleared ? 'Bramble Hound defeated.' : 'Your team could not beat Bramble Hound.',
    );
    expect(onDone).not.toHaveBeenCalled();
    await advance(ROOM_END_MS + 50);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps a creature that came in knocked out greyed in its place', () => {
    const { room } = sampleRoomV2({
      foe: 'bramble-hound',
      depth: 3,
      level: 22,
      seed: 'play-2',
      carried: [1, 0, 1],
    });
    const { root } = draw(<DungeonPlayback input={input(room)} onDone={noop} />);
    const tiles = byClass(root, 'party-slot');
    expect(tiles).toHaveLength(3);
    expect(tiles[1]?.getAttribute('class')).toContain('fight-out');
    expect(tiles[0]?.getAttribute('class') ?? '').not.toContain('fight-out');
  });
});

describe('the map’s drawer on a v2 run', () => {
  const v2 = mapV2(SAMPLE_MAP, 3);
  const open = (map: typeof SAMPLE_MAP, node: string) => {
    const state = sampleState('after-elite');
    if (state === null) throw new Error('no run');
    return draw(<DungeonMap map={map} state={state} initialOpen={node} />);
  };

  it('shows the foe’s move tiles and armour, and no v1 trick lines, no Thorns', () => {
    // f2l0 is the elite Moss Lurker in a Thorns room.
    const { root } = open(v2, 'f2l0');
    const tiles = byClass(root, 'move-tile');
    const node = v2.nodes.find((n) => n.id === 'f2l0');
    expect(node?.modifier?.id).toBe('thorns');
    expect(tiles).toHaveLength(node?.foe?.card?.moves.length ?? -1);
    expect(tiles.length).toBeGreaterThan(0);
    // A tile is a plain group, not a button: there is no board to light here.
    expect(tiles.every((t) => t.localName !== 'button')).toBe(true);
    expect(byClass(root, 'dnd-trick')).toHaveLength(0);
    expect(byClass(root, 'dnd-mod')).toHaveLength(0);
    expect(visibleText(root)).not.toContain('Thorns');
  });

  it('names a modifier that does something (Flooded), and keeps a foe with no moves honest', () => {
    const { root } = open(v2, 'f0l0');
    expect(byClass(root, 'dnd-mod')).toHaveLength(1);
    expect(visibleText(byClass(root, 'dnd-mod')[0] as FakeElement)).toContain('Flooded');
    // The Puddle Imp has no moves but escalates: its meter shows and no "No tricks" line (it is not true), with no empty tile row.
    expect(byClass(root, 'boss-moves')).toHaveLength(0);
    expect(byClass(root, 'escalating')).toHaveLength(1);
    expect(byClass(root, 'dnd-trick')).toHaveLength(0);
  });

  it('is exactly what it was on a v1 run: tricks from the content, the Thorns modifier named', () => {
    const { root } = open(SAMPLE_MAP, 'f2l0');
    expect(byClass(root, 'move-tile')).toHaveLength(0);
    expect(byClass(root, 'dnd-trick').length).toBeGreaterThan(0);
    expect(visibleText(byClass(root, 'dnd-mod')[0] as FakeElement)).toContain('Thorns');
  });
});

describe('the camp and the strip on a v2 run', () => {
  const camp = { offers: [], restBp: 4000 };

  it('greys a creature that is out in its place as "Out", with one line that says it stays out until the camp swaps it', () => {
    const state = sampleStateCamp();
    const { root } = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={sampleCampCreatures(5)}
        busy={false}
        rules={2}
        onAct={noop}
      />,
    );
    const hp = byClass(root, 'slot-hp-text').map((e) => visibleText(e));
    expect(hp).toEqual(['84 / 281 HP', expect.stringMatching(/ HP$/), 'Out']);
    expect(
      byClass(root, 'slot-hp').filter((e) => (e.getAttribute('class') ?? '').includes(' ko')),
    ).toHaveLength(1);
    expect(visibleText(byClass(root, 'camp-out-line')[0] as FakeElement)).toBe(OUT_UNTIL_CAMP);
    expect(visibleText(root)).not.toContain('Knocked out');
    // The rest line still says it heals the standing only.
    expect(visibleText(root)).toContain('Standing creatures heal 40% HP.');
  });

  it('draws a v1 camp as it was: the number of a knocked-out creature, no extra line', () => {
    const state = sampleStateCamp();
    const { root } = draw(
      <DungeonCamp
        team={state.team}
        pack={state.pack}
        camp={camp}
        creatures={sampleCampCreatures(5)}
        busy={false}
        onAct={noop}
      />,
    );
    expect(byClass(root, 'slot-hp-text').map((e) => visibleText(e))[2]).toMatch(/^0 \/ \d+ HP$/);
    expect(byClass(root, 'camp-out-line')).toHaveLength(0);
  });

  it('says "Out" in no camp line when everyone stands', () => {
    const state = sampleStateCamp();
    const team = state.team.map((c) => ({ ...c, hp: c.hpMax }));
    const { root } = draw(
      <DungeonCamp
        team={team}
        pack={state.pack}
        camp={camp}
        creatures={sampleCampCreatures(5)}
        busy={false}
        rules={2}
        onAct={noop}
      />,
    );
    expect(byClass(root, 'camp-out-line')).toHaveLength(0);
  });

  it('reads "Out" under the skull in the run strip, and the tile says it for a screen reader', () => {
    const state = { ...sampleStateMid(), rules: 2 as const };
    const { root } = draw(<DungeonRunStrip state={state} />);
    const text = visibleText(root);
    expect(text).toContain('Out');
    expect(text).not.toContain('Knocked out');
    // What a screen reader says of its tile (the face is a button inside a popover host).
    const out = state.team.find((c) => c.hp <= 0);
    expect(out === undefined ? '' : tileLabel(out, 2)).toMatch(/: out until the camp swaps it\.$/);
    expect(out === undefined ? '' : tileLabel(out)).toMatch(/: knocked out\.$/);
  });
});

describe('the descent card on a v2 run', () => {
  const base = undercroftState('descent');
  const pending = base.pending?.kind === 'descend' ? base.pending : null;

  it('promises the revive, as on v1: the standing recover and a downed creature gets back up', () => {
    if (pending === null) throw new Error('the capture has a descent');
    const { root } = draw(
      <DungeonDescend
        descent={pending}
        pack={base.pack}
        depth={base.depth}
        busy={false}
        onAct={noop}
      />,
    );
    const text = visibleText(root);
    expect(text).toContain('Your creatures catch their breath');
    expect(text).toContain('Downed creatures revive to');
    expect(text).not.toContain('stay out');
  });

  it('says the same on a v1 descent', () => {
    if (pending === null) throw new Error('the capture has a descent');
    const { root } = draw(
      <DungeonDescend
        descent={pending}
        pack={base.pack}
        depth={base.depth}
        busy={false}
        onAct={noop}
      />,
    );
    expect(visibleText(root)).toContain('Downed creatures revive to');
  });
});
