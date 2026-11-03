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
import { FightV2 } from './LiveV2';
import { liveSample, replaySample } from './workbench/fight-v2-sample';
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
  knackNames = false,
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
  const show = showOf(replay.events, model.beats[k] as never, { creatures: setup.creatures });
  const playback: PlaybackV2 = {
    beat,
    total: model.beats.length,
    finished: false,
    playing: false,
    setPlaying: () => undefined,
    move: () => undefined,
    show,
    fx: staticFx(cuesOf(show, knackNames)),
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

describe('the live finale page', () => {
  it('says the round once (the stage head) and keeps the countdown', () => {
    const snapshot = liveSample({ slot: 4, players: 4, stage: 3, seed: 'screen' }, { round: 2 });
    page = createPage();
    page.draw(
      <FightV2
        snapshot={snapshot}
        serverNow={snapshot.serverNow}
        busy={false}
        actionError={null}
        onFire={() => undefined}
        onAuto={() => undefined}
      />,
    );
    const visible = byClass(page.root, 'live-round').map((el) => visibleText(el));
    expect(visible.join(' ')).toContain('Next round in');
    expect(visibleText(page.root).match(/Round 2 \/ 8/g)?.length).toBe(2);
    // The page's line says it only to a screen reader.
    expect(
      byClass(page.root, 'visually-hidden').some((el) => visibleText(el) === 'Round 2 / 8'),
    ).toBe(true);
  });
});

describe('what a fight shows besides the numbers', () => {
  const mixed = () => replaySample({ slot: 4, players: 5, stage: 1, seed: 'fold', party: 'mixed' });

  it("a reaction's callout is its name in the content's words over the boss, with the bonus and its two colours", () => {
    const replay = mixed();
    const { p } = draw(
      replay,
      (m, k) => (m.beats[k]?.reacts ?? false) && m.beats[k]?.kind === 'creature',
    );
    const callouts = byClass(p.root, 'float-reaction');
    expect(callouts.length).toBeGreaterThan(0);
    const text = visibleText(callouts[0] as never);
    expect(text).toMatch(/^(Overload|Grounding|Wildfire|Steam|Smother|[A-Z][a-z]+)!\s*\+\d+$/);
    expect(byClass(callouts[0] as never, 'float-colours').length).toBe(1);
  });

  it("a creature's hit is a number in its element's colour; a crit is bigger with its multiplier", () => {
    const replay = mixed();
    const { p } = draw(replay, (m, k) =>
      showOf(replay.events, m.beats[k] as never).floats.some((f) => f.mult !== undefined),
    );
    const crit = byClass(p.root, 'float-hit').find((el) =>
      el.getAttribute('class')?.includes('crit'),
    );
    expect(crit).toBeDefined();
    expect(crit?.getAttribute('class')).toMatch(/el-(tide|ember|grove|spark|mire)/);
    expect(visibleText(crit as never)).toMatch(/x\d(\.\d)?!\s*\d+/);
  });

  it("a Guard's save puts a shield on the covered creature and a bracket leg on both tiles; the Guard's tile flashes", () => {
    const replay = mixed();
    const { p } = draw(
      replay,
      (m, k) => showOf(replay.events, m.beats[k] as never).saves.length > 0,
    );
    expect(byClass(p.root, 'float-save').length).toBeGreaterThan(0);
    expect(
      byClass(p.root, 'slot-link').filter((el) => el.getAttribute('class')?.includes('guard'))
        .length,
    ).toBeGreaterThan(0);
    expect(
      byClass(p.root, 'slot-link').filter((el) => el.getAttribute('class')?.includes('saved'))
        .length,
    ).toBeGreaterThan(0);
    expect(byClass(p.root, 'fight-guarding').length).toBeGreaterThan(0);
  });

  it('boosts are arrows and heals green numbers, always; a Knack name pops only when the option is on', () => {
    const replay = mixed();
    const found = (m: ReturnType<typeof stageModelOf>, k: number) =>
      showOf(replay.events, m.beats[k] as never).floats.some((f) => f.tone === 'boost') &&
      showOf(replay.events, m.beats[k] as never, { creatures: m.setup.creatures }).knacks.length >
        0;
    const off = draw(replay, found, false);
    expect(byClass(off.p.root, 'float-boost').length).toBeGreaterThan(0);
    expect(byClass(off.p.root, 'float-arrows').length).toBeGreaterThan(0);
    expect(byClass(off.p.root, 'float-knack')).toHaveLength(0);
    page?.unmount();
    const on = draw(replay, found, true);
    const pops = byClass(on.p.root, 'float-knack');
    expect(pops.length).toBeGreaterThan(0);
    expect(visibleText(pops[0] as never).length).toBeGreaterThan(0);
    page?.unmount();
    const heals = draw(replay, (m, k) =>
      showOf(replay.events, m.beats[k] as never).floats.some((f) => f.tone === 'heal'),
    );
    expect(byClass(heals.p.root, 'float-heal').length).toBeGreaterThan(0);
  });
});
