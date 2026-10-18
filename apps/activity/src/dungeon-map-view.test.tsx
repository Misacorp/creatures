import { afterEach, describe, expect, it, vi } from 'vitest';
import { DungeonMap } from './DungeonMap';
import { SAMPLE_MAP, sampleHistory, sampleState } from './dungeon-map-sample';
import { omitKey } from './dungeon-path-samples';
import type { DungeonRunState } from './dungeon-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** A stage of the sample run (every stage but the preview has a run). */
function stageRun(stage: Parameters<typeof sampleState>[0]): DungeonRunState {
  const found = sampleState(stage);
  if (found === null) throw new Error('no run in this stage');
  return found;
}

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page = createPage();
  page.draw(vnode);
  return page;
}

describe('DungeonMap', () => {
  it('draws every room as a labelled button and every path in one SVG', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    const buttons = byClass(p.root, 'dmap-node');
    expect(buttons).toHaveLength(SAMPLE_MAP.nodes.length);
    for (const b of buttons) {
      expect(b.localName).toBe('button');
      expect(b.getAttribute('aria-label')).toMatch(/Show details$/);
    }
    const paths = byClass(p.root, 'dmap-edge');
    expect(paths).toHaveLength(SAMPLE_MAP.nodes.reduce((n, r) => n + r.next.length, 0));
    expect(byName(p.root, 'button', /^Room boss: Coil Baron/)).toHaveLength(1);
  });

  it('marks the rooms by where the run stands', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} />);
    const status = (label: RegExp): string =>
      first(byName(p.root, 'button', label)).getAttribute('class') ?? '';
    expect(status(/Fight: Ember Mite/)).toContain('s-current');
    expect(first(byName(p.root, 'button', /Fight: Ember Mite/)).getAttribute('aria-current')).toBe(
      'step',
    );
    expect(status(/Fight: Drift Wisp/)).toContain('s-reachable');
    expect(status(/Fight: Ash Sprite/)).toContain('s-visited');
    // Still ahead (only not next): the normal dim. No path leads to it any more: greyed out.
    expect(status(/^Camp/)).toContain('s-locked');
    expect(status(/Fierce Moss Lurker/)).toContain('s-unreachable');
    expect(status(/Fight: Puddle Imp/)).toContain('s-unreachable');
    expect(byClass(p.root, 'dmap-edge').map((e) => e.getAttribute('class'))).toContain(
      'dmap-edge taken',
    );
  });

  it('opens the drawer on a tap, and Go closes it and calls onGo for a reachable room', () => {
    const onGo = vi.fn();
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={onGo} />);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(visibleText(dialog)).toContain('Drift Wisp');
    expect(visibleText(dialog)).toContain('HP 380');
    expect(visibleText(dialog)).toContain('Echoing');
    p.click(first(byName(p.root, 'button', /^Go to /)));
    expect(onGo).toHaveBeenCalledWith('f2l1');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('has no Go in the preview, and says a room off the path is not on it', () => {
    const preview = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    preview.click(first(byName(preview.root, 'button', /^Fight: Puddle Imp/)));
    expect(byName(preview.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(preview.root)).not.toContain('Not on your path.');
    preview.unmount();

    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Camp/)));
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('Not on your path.');
    expect(visibleText(first(byRole(p.root, 'dialog')))).not.toContain("can't reach");
  });

  it('says a room no path leads to any more cannot be reached, and still shows what is there', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} />);
    expect(byClass(p.root, 'dmap-edge').map((e) => e.getAttribute('class'))).toContain(
      'dmap-edge unreachable',
    );
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
    expect(text).toContain("You can't reach this room any more.");
    expect(text).toContain('Fierce Moss Lurker');
    expect(text).toContain('HP 640');
    expect(
      first(byName(p.root, 'button', /^Fierce Moss Lurker/)).getAttribute('aria-label'),
    ).toContain('Out of reach');
  });

  it('greys nothing in the preview or in a finished run, and says a room the run skipped was not visited', () => {
    const preview = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    expect(byClass(preview.root, 's-unreachable')).toHaveLength(0);
    expect(byClass(preview.root, 'dmap-edge').map((e) => e.getAttribute('class'))).not.toContain(
      'dmap-edge unreachable',
    );
    preview.unmount();
    const done = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('finished')} />);
    expect(byClass(done.root, 's-unreachable')).toHaveLength(0);
    done.click(first(byName(done.root, 'button', /^Fierce Moss Lurker/)));
    expect(visibleText(first(byRole(done.root, 'dialog')))).toContain('Your run did not go here.');
  });

  it('waits on Go while busy', () => {
    const p = draw(
      <DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} busy />,
    );
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    expect(first(byName(p.root, 'button', /^Go to /)).getAttribute('disabled')).not.toBeNull();
  });

  it('says what a mystery room, a cache and the camp are, with no Go while the camp waits', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('camp')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    expect(visibleText(p.root)).toContain("Something stirs. You'll see when you step in.");
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Cache/)));
    expect(visibleText(p.root)).toContain('Free loot: Bait and scrap for your pack.');
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Camp/)));
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('The camp is waiting.');
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
  });

  it('shows an elite as Fierce, with an Elite tag', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'dnd-name')[0]?.textContent).toBe('Fierce Moss Lurker');
    expect(visibleText(dialog)).toContain('Elite');
    expect(visibleText(dialog)).toContain('Thorns');
  });
});

describe('DungeonMap: what happened in a room the run has been through', () => {
  function open(stage: Parameters<typeof sampleState>[0], label: RegExp): string {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState(stage)} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', label)));
    return visibleText(first(byRole(p.root, 'dialog')));
  }

  it('tells a cleared fight: the foe, "HP 0 / max", Cleared, the rounds, the loot and the supply', () => {
    const text = open('midway', /^Fight: Ash Sprite/);
    expect(text).toContain('Ash Sprite');
    expect(text).toContain('HP 0 / 330');
    expect(text).toContain('Cleared');
    expect(text).toContain('Won in 4 rounds.');
    expect(text).toContain('Into your pack:');
    expect(text).toContain("Earned the run's supply.");
    expect(text).not.toContain('Defeat');
  });

  it('gives the standing room the same account (and no supply when an earlier fight earned it)', () => {
    const text = open('midway', /^Fight: Ember Mite/);
    expect(text).toContain('HP 0 / 360');
    expect(text).toContain('Cleared');
    expect(text).not.toContain("Earned the run's supply.");
  });

  it('gives an elite its keepsake', () => {
    const text = open('after-elite', /Fierce Moss Lurker/);
    expect(text).toContain('Cleared');
    expect(text).toContain('Lantern Moth');
    expect(text).toContain('Your creatures crit 5 points more often.');
    expect(text).not.toContain('Win it to earn a');
  });

  it('tells a lost fight in red words: Defeat and the HP the foe had left', () => {
    const lost: DungeonRunState = {
      ...stageRun('midway'),
      status: 'done',
      outcome: 'defeat',
      reachable: [],
      history: sampleHistory(SAMPLE_MAP, ['f0l1', 'f1l2'], { lostLast: true }),
    };
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={lost} />);
    p.click(first(byName(p.root, 'button', /^Fight: Ember Mite/)));
    const dialog = first(byRole(p.root, 'dialog'));
    const text = visibleText(dialog);
    expect(text).toContain('Defeat');
    expect(text).toContain('HP 108 / 360');
    expect(text).toContain('Your team fell after 5 rounds.');
    expect(byClass(dialog, 'bad').map((t) => visibleText(t))).toContain('Defeat');
    expect(text).toContain('Nothing went into the pack.');
  });

  it('tells a cache, a mystery room and the camp what they gave and what was picked', () => {
    const map = SAMPLE_MAP;
    const history = sampleHistory(map, ['f0l1', 'f1l1', 'f2l1', 'f3l1']);
    const base = stageRun('past-camp');
    const walked: DungeonRunState = { ...base, path: ['f0l1', 'f1l1', 'f2l1', 'f3l1'], history };
    const p = draw(<DungeonMap map={map} state={walked} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    let text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('The Singing Well');
    expect(text).toContain('You picked: Take one coin.');
    expect(text).toContain('You gain 1 scrap.');
    expect(text).not.toContain("Something stirs. You'll see when you step in.");
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Camp/)));
    text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('Rested: standing creatures recovered 40% HP.');
    expect(text).not.toContain('Rest, swap a creature');
    p.unmount();

    const cacheRun: DungeonRunState = {
      ...base,
      path: ['f0l1', 'f1l2', 'f2l2', 'f3l1'],
      history: sampleHistory(map, ['f0l1', 'f1l2', 'f2l2', 'f3l1']),
    };
    const q = draw(<DungeonMap map={map} state={cacheRun} />);
    q.click(first(byName(q.root, 'button', /^Cache/)));
    text = visibleText(first(byRole(q.root, 'dialog')));
    expect(text).toContain('Into your pack:');
    expect(text).not.toContain('Free loot: Bait and scrap for your pack.');
    expect(byClass(first(byRole(q.root, 'dialog')), 'part-count')).toHaveLength(2);
  });

  it('says what is still waiting in a mystery room or at the camp', () => {
    const waiting = (path: string[]): DungeonRunState => ({
      ...stageRun('camp'),
      path,
      history: sampleHistory(SAMPLE_MAP, path, { pendingLast: true }),
    });
    const camp = draw(
      <DungeonMap map={SAMPLE_MAP} state={waiting(['f0l1', 'f1l2', 'f2l1', 'f3l1'])} />,
    );
    camp.click(first(byName(camp.root, 'button', /^Camp/)));
    expect(visibleText(first(byRole(camp.root, 'dialog')))).toContain('The camp is waiting.');
    camp.unmount();
    const mystery = draw(
      <DungeonMap map={SAMPLE_MAP} state={{ ...waiting(['f0l1', 'f1l1']), at: 'f1l1' }} />,
    );
    mystery.click(first(byName(mystery.root, 'button', /^Mystery room/)));
    expect(visibleText(first(byRole(mystery.root, 'dialog')))).toContain(
      'A choice is waiting here.',
    );
  });

  it('shows the plain account of a room when the server sent no history', () => {
    const bare = omitKey(stageRun('midway'), 'history');
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={bare} />);
    p.click(first(byName(p.root, 'button', /^Fight: Ash Sprite/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('HP 330');
    expect(text).not.toContain('Cleared');
  });
});
