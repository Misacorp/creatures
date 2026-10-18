import type { SupplyPick } from './expedition-types';
import { supplyEntry } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { canCarry, pickFor, setSupply, supplyOptions } from './trip-view';

/**
 * The lure of a trip, in one row: a lure draws creatures to the trip, and the better ones draw species you
 * do not have yet. Three tiers as small toggle buttons with how many you have; none in stock says where to
 * make them (lures are crafted from Bait in the Workshop). One lure at most goes on a trip.
 */
export function LurePicker({
  picks,
  stock,
  onChange,
  onOpenWorkshop,
}: {
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
  onChange: (picks: SupplyPick[]) => void;
  onOpenWorkshop?: (() => void) | undefined;
}) {
  const lures = supplyOptions(stock).filter((o) => o.kind === 'lure');
  if (lures.length === 0) return null;
  const chosen = lures.find((o) => pickFor(picks, o.id) !== undefined);
  const none = lures.every((o) => o.owned === 0);
  return (
    <section class="lure-picker" aria-label="Lure">
      <h5 class="pix supply-kind-name">
        <Sprite sprite={glyphOrUnknown('lure')} scale={3} />
        <GlossaryTag entry={supplyEntry('lure')} look="text">
          Lure
        </GlossaryTag>
      </h5>
      <ul class="lure-tiers">
        {lures.map((option) => {
          const on = pickFor(picks, option.id) !== undefined;
          return (
            <li key={option.id}>
              <button
                type="button"
                class={on ? 'primary' : ''}
                aria-pressed={on}
                disabled={option.owned === 0 || !canCarry(picks, option.id)}
                aria-label={`Take your ${option.name} (you have ${String(option.owned)})`}
                onClick={() => {
                  onChange(setSupply(picks, option.id, on ? null : 'owned'));
                }}
              >
                {option.name} ({option.owned})
              </button>
            </li>
          );
        })}
      </ul>
      <p class="muted lure-effect">
        {chosen === undefined ? 'A lure draws creatures to the trip.' : chosen.effect}
      </p>
      {none && (
        <p class="muted">
          You have no lures.{' '}
          {onOpenWorkshop === undefined ? (
            'Make them in the Workshop, from Bait.'
          ) : (
            <button type="button" onClick={onOpenWorkshop}>
              Make lures in the Workshop (Bait)
            </button>
          )}
        </p>
      )}
    </section>
  );
}
