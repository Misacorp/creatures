import type { OwnHouseView } from '@creatures/game';
import { useEffect, useRef } from 'preact/hooks';
import { Accordion } from '../ui/Accordion';
import { Alert } from '../ui/Alert';
import { HoldingsStrip } from './HoldingsStrip';
import { MakeCard } from './MakeCard';
import { groupOf, workbenchGroups } from './workbench-view';

export interface WorkbenchPanelProps {
  own: OwnHouseView;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A refusal of the last craft, in words, or null. */
  error: string | null;
  /** An item id to bring into view and open (the spot picker's "Make" lands on its recipe). */
  focus?: string | undefined;
  /** "Make" was pressed for this piece or skin. */
  onCraft: (itemId: string) => void;
}

/**
 * The workbench: every blueprint the player knows as a recipe card, by set in accordions (the first one open, or the
 * one that holds `focus`). Make crafts at once. Data in, callbacks out: it fetches nothing.
 */
export function WorkbenchPanel({ own, busy, error, focus, onCraft }: WorkbenchPanelProps) {
  const groups = workbenchGroups(own);
  const target = focus === undefined ? null : groupOf(groups, focus);
  const focused = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    focused.current?.scrollIntoView?.({ block: 'center' });
  }, [focus]);
  return (
    <div class="hp-panel hp-workbench">
      {error !== null && <Alert level="alert">{error}</Alert>}
      <HoldingsStrip own={own} />
      {groups.length === 0 && (
        <p class="hp-empty" role="status">
          No blueprints yet. Trips, scouts and fights turn some up.
        </p>
      )}
      {groups.map((group, index) => (
        <Accordion
          key={group.id}
          title={group.title}
          meta={group.ready > 0 ? String(group.ready) : undefined}
          metaTone="gold"
          label={
            group.ready > 0 ? `${group.title}, ${String(group.ready)} ready to make` : group.title
          }
          headingLevel={3}
          defaultOpen={target === null ? index === 0 : target === group.id}
        >
          <ul class="hp-recipes">
            {group.recipes.map((recipe) => (
              <li
                key={recipe.id}
                ref={(el) => {
                  if (recipe.id === focus) focused.current = el;
                }}
              >
                <MakeCard recipe={recipe} busy={busy} onMake={onCraft} />
              </li>
            ))}
          </ul>
        </Accordion>
      ))}
    </div>
  );
}
