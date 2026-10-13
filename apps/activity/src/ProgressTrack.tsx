import { glyphOrUnknown } from './glyphs';
import { ROLE_WORDS, trackNodes, type TrackStep } from './progress-track';
import { Sprite } from './sprites/Sprite';

/**
 * A horizontal rank or depth timeline: the previous step (dimmed), the current one (lit) and the
 * next one, each with what it unlocks. Nothing past the next step is shown; at the last step a
 * "Max" node closes the track. It is information, not a control: a list, no focus stops, and the
 * hidden role words ("Previous", "Current", "Next") tell a screen reader which node is which.
 *
 * `steps` is the whole ladder in order, `current` the index of the step the player is on. The
 * unlock icons are glyph ids (`glyphs.ts`). `label` names the track for screen readers.
 */
export function ProgressTrack({
  steps,
  current,
  label,
}: {
  steps: readonly TrackStep[];
  current: number;
  label: string;
}) {
  const nodes = trackNodes(steps, current);
  if (nodes.length === 0) return null;
  return (
    <ol class="ptrack" aria-label={label}>
      {nodes.map((node) => (
        <li
          key={node.key}
          class={`ptrack-node ${node.role}`}
          aria-current={node.role === 'current' ? 'step' : undefined}
        >
          <span class="ptrack-dot" aria-hidden="true" />
          <span class="visually-hidden">{ROLE_WORDS[node.role]}: </span>
          <span class="ptrack-label pix">{node.label}</span>
          {node.role === 'max' ? null : node.unlocks.length === 0 ? (
            <span class="ptrack-none muted">Nothing new</span>
          ) : (
            <ul class="ptrack-unlocks">
              {node.unlocks.map((unlock) => (
                <li key={`${unlock.icon}:${unlock.text}`} class="ptrack-unlock">
                  <Sprite sprite={glyphOrUnknown(unlock.icon)} scale={2} />
                  <span>{unlock.text}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
