import type { ComponentChildren } from 'preact';
import { GlossaryTag } from './Glossary';
import type { ExperienceGain } from './xp-gain';
import { Tag } from './ui/Tag';
import { XpGain } from './ui/XpGain';

/**
 * A creature's experience as the one "XP gained" row every result screen shows (a Workshop job, a trip, a
 * dungeon run): the label "Experience", its levels (a level change when it went up), the green "+N" and
 * "Level up!", the small tags (Treat, Gold Ribbon, Waiting at this level), an optional note, and the bar.
 * Put it in an `XpList`. `who` names the creature when one list holds several (the dungeon team): the label
 * then reads "Sproutle · Experience".
 */
export function ExperienceGainRow({
  gain,
  who,
  note,
}: {
  gain: ExperienceGain;
  who?: string;
  note?: ComponentChildren;
}) {
  const leveledUp = gain.levels.to > gain.levels.from;
  const experience = <GlossaryTag entry="experience">Experience</GlossaryTag>;
  return (
    <XpGain
      label={
        who === undefined ? (
          experience
        ) : (
          <>
            {who} · {experience}
          </>
        )
      }
      levels={leveledUp ? gain.levels : undefined}
      gain={gain.gain}
      tags={
        <>
          {gain.treat && (
            <Tag kind="badge" entry="treat">
              Treat
            </Tag>
          )}
          {gain.gold && (
            <Tag kind="badge" tone="good">
              Gold Ribbon
            </Tag>
          )}
          {gain.waiting && <Tag kind="badge">Waiting at this level</Tag>}
        </>
      }
      note={note}
      bar={gain.bar}
    />
  );
}
