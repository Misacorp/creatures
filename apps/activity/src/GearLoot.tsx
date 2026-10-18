import { Tag } from './ui/Tag';
import { GlossaryTag } from './Glossary';
import { PartCount } from './GearArt';
import { ItemRow } from './ItemRow';
import { gearName, lootIsEmpty, lootItemName, partsEntries, qualityText } from './gear-view';
import type { GrantLoot } from './gear-types';

/**
 * What a grant gave, with pictures: each item as a compact row (image with its level in the corner and rarity border, name, rarity badge), items that did
 * not fit in the bag and became parts, blueprints, and parts as icons with numbers. The items pop
 * in when motion is allowed (`pop-in`, the same animation as the Festival creature). Text only.
 */
export function LootList({
  loot: given,
  label,
  counted = false,
}: {
  loot: GrantLoot;
  label: string;
  /** True when the parts and supplies are shown as count badges beside it, so they are left out here. */
  counted?: boolean;
}) {
  const loot = counted ? { ...given, parts: {}, supplies: [] } : given;
  if (lootIsEmpty(loot)) return null;
  const parts = partsEntries(loot.parts);
  return (
    <div class="loot" role="group" aria-label={label}>
      {loot.gear.length > 0 && (
        <ul class="loot-items" aria-label="Items">
          {loot.gear.map((g) => (
            <ItemRow key={g.id} baseId={g.baseId} rarity={g.rarity} level={g.itemLevel} motion />
          ))}
        </ul>
      )}
      {loot.converted.length > 0 && (
        <ul class="loot-notes">
          {loot.converted.map((c, i) => (
            <li key={i} class="muted">
              <GlossaryTag entry="gear">{lootItemName(c)}</GlossaryTag> did not fit in the bag. It
              became parts.
            </li>
          ))}
        </ul>
      )}
      {loot.blueprints.length > 0 && (
        <ul class="loot-notes">
          {loot.blueprints.map((b, i) => (
            <li key={i}>
              <Tag kind="badge" entry="blueprint">
                {b.duplicate ? 'Known blueprint' : 'New blueprint'}
              </Tag>{' '}
              {gearName(b.baseId)}
              {b.duplicate && (
                <span class="muted">
                  {' '}
                  {b.marks === undefined ? '(it became scrap)' : `(${qualityText(b.marks)})`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {parts.length > 0 && (
        <ul class="loot-parts" aria-label="Parts">
          {parts.map((p) => (
            <li key={p.kind}>
              <PartCount kind={p.kind} amount={p.amount} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
