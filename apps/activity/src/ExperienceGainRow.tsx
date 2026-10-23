import type { ComponentChildren } from 'preact';
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
  home,
  extra,
}: {
  gain: XpChange;
  who?: { name: string; species: string };
  /** The creature was sent home at a camp: it keeps what it earned. */
  home?: boolean;
  /** More beside the name, after the tags (the Games' reasons for the gain). */
  extra?: ComponentChildren;
}) {
  return (
    <XpGain
      change={gain}
      what="Experience"
      label={
        who === undefined ? <GlossaryTag entry="experience">Experience</GlossaryTag> : who.name
      }
      who={who}
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
          {extra}
        </>
      }
    />
  );
}
