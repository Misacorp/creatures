import { Tag } from './ui/Tag';
import { GlossaryTag } from './Glossary';
import { ItemFrame, ItemSprite, PartCount, RarityTag } from './GearArt';
import { gearName, lootIsEmpty, lootItemName, partsEntries } from './gear-view';
import type { GrantLoot } from './gear-types';

/**
 * What a grant gave, with pictures: each item (sprite, rarity frame, name, rarity), items that did
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
        <ul class="loot-items">
          {loot.gear.map((g) => (
            <li key={g.id} class="loot-item">
              <ItemFrame rarity={g.rarity} class="pop-in">
                <ItemSprite baseId={g.baseId} scale={4} />
              </ItemFrame>
              <span class="loot-name">{lootItemName(g)}</span>
              <RarityTag rarity={g.rarity} />
            </li>
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
              {b.duplicate && <span class="muted"> (it became scrap)</span>}
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
