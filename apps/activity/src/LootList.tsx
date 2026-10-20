import { GlossaryTag } from './Glossary';
import { PartCount } from './GearArt';
import { lootIsEmpty, lootItemName, partsEntries } from './gear-view';
import type { GrantLoot } from './gear-types';
import type { ComponentChildren } from 'preact';
import { FindBlueprint } from './ui/FindBlueprint';
import { FindItem } from './ui/FindItem';
import { FindList } from './ui/FindRow';

/**
 * What a grant gave, as finds: each gear piece as a `FindItem`, each blueprint as a `FindBlueprint` (both
 * rows in one `FindList`, the images popping in when motion is allowed), a note for items that did not fit
 * in the bag and became parts, and parts as icons with numbers. Text only.
 */
export function LootList({
  loot: given,
  label,
  counted = false,
  children,
}: {
  loot: GrantLoot;
  label: string;
  /** True when the parts and supplies are shown as count badges beside it, so they are left out here. */
  counted?: boolean;
  /** More finds after the gear and blueprints, in the same list (a creature's card). */
  children?: ComponentChildren;
}) {
  const loot = counted ? { ...given, parts: {}, supplies: [] } : given;
  if (lootIsEmpty(loot) && children === undefined) return null;
  const parts = partsEntries(loot.parts);
  return (
    <div class="loot" role="group" aria-label={label}>
      {(loot.gear.length > 0 || loot.blueprints.length > 0 || children !== undefined) && (
        <FindList label="Finds">
          {loot.gear.map((g) => (
            <FindItem key={g.id} baseId={g.baseId} rarity={g.rarity} level={g.itemLevel} motion />
          ))}
          {loot.blueprints.map((b, i) => (
            <FindBlueprint
              key={`bp-${String(i)}`}
              baseId={b.baseId}
              duplicate={b.duplicate}
              marks={b.marks}
            />
          ))}
          {children}
        </FindList>
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
