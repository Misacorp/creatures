import type { EventNames, FightEvent } from '@creatures/engine';
import { content, entryView } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { effectIcons, turnsText } from './effect-view';
import { Stage } from './Stage';
import { actingSlots, cuesForEvents, DODGED_WORD, SHAKE_OFF_WORD, type Cue } from './stage';
import { EffectIcons } from './ui/EffectIcons';
import { byClass, createPage, visibleText, type Page } from './test-dom';
import live from './fixtures/live-mid.json';
import type { ReplayRowEntry } from './raid-api';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const NAMES = live.names as unknown as EventNames;
const ROW = live.row.slice(0, 4) as ReplayRowEntry[];
const IDS = ROW.map((c) => c.id);

const floats = (cues: readonly Cue[]) => cues.filter((c) => c.kind === 'float');

describe('the effect icons', () => {
  it('say the name, stacks and turns, from the content', () => {
    const [mired] = effectIcons([{ effect: 'mired', stacks: 5, turnsLeft: 3 }]);
    expect(mired).toMatchObject({
      name: 'Mired',
      kind: 'debuff',
      stacksText: '×5',
      turnsText: '3 turns',
      entry: 'status-mired',
    });
    expect(mired?.label).toContain('5 stacks');
    expect(turnsText(1)).toBe('1 turn');
  });

  it('has a glossary entry in the content for every status effect', () => {
    for (const e of content.statusEffects) {
      expect(entryView(`status-${e.id}`), e.id).toBeDefined();
    }
  });

  it('draws one chip each, with the stacks and (on the boss) the turns', () => {
    page = createPage();
    page.draw(<EffectIcons effects={[{ effect: 'mired', stacks: 4, turnsLeft: 2 }]} />);
    const chips = byClass(page.root, 'effect-chip');
    expect(chips).toHaveLength(1);
    const text = visibleText(page.root);
    expect(text).toContain('×4');
    expect(text).toContain('2 turns');
  });

  it('draws only glyph and a bare stack count on a creature, and nothing without effects', () => {
    page = createPage();
    page.draw(<EffectIcons compact effects={[{ effect: 'mired', stacks: 4, turnsLeft: 2 }]} />);
    expect(visibleText(page.root)).toContain('4');
    expect(visibleText(page.root)).not.toContain('×');
    expect(visibleText(page.root)).not.toContain('turns');
    page.unmount();
    page = createPage();
    page.draw(<EffectIcons compact effects={[{ effect: 'mired', stacks: 1, turnsLeft: 2 }]} />);
    expect(visibleText(page.root)).not.toMatch(/\d/);
    page.unmount();
    page = createPage();
    page.draw(<EffectIcons effects={[]} />);
    expect(byClass(page.root, 'effect-icons')).toHaveLength(0);
  });
});

describe('the stage shows effects', () => {
  const events: FightEvent[] = [
    { t: 'round_start', round: 1, bossHp: 1000, mark: null },
    {
      t: 'effect_apply',
      round: 1,
      target: null,
      effect: 'mired',
      stacksAdded: 3,
      stacks: 3,
      turnsLeft: 3,
    },
    {
      t: 'effect_apply',
      round: 1,
      target: IDS[0] as string,
      effect: 'mired',
      stacksAdded: 1,
      stacks: 1,
      turnsLeft: 3,
    },
  ];

  it('puts the boss’s effects in the column at its right and a creature’s on it', () => {
    page = createPage();
    page.draw(
      <Stage
        boss={{ id: 'old-bogback', name: 'Old Bogback', element: 'mire' }}
        hpMax={1000}
        hpStart={1000}
        rounds={12}
        row={ROW}
        mineIds={new Set<string>()}
        names={NAMES}
        events={events}
        index={events.length}
        anim={null}
      />,
    );
    const boss = byClass(page.root, 'boss-effects')[0];
    expect(boss && byClass(boss, 'effect-chip')).toHaveLength(1);
    expect(byClass(page.root, 'effect-chip')).toHaveLength(2);
    expect(byClass(page.root, 'compact')).toHaveLength(1);
  });

  it('shows none before the effect happens', () => {
    page = createPage();
    page.draw(
      <Stage
        boss={{ id: 'old-bogback', name: 'Old Bogback', element: 'mire' }}
        hpMax={1000}
        hpStart={1000}
        rounds={12}
        row={ROW}
        mineIds={new Set<string>()}
        names={NAMES}
        events={events}
        index={1}
        anim={null}
      />,
    );
    expect(byClass(page.root, 'effect-chip')).toHaveLength(0);
  });
});

describe('the cues of dodges and purges', () => {
  const dodgedHit: FightEvent = {
    t: 'hit',
    round: 1,
    creature: 'a',
    damage: 0,
    matchupBp: 10_000,
    bonusBp: 0,
    mark: null,
    bossHp: 1000,
    dodged: true,
  };

  it('floats "Dodged!" over the boss, with no flash, when it dodges a hit', () => {
    const cues = cuesForEvents([dodgedHit], 0, 1, ['a']);
    expect(cues.some((c) => c.kind === 'flash')).toBe(false);
    expect(floats(cues)).toMatchObject([{ target: null, text: DODGED_WORD, tone: 'dodge' }]);
  });

  it('floats "Dodged!" over a creature that dodges a boss hit, with no flash or shake', () => {
    const e: FightEvent = {
      t: 'boss_hit',
      round: 1,
      target: 'b',
      damage: 0,
      source: 'attack',
      dodged: true,
    };
    const cues = cuesForEvents([e], 0, 1, ['a', 'b']);
    expect(cues.map((c) => c.kind)).not.toContain('flash');
    expect(cues.map((c) => c.kind)).not.toContain('shake');
    expect(floats(cues)).toMatchObject([{ target: 'b', text: DODGED_WORD, tone: 'dodge' }]);
  });

  it('floats "Shake Off" on the boss when it purges, and "Cleansed" on a cleansed creature', () => {
    const purge: FightEvent = {
      t: 'effect_purge',
      round: 2,
      removed: [{ effect: 'mired', stacks: 3 }],
    };
    const cleanse: FightEvent = {
      t: 'effect_cleanse',
      round: 2,
      supporter: 'a',
      target: 'b',
      effect: 'mired',
      stacks: 1,
    };
    expect(floats(cuesForEvents([purge], 0, 1, ['a']))).toMatchObject([
      { target: null, text: SHAKE_OFF_WORD, tone: 'purge' },
    ]);
    expect(floats(cuesForEvents([cleanse], 0, 1, ['a', 'b']))).toMatchObject([
      { target: 'b', text: 'Cleansed' },
    ]);
  });
});

describe('serpentine ordinals follow each round', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const start = (round: number): FightEvent => ({
    t: 'round_start',
    round,
    bossHp: 1000,
    mark: null,
  });
  const order = (m: Map<string, number>): string[] =>
    [...m].sort((x, y) => x[1] - y[1]).map(([id]) => id);

  it('shows the whole round from its first beat, and flips the rows in round 2', () => {
    // A dense row of six: front a b c, middle d e f (rows of three), back empty.
    const board = { length: 9, slots: [0, 1, 2, 3, 4, 5] };
    const one = actingSlots([start(1)], 1, ids, false, { board, knockedOut: [] });
    expect(order(one)).toEqual(['a', 'b', 'c', 'f', 'e', 'd']);
    const two = actingSlots([start(1), start(2)], 2, ids, false, { board, knockedOut: [] });
    expect(order(two)).toEqual(['c', 'b', 'a', 'd', 'e', 'f']);
  });

  it('leaves out a creature that was already knocked out', () => {
    const board = { length: 9, slots: [0, 1, 2, 3, 4, 5] };
    const slots = actingSlots([start(2)], 2, ids, false, { board, knockedOut: ['b'] });
    expect(order(slots)).toEqual(['c', 'a', 'd', 'e', 'f']);
  });

  it('keeps the other orders to the engine’s events', () => {
    expect(actingSlots([start(1)], 1, ids, false).size).toBe(0);
  });
});
