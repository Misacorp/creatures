import { RULES, content, createSeededRng } from '@creatures/game';
import {
  makeSlot,
  scaleBoss,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightSlot,
} from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { buildBeats, MIN_BEAT_MS, type Beat, type Cue } from './stage';
import {
  FX_MS,
  INTRO_LIVE_MS,
  LIVE_TAIL_MS,
  activeFx,
  addFx,
  beatHoldMs,
  cueMs,
  isFxCue,
  liveBudgetMs,
  nextFxEnd,
  planLiveRound,
  replayIntroMs,
  replayLead,
  shortEffectMs,
  staggerMs,
  staticFx,
  type FxCue,
} from './stage-fx';

const float = (i: number, target: string | null, crit = false): Cue => ({
  kind: 'float',
  i,
  target,
  text: '5',
  tone: 'hit',
  crit,
  drift: 0,
});
const burst: Cue = {
  kind: 'burst',
  i: 3,
  target: null,
  reaction: 'conduction',
  elements: ['tide', 'spark'],
  reflected: false,
};
const ability: Cue = { kind: 'ability', i: 4, ability: 'rally', creature: null, player: 'p' };
const ko: Cue = { kind: 'ko', i: 5, creature: 'a' };
const hop: Cue = { kind: 'hop', i: 0, creature: 'a' };

describe('visible durations', () => {
  it('keeps damage numbers 1.3 s, crits 2 s, reactions and abilities 1.5 s, knockouts 1 s', () => {
    expect(cueMs(float(1, null) as FxCue)).toBe(1300);
    expect(cueMs(float(1, null, true) as FxCue)).toBe(2000);
    expect(cueMs(burst as FxCue)).toBe(1500);
    expect(cueMs(ability as FxCue)).toBe(1500);
    expect(cueMs(ko as FxCue)).toBe(1000);
    expect(cueMs({ kind: 'gimmick', i: 1, gimmick: 'g', op: 'hit_zone' })).toBe(FX_MS.callout);
    expect(cueMs({ kind: 'banner', i: 1, text: 'Bad omen!' })).toBe(1500);
    expect(cueMs({ kind: 'zone', i: 1, zone: 'front', effect: 'rally', op: null })).toBe(1000);
  });

  it('shortens every duration by about 30% at 2x', () => {
    for (const cue of [float(1, null), float(1, null, true), burst, ability, ko] as FxCue[]) {
      const slow = cueMs(cue, 1);
      const fast = cueMs(cue, 2);
      expect(fast).toBe(Math.round(slow * 0.7));
    }
    expect(cueMs(float(1, null, true) as FxCue, 2)).toBe(1400);
  });

  it('only keeps the effects that outlast their beat', () => {
    expect([float(1, null), burst, ability, ko].every(isFxCue)).toBe(true);
    expect(isFxCue(hop)).toBe(false);
    expect(isFxCue({ kind: 'flash', i: 1, target: null })).toBe(false);
    expect(isFxCue({ kind: 'mark', i: 1, element: 'tide' })).toBe(false);
    expect(isFxCue({ kind: 'shake', i: 1, zone: 'front' })).toBe(false);
  });

  it('holds a beat for its longest effect', () => {
    expect(beatHoldMs([hop])).toBe(0);
    expect(beatHoldMs([hop, float(1, 'a'), ko])).toBe(1300);
    expect(beatHoldMs([float(1, 'a', true), burst])).toBe(2000);
    expect(beatHoldMs([float(1, 'a', true), burst], 2)).toBe(1400);
  });

  it('halves the stagger at 2x and keeps the short animations visible', () => {
    expect(staggerMs(600, 1)).toBe(600);
    expect(staggerMs(600, 2)).toBe(300);
    expect(shortEffectMs(250)).toBe(300);
    expect(shortEffectMs(500)).toBe(500);
    expect(shortEffectMs(900)).toBe(600);
  });
});

describe('effects overlap the beats that follow', () => {
  it('keeps a crit on screen while three more beats start 500 ms apart', () => {
    let items = addFx([], [float(1, null, true), hop], 0);
    expect(items).toHaveLength(1);
    items = addFx(items, [float(5, 'a')], 500);
    items = addFx(items, [burst], 1000);
    items = addFx(items, [ability], 1500);
    // At 1.6 s the crit (2 s), the first number (1.3 s from 0.5 s), the reaction and the ability show.
    expect(activeFx(items, 1600).map((i) => i.cue.kind)).toEqual([
      'float',
      'float',
      'burst',
      'ability',
    ]);
    // The crit is still there at 1999 ms and gone at 2000 ms.
    expect(activeFx(items, 1999).some((i) => i.cue.kind === 'float' && i.cue.crit)).toBe(true);
    expect(activeFx(items, 2000).some((i) => i.cue.kind === 'float' && i.cue.crit)).toBe(false);
    // The last effect ends 1.5 s after the last beat started.
    expect(activeFx(items, 2999)).toHaveLength(1);
    expect(activeFx(items, 3000)).toHaveLength(0);
  });

  it('drops ended effects when new ones are added, and keeps nothing for plain cues', () => {
    const first = addFx([], [float(1, null)], 0);
    const second = addFx(first, [hop], 5000);
    expect(second).toEqual([]);
  });

  it('puts overlapping numbers on one target in different lanes, and frees a lane when it ends', () => {
    let items = addFx([], [float(1, 'a', true)], 0);
    items = addFx(items, [float(2, 'a')], 500);
    items = addFx(items, [float(3, 'a')], 1000);
    items = addFx(items, [float(4, 'b')], 1000);
    expect(items.map((i) => i.lane)).toEqual([0, 1, 2, 0]);
    // The second number (0.5 s + 1.3 s) is over at 2 s, the crit too: a new one takes lane 0.
    items = addFx(items, [float(5, 'a')], 2000);
    expect(items.filter((i) => i.cue.kind === 'float' && i.cue.target === 'a')).toHaveLength(2);
    expect(items.at(-1)?.lane).toBe(0);
  });

  it('uses the 2x durations when asked', () => {
    const [item] = addFx([], [float(1, null, true)], 100, 2);
    expect(item?.ms).toBe(1400);
    expect(item?.until).toBe(1500);
  });

  it('says when the next effect ends', () => {
    const items = addFx(addFx([], [float(1, null)], 0), [burst], 200);
    expect(nextFxEnd(items, 300)).toBe(1000);
    expect(nextFxEnd(items, 1300)).toBe(1);
    expect(nextFxEnd([], 0)).toBeNull();
    expect(nextFxEnd(staticFx([float(1, null)]), 0)).toBeNull();
  });

  it('shows the effects of a beat still, without a timer, for reduced motion', () => {
    const items = staticFx([hop, float(1, null, true), burst]);
    expect(items.map((i) => i.cue.kind)).toEqual(['float', 'burst']);
    expect(items.every((i) => i.ms === 0 && i.until === Number.POSITIVE_INFINITY)).toBe(true);
    expect(activeFx(items, 1e12)).toHaveLength(2);
  });
});

describe('a live round', () => {
  const beat = (ms: number, cues: Cue[] = [], from = 1): Beat => ({
    from,
    to: from + 1,
    round: 1,
    cues,
    ms,
  });
  const opening: FightEvent = { t: 'round_start', round: 4, bossHp: 10, mark: null };
  const turn: FightEvent = { t: 'turn', round: 4, creature: 'a' };

  it('gives a 15 second round a 3 second intro and a 10.5 second budget', () => {
    expect(INTRO_LIVE_MS).toBe(3000);
    expect(LIVE_TAIL_MS).toBe(1500);
    expect(liveBudgetMs(15_000)).toBe(10_500);
    expect(liveBudgetMs(1_000)).toBe(2_000);
  });

  it('opens with the intro when the first new event starts a round', () => {
    const plan = planLiveRound([beat(500, [], 0)], [opening, turn], 15_000);
    expect(plan.introRound).toBe(4);
    expect(plan.introMs).toBe(3000);
  });

  it('has no intro for a stage that joins in the middle of a round', () => {
    const plan = planLiveRound([beat(500, [], 1)], [opening, turn], 15_000);
    expect(plan.introRound).toBeNull();
    expect(plan.introMs).toBe(0);
  });

  it('squeezes the staggers so the last effects end 1.5 s before the next round', () => {
    // 30 beats of 700 ms would need 20 s; the last beat has a crit (2 s of effects).
    const beats = Array.from({ length: 30 }, (_, k) =>
      beat(700, k === 29 ? [float(1, null, true)] : [], 0),
    );
    const plan = planLiveRound(beats, [opening], 15_000);
    const starts = plan.beats.slice(0, -1).reduce((sum, b) => sum + b.ms, 0);
    expect(plan.introMs + starts + 2000).toBeLessThanOrEqual(15_000 - LIVE_TAIL_MS);
    expect(plan.beats.slice(0, -1).every((b) => b.ms >= MIN_BEAT_MS)).toBe(true);
    // The squeeze is gentle: it does not go lower than it has to.
    expect(plan.introMs + starts + 2000).toBeGreaterThan(15_000 - LIVE_TAIL_MS - 300);
  });

  it('leaves a short round at its natural pace', () => {
    const beats = [beat(500, [], 0), beat(600), beat(700, [float(1, null)])];
    const plan = planLiveRound(beats, [opening], 15_000);
    expect(plan.beats.map((b) => b.ms)).toEqual([500, 600, 700]);
  });

  function realRounds(): { beats: Beat[]; events: FightEvent[]; round: number }[] {
    const species = content.creatures.filter((c) => c.stage === 1).slice(0, 9);
    const row: FightSlot[] = species.map((sp, k) =>
      makeSlot(sp, {
        id: `c${String(k)}`,
        ownerId: `p${String(k % 3)}`,
        level: RULES.abilities.unlockLevel,
        fusionCount: 0,
      }),
    );
    const boss = content.bosses[0];
    if (boss === undefined) throw new Error('no boss');
    const scaled = scaleBoss(boss, 3, 3);
    const input: FightInput = {
      boss,
      bossAtk: scaled.atk,
      phase: 'finale',
      bossHpPool: { max: scaled.maxHp, current: scaled.maxHp },
      adaptation: null,
      row,
      players: ['p0', 'p1', 'p2'],
      finaleAbilities: [{ playerId: 'p1', abilityId: 'rally', key: 'p1:basic', fireAtRound: 2 }],
      luck: RULES.combat.luck,
    };
    const { events } = simulateFight(input, createSeededRng('fx'));
    const ids = row.map((s) => s.id);
    const out: { beats: Beat[]; events: FightEvent[]; round: number }[] = [];
    for (let round = 1; round <= 12; round++) {
      const from = events.findIndex((e) => e.t === 'round_start' && e.round === round);
      if (from < 0) continue;
      const next = events.findIndex((e) => e.t === 'round_start' && e.round === round + 1);
      const upto = next < 0 ? events.length : next;
      out.push({
        beats: buildBeats(events.slice(0, upto), from, ids),
        events: events.slice(0, upto),
        round,
      });
    }
    return out;
  }

  it('fits every round of a real fight: intro, beats, and effects over before the tail', () => {
    const rounds = realRounds();
    expect(rounds.length).toBeGreaterThan(3);
    for (const { beats, events, round } of rounds) {
      const plan = planLiveRound(beats, events, 15_000);
      expect(plan.introRound, `round ${String(round)}`).not.toBeNull();
      const last = plan.beats.at(-1) as Beat;
      const starts = plan.beats.slice(0, -1).reduce((sum, b) => sum + b.ms, 0);
      const end = plan.introMs + starts + beatHoldMs(last.cues);
      const atMinimum = plan.beats.slice(0, -1).every((b) => b.ms === MIN_BEAT_MS);
      expect(
        end <= 15_000 - LIVE_TAIL_MS || atMinimum,
        `round ${String(round)} ends at ${String(end)}`,
      ).toBe(true);
    }
  });
});

describe('a replay round', () => {
  const opening: FightEvent = { t: 'round_start', round: 2, bossHp: 10, mark: null };
  const turn: FightEvent = { t: 'turn', round: 2, creature: 'a' };
  const events: FightEvent[] = [opening, turn, { ...opening, round: 3 }];
  const beats: Beat[] = [
    { from: 0, to: 1, round: 2, cues: [], ms: 500 },
    { from: 1, to: 2, round: 2, cues: [float(1, null, true)], ms: 600 },
    { from: 2, to: 3, round: 3, cues: [], ms: 500 },
  ];

  it('shows a 1.5 s intro at 1x and a shorter one at 2x', () => {
    expect(replayIntroMs(1)).toBe(1500);
    expect(replayIntroMs(2)).toBeLessThan(replayIntroMs(1));
    expect(replayIntroMs(2)).toBe(900);
  });

  it('opens the first round at once with the intro', () => {
    expect(replayLead(beats, events, 0)).toEqual({ waitMs: 0, introMs: 1500, round: 2 });
  });

  it('waits the stagger between beats of one round, halved at 2x', () => {
    expect(replayLead(beats, events, 1)).toEqual({ waitMs: 500, introMs: 0, round: null });
    expect(replayLead(beats, events, 1, 2)).toEqual({ waitMs: 250, introMs: 0, round: null });
  });

  it('lets the last effects of a round finish before the next intro', () => {
    // The crit (2 s) outlasts the 600 ms stagger.
    expect(replayLead(beats, events, 2)).toEqual({ waitMs: 2000, introMs: 1500, round: 3 });
    expect(replayLead(beats, events, 2, 2)).toEqual({ waitMs: 1400, introMs: 900, round: 3 });
  });
});
