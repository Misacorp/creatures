import { cssVars } from '../css-vars';
import { HP_SEGMENTS, hpSegments } from '../stage';

const UNIT_SEGMENTS = 5;

interface SegmentBarProps {
  current: number;
  max: number;
  /**
   * `boss`: twenty red segments, named for assistive technology. `unit`: five green segments under
   * a creature, decoration only (the creature's HP is in its spoken label).
   */
  size: 'boss' | 'unit';
  /** The HP before the beat that is playing, so the segments that just emptied can blink. */
  previous?: number;
  /** Names a boss bar for screen readers. Not used by a unit bar. */
  label?: string;
  /**
   * Words drawn over a boss bar ("62 / 337"), the way `XpBar` writes over its fill: bone letters with
   * an ink outline, so they read on the red segments and on the dark gaps. Decoration: the label
   * already says the numbers.
   */
  text?: string;
  /**
   * A boss bar only (a combat v2 weekend): a tick at each of these shares of the bar (0 to 1 from the left, where the HP
   * stands when a stage's goal is met), so the bar shows the weekend's stages. Decoration: the card says "Stage 2 of 3".
   */
  ticks?: readonly number[];
  /**
   * A boss bar only: last week's best, as the HP that was left then (0 to 1 of the bar). The segments between where the HP stands now
   * and that level show as a dim ghost fill, so a returning boss shows how far the last try got. Absent: none.
   */
  ghost?: number;
}

/** A stepped HP bar. Any HP keeps a segment lit and only full HP lights them all (`hpSegments`). */
export function SegmentBar({
  current,
  max,
  size,
  previous,
  label,
  text,
  ticks,
  ghost,
}: SegmentBarProps) {
  const total = size === 'boss' ? HP_SEGMENTS : UNIT_SEGMENTS;
  const lit = hpSegments(current, max, total);
  const was = previous === undefined ? lit : hpSegments(previous, max, total);
  // The ghost: the segments last week's best still had (up to its HP level) that this week's HP has already lost.
  const ghostLit = ghost === undefined ? 0 : hpSegments(Math.round(ghost * max), max, total);
  const segments = Array.from({ length: total }, (_, k) => (
    <i
      key={k}
      class={k < lit ? undefined : k < was ? 'gone drain' : k < ghostLit ? 'gone ghost' : 'gone'}
    />
  ));
  if (size === 'unit') {
    return (
      <span class="unit-hp" aria-hidden="true">
        {segments}
      </span>
    );
  }
  return (
    <div class="hpbar" role="img" aria-label={label}>
      {segments}
      {ticks?.map((at) => (
        <b
          key={at}
          class="hpbar-tick"
          ref={cssVars({ '--at': `${(at * 100).toFixed(2)}%` })}
          aria-hidden="true"
        />
      ))}
      {text !== undefined && (
        <span class="xpbar-text hpbar-text pix" aria-hidden="true">
          {text}
        </span>
      )}
    </div>
  );
}

interface BossHpProps {
  /** What the numbers are of ("Boss HP this week", "Ashen Wyrm HP"). */
  caption: string;
  current: number;
  max: number;
  previous?: number;
}

/** The boss's HP bar with the same numbers written out under it (the bar is a picture). */
export function BossHp({ caption, current, max, previous }: BossHpProps) {
  return (
    <>
      <SegmentBar
        size="boss"
        current={current}
        max={max}
        {...(previous === undefined ? {} : { previous })}
        label={`${caption}: ${String(current)} / ${String(max)}`}
      />
      <p class="muted small">
        {`${caption}: `}
        {current} / {max}
      </p>
    </>
  );
}
