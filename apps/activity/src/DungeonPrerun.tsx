import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import { DepthProgress } from './DepthProgress';
import { DungeonMap } from './DungeonMap';
import { roomPanels } from './dungeon-rooms';
import { landmarkLine, streakLabel, streakPips } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { GameIcon } from './ui/GameIcon';
import { PixelHeading } from './ui/PixelHeading';
import { SkyLine } from './SkyLine';
import type { Forecast } from './weather-types';
import { StreakTrack } from './ui/StreakTrack';

/**
 * The daily dungeon card, down to the depth track: a header with the big "Daily Dungeon" title and
 * its "?" at the left and the streak (a row of days with a gift on the reward days; tap it for what
 * a streak is) at the right, or under the title on a phone, then today's map in preview (the same
 * for everyone on the server; tap a room to see what is there, nothing can be gone to yet; no caption
 * under it). An
 * older server sends no map: the three rooms then show as a comic strip of "?" panels with the day's
 * modifier icons. Then, at a landmark depth, the line that names the floor boss, and the depth
 * progress to the next landmark. `children` carry on inside the same card (the team and the Enter
 * button). The map shows only what the server already shows to everyone; no fight's dice are in it.
 */
export function DungeonPrerun({
  today,
  forecast = null,
  children,
}: {
  today: DungeonToday;
  /** The valley's sky: one line under the title (absent or null: none). */
  forecast?: Forecast | null;
  children?: ComponentChildren;
}) {
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
      <SkyLine forecast={forecast} />
      {today.map != null ? (
        <div class="dungeon-preview">
          <DungeonMap map={today.map} state={null} landmark={today.landmark} depth={today.depth} />
        </div>
      ) : (
        <RoomStripPreview modifiers={today.modifiers} />
      )}
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

/**
 * The pre-run strip of an older server that sends no map: the three rooms as "?" panels with the
 * day's modifier icon on each.
 */
function RoomStripPreview({ modifiers }: { modifiers: DungeonToday['modifiers'] }) {
  const panels = roomPanels(modifiers);
  return (
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
  );
}
