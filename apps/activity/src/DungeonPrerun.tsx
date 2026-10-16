import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import { DepthProgress } from './DepthProgress';
import { roomPanels } from './dungeon-rooms';
import { landmarkLine, streakLabel, streakPips } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { GameIcon } from './ui/GameIcon';
import { PixelHeading } from './ui/PixelHeading';
import { StreakTrack } from './ui/StreakTrack';

/**
 * The daily dungeon card, down to the depth track: a header with the big "Daily Dungeon" title and
 * its "?" at the left and the streak (a row of days with a gift on the reward days; tap it for what
 * a streak is) at the right, or under the title on a phone, then the three rooms as a comic strip
 * (room 1, room 2 and the boss), each a "?" until the run, with the day's modifier on it as an icon
 * (tap it for what it does), then, at a landmark depth, the line that names the room boss, then the
 * depth progress to the next landmark. `children` carry on
 * inside the same card (the team and the Enter button). The foes are the server's secret until the
 * run; nothing here says more than the server already shows to everyone.
 */
export function DungeonPrerun({
  today,
  children,
}: {
  today: DungeonToday;
  children?: ComponentChildren;
}) {
  const panels = roomPanels(today.modifiers);
  return (
    <section class="raid-section dungeon-card" aria-labelledby="dungeon-heading">
      <div class="dungeon-head">
        <div class="dungeon-title">
          <PixelHeading as="h3" outline="ink-drop" size="m" id="dungeon-heading">
            Daily Dungeon
          </PixelHeading>
          <GlossaryTag entry="dungeon" look="help" />
        </div>
        <GlossaryTag
          entry="streak"
          look="chip"
          bare
          class="streak-tag"
          label={`${streakLabel(today.streak)}. What is a streak?`}
        >
          <StreakTrack pips={streakPips(today.streak)} label={streakLabel(today.streak)} />
        </GlossaryTag>
      </div>
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
      {today.landmarkBoss != null && (
        <p class="landmark-note">
          <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
          <span>{landmarkLine(today.landmarkBoss)}</span>
        </p>
      )}
      <DepthProgress depth={today.depth} />
      {children}
    </section>
  );
}
