import { GLOSSARY_IDS } from '@creatures/game';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { ProgressTrack } from './ProgressTrack';
import { depthTrack, roomPanels } from './dungeon-rooms';
import { streakPips } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { Sprite } from './sprites/Sprite';
import { GameIcon } from './ui/GameIcon';

/**
 * A tiny row of pips for the streak (a cycle of days, lit up to today's count). On the pre-run screen
 * it is a tag that opens the Streak entry; the end report writes the streak out in full next to a
 * plain row (`plain`).
 */
export function StreakPips({ streak, plain = false }: { streak: number; plain?: boolean }) {
  const pips = streakPips(streak);
  const lit = pips.filter((p) => p.on).length;
  const label = `Streak: ${String(lit)} of ${String(pips.length)} days of the cycle`;
  const row = (
    <span class="pips" aria-hidden="true">
      {pips.map((p) => (
        <i key={p.day} class={`${p.on ? 'on' : ''}${p.bonus ? ' fest' : ''}`.trim()} />
      ))}
    </span>
  );
  if (plain) {
    return (
      <span role="img" aria-label={label}>
        {row}
      </span>
    );
  }
  return (
    <GlossaryTag entry="streak" look="chip" class="pips-tag" label={label}>
      {row}
    </GlossaryTag>
  );
}

/**
 * The top of the pre-run screen: the three rooms as a comic strip (room 1, room 2 and the boss), each
 * a "?" until the run, with the day's modifier on it as an icon (tap it for what it does), then the
 * landmark depths as a progress track. The foes are the server's secret until the run; nothing here
 * says more than the server already shows to everyone.
 */
export function DungeonPrerun({ today }: { today: DungeonToday }) {
  const panels = roomPanels(today.modifiers);
  const track = depthTrack(today.depth);
  return (
    <section class="raid-section dungeon-prerun" aria-labelledby="dungeon-heading">
      <h3 id="dungeon-heading">
        <GlossaryTag entry="dungeon">Daily dungeon</GlossaryTag>
      </h3>
      <p class="dungeon-depth">
        <GlossaryTag entry="depth" look="chip" class="chip dungeon-depth-chip">
          <span class="chip-text">Depth {today.depth}</span>
        </GlossaryTag>
        {today.landmark && (
          <GlossaryTag entry="landmark" look="chip" class="chip dungeon-landmark-chip">
            <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
            <span class="chip-text">Landmark</span>
          </GlossaryTag>
        )}
        <StreakPips streak={today.streak} />
      </p>
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
      <ProgressTrack steps={track.steps} current={track.current} label="Landmark depths" />
    </section>
  );
}
