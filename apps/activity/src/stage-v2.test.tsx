/**
 * The combat v2 stage drawn from real fights (the engine's own events through the fold): the mark strip, a silenced creature's Knack, a
 * knocked-out one, the announced move on its targets, the numbers over the hit, the turn strip, the boss's move line, and the words (counts
 * with a slash, no boss called a wall or harder, no damage potential).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { foldSetupOf, showOf, stageModelOf } from './fight-v2';
import { StageV2 } from './StageV2';
import { staticFx } from './stage-fx';
import { byClass, visibleText, createPage, type Page } from './test-dom';
import { MarkStrip } from './ui/MarkStrip';
import { cuesOf, type PlaybackV2 } from './use-playback-v2';
import { replaySample } from './workbench/fight-v2-sample';
import { fightV2Entries } from './workbench/entries/fight-v2';

let page: Page | null = null;
beforeEach(() => {
  // The boss's attack animation asks the window whether motion is wanted; a still screen draws none.
  Reflect.set(globalThis, 'window', { matchMedia: () => ({ matches: true }) });
});
afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

type Replay = ReturnType<typeof replaySample>;

/** The stage held after the first beat that `found` says is the one. */
function draw(
  replay: Replay,
  found: (model: ReturnType<typeof stageModelOf>, k: number) => boolean,
) {
  const setup = foldSetupOf({
    fighters: replay.fighters,
    card: replay.card,
    bossHpStart: replay.bossHpStart,
  });
  const model = stageModelOf(setup, replay.events);
  const k = model.beats.findIndex((_, i) => found(model, i));
  expect(k).toBeGreaterThanOrEqual(0);
  const beat = k + 1;
  const show = showOf(replay.events, model.beats[k] as never);
  const playback: PlaybackV2 = {
    beat,
    total: model.beats.length,
    finished: false,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show,
    fx: staticFx(cuesOf(show)),
    intro: null,
  };
  page = createPage();
  page.draw(
    <StageV2
      boss={replay.boss}
      card={replay.card}
      fighters={replay.fighters}
      names={replay.names}
      you={replay.you}
      model={model}
      playback={playback}
      place="Stage 1 / 3"
      hpMax={replay.bossHpMax}
      rounds={replay.boss.rounds}
    />,
  );
  return { p: page, model, beat };
}

describe('the v2 stage', () => {
  it('draws marks oldest first, an announced move on each creature it will land on, and the head as counts with a slash', () => {
    const replay = replaySample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const { p, model, beat } = draw(
      replay,
      (m, k) =>
        (m.states[k + 1]?.marks.length ?? 0) >= 2 && (m.states[k + 1]?.announced.length ?? 0) > 0,
    );
    const state = model.states[beat];
    expect(byClass(p.root, 'mark-chip').length).toBe(state?.marks.length);
    const announced = state?.announced.reduce((n, a) => n + a.slots.length, 0) ?? 0;
    expect(byClass(p.root, 'cue-hit').length).toBe(announced);
    const text = visibleText(p.root);
    expect(text).toContain('Stage 1 / 3');
    expect(text).toMatch(/Round \d+ \/ 8/);
    expect(text.toLowerCase()).not.toMatch(/\bwall\b|harder|hardest|potential/);
    expect(text).not.toMatch(/\b\d+ of \d+\b/);
  });

  it("crosses out a silenced creature's Knack with its turns, and greys a knocked-out one", () => {
    const replay = replaySample({ slot: 5, players: 4, stage: 1, seed: 'fold' });
    const { p } = draw(replay, (m, k) =>
      Object.values(m.states[k + 1]?.creatures ?? {}).some((c) => c.silenced > 0),
    );
    const chips = byClass(p.root, 'silenced');
    expect(chips.length).toBeGreaterThan(0);
    expect(byClass(chips[0] as never, 'slot-knack-turns').length).toBe(1);
    page?.unmount();
    const out = draw(replay, (m, k) =>
      Object.values(m.states[k + 1]?.creatures ?? {}).some((c) => c.out),
    );
    expect(byClass(out.p.root, 'fight-out').length).toBeGreaterThan(0);
  });

  it('names the boss move over its plain label when it acts, and floats the numbers over what was hit', () => {
    const replay = replaySample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const { p } = draw(
      replay,
      (m, k) => m.beats[k]?.kind === 'boss' && showOf(replay.events, m.beats[k]).move === 'Spray',
    );
    expect(
      byClass(p.root, 'stage-move')[0] === undefined
        ? ''
        : visibleText(byClass(p.root, 'stage-move')[0] as never),
    ).toContain('Spray · ');
    expect(byClass(p.root, 'float').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'fight-hit').length).toBeGreaterThan(0);
  });

  it('lights the step on in the turn strip', () => {
    const replay = replaySample({ slot: 1, players: 4, stage: 1, seed: 'fold' });
    const { p } = draw(replay, (m, k) => m.beats[k]?.kind === 'boss' && m.beats[k]?.row === 1);
    const current = byClass(p.root, 'current');
    expect(current.length).toBe(1);
    expect(visibleText(current[0] as never)).toBe('Boss');
  });

  it('shows the Escalating meter of a boss that has one, and what a boss resists from stage 2', () => {
    const replay = replaySample({ slot: 4, players: 5, stage: 2, seed: 'fold' });
    const { p } = draw(replay, (_m, k) => k === 3);
    expect(byClass(p.root, 'boss-resist').length).toBe(
      replay.events.some((e) => e.board?.type === 'resistance') ? 1 : 0,
    );
    expect(byClass(p.root, 'escalating').length).toBe(replay.card.escalation === null ? 0 : 1);
  });
});

describe('the mark strip', () => {
  it('shows a lock on a Sealed mark, a blink on the ones to be shed and one line when empty', () => {
    page = createPage();
    page.draw(
      <MarkStrip
        marks={[
          { element: 'tide', stacks: 3, sealed: true },
          { element: 'ember', stacks: 1, sealed: false, expiring: true },
        ]}
      />,
    );
    expect(byClass(page.root, 'mark-lock')).toHaveLength(1);
    expect(byClass(page.root, 'expiring')).toHaveLength(1);
    expect(visibleText(page.root)).toContain('x3');
    expect(visibleText(page.root)).toContain('Ember mark, 1, about to be shed');
    page.unmount();
    page = createPage();
    page.draw(<MarkStrip marks={[]} />);
    expect(byClass(page.root, 'mark-chip')).toHaveLength(0);
    expect(byClass(page.root, 'mark-strip')).toHaveLength(1);
  });
});

describe('the workbench page', () => {
  it('has a preset for each thing the brief asks to see', () => {
    const names = fightV2Entries.flatMap((e) => e.presets.map((p) => p.name)).join(' | ');
    for (const word of [
      'marks on the boss',
      'crit',
      'Blocked',
      'silenced',
      'Live finale',
      'Results',
    ]) {
      expect(names.toLowerCase()).toContain(word.toLowerCase());
    }
  });
});
