import type { PartnerCue } from '../reaction-partners';
import { Sprite } from '../sprites/Sprite';
import { elementIcon } from '../sprites/element-icons';

/**
 * The reaction-partner badge (look A): the mark's element icon, or icons (the same 8 x 8 icons as the mark strip's chips, each element a
 * different shape, so colour is never the only cue) on a dark plate. A partner has a gold edge, the creature in hand a bone one. It does
 * not move, so reduced motion needs nothing. The parent says where it sits (`partner.css`); the creature's own spoken name carries the
 * words (`partnerWords`).
 */
export function PartnerBadge({ cue }: { cue: PartnerCue }) {
  if (cue.look !== 'badge') return null;
  return (
    <span class={`partner-badge ${cue.who}`} aria-hidden="true">
      {cue.marks.map((mark) => {
        const icon = elementIcon(mark);
        return icon === undefined ? null : <Sprite key={mark} sprite={icon} scale={2} />;
      })}
    </span>
  );
}

/** The glow (look B): a soft inner wash in the first mark's colour over a partner; the touched creature has none. */
export function PartnerGlow({ cue }: { cue: PartnerCue }) {
  if (cue.look !== 'glow' || cue.who !== 'partner') return null;
  return <span class="partner-glow-fill" aria-hidden="true" data-audit-clip />;
}
