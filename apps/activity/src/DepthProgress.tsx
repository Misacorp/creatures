import { ProgressTrack } from './ProgressTrack';
import { depthTrack } from './dungeon-rooms';

/**
 * Where the player is on the dungeon's depth ladder: the depth now, the next landmark and a pip for
 * each depth between them, across the whole width. "Depth N" opens the Dungeon depth entry. It is on
 * the pre-run screen and, with the depth after the run, in the end report.
 */
export function DepthProgress({ depth }: { depth: number }) {
  const track = depthTrack(depth);
  return (
    <ProgressTrack
      steps={track.steps}
      current={track.current}
      label="Depth, and the next landmark"
      edge
      between={track.between}
      labelEntry="depth"
    />
  );
}
