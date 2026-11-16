/**
 * A stage played on the raid canvas's scene (docs/design/combat/raid-screen.md, sections 4 and 6.5), from the three places one comes from:
 *
 * - a stage playing out as it happens (`useStageFeed`: the replay route serves the rounds up to now; the next fetch is at `nextRoundAt`,
 *   one per round, never a poll), joined at the current round;
 * - a played stage watched from the Weekend drawer (one fetch of the whole stage);
 * - the live finale (its snapshots, `useLiveFinaleV2`).
 *
 * `ScenePlayer` draws all three with `StageV2`'s own pieces (`canvas` mode) at the finale's pace (`REPLAY_PACE`), with the boss move
 * animations, and reports the fight log so far to the Log drawer. Names are text only.
 */
import type { FightEvent } from '@creatures/engine/v2';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { bossAnimSetup } from '../boss-anim/setup';
import { foldSetupOf, stageModelOf } from '../fight-v2';
import {
  fetchReplayV2,
  type FightBossV2,
  type FightCreatureV2,
  type FightNamesV2,
  type LiveSnapshotV2,
  type ReplayViewV2,
} from '../fight-v2-api';
import { INTRO_LIVE_MS, REPLAY_PACE, roundBudgetMs } from '../playback-v2';
import type { BossCardV2 } from '../raid-v2-api';
import { StageV2 } from '../StageV2';
import { usePlaybackV2 } from '../use-playback-v2';
import { nextFetchIn, replayPhaseOfStage, type Playing } from './playing';

/** What the scene needs to play a stage, from whichever place it comes. */
export interface PlayData {
  /** A key that changes when another stage starts (the player starts over). */
  id: string;
  boss: FightBossV2;
  card: BossCardV2;
  fighters: FightCreatureV2[];
  names: FightNamesV2;
  you: string | null;
  events: readonly FightEvent[];
  rounds: number;
  hpMax: number;
  hpStart: number;
  /** `replay` starts at the beginning; `live` starts at what is there and plays what arrives, a round at a time. */
  mode: 'replay' | 'live';
  /** The live round's length (the server's clock), for the pace of a `live` stage. */
  roundMs: number;
  place: string;
}

/** A stored or partly stored stage as scene data. `live` is a stage still playing out (its rounds arrive one at a time). */
export function playDataOfReplay(data: ReplayViewV2, live: boolean, roundMs: number): PlayData {
  return {
    id: `${data.weekId}:${String(data.party)}:${data.phase}`,
    boss: data.boss,
    card: data.card,
    fighters: data.fighters,
    names: data.names,
    you: data.you,
    events: data.events,
    rounds: data.boss.rounds,
    hpMax: data.bossHpMax,
    hpStart: data.bossHpStart,
    mode: live ? 'live' : 'replay',
    roundMs,
    place: data.phase,
  };
}

/** The live finale's snapshot as scene data; null in the lobby and while the snapshot lacks the fight. */
export function playDataOfFinale(snapshot: LiveSnapshotV2): PlayData | null {
  const { boss, bossDef, card, names } = snapshot;
  if (
    snapshot.status === 'lobby' ||
    snapshot.status === 'none' ||
    boss === null ||
    bossDef === null ||
    card === null ||
    names === null ||
    boss.hpStart === null ||
    boss.hpMax === null
  ) {
    return null;
  }
  return {
    id: `${snapshot.week}:${String(snapshot.party ?? 0)}:finale`,
    boss: bossDef,
    card,
    fighters: snapshot.fighters,
    names,
    you: snapshot.you,
    events: snapshot.events,
    rounds: snapshot.rounds,
    hpMax: boss.hpMax,
    hpStart: boss.hpStart,
    mode: 'live',
    roundMs: snapshot.roundMs,
    place: 'Finale',
  };
}

/**
 * The replay of the stage that plays out now, fetched once, then again at each `nextRoundAt` until the window ends. Without a playing
 * stage nothing is fetched (and the data is dropped). A failed fetch is tried again at the next round.
 */
export function useStageFeed(args: {
  playing: Playing | null;
  week: string;
  party: number | null;
  fetcher?: typeof fetchReplayV2;
  clock?: () => number;
}): ReplayViewV2 | null {
  const { playing, week, party } = args;
  const [data, setData] = useState<ReplayViewV2 | null>(null);
  const key =
    playing === null || party === null ? null : `${week}:${String(party)}:${String(playing.stage)}`;
  useEffect(() => {
    if (playing === null || party === null) {
      setData(null);
      return undefined;
    }
    const fetcher = args.fetcher ?? fetchReplayV2;
    const clock = args.clock ?? Date.now;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let next: Playing = playing;
    const load = (): void => {
      fetcher(week, party, replayPhaseOfStage(playing.stage)).then(
        (replay) => {
          if (cancelled) return;
          setData(replay);
          const hint = (replay as { playing?: { nextRoundAt?: unknown } }).playing?.nextRoundAt;
          if (typeof hint === 'number' || hint === null) next = { ...next, nextRoundAt: hint };
          schedule();
        },
        () => {
          if (!cancelled) schedule();
        },
      );
    };
    const schedule = (): void => {
      const wait = nextFetchIn(next, clock());
      if (wait === null || cancelled) return;
      timer = setTimeout(load, wait);
    };
    load();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [key]);
  return data;
}

/** One stage fetched in full, for a Watch from the Weekend drawer (null while loading or without a request). */
export function useWatchedStage(request: { week: string; party: number; phase: string } | null): {
  data: ReplayViewV2 | null;
  failed: boolean;
} {
  const [state, setState] = useState<{ data: ReplayViewV2 | null; failed: boolean }>({
    data: null,
    failed: false,
  });
  const key = request === null ? null : `${request.week}:${String(request.party)}:${request.phase}`;
  useEffect(() => {
    if (request === null) {
      setState({ data: null, failed: false });
      return undefined;
    }
    let cancelled = false;
    setState({ data: null, failed: false });
    fetchReplayV2(
      request.week,
      request.party,
      request.phase as 'stage1' | 'stage2' | 'finale',
    ).then(
      (data) => {
        if (!cancelled) setState({ data, failed: false });
      },
      () => {
        if (!cancelled) setState({ data: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

/** The scene's stage: `StageV2` in canvas mode, played at the finale's pace. `children` sit under the board (the finale's own button). */
export function ScenePlayer({
  data,
  onLog,
  children,
}: {
  data: PlayData;
  /** The fight's text so far, as the beats have landed. */
  onLog?: (lines: string[]) => void;
  children?: ComponentChildren;
}) {
  const setup = useMemo(
    () => foldSetupOf({ fighters: data.fighters, card: data.card, bossHpStart: data.hpStart }),
    [data.fighters, data.card, data.hpStart],
  );
  const model = useMemo(() => stageModelOf(setup, data.events), [setup, data.events]);
  const bossAnim = useMemo(
    () => bossAnimSetup(data.boss, data.card, data.fighters),
    [data.boss, data.card, data.fighters],
  );
  const pace =
    data.mode === 'replay'
      ? REPLAY_PACE
      : { introMs: INTRO_LIVE_MS, budgetMs: roundBudgetMs(data.roundMs, INTRO_LIVE_MS) };
  const playback = usePlaybackV2({
    model,
    events: data.events,
    rounds: data.rounds,
    speed: 1,
    ...pace,
    mode: data.mode,
    bossAnim,
  });
  const shown = playback.beat === 0 ? 0 : (model.beats[playback.beat - 1]?.to ?? 0);
  useEffect(() => {
    if (onLog === undefined) return;
    onLog(data.events.slice(0, shown).flatMap((event) => (event.text === '' ? [] : [event.text])));
  }, [shown, data.events]);
  return (
    <StageV2
      canvas
      boss={data.boss}
      card={data.card}
      fighters={data.fighters}
      names={data.names}
      you={data.you}
      model={model}
      playback={playback}
      place={data.place}
      hpMax={data.hpMax}
      rounds={data.rounds}
    >
      {children}
    </StageV2>
  );
}
