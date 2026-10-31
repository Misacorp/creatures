import { FindRow } from './FindRow';
import { GearTagBadge, ItemFrame, ItemSprite, SetTag, SlotTag } from '../GearArt';
import { gearBase } from '@creatures/game';
import { gearName, qualityText } from '../gear-view';
import { GlossaryTag } from '../Glossary';
import { Tag } from './Tag';

/**
 * A blueprint that was found, as the same row a gear piece has (`FindRow`): the item's own picture in a
 * plain frame (it does not exist yet, so no rarity colour and no level), the name "Blueprint: Kelp Cap", and
 * tags: "Blueprint" (tap for what a blueprint is), whether it is new or already known, and the tags the
 * crafted item will have (its slot, its element or role, its set). Never a rarity: that is rolled when it
 * is crafted. A repeat find says what it added (a mark of quality, or scrap) after the tags.
 */
export function FindBlueprint({
  baseId,
  duplicate = false,
  marks,
  scale = 4,
  compact = false,
}: {
  baseId: string;
  /** The blueprint was already known. */
  duplicate?: boolean;
  /** A repeat find's quality after it (marks); leave out when the repeat became scrap. */
  marks?: number | undefined;
  scale?: number;
  /** The small form: the picture alone (`FindRow compact`). */
  compact?: boolean;
}) {
  const base = gearBase(baseId);
  const frame = (
    <ItemFrame rarity="common" class="blueprint">
      <ItemSprite baseId={baseId} scale={compact ? 3 : scale} />
    </ItemFrame>
  );
  return (
    <FindRow
      compact={compact}
      image={
        compact ? (
          // Small, the picture is the tap target: it opens what a blueprint is (it has no card of its own).
          <GlossaryTag
            entry="blueprint"
            look="chip"
            class="find-compact-help"
            label={`Blueprint: ${gearName(baseId)}. What is a blueprint?`}
          >
            {frame}
          </GlossaryTag>
        ) : (
          frame
        )
      }
      name={`Blueprint: ${gearName(baseId)}`}
      nameClass="blueprint-name"
      tags={
        <>
          <Tag kind="badge" entry="blueprint" class="item-badge pix">
            Blueprint
          </Tag>
          {duplicate ? (
            <Tag kind="badge" class="item-badge pix">
              Known
            </Tag>
          ) : (
            <Tag kind="badge" tone="good" class="item-badge pix">
              New!
            </Tag>
          )}
          {base !== undefined && <SlotTag slot={base.slot} />}
          <GearTagBadge baseId={baseId} />
          <SetTag baseId={baseId} />
        </>
      }
    >
      {duplicate && (
        <span class="muted find-row-note">
          {marks === undefined ? 'It became scrap.' : qualityText(marks)}
        </span>
      )}
    </FindRow>
  );
}
