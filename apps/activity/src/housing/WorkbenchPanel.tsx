import type { OwnHouseView } from '@creatures/game';
import { useState } from 'preact/hooks';
import { Accordion } from '../ui/Accordion';
import { Alert } from '../ui/Alert';
import { SupplyGrid, type SupplyCell } from '../ui/SupplyGrid';
import { HouseThumb } from './HouseThumb';
import { MakeCard } from './MakeCard';
import { groupOf, workbenchGroups, type RecipeGroup, type RecipeView } from './workbench-view';

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

/** The picture of one recipe in the grid: dimmed when it cannot be made now, the owned count in the corner. */
export function recipeCell(recipe: RecipeView): SupplyCell {
  const state = recipe.done
    ? 'made already'
    : recipe.affordable
      ? 'ready to make'
      : 'not enough yet';
  return {
    id: recipe.id,
    kind: recipe.id,
    tier: 'basic',
    label: `${recipe.name}, ${recipe.owned > 0 ? `${String(recipe.owned)} owned, ` : ''}${state}`,
    owned: recipe.owned,
    muted: recipe.done || !recipe.affordable,
    picture: <HouseThumb id={recipe.id} />,
  };
}

/** The piece a set's grid starts on: the asked-for one, else the first that can be made now, else the first. */
export function startingRecipe(
  group: RecipeGroup,
  focus: string | undefined,
): RecipeView | undefined {
  return (
    group.recipes.find((r) => r.id === focus) ??
    group.recipes.find((r) => !r.done && r.affordable) ??
    group.recipes[0]
  );
}

/** One set: its pieces as pictures, and the card of the chosen one under them. */
function GroupBody({
  group,
  focus,
  busy,
  onCraft,
}: {
  group: RecipeGroup;
  focus: string | undefined;
  busy: boolean;
  onCraft: (itemId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const chosen =
    group.recipes.find((r) => r.id === picked) ?? startingRecipe(group, focus) ?? group.recipes[0];
  if (chosen === undefined) return null;
  return (
    <div class="hp-recipes">
      <SupplyGrid
        flat
        label={`${group.title}: pieces to make`}
        cells={group.recipes.map(recipeCell)}
        selected={chosen.id}
        onSelect={setPicked}
      />
      <MakeCard recipe={chosen} busy={busy} onMake={onCraft} />
    </div>
  );
}

/**
 * The workbench: the blueprints the player knows by set in accordions (the first one open, or the one that holds `focus`);
 * inside one, its pieces as pictures (dimmed when short, the owned count in the corner) over the card of the chosen one.
 * Make crafts at once. Data in, callbacks out: it fetches nothing.
 */
export function WorkbenchPanel({ own, busy, error, focus, onCraft }: WorkbenchPanelProps) {
  const groups = workbenchGroups(own);
  const target = focus === undefined ? null : groupOf(groups, focus);
  return (
    <div class="hp-panel hp-workbench">
      {error !== null && <Alert level="alert">{error}</Alert>}
      {groups.length === 0 && (
        <p class="hp-empty" role="status">
          No blueprints yet. Trips, scouts and fights turn some up.
        </p>
      )}
      {groups.map((group, index) => (
        <Accordion
          key={group.id}
          title={group.title}
          meta={
            group.held === null
              ? undefined
              : `${String(group.held.owned)} / ${String(group.held.total)}`
          }
          metaTone={group.ready > 0 ? 'gold' : 'quiet'}
          label={`${group.title}${
            group.held === null
              ? ''
              : `, ${String(group.held.owned)} of ${String(group.held.total)} made`
          }${group.ready > 0 ? `, ${String(group.ready)} ready to make` : ''}`}
          headingLevel={3}
          defaultOpen={target === null ? index === 0 : target === group.id}
        >
          <GroupBody group={group} focus={focus} busy={busy} onCraft={onCraft} />
        </Accordion>
      ))}
    </div>
  );
}
