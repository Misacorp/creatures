import type { Creature } from './api';
import { baitCount } from './count-items';
import { GlossaryTag } from './Glossary';
import { creatureName } from './game';
import { TreatBox } from './TreatBox';
import { CountBadge } from './ui/CountBadge';
import { resourceName } from '@creatures/game';

/**
 * The treats of the pre-run card: the "Treats" heading with the Bait left, then one "Pack a treat" box per creature of the team, in the
 * order they stand. A treat is paid up front, so the boxes cannot add up to more Bait than the player has. Shared by the page
 * (`DungeonSetup`) and the Cave canvas's Enter drawer.
 */
export function DungeonTreats({
  creatures,
  slots,
  treats,
  bait,
  busy,
  rules,
  onChange,
}: {
  /** Everything the player owns. */
  creatures: readonly Creature[];
  /** The team row (creature ids; null for an empty place). */
  slots: readonly (string | null)[];
  treats: ReadonlySet<string>;
  /** The player's Bait. */
  bait: number;
  busy: boolean;
  rules: 2 | undefined;
  onChange: (id: string, on: boolean) => void;
}) {
  const team = slots.flatMap((id) => creatures.filter((c) => c.id === id));
  // What the packed treats leave of the Bait, shown once above the boxes (they share one purse).
  const baitLeft = team.reduce((n, c) => n - (treats.has(c.id) ? c.treatCost : 0), bait);
  return (
    <div class="dungeon-treats">
      {team.length > 0 && (
        <p class="treats-head">
          <span class="treats-title">Treats</span>
          <GlossaryTag entry="treat" look="help" />
          <span class="treats-left">
            <CountBadge {...baitCount(baitLeft)} label={`${resourceName('bait')} left`} />
            <span>left</span>
          </span>
        </p>
      )}
      <div class="treat-list">
        {slots.flatMap((id) => {
          const creature = creatures.find((c) => c.id === id);
          if (creature === undefined) return [];
          const others = [...treats]
            .filter((t) => t !== creature.id)
            .reduce((n, t) => n + (creatures.find((c) => c.id === t)?.treatCost ?? 0), 0);
          return [
            <TreatBox
              key={creature.id}
              cost={creature.treatCost}
              bait={bait - others}
              checked={treats.has(creature.id)}
              disabled={busy}
              who={creatureName(creature)}
              help={false}
              {...(rules === 2 ? { times: 2 } : {})}
              listed
              onChange={(on) => {
                onChange(creature.id, on);
              }}
            />,
          ];
        })}
      </div>
    </div>
  );
}
