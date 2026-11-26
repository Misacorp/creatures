import { PartnerBadge, PartnerGlow } from '../../ui/PartnerBadge';
import type { PartnerCue } from '../../reaction-partners';
import { str } from '../props';
import type { Entry } from '../types';

/** One badge or glow on a stand-in tile, so the part can be seen alone (on the canvases it sits on a seat, a tray creature or a figure). */
const partnerBadge: Entry = {
  name: 'PartnerBadge',
  file: 'apps/activity/src/ui/PartnerBadge.tsx',
  group: 'Creatures & game pieces',
  description:
    "The reaction-partner highlight's parts: the badge (look A, a review variant), the mark's element icon or icons on a dark plate with a gold edge for a partner and a bone one for the creature touched; and the glow (look B), a soft inner wash in the mark's colour. Look C (the others dim) has no part of its own. The canvases (RaidCanvas, CaveCanvas) show all three on seats, in the tray and on the Cave's figures.",
  covers: ['PartnerGlow'],
  controls: {
    who: { kind: 'select', options: ['partner', 'touched'] },
    marks: { kind: 'select', options: ['one mark', 'two marks'] },
    look: { kind: 'select', options: ['badge', 'glow'] },
  },
  defaults: { who: 'partner', marks: 'one mark', look: 'badge' },
  presets: [
    { name: 'A partner, one mark', props: {} },
    { name: 'A partner, two marks', props: { marks: 'two marks' } },
    { name: 'The creature touched', props: { who: 'touched', marks: 'two marks' } },
    { name: 'The glow', props: { look: 'glow' } },
  ],
  render: (p) => {
    const cue: PartnerCue = {
      who: str(p, 'who') === 'touched' ? 'touched' : 'partner',
      marks: str(p, 'marks') === 'two marks' ? ['ember', 'grove'] : ['grove'],
      look: str(p, 'look') === 'glow' ? 'glow' : 'badge',
    };
    return (
      <div
        class="party-slot cue-el-grove"
        style="position:relative;width:5rem;height:6rem;overflow:hidden"
      >
        <PartnerGlow cue={cue} />
        <PartnerBadge cue={cue} />
      </div>
    );
  },
};

export const partnerBadgeEntries: readonly Entry[] = [partnerBadge];
