import { describeEvent } from '@creatures/engine';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { errorText } from './game';
import { fetchReplay, type RaidPhaseId, type ReplayView } from './raid-api';
import { phaseName } from './raid-text';
import {
  beatEnds,
  indexAfterBeat,
  keyMoments,
  mineInRow,
  personalRecap,
  stateAt,
  turnOrderOfRound,
  type Speed,
} from './replay';
import { usePrefersReducedMotion } from './hooks';
import { buildBeats, cuesForEvents } from './stage';
import { INTRO_REPLAY_MS, staticFx, type IntroView } from './stage-fx';
import { LogToggle, Stage, type Anim } from './Stage';
import { useFxTrail } from './use-fx-trail';

export function Replay({
  weekId,
  party,
  phase,
  onClose,
}: {
  weekId: string;
  party: number;
  phase: RaidPhaseId;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReplayView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReplay(weekId, party, phase).then(
      (next) => {
        if (!cancelled) setData(next);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [weekId, party, phase]);

  return (
    <section class="raid-section" aria-labelledby="replay-heading">
      <h3 id="replay-heading">Replay: {phaseName(phase)}</h3>
      <p>
        <button type="button" onClick={onClose}>
          Back to the raid
        </button>
      </p>
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {data === null && error === null && <p class="muted">Loading the replay...</p>}
      {data !== null && <Player data={data} />}
    </section>
  );
}

/** Where the player is: the step number, the one before it and a counter that grows with every move. */
interface Position {
  beat: number;
  prev: number;
  seq: number;
}

function Player({ data }: { data: ReplayView }) {
  const ends = beatEnds(data.events);
  const total = ends.length;
  const rowIds = data.row.map((r) => r.id);
  const [pos, setPos] = useState<Position>({ beat: 0, prev: 0, seq: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  // The same pacing as the live finale (the engine's), with a 1 second intro; 2x halves all of it.
  const beats = useMemo(
    () => buildBeats(data.events, 0, rowIds, data.boss.id, { introMs: INTRO_REPLAY_MS, speed }),
    [data, speed],
  );
  const [intro, setIntro] = useState<IntroView | null>(null);
  const reduced = usePrefersReducedMotion();
  const trail = useFxTrail();
  const logRef = useRef<HTMLOListElement>(null);
  const { beat } = pos;

  const move = (to: number): void => {
    setPos((p) => ({ beat: to, prev: p.beat, seq: p.seq + 1 }));
  };

  // Advance one step at a time while playing, on the same timeline the live stage runs. After the
  // previous step lands, the rest of its stagger passes (for the last step of a round that is the 2
  // second tail), then a step that opens a round shows "Round N" for a moment (1 s, 0.5 s at 2x),
  // and a boss action is telegraphed for 600 ms (300 ms at 2x) before it lands.
  useEffect(() => {
    if (!playing) return undefined;
    if (beat >= total) {
      setPlaying(false);
      return undefined;
    }
    const next = beats[beat];
    if (next === undefined) return undefined;
    const previous = beats[beat - 1];
    const lead = previous === undefined ? 0 : Math.max(0, previous.ms - previous.windupMs);
    const advance = (): void => {
      setPos((p) => ({ beat: p.beat + 1, prev: p.beat, seq: p.seq + 1 }));
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number): void => {
      timers.push(setTimeout(fn, ms));
    };
    const telegraph = (): void => {
      if (next.windupMs > 0) {
        if (!reduced) trail.push(next.windup, speed);
        later(advance, next.windupMs);
      } else {
        advance();
      }
    };
    later(() => {
      if (next.introMs === 0) {
        telegraph();
        return;
      }
      setIntro({ round: next.round, rounds: data.rounds, ms: next.introMs, key: pos.seq + 1 });
      later(() => {
        setIntro(null);
        telegraph();
      }, next.introMs);
    }, lead);
    return () => {
      for (const t of timers) clearTimeout(t);
      setIntro(null);
    };
  }, [playing, beat, speed, total, reduced]);

  // Keep the newest log line in view (when the log is open).
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [beat]);

  const index = indexAfterBeat(ends, beat);
  const step = stateAt(data.events, index, data.bossHpStart);
  const finished = beat >= total;
  const rowById = new Map(data.row.map((r) => [r.id, r]));
  const mineIds = new Set(mineInRow(data.row, data.you));
  const order = turnOrderOfRound(data.events, Math.max(1, step.round));
  const moments = keyMoments(data.events, data.names);
  const recap = personalRecap(data.events, data.row, [...mineIds]);
  // Only a single step forward is animated; a skip or a restart just shows the new state.
  const stepBeat = beats[beat - 1];
  const anim: Anim | null =
    beat >= 1 && beat === pos.prev + 1 && stepBeat !== undefined
      ? {
          from: indexAfterBeat(ends, pos.prev),
          to: index,
          ms: stepBeat.ms,
          seq: pos.seq,
        }
      : null;

  // The effects of a step stay for their own time (the same at every speed but 2x, which is about
  // 30% shorter) and overlap the next steps. A skip or a restart drops them. With reduced motion the
  // newest step's effects are shown still.
  useEffect(() => {
    if (anim === null) {
      trail.clear();
      return;
    }
    if (!reduced) {
      trail.push(cuesForEvents(data.events, anim.from, anim.to, rowIds, data.boss.id), speed);
    }
  }, [pos.seq]);
  const fx = reduced
    ? anim === null
      ? []
      : staticFx(cuesForEvents(data.events, anim.from, anim.to, rowIds, data.boss.id))
    : trail.items;

  return (
    <>
      <p>
        {data.boss.name}: {data.cleared ? 'cleared' : 'not cleared'} after {data.rounds} rounds.
        {step.round > 0 && (
          <>
            {' '}
            Round {step.round} of {data.rounds}.
          </>
        )}
      </p>

      <div class="controls button-row" role="group" aria-label="Replay controls">
        <button
          type="button"
          class="primary"
          onClick={() => {
            if (finished) move(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        </button>
        <button
          type="button"
          aria-pressed={speed === 2}
          class={speed === 2 ? 'toggle on' : 'toggle'}
          onClick={() => {
            setSpeed(speed === 2 ? 1 : 2);
          }}
        >
          2×
        </button>
        <button
          type="button"
          disabled={finished}
          onClick={() => {
            setPlaying(false);
            move(total);
          }}
        >
          Skip to end
        </button>
      </div>

      <Stage
        boss={data.boss}
        hpMax={data.bossHpMax}
        hpStart={data.bossHpStart}
        rounds={data.rounds}
        row={data.row}
        mineIds={mineIds}
        names={data.names}
        events={data.events}
        index={index}
        anim={anim}
        fx={fx}
        intro={intro}
      />

      <h4>Turn order {step.bossActing && <span class="muted">(the boss is acting)</span>}</h4>
      <ol class="turn-strip" aria-label="Turn order this round">
        {order.map((id) => {
          const c = rowById.get(id);
          const classes = ['turn-chip'];
          if (step.actor === id) classes.push('current');
          else if (step.acted.includes(id)) classes.push('done');
          if (step.knockedOut.includes(id)) classes.push('ko');
          return (
            <li
              key={id}
              class={classes.join(' ')}
              aria-current={step.actor === id ? 'step' : undefined}
            >
              {c?.name ?? id}
            </li>
          );
        })}
      </ol>

      <LogToggle id="replay-log">
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {data.events.slice(0, index).map((event, i) => (
            <li key={i}>{describeEvent(event, data.names)}</li>
          ))}
        </ol>
      </LogToggle>

      <h4>Key moments</h4>
      {moments.length === 0 ? (
        <p class="muted">Nothing stood out.</p>
      ) : (
        <ol class="plain-list">
          {moments.map((m, i) => (
            <li key={i}>
              <strong>{m.title}</strong> (round {m.round}): {m.text}
            </li>
          ))}
        </ol>
      )}

      <h4>Your recap</h4>
      {recap.creatures.length > 0 && (
        <ul class="plain-list">
          {recap.creatures.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>: {c.damage} damage, {c.setupCredit} setup credit, {c.setups}{' '}
              reaction{c.setups === 1 ? '' : 's'} set up
            </li>
          ))}
        </ul>
      )}
      {recap.notes.map((note, i) => (
        <p key={i}>{note}</p>
      ))}
    </>
  );
}
