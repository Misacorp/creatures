import { GLOSSARY_IDS } from '@creatures/game';
import { GlossaryTag } from './Glossary';
import { DepthProgress } from './DepthProgress';
import { roomPanels } from './dungeon-rooms';
import type { DungeonToday } from './dungeon-types';
import { GameIcon } from './ui/GameIcon';

/**
 * The top of the pre-run screen: the three rooms as a comic strip (room 1, room 2 and the boss), each
 * a "?" until the run, with the day's modifier on it as an icon (tap it for what it does), then the
 * depth progress to the next landmark. The foes are the server's secret until the run; nothing here
 * says more than the server already shows to everyone.
 */
export function DungeonPrerun({ today }: { today: DungeonToday }) {
  const panels = roomPanels(today.modifiers);
  return (
    <section class="raid-section dungeon-prerun" aria-labelledby="dungeon-heading">
      <h3 id="dungeon-heading">
        <GlossaryTag entry="dungeon">Daily dungeon</GlossaryTag>
      </h3>
      <ol class="room-strip prerun" aria-label="Today's rooms, first to last">
        {panels.map((panel) => (
          <li key={panel.room} class="room-panel unknown">
            <span class="rp-title pix">{panel.title}</span>
            <span class="rp-art" role="img" aria-label={`${panel.title}: not known yet`}>
              <span class="rp-unknown pix" aria-hidden="true">
                ?
              </span>
            </span>
            {panel.modifier !== null && (
              <>
                <GlossaryTag
                  entry={GLOSSARY_IDS.modifier(panel.modifier.id)}
                  look="chip"
                  bare
                  class="mod-icon"
                  label={`${panel.modifier.name}: ${panel.modifier.description}`}
                >
                  <GameIcon icon={panel.modifier.icon} scale={3} />
                </GlossaryTag>
                <span class="rp-mod" aria-hidden="true">
                  {panel.modifier.name}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      <DepthProgress depth={today.depth} />
    </section>
  );
}
