import type { OwnHouseView } from '@creatures/game';
import { useState } from 'preact/hooks';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { SupplyGrid, type SupplyCell } from '../ui/SupplyGrid';
import { HouseThumb } from './HouseThumb';
import { MakeCard } from './MakeCard';
import { PickCard } from './PickCard';
import { skinChoices, type SkinChoice, type SkinKind } from './spot-view';
import { recipeFor } from './workbench-view';

export interface SkinPickerProps {
  kind: SkinKind;
  /** The skin in use now. */
  current: string;
  own: OwnHouseView;
  /** A request is running: every button waits. */
  busy: boolean;
  /** A skin the player has was chosen. */
  onPick: (skinId: string) => void;
  /** "Make" was pressed on a blueprint's recipe. */
  onMake: (itemId: string) => void;
}

const KIND_NAMES: Readonly<Record<SkinKind, string>> = {
  wall: 'Wallpaper',
  floor: 'Floor',
  roof: 'Roof',
  walls: 'Walls',
  ground: 'Ground',
};

function cellOf(choice: SkinChoice): SupplyCell {
  return {
    id: choice.id,
    kind: choice.id,
    tier: 'basic',
    label: choice.label,
    owned: 0,
    muted: choice.kind === 'blueprint',
    picture: <HouseThumb id={choice.id} />,
  };
}

/**
 * The wallpaper, floor, roof or walls to choose from, as the body of a drawer: the skins the player has as pictures (the
 * one in use first), then the ones known but not made yet, greyed; the chosen one as a card with "Use it" (or "Make",
 * which opens its recipe in the same drawer). Data in, callbacks out: it fetches nothing.
 */
export function SkinPicker({ kind, current, own, busy, onPick, onMake }: SkinPickerProps) {
  const choices = skinChoices(kind, current, own);
  const [picked, setPicked] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const choice = choices.find((c) => c.id === picked) ?? choices.find((c) => c.here) ?? choices[0];
  if (choice === undefined) {
    return (
      <p class="hp-empty" role="status">
        Nothing to choose from yet.
      </p>
    );
  }
  const recipe = making ? recipeFor(choice.id, own) : undefined;
  if (making && recipe !== undefined) {
    const back = () => {
      setMaking(false);
    };
    return (
      <div class="hp-spot" onKeyDown={onDrillKey(back)}>
        <DrillHead
          title={recipe.name}
          onBack={back}
          backLabel={`to the ${KIND_NAMES[kind].toLowerCase()}`}
          focus
        />
        <MakeCard recipe={recipe} busy={busy} onMake={onMake} />
      </div>
    );
  }
  return (
    <div class="hp-spot">
      <SupplyGrid
        flat
        label={`${KIND_NAMES[kind]} to choose from`}
        cells={choices.map(cellOf)}
        selected={choice.id}
        onSelect={(id) => {
          setPicked(id);
        }}
      />
      <PickCard
        picture={<HouseThumb id={choice.id} />}
        name={choice.name}
        set={choice.set}
        action={
          choice.kind === 'owned'
            ? {
                label: 'Use it',
                detail: choice.here ? 'In use' : undefined,
                disabled: busy || choice.here,
                onClick: () => {
                  onPick(choice.id);
                },
              }
            : {
                label: 'Make',
                detail: undefined,
                disabled: busy,
                onClick: () => {
                  setMaking(true);
                },
              }
        }
      />
    </div>
  );
}
