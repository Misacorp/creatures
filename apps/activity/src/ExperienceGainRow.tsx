import { GlossaryTag } from './Glossary';
import type { XpChange } from './xp-change';
import { Tag } from './ui/Tag';
import { XpGain } from './ui/XpGain';

/**
 * A creature's experience as the one "XP gained" row every result screen shows (a Workshop job, a trip, a
 * dungeon run): the shared `XpGain` labelled "Experience", with the small tags only experience has (Gold
 * Ribbon, Waiting). Put it in an `XpList`. `who` names the creature when one list holds several (the
 * dungeon team, under the list's "Experience" caption): its small sprite and name are the label then.
 */
export function ExperienceGainRow({
  gain,
  who,
  note,
  home,
}: {
  gain: XpChange;
  who?: { name: string; species: string };
  /** What paid the gain, as one short line under the bar. */
  note?: string | null;
  /** The creature was sent home at a camp: it keeps what it earned. */
  home?: boolean;
}) {
  return (
    <XpGain
      change={gain}
      what="Experience"
      label={
        who === undefined ? <GlossaryTag entry="experience">Experience</GlossaryTag> : who.name
      }
      who={who}
      note={note}
      tags={
        <>
          {gain.gold && (
            <Tag kind="badge" tone="good" class="xp-tag">
              Gold Ribbon
            </Tag>
          )}
          {gain.waiting && (
            <Tag kind="badge" class="xp-tag">
              Waiting
            </Tag>
          )}
          {home === true && (
            <Tag kind="badge" class="xp-tag">
              Went home
            </Tag>
          )}
        </>
      }
    />
  );
}
