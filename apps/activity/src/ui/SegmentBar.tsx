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
}

/** A stepped HP bar. Any HP keeps a segment lit and only full HP lights them all (`hpSegments`). */
export function SegmentBar({ current, max, size, previous, label, text }: SegmentBarProps) {
  const total = size === 'boss' ? HP_SEGMENTS : UNIT_SEGMENTS;
  const lit = hpSegments(current, max, total);
  const was = previous === undefined ? lit : hpSegments(previous, max, total);
  const segments = Array.from({ length: total }, (_, k) => (
    <i key={k} class={k < lit ? undefined : k < was ? 'gone drain' : 'gone'} />
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
        label={`${caption}: ${String(current)} of ${String(max)}`}
      />
      <p class="muted small">
        {`${caption}: `}
        {current} / {max}
      </p>
    </>
  );
}
