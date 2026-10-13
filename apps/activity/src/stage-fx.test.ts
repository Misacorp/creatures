import { RULES, content, createSeededRng } from '@creatures/game';
import {
  INTRO_LIVE_MS as ENGINE_INTRO_LIVE_MS,
  MAX_ROUND_MS,
  MIN_ROUND_MS,
  TAIL_MS,
  WINDUP_MS,
  makeSlot,
  roundPlaybackMs,
  scaleBoss,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightSlot,
} from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { buildBeats, type BossStrike, type Cue } from './stage';
import {
  FX_MS,
  INTRO_LIVE_MS,
  INTRO_REPLAY_MS,
  activeFx,
  addFx,
  cueMs,
  isFxCue,
  liveTimeline,
  nextFxEnd,
  shortEffectMs,
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
const strike: BossStrike = {
  action: 'hit_zone',
  gimmick: 'undertow',
  targets: ['a'],
  zone: 'front',
  blocked: [],
  guarded: null,
};

describe('visible durations', () => {
  it('keeps damage numbers 2.5 s, crits 3 s, reactions 2.5 s, abilities 2 s and knockouts 1.5 s', () => {
    expect(cueMs(float(1, null) as FxCue)).toBe(2500);
    expect(cueMs(float(1, null, true) as FxCue)).toBe(3000);
    expect(cueMs(burst as FxCue)).toBe(2500);
    expect(cueMs(ability as FxCue)).toBe(2000);
    expect(cueMs(ko as FxCue)).toBe(1500);
    expect(cueMs({ kind: 'strike', i: 1, strike })).toBe(FX_MS.callout);
    expect(cueMs({ kind: 'banner', i: 1, text: 'Bad omen!' })).toBe(2000);
    expect(cueMs({ kind: 'zone', i: 1, zone: 'front', effect: 'rally' })).toBe(1200);
  });

  it('lasts as long as the engine says for a wind-up, so the telegraph ends where the hit lands', () => {
    expect(cueMs({ kind: 'windup', i: 1, strike })).toBe(WINDUP_MS);
    expect(cueMs({ kind: 'windup', i: 1, strike }, 2)).toBe(WINDUP_MS / 2);
  });

  it('shortens every duration by about 30% at 2x', () => {
    for (const cue of [float(1, null), float(1, null, true), burst, ability, ko] as FxCue[]) {
      const slow = cueMs(cue, 1);
      const fast = cueMs(cue, 2);
      expect(fast).toBe(Math.round(slow * 0.7));
    }
    expect(cueMs(float(1, null, true) as FxCue, 2)).toBe(2100);
  });

  it('only keeps the effects that outlast their beat', () => {
    const kept: Cue[] = [
      float(1, null),
      burst,
      ability,
      ko,
      { kind: 'strike', i: 1, strike },
      { kind: 'windup', i: 1, strike },
    ];
    expect(kept.every(isFxCue)).toBe(true);
    expect(isFxCue(hop)).toBe(false);
    expect(isFxCue({ kind: 'flash', i: 1, target: null })).toBe(false);
    expect(isFxCue({ kind: 'mark', i: 1, element: 'tide' })).toBe(false);
    expect(isFxCue({ kind: 'shake', i: 1, zone: 'front' })).toBe(false);
  });

  it('keeps the short animations visible whatever the stagger', () => {
    expect(shortEffectMs(250)).toBe(300);
    expect(shortEffectMs(500)).toBe(500);
    expect(shortEffectMs(900)).toBe(600);
  });
});

describe('effects overlap the beats that follow', () => {
  it('keeps a crit on screen while five more beats start 500 ms apart', () => {
    let items = addFx([], [float(1, null, true), hop], 0);
    expect(items).toHaveLength(1);
    items = addFx(items, [float(5, 'a')], 500);
    items = addFx(items, [burst], 1000);
    items = addFx(items, [ability], 1500);
    // At 1.6 s everything is on screen.
    expect(activeFx(items, 1600).map((i) => i.cue.kind)).toEqual([
      'float',
      'float',
      'burst',
      'ability',
    ]);
    // The crit (3 s) is still there at 2999 ms and gone at 3000 ms.
    expect(activeFx(items, 2999).some((i) => i.cue.kind === 'float' && i.cue.crit)).toBe(true);
    expect(activeFx(items, 3000).some((i) => i.cue.kind === 'float' && i.cue.crit)).toBe(false);
    // The number on creature a (0.5 s + 2.5 s) goes at 3 s too; the reaction (1 s + 2.5 s) at 3.5 s.
    expect(activeFx(items, 3499).map((i) => i.cue.kind)).toEqual(['burst', 'ability']);
    expect(activeFx(items, 3500)).toHaveLength(0);
  });

  it('drops ended effects when new ones are added, and keeps nothing for plain cues', () => {
    const first = addFx([], [float(1, null)], 0);
    const second = addFx(first, [hop], 5000);
    expect(second).toEqual([]);
  });

  it('lets numbers on a creature rise from the same spot: a newer one is always at the base', () => {
    let items = addFx([], [float(1, 'a', true)], 0);
    items = addFx(items, [float(2, 'a')], 500);
    items = addFx(items, [float(3, 'a')], 1000);
    items = addFx(items, [float(4, 'b')], 1000);
    // Every creature number is lane 0 (no stacking offset): the older ones have simply risen.
    expect(items.map((i) => i.lane)).toEqual([0, 0, 0, 0]);
  });

  it('stands the boss numbers side by side, reusing the lane whose number has risen furthest', () => {
    let items = addFx([], [float(1, null, true)], 0);
    items = addFx(items, [float(2, null)], 500);
    items = addFx(items, [float(3, null)], 1000);
    items = addFx(items, [float(4, null)], 1500);
    expect(items.map((i) => i.lane)).toEqual([0, 1, 2, 3]);
    // All four lanes are busy: the next number takes the lane of the oldest one (lane 0, from 0 ms).
    items = addFx(items, [float(5, null)], 2000);
    expect(items.at(-1)?.lane).toBe(0);
    items = addFx(items, [float(6, null)], 2100);
    expect(items.at(-1)?.lane).toBe(1);
    // Once the numbers have gone, the first lane is free again.
    items = addFx(items, [float(7, null)], 10_000);
    expect(items.map((i) => i.lane)).toEqual([0]);
  });

  it('uses the 2x durations when asked', () => {
    const [item] = addFx([], [float(1, null, true)], 100, 2);
    expect(item?.ms).toBe(2100);
    expect(item?.until).toBe(2200);
  });

  it('says when the next effect ends', () => {
    const items = addFx(addFx([], [float(1, null)], 0), [burst], 200);
    expect(nextFxEnd(items, 300)).toBe(2200);
    expect(nextFxEnd(items, 2500)).toBe(1);
    expect(nextFxEnd([], 0)).toBeNull();
    expect(nextFxEnd(staticFx([float(1, null)]), 0)).toBeNull();
  });

  it('shows the effects of a beat still, without a timer, for reduced motion', () => {
    const items = staticFx([hop, float(1, null, true), burst]);
    expect(items.map((i) => i.cue.kind)).toEqual(['float', 'burst']);
    expect(items.every((i) => i.ms === 0 && i.until === Number.POSITIVE_INFINITY)).toBe(true);
    expect(activeFx(items, 1e12)).toHaveLength(2);
  });

  it('stacks still numbers on one creature, since nothing rises', () => {
    const items = staticFx([float(1, 'a'), float(2, 'a'), float(3, 'b')]);
    expect(items.map((i) => i.lane)).toEqual([0, 1, 0]);
  });
});

describe('the intro', () => {
  it('is 1.5 s live and 1 s in a replay, as in the engine', () => {
    expect(INTRO_LIVE_MS).toBe(1500);
    expect(INTRO_LIVE_MS).toBe(ENGINE_INTRO_LIVE_MS);
    expect(INTRO_REPLAY_MS).toBe(1000);
  });
});

/** A fight with a boss that has a zone hit (round 3, 6...) and the creatures of a typical group. */
function realFight(bossId: string, rowSize = 9): { events: FightEvent[]; ids: string[] } {
  const species = content.creatures.filter((c) => c.stage === 1);
  const row: FightSlot[] = Array.from({ length: rowSize }, (_, k) =>
    makeSlot(species[k % species.length] as (typeof species)[number], {
      id: `c${String(k)}`,
      ownerId: `p${String(k % 3)}`,
      level: RULES.abilities.unlockLevel,
      fusionCount: 0,
    }),
  );
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error('no boss');
  const scaled = scaleBoss(boss, 3, 3);
  const input: FightInput = {
    boss,
    bossAtk: scaled.atk,
    phase: 'finale',
    bossHpPool: { max: scaled.maxHp * 1000, current: scaled.maxHp * 1000 },
    adaptation: null,
    row,
    players: ['p0', 'p1', 'p2'],
    finaleAbilities: [{ playerId: 'p1', abilityId: 'rally', key: 'p1:basic', fireAtRound: 2 }],
    luck: RULES.combat.luck,
  };
  const { events } = simulateFight(input, createSeededRng('fx-' + bossId));
  return { events, ids: row.map((s) => s.id) };
}

describe('a round on the stage plays as long as the server gives it', () => {
  it('has the engine staggers, intro and wind-ups in its beats', () => {
    const { events, ids } = realFight('tidal-colossus');
    const beats = buildBeats(events, 0, ids, 'tidal-colossus');
    const first = beats.find((b) => b.introMs > 0);
    expect(first?.introMs).toBe(INTRO_LIVE_MS);
    // Staggers are 500 to 700 ms, plus the 600 ms wind-up of a boss action (the last beat of a round has the tail).
    const windups = beats.filter((b) => b.windupMs > 0);
    expect(windups.length).toBeGreaterThan(10);
    expect(windups.every((b) => b.windupMs === WINDUP_MS && b.windup.length > 0)).toBe(true);
    expect(beats.filter((b) => b.windupMs === 0).every((b) => b.windup.length === 0)).toBe(true);
  });

  it('is exactly the length of the server round: intro plus every stagger, clamped like the engine does', () => {
    for (const [boss, size] of [
      ['tidal-colossus', 9],
      ['storm-sovereign', 9],
      ['thornmother', 24],
      ['cinder-wyrm', 45],
    ] as const) {
      const { events, ids } = realFight(boss, size);
      const rounds = [...new Set(events.map((e) => e.round))].filter((r) => r > 0);
      expect(rounds.length).toBeGreaterThan(3);
      for (const round of rounds) {
        const slice = events.filter((e) => e.round === round);
        const from = events.indexOf(slice[0] as FightEvent);
        const beats = buildBeats(events.slice(0, from + slice.length), from, ids, boss);
        const played = beats.reduce((sum, b) => sum + b.introMs + b.ms, 0);
        const server = roundPlaybackMs(slice);
        // The beats play out the whole server round (a short round is padded up to 6 s, which is idle time).
        expect(Math.max(MIN_ROUND_MS, played), `${boss} round ${String(round)}`).toBe(server);
        expect(server).toBeLessThanOrEqual(MAX_ROUND_MS);
      }
    }
  });

  it('leaves 2 s after the last effect appears and no idle wait beyond it', () => {
    const { events, ids } = realFight('tidal-colossus');
    const from = events.findIndex((e) => e.t === 'round_start' && e.round === 4);
    const to = events.findIndex((e) => e.t === 'round_start' && e.round === 5);
    const beats = buildBeats(events.slice(0, to), from, ids, 'tidal-colossus');
    const last = beats.findLast((b) => b.cues.length > 0);
    expect(last).toBeDefined();
    // From the moment its effects land, the tail is what is left of its stagger.
    expect((last?.ms ?? 0) - (last?.windupMs ?? 0)).toBe(TAIL_MS);
    // The beats after it (the round's end) only change state, and take no time of their own.
    const after = beats.slice(beats.indexOf(last as (typeof beats)[number]) + 1);
    expect(after.every((b) => b.ms === 0 && b.cues.length === 0)).toBe(true);
  });

  it('plays the live timeline in exactly the server round: intro, wind-ups, landings and the 2 s tail', () => {
    for (const boss of ['tidal-colossus', 'storm-sovereign', 'thornmother', 'cinder-wyrm']) {
      const { events, ids } = realFight(boss, 12);
      const rounds = [...new Set(events.map((e) => e.round))].filter((r) => r > 0);
      for (const round of rounds) {
        const slice = events.filter((e) => e.round === round);
        const from = events.indexOf(slice[0] as FightEvent);
        const beats = buildBeats(events.slice(0, from + slice.length), from, ids, boss);
        const { steps, endsAt } = liveTimeline(beats);
        const server = roundPlaybackMs(slice);
        expect(Math.max(MIN_ROUND_MS, endsAt), `${boss} round ${String(round)}`).toBe(server);
        // It opens with the intro, in order, and nothing is scheduled after the end.
        expect(steps[0]).toEqual({ at: 0, kind: 'intro', beat: 0 });
        expect(steps[1]).toEqual({ at: INTRO_LIVE_MS, kind: 'intro-end', beat: 0 });
        expect(steps.every((st, k) => k === 0 || st.at >= (steps[k - 1] as typeof st).at)).toBe(
          true,
        );
        expect(steps.at(-1)?.at).toBeLessThanOrEqual(endsAt);
        // Every wind-up lands 600 ms after it starts; the last effect appears 2 s before the end.
        for (const st of steps.filter((x) => x.kind === 'windup')) {
          const land = steps.find((x) => x.kind === 'land' && x.beat === st.beat);
          expect((land?.at ?? 0) - st.at).toBe(WINDUP_MS);
        }
        const lastLand = steps.findLast(
          (x) => x.kind === 'land' && (beats[x.beat] as (typeof beats)[number]).cues.length > 0,
        );
        expect(endsAt - (lastLand?.at ?? 0)).toBe(TAIL_MS);
      }
    }
  });

  it('has the intro only when the round opens, and none for a stage that joins mid-round', () => {
    const { events, ids } = realFight('tidal-colossus', 9);
    const from = events.findIndex((e) => e.t === 'round_start' && e.round === 3);
    const to = events.findIndex((e) => e.t === 'round_start' && e.round === 4);
    const midway = buildBeats(events.slice(0, to), from + 3, ids, 'tidal-colossus');
    expect(midway[0]?.introMs).toBe(0);
    expect(liveTimeline(midway).steps.some((st) => st.kind === 'intro')).toBe(false);
    expect(liveTimeline([]).endsAt).toBe(0);
  });
});
