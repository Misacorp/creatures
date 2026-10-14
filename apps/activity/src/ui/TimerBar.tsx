import type { ComponentChildren } from 'preact';
import { Bar } from './Bar';

interface TimerBarProps {
  /** The leg being timed, and the server time now (all UTC epoch milliseconds). */
  startedAt: number;
  endsAt: number;
  now: number;
  /** Names the bar for screen readers ("Craft Wave Band: 40% done"). */
  label: string;
  /** The line under the bar: the time left, or what is ready. */
  state: ComponentChildren;
  /** Done: the bar is full and the line is gold. */
  ready?: boolean;
  tone?: 'gold' | 'spark' | undefined;
  /** Where the bar sits (its margins). */
  class?: string;
}

/** A bar that fills as a timer runs out, with its state line under it. */
export function TimerBar(props: TimerBarProps) {
  const { startedAt, endsAt, now, ready = false } = props;
  const total = endsAt - startedAt;
  const full = ready || total <= 0;
  return (
    <>
      <Bar
        value={full ? 1 : Math.min(total, Math.max(0, now - startedAt))}
        max={full ? 1 : total}
        label={props.label}
        tone={props.tone}
        smooth
        class={props.class}
      />
      <p class={ready ? 'timer-state ready' : 'timer-state'} aria-live="off">
        {props.state}
      </p>
    </>
  );
}
