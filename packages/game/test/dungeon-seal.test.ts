import { describe, expect, it } from 'vitest';
import {
  RULES,
  SEALED_MARK,
  createSeededRng,
  dungeonEvent,
  dungeonEvents,
  eventOptionCosts,
  eventSeals,
  generateDungeonMap,
  generateUndercroftMap,
  mapNode,
  mapView,
  rareEventsAt,
  resolveEvent,
  roomSpecForNode,
  roomXpSource,
  scaledFoe,
  sealTargets,
  type DungeonEventDef,
  type DungeonMap,
  type EventContext,
  type MapNode,
} from '../src/index';

const vault = dungeonEvent('sealed-vault') as DungeonEventDef;

const ctx: EventContext = { hp: { a: 50, b: 0 }, hpMax: { a: 100, b: 100 }, keepsakes: [] };
const rng = { nextU32: () => 0 };

/** A map by hand: each row is `[id, kind, ...next]`. */
function handMap(rows: [string, MapNode['kind'], ...string[]][]): DungeonMap {
  return {
    floors: 5,
    nodes: rows.map(([id, kind, ...next], i) => ({
      id,
      floor: i,
      lane: 0,
      kind,
      next,
      ...(kind === 'fight' || kind === 'elite' || kind === 'boss' || kind === 'epic'
        ? { foeId: 'puddle-imp', modifierId: 'slick-floor' }
        : {}),
    })),
  };
}

describe('the Sealed Vault content', () => {
  it('has the words of the design, is rare (one room in four, from the first depth) and breaking the seal costs', () => {
    expect(vault.name).toBe('Sealed Vault');
    expect(vault.rare).toEqual({ fromDepth: 1 });
    const [brk, leave] = vault.options;
    expect(brk?.label).toBe('Break the seal');
    expect(brk?.effects).toEqual([{ op: 'seal' }]);
    expect(brk?.description.length).toBeLessThanOrEqual(90);
    expect(eventOptionCosts(brk as NonNullable<typeof brk>)).toBe(true);
    expect(leave?.label).toBe('Leave it sealed');
    expect(leave?.effects).toEqual([{ op: 'nothing' }]);
    expect(eventOptionCosts(leave as NonNullable<typeof leave>)).toBe(false);
    expect(dungeonEvents.filter(eventSeals).map((e) => e.id)).toEqual(['sealed-vault']);
  });

  it('breaking the seal says so and flags the resolution; leaving it does neither', () => {
    const broke = resolveEvent(vault, 0, ctx, rng);
    expect(broke.sealed).toBe(true);
    expect(broke.outcome).toBe(
      'The seal breaks. The next fight you enter is epic, with double rewards.',
    );
    expect(broke.hp).toEqual(ctx.hp);
    expect(broke.packDelta).toEqual({ bait: 0, essence: 0, scrap: 0 });
    const left = resolveEvent(vault, 1, ctx, rng);
    expect(left.sealed).toBeUndefined();
    expect(left.outcome).toBe('Nothing happens.');
  });
});

describe('which rooms a broken seal marks', () => {
  it('marks every fight and elite among the next rooms, and only those', () => {
    const m = handMap([
      ['v', 'mystery', 'a', 'b', 'c', 'd'],
      ['a', 'fight', 'z'],
      ['b', 'elite', 'z'],
      ['c', 'cache', 'z'],
      ['d', 'mystery', 'z'],
      ['z', 'boss'],
    ]);
    expect(sealTargets(m, 'v')).toEqual(['a', 'b']);
  });

  it('with no fight among the next rooms, marks the nearest fight on each path', () => {
    const m = handMap([
      ['v', 'mystery', 'a', 'b', 'c'],
      ['a', 'cache', 'f1'],
      ['b', 'camp', 'f2'],
      ['c', 'mystery', 'x'],
      ['f1', 'fight', 'z'],
      ['f2', 'elite', 'z'],
      ['x', 'cache', 'f3', 'z'],
      ['f3', 'fight', 'z'],
      ['z', 'boss'],
    ]);
    expect(sealTargets(m, 'v')).toEqual(['f1', 'f2', 'f3']);
  });

  it('stops a path at a floor boss or an epic fight: nothing there to mark', () => {
    const m = handMap([
      ['v', 'mystery', 'a', 'b'],
      ['a', 'cache', 'z'],
      ['b', 'epic', 'f'],
      ['f', 'fight', 'z'],
      ['z', 'boss'],
    ]);
    expect(sealTargets(m, 'v')).toEqual([]);
  });

  it('is empty for a room that is not on the map, and a vault is left out of the roll where it would do nothing', () => {
    const m = handMap([
      ['v', 'mystery', 'z'],
      ['z', 'boss'],
    ]);
    expect(sealTargets(m, 'nope')).toEqual([]);
    expect(rareEventsAt(m, 'v').some(eventSeals)).toBe(false);
    const open = handMap([
      ['v', 'mystery', 'a'],
      ['a', 'fight', 'z'],
      ['z', 'boss'],
    ]);
    expect(rareEventsAt(open, 'v').some(eventSeals)).toBe(true);
  });

  it('marks only fights that are on the map, over many real maps and Undercroft floors', () => {
    for (let i = 0; i < 60; i++) {
      const maps = [
        generateDungeonMap(createSeededRng(`seal-${String(i)}`)),
        generateUndercroftMap(createSeededRng(`seal-u-${String(i)}`), {
          level: 1,
          floors: 4,
          marks: ['mystery', 'cache'],
        }),
      ];
      for (const map of maps) {
        for (const node of map.nodes.filter((n) => n.kind === 'mystery')) {
          for (const id of sealTargets(map, node.id)) {
            const kind = mapNode(map, id)?.kind;
            expect(kind === 'fight' || kind === 'elite').toBe(true);
          }
        }
      }
    }
  });
});

describe('a sealed room is an epic fight', () => {
  const map = generateDungeonMap(createSeededRng('seal-room'));
  const of = (kind: MapNode['kind']): MapNode => map.nodes.find((n) => n.kind === kind) as MapNode;

  it('is the same foe at the same depth with the epic boost, flagged epic (and elite for the display)', () => {
    const node = of('fight');
    const plain = roomSpecForNode(map, node.id, 6, 1);
    const sealed = roomSpecForNode(map, node.id, 6, 1, true);
    const scaled = scaledFoe(sealed.foe, 6);
    expect(sealed.foe).toEqual(plain.foe);
    expect(sealed.hp).toBe(Math.floor((scaled.hp * RULES.dungeon.undercroft.epic.hpBp) / 10_000));
    expect(sealed.atk).toBe(
      Math.floor((scaled.atk * RULES.dungeon.undercroft.epic.atkBp) / 10_000),
    );
    expect(sealed.hp).toBeGreaterThan(plain.hp);
    expect(sealed.epic).toBe(true);
    expect(sealed.elite).toBe(true);
    expect(plain.epic).toBeUndefined();
  });

  it('replaces an elite boost rather than stacking on it', () => {
    const node = of('elite');
    const elite = roomSpecForNode(map, node.id, 6, 1);
    const sealed = roomSpecForNode(map, node.id, 6, 1, true);
    const scaled = scaledFoe(sealed.foe, 6);
    expect(sealed.hp).toBe(Math.floor((scaled.hp * RULES.dungeon.undercroft.epic.hpBp) / 10_000));
    expect(sealed.hp).toBeGreaterThan(elite.hp);
  });

  it('never makes a floor boss epic, and pays the epic experience', () => {
    const boss = of('boss');
    expect(roomSpecForNode(map, boss.id, 6, 1, true).epic).toBeUndefined();
    expect(roomXpSource('epic', 0)).toBe('epic');
    expect(RULES.experience.dungeon.epic).toBeGreaterThan(RULES.experience.dungeon.elite);
    expect(RULES.dungeon.seal.rewardMultiplier).toBe(2);
  });
});

describe('the mark on the map view', () => {
  const map = generateDungeonMap(createSeededRng('seal-view'));
  const fight = map.nodes.find((n) => n.kind === 'fight') as MapNode;

  it('carries the mark as data on the marked room only, and shows its foe with the epic HP', () => {
    const view = mapView(map, 5, (id) => (id === fight.id ? [SEALED_MARK] : []));
    const marked = view.nodes.filter((n) => n.marks !== undefined);
    expect(marked.map((n) => n.id)).toEqual([fight.id]);
    expect(marked[0]?.marks).toEqual([
      { kind: 'sealed-vault', text: 'x2', label: 'Sealed Vault: epic fight, double rewards' },
    ]);
    const plain = mapView(map, 5).nodes.find((n) => n.id === fight.id);
    expect(plain?.marks).toBeUndefined();
    expect(marked[0]?.foe?.hpMax).toBeGreaterThan(plain?.foe?.hpMax ?? Infinity);
    expect(marked[0]?.foe?.elite).toBe(true);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
