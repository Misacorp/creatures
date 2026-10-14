import type { Speed } from '../replay';
import { ToggleButton } from './ToggleButton';

interface PlaybackControlsProps {
  /** The name of the group, for assistive technology ("Replay controls"). */
  label: string;
  playing: boolean;
  /** At the end: the play button says "Replay" and starts again. */
  finished?: boolean;
  speed: Speed;
  onPlayPause: () => void;
  onSpeed: (speed: Speed) => void;
  onSkip: () => void;
  skipLabel: string;
  skipDisabled?: boolean;
}

/**
 * Play or pause, 2x speed and skip, for the raid replay and the dungeon playback. The play button
 * names the action it does (Play, Pause or Replay), so it is a plain button; only 2x is a toggle.
 */
export function PlaybackControls(props: PlaybackControlsProps) {
  const { playing, finished = false, speed } = props;
  return (
    <div class="controls button-row" role="group" aria-label={props.label}>
      <button type="button" class="primary" onClick={props.onPlayPause}>
        {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
      </button>
      <ToggleButton
        pressed={speed === 2}
        onToggle={() => {
          props.onSpeed(speed === 2 ? 1 : 2);
        }}
      >
        2×
      </ToggleButton>
      <button type="button" disabled={props.skipDisabled === true} onClick={props.onSkip}>
        {props.skipLabel}
      </button>
    </div>
  );
}
